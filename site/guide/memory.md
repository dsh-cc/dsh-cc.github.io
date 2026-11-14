---
title: Memory
description: Understand dsh-cc's two memory layers — CLAUDE.md project conventions loaded every session, and the durable memdir written through the memory_save channel — and how both surface in later sessions.
---

# Memory

This page is for anyone who wants the agent to remember things across
sessions: project conventions, your feedback, facts about the codebase.
dsh-cc gives you two complementary layers — a `CLAUDE.md` conventions file
that is loaded into every session, and a durable file-based **memdir**
(`MEMORY.md` plus topic files) that the agent writes through a dedicated
`memory_save` channel and reads back through dynamic recall.

## The two layers at a glance

| Layer | What it holds | Who writes it | When it is loaded |
| --- | --- | --- | --- |
| `CLAUDE.md` | Project conventions, build commands, house style | You (scaffolded by `/init`) | Every session |
| Memdir (`MEMORY.md` + topic files) | Durable facts: user preferences, feedback, project and reference notes | The agent, via `memory_save` | Topic catalog in every session; topic bodies on demand via recall |

The memory layer supports `CLAUDE.md`-style context plus a dedicated write
channel for durable memories. Memory is isolated by workspace, with optional
shared team memory.

## The CLAUDE.md layer

`CLAUDE.md` is the conventions file: the durable, human-authored instructions
you want applied in every session in a repository — build commands, code
style, repo-specific rules. It lives at the repository root and is mounted as
context each session.

Run `/init` to scaffold it. Per the compatibility matrix, `/init` in dsh-cc
drives a follow-up model turn that writes or refreshes `CLAUDE.md`, rather
than Claude Code's upstream one-shot initializer flow (status: partial).
You can edit the file by hand afterwards like any Markdown file.

One upstream feature is not ported: `CLAUDE.md` `@path` imports are absent —
no parser or loader handles imports today.

## The memdir layer

The memdir is the durable store. Its layout:

