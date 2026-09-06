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
| Memdir (`MEMORY.md` + topic files) | Durable facts: user preferences, feedback, project and reference notes | The agent, via `memory_save` | `MEMORY.md` index always; topic files on demand via recall |

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
  collapsed onto the main checkout first, so they share one store.
- Every layer holds an **always-loaded `MEMORY.md` entrypoint** (capped at
  200 lines / 25 KB), each line an index of `.md` **topic files**.
- Each topic file carries `name`, `description`, and `type` frontmatter
  (`user` / `feedback` / `project` / `reference`) plus a Markdown body.

Sessions of different repositories never see each other's private memories;
facts useful everywhere are saved with `scope: "global"`.

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
  including the memory plugin's `memoryHome` and recall settings