- A **memory home** (by default the harness home's `memory/`) acts as the
  **global layer** shared by every workspace.
- Each git repository gets its own workspace directory under
  `<memoryHome>/projects/<slug>/` — linked worktrees and subdirectories are
  collapsed onto the main checkout first (`canonicalMemoryRoot`), so they share
  one store. Session transcripts still group by raw cwd; memory no longer
  follows that grouping for worktree sessions.
- Every layer holds a `MEMORY.md` **curator index** (capped at 200 lines /
  25 KB), each line an index of `.md` **topic files**. The file itself stays on
  disk and never enters the prompt verbatim; what it contributes is order — the
  prompt catalog lists the topics it points at first, in the file's own order.
- Each topic file carries `name`, `description`, and `type` frontmatter
  (`user` / `feedback` / `project` / `reference`) plus a Markdown body.

Sessions of different repositories never see each other's private memories;
facts useful everywhere are saved with `scope: "global"`.

### What the prompt actually carries

The `memory` system-prompt section renders **one** scope-tagged catalog of
parsed topic files over every layer: a `## Memory index` header, one line per
topic with its description, and grep search guidance. `MEMORY.md` is not
prompt-visible — curator prose in it, and pointer lines whose target has no
parseable topic file, stay on disk — but its pointer order is the catalog's
ordering input: the entries that index lists come first, in that file's own
order, interleaved round-robin across workspace → team → global, and every
remaining topic follows, each scope sorted by filename. Round-robin is ordering
fairness, not a visibility guarantee — once entries start dropping, a scope can
still vanish from the catalog. The catalog names topics; recall injects their
bodies.

The budget is the `cc-memory-section` settings namespace, on by default, and it
is re-read on every render — a settings write applies to the next assembly:
`truncate` `true` (`false` renders the catalog complete and never removes the
section), `max-bytes` `24576` (1024..65536, ceiling for the whole catalog block
including header and ellipsis line), `description-max-bytes` `160` (0, or
8..1024; `0` disables description trimming, 1-7 is rejected). Invalid values are
rejected whole, never clamped into range. Over budget, whole entries drop from
the bottom of the interleaved order — never a partial line — and a closing
ellipsis line counts the topics left out; when not even one entry fits, the
header and that line render alone. The full knob table lives in
[/reference/settings](/reference/settings).

The section always renders — a memoryless layer shows a placeholder — so the
save guidance never disappears. Delegated subagent children render it empty, so
the section drops out of their prompt; the parent prompt must pass any facts the
child needs.

### The `memory_save` channel

The agent's only working save channel is the `memory_save` tool. Memory
directories live outside every session workspace, so direct `write`/`edit`
calls against them are fenced by the fs sandbox and always fail — the system
prompt says so explicitly. `memory_save` takes structured fields (`name`,
`type`, `description`, `body`, optional `scope`: `workspace` (default) or
`global`), resolves the target directory from the calling agent's canonical
git root, generates the frontmatter host-side, and upserts the `MEMORY.md`
pointer.

::: info
`memory_save` writes the workspace and global layers only; a team-scope save
channel and a delete channel are deferred. Registration is opportunistic:
hosts without a tools service stay read-only.
:::

### `/memory`

The human-facing `/memory` command lists memory files or prints one memory's
body. It registers as a global command, so it runs without a model turn.

| Input | Result |
| --- | --- |
| `/memory` | List each topic as `- name (type) — first line`, sorted by name, plus the memory directory header. |
| `/memory <name>` | Print a single memory's frontmatter and full body, matched by frontmatter `name` or filename. An unknown name yields a friendly notice. |

It is fully read-only, and the slash input and output are absent from model
requests — using it consumes no model tokens.

### Distilling failures with `/learn`

While `/memory` inspects memory, `/learn` writes it: the command scans the
durable session transcripts for recurring failure→success corrections and
distills them into workspace memory. It is dry-run by default — it renders the
ranked findings and the proposed memory block and writes nothing. Only
`/learn apply` writes: it creates the `session-learnings` memory topic as a
managed marker block that `/learn` owns entirely and regenerates wholesale on
every apply — hand-written memory elsewhere is untouched — and updates the
`MEMORY.md` pointer. Empty findings leave existing memory untouched.
`/learn all` scans every project's sessions instead of the current workspace
only, and `/learn days=N` overrides the recency window (default 14). Tuning
lives in the `cc-learn` settings namespace: `enabled` (default `true`), `days`
(default `14`), `min-occurrences` (default `2`).

## Automatic consolidation

Memory maintenance runs in the background and never blocks your session. The
memory layer gates `MEMORY.md` writes with an index gate; when index pressure
builds, a `.consolidation-needed` marker is written and a forced "dream"
consolidation is queued.

The consolidation package (`dsh-memory-consolidation`) adds turn-end
extraction: a background forked subagent with read/search tools only extracts
durable facts from the turn as structured output, which the plugin validates
and writes host-side — the forks hold no write tools, so a sandboxed session
can never write memory directly. Concurrent extractions from parallel sessions
no longer drop each other's `MEMORY.md` pointers: an index write is checked
against the baseline the job read and rebased onto whatever landed meanwhile —
topic-file bodies stay last-writer-wins, and the dream lock serializes only
consolidations.

Dream consolidation is a read-only forked subagent that reviews past sessions
and reports a rewritten `MEMORY.md` + topic file set, applied by the plugin
the same way. It runs only when three gates all pass:

1. **Time** — at least `minHours` (default 24) since the last consolidation.
2. **Session count** — at least `minSessions` (default 5) new transcripts.
3. **Lock** — a `.consolidation-lock` file enforces mutual exclusion; a stale
   holder older than `lockStaleMs` (default 1 hour) is reclaimed, so a crash
   mid-consolidation recovers automatically. A successful consolidation
   releases the lock (holder cleared, epoch kept), so the next dream waits only
   on its own cooldown or the time gate; a failed or killed consolidation rolls
   the lock back so the time gate re-opens.

Two more knobs bound the forced path: `pressureCooldownMinutes` (default 60)
is the minimum minutes between forced (pressure) dreams, and `sessionsRoot`
(default `<DSH_HOME>/sessions`) is the session store root the gates scan.

## Recall: how memories surface later

You do not have to ask for memories back. An `agent/pre-step` listener runs a
**small-model side query** — a forked subagent — asking which topic files are
relevant to the current turn, then injects their bodies into context:

- Recall scans both layers (the agent's workspace directory plus the global
  one) and deduplicates: topic files already shown this session are never
  re-injected.
- Tools used earlier in the session are tracked, and reference-doc memories
  for an actively-used tool are suppressed — warnings and gotchas about it
  are still surfaced.
- Recall is opt-out via `recallEnabled` (default `true`); with
  `recallUseSmallFast: true` the recall fork runs on the cheap lane. Absence
  of the subagent service or provider skips recall without error.

::: tip
The recall side-query relies on a registered one-shot subagent provider; no
provider ships with the memory package itself (compose `fork` or `spawn`).
:::

### SystemOne recall decisions (opt-in)

The side query above can be replaced by per-candidate decisions: with the
`cc-systemone-memory-recall` namespace set to `shadow` or `active`, the SystemOne
decision model answers one relevance question per candidate and returns an
independent probability, and a deterministic filter decides what to inject — a
probability at or above `include-probability` (`0.75`) is an explicit inclusion,
at or below `exclude-probability` (`0.25`) an explicit exclusion. The generative
selector stays and is the fallback.

| Key | Default | Meaning |
| --- | --- | --- |
| `mode` | `off` | `off`: legacy selector only, no route read, no request; `shadow`: legacy still selects and injects, only the comparison is recorded; `active`: the decision model decides |
| `timeout-ms` | `1500` | 100..30000; deadline for the whole selection (~1.3 s per 24-candidate batch) |
| `max-input-tokens` | `6000` | 512..16000; per-batch request budget |
| `max-candidates` | `96` | 1..256; a larger candidate pool falls back to the legacy selector |
| `batch-size` | `24` | 1..32; also bounded by the question count the route advertises |
| `fallback-max-candidates` | `256` | `max-candidates`..1024; above it the round skips recall rather than selecting from a subset |
| `fallback-max-bytes` | `65536` | 4096..262144; UTF-8 cap on the text the legacy selector receives |

In `active` mode a probability strictly inside the two thresholds makes the pool
uncertain and falls back to the legacy selector once — as does every other
degradation (no service, unresolvable route, over the candidate limit, a batch
or token budget overflow, a timeout, a malformed answer). Cancellation never
falls back, and an all-low pool is a valid empty result.

Enabling it needs BOTH the decision service mounted and a non-`off` mode: the
service alone changes nothing, and a mode without the service only ever falls
back. `recallEnabled: false` still switches recall — and with it all three
modes — off, while `recallProviderName`, `recallAgentOptions` and
`recallUseSmallFast` configure only the legacy selector and its fallback.

Privacy: the decision route receives the turn's query plus candidate metadata
only (each candidate's scope, filename, name and description, and the names of
tools already used this turn). File content, absolute paths, content hashes and
tool arguments are never sent, and an answer cannot widen access — a selected
file whose hash changed on re-read is discarded instead of injected.

### SystemOne extraction gate (opt-in)

The turn-end extraction described above can be gated the same way: with
`cc-systemone-memory-extraction` set to `shadow` or `active`, one call over the
complete review window (the events since the last reviewed seq plus the
existing topic index) answers a single question — does this window hold at
least one durable novel fact? Only an explicit low-probability verdict may omit
the extraction fork; every other outcome extracts exactly as before (an
incomplete window, a budget overflow, a missing route or runner, an invalid
answer, a timeout).

| Key | Default | Meaning |
| --- | --- | --- |
| `mode` | `off` | `off`: legacy listener, no request; `shadow`: jobs serialise through the coordinator, still extract, and only record the would-skip; `active`: an eligible low-probability verdict may skip the fork |
| `timeout-ms` | `1500` | 100..5000; per-decision wire timeout |
| `max-input-tokens` | `6000` | 512..16000; estimated budget of one decision state |
| `max-surface-events` | `64` | 1..256; above it the window extracts directly |
| `max-state-bytes` | `32768` | 4096..131072; UTF-8 budget for the complete state |
| `skip-probability` | `0.05` | 0..0.20 inclusive; `p` at or below it may skip, and `0.5` is the fixed positive boundary |
| `audit-every-n-skips` | `20` | 1..1000; every Nth eligible skip becomes an audit extraction instead |
| `failure-cooldown-ms` | `30000` | 1000..300000; wait before a failed window may be retried |
| `session-state-cap` | `200` | 1..2000; LRU cap on idle session states |

Any invalid value rejects the whole section and keeps the previous snapshot.
These probabilities are experimental — no accuracy or benefit guarantee — and
the gate is inert unless the decision service is mounted: without it every
eligible window simply extracts. The disclosure is wider than recall's candidate
metadata, since a complete window sends current session text plus the topic
index; nothing is sent while the mode is `off`, and a window that would have to
be trimmed is marked incomplete so the original fork runs instead. Shadow is not
event-for-event identical to the legacy scheduling — it serialises jobs and
advances the review watermark only after the host validated and wrote the batch,
so an unfinished job is never treated as finished — while `off` and `shadow`
produce the same memory content with the same permissions.

## Team memory (opt-in)

When `teamEnabled` is `true`, a shared per-workspace team directory
(`<workspaceDir>/team`) is layered on top of the workspace's private memdir,
and the `memory` section renders a combined workspace + team + global prompt.
It is **off by default**: enabling it changes the persisted memory layout and
what the model writes, and points team-memory reads at a shared directory.

The source is explicit about the safety boundary: the per-access validation
chain closes path traversal (key sanitization, final-segment symlink
rejection, resolve + containment), but the intermediate-component TOCTOU
window is not fully closed. Do not enable `teamEnabled` in multi-tenant or
untrusted-writer deployments — it is intended for single-tenant,
trusted-writer projects.

## Practical hygiene

- Put stable project conventions (build commands, style rules) in
  `CLAUDE.md`; save per-fact knowledge (user preferences, feedback, tool
  gotchas) through `memory_save` so it can be indexed and recalled.
- Keep memories durable, not ephemeral: a topic file is re-injected in later
  sessions until it is superseded, so transient task state does not belong
  there.
- Prefer `scope: "global"` only for facts genuinely useful across every
  repository — workspace memories stay private to the repo's store.

## Next

- [/guide/interactive-basics](/guide/interactive-basics) — slash commands and
  the session loop
- [/reference/commands](/reference/commands) — the command catalog,
  including `/init` and `/memory`
- [/reference/settings](/reference/settings) — configuration knobs,
  including the memory plugin's `memoryHome`, the recall switches, and the
  `cc-memory-section` catalog budget
