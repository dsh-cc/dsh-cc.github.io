---
title: Getting around a session
description: Everyday interactive use of the dsh-cc TUI — starting, resuming, inspecting, and running parallel work in worktrees.
---

# Getting around a session

This guide is for developers using `dsh-cc` as their everyday interactive coding agent in the terminal. It walks through the session lifecycle, the slash commands you will reach for most, and how to run isolated parallel work in git worktrees. On the `tui` profile, CC Mode is the default, so launching `dsh-cc` drops you straight into the familiar CC-style TUI.

Prerequisite: the `@dsh-cc/cli` launcher installed (`npm install -g @dsh-cc/cli`) and a dsh deployment you can reach.

## Session lifecycle

Start a new session from your project root:

```sh
$ dsh-cc -n
```

Resume a specific session by id:

```sh
$ dsh-cc --resume <id>
```

Continue the last session in this project:

```sh
$ dsh-cc -c
```

If you pass `-c`/`--continue` and there is no previous session, the TUI shows a "no previous session to continue" notice. With no explicit flag, the TUI reads its own project resume marker and auto-resumes the last session if one exists.

Inside a session, `/resume` lists sessions so you can resume an interrupted one. Note this is partial parity: `/resume` lists sessions, but switching is host-owned (`dsh --resume <id>` from the shell). Rename the current session with `/rename <title>`; the full list lives in the [slash-command catalog](/reference/commands). When you quit, the TUI prints an exit tip to scrollback with the session id and the resume command; set `DSH_CC_DISABLE_EXIT_TIP='1'` to disable it.

## Inspecting work

The CC preset exposes a growing command surface. The ones most useful while working:

| Command | What it does |
| --- | --- |
| `/cost` | token / cost information |
| `/status` | environment and session status |
| `/diff` | inspect CLAUDE.md / settings differences |
| `/doctor` | session health report (`--verbose` / `--json`) |

The TUI also provides transcript export, usage/context display, todo inspection, approval flows, queued prompts, and local shell commands (the TUI-local `/export-md` covers transcript export).

## Context management

For context handling, `/compact` compacts the session with optional preservation instructions; the TUI-local `/clear` (aliases `/new`, `/reset`) starts a fresh conversation while the previous session stays resumable (see the [slash-command catalog](/reference/commands)). The memory layer (`CLAUDE.md`-style context plus a dedicated write channel for durable memories, isolated by workspace) carries durable knowledge; use `/memory` to inspect memories.

Opt-in CCR (compress-cache-retrieve) compression is also available: when `cc-context-compression.enabled: true` and `mode: on` (the default mode is `dry-run`, which only measures), large grep/log-shaped tool results are replaced by one fresh text block plus a `[dsh-cc compressed BEFORE→AFTER tokens. Original: ccr://<hash>]` marker. The original is cached in a content-addressed store at `$DSH_HOME/ccr/<projectKey>/<hash16>` (projectKey = the first 16 hex of `sha256(session cwd)`), an LRU capped at 200 entries with a TTL of 3600 seconds, and restored verbatim via the `context_retrieve` tool. Knobs: `min-bytes` (8192), `min-savings-ratio` (0.4), and `protected-tools` — an explicit list REPLACES the default, it is not a union. The same `cc-context-compression` namespace also carries the reducer knobs, all shipped dark: `reducer-enabled` (false), `reducer-commands`, `reducer-max-input-tokens` (30000), `reducer-min-savings-ratio` (0.5), `reducer-max-tokens` (1024), `reducer-timeout-ms` (10000), and `reducer-alias` (`'haiku'`). The reducer escalates noisy build/test output the deterministic router declines to a cheap-lane receipt — a failing-test list with verbatim evidence quotes — verified deterministically before substitution, with an original-bytes fallback on any failure; unrouted or inherited-provider lanes are skipped. Caveat: replay and `/export` keep the compressed form.

### Microcompaction and cheap-lane digests

Microcompaction is a model-free, replay-safe collapse of stale tool results: beyond the most recent `retainResults` (10) tool results, older ones are replaced by a deterministic `[... tool result compacted ...]` placeholder capped at `placeholderChars` (256) code points. It is a preset-plugin config (a profile tweak, with `auto` defaulting to `false`), not a settings namespace. With `auto: true`, after `failureCap` (3) consecutive failures the pass pauses for the session with one model-visible notice pointing at manual `/compact`; any later success re-arms it. When tool-use-summary is on, stale placeholders carry the digest inside a mandatory untrusted wrapper.

Tool-use-summary (TUS) is default ON (namespace `cc-tool-use-summary`): every large tool result gets a fire-and-forget cheap-lane digest (alias `haiku` by default, ≤150 words, clamped to 800 chars in the ledger) keyed by `callId`, consumed at compaction instead of re-reading raw output. Defaults: `enabled` true, `topLevelOnly` true, `minResultBytes` 4096, `maxSummariesPerSession` 200, `maxTokens` 256, `timeoutMs` 5000, `excludeTools` `['structured_output']`, `retentionDays` 7 (0 = memory only), `upgradeMicroPlaceholders` true. The ledger lives at `$DSH_HOME/tool-use-summary/<sessionId>.jsonl`. Digests are wrapped untrusted on the consumer side; context-crusher stubs are never substituted (their `ccr://` locator must survive).

Cost-gated plan-step compaction (`cc-compaction-cost-gate`) ships dark (`enabled` false, `mode` `'dry-run'`): completing a plan step (a `todo_write` transition to completed) arms a boundary, and when the agent next goes idle it evaluates whether compacting pays for itself — projected input-token savings versus rewrite cost plus debt, `margin` 1.0 — and only then compacts. `cooldown-ms` (600000) cools down after a real compaction; an unset `window-pressure-tokens` means no bypass; `model-table` is optional. The ledger lives at `$DSH_HOME/compaction-cost-gate/<projectKey>.jsonl`; 3 consecutive real failures pause for the session with a notice pointing at manual `/compact`; `dry-run` ledgers both sides without compacting.

### Opt-in previews

Three previews are user-layer-only: their namespace lives ONLY in the user-layer `~/.dsh/settings.json` — project scope is never read (invisible, not refused).

- **prompt-suggest** (`cc-prompt-suggest`, `enabled` false): next-prompt prediction at turn-stop via a cheap-lane side query (`alias` `'haiku'`, `timeoutMs` 4000, `maxTokens` 128), ≤120 chars, 5-minute TTL. Surfaced in TUI autocomplete prefix-match-only — trigger chars `/`/`@` or forced Tab, never on empty input; type the first characters then Tab to complete.
- **post-edit-verify** (`cc-post-edit-verify`, `enabled` false): after an accepted edit/write, runs the first matching `rules` entry `{glob, command, timeout-ms?}` (POSIX sh, session cwd) and appends the outcome as an `[auto-verify]` block to the SAME tool result. Keys: `rules` `[]`, `debounce-ms` 5000 (burst labeling only — every matching edit still runs), `max-output-bytes` 4096, `verbose-on-success` false, per-rule `timeout-ms` 60000 capped at 120000. Success is a near-silent one-liner unless verbose.
- **edit-recovery-hint** (`cc-edit-recovery-hint`, `enabled` false): when an edit fails multi-line-`old_string` not-found, appends fixed static advice (retry with a single-line anchor, or split one edit per hunk; only if the anchor also fails, re-read the target region) as sideband context. Ambiguity failures ("appears more than once") are deliberately unmatched; the text is static — no tool output is ever interpolated.

Two more opt-in features follow the same user-layer-only rule:

- **advisor watchdog** (`cc-advisor`, `enabled` false): a second model reviews every completed turn. After each turn it asks a cheap lane (`alias` `'haiku'`; an unconfigured alias never falls back to the main route) and delivers surviving `nit` / `concern` / `blocker` notes as one injected message, never mid-tool-batch and never waking an idle session. Guards: `budget` 2 non-blocker notes per run, `immune-turns` 3, `session-cap` 24. `subagents` `'off'` reviews top-level sessions only. Each run is journaled to `$DSH_HOME/advisor/<sessionId>.jsonl`.
- **lsp-on-write** (`cc-lsp-on-write`, `enabled` false): after a successful `edit`/`write`/`NotebookEdit`, pulls the file's diagnostics from the running serena language servers (MCP connection `server-name` `serena`) and appends a compact `[lsp]` block to the same tool result. Knobs: `timeout-ms` 1500, `max-diagnostics` 8, `min-severity` `warning`. Any failure drops silently; after 3 consecutive drops it disables itself for the session.

## Working in parallel safely

To isolate experiments from your main checkout, start the session inside a git worktree:

```sh
$ dsh-cc --worktree my-experiment
```

`--worktree [name]` starts the session inside a git worktree at `<repoRoot>/.claude/worktrees/<slug>` on branch `worktree-<slug>` (a random slug when no name is given). A newly created worktree starts a fresh session. Re-invoking `--worktree <name>` when that directory already exists reuses it and falls back to the default auto-resume, because sessions are scoped to the project (the main git root; worktrees share it). `--resume` / `--new` still override. Requires a git repository with at least one commit.

In-session, `/branch` provides worktree branch management. Worktree support is broad but marked partial upstream; see [Worktrees](/guide/worktrees). When you quit, the TUI offers to keep or remove the worktree.

## Next

- [Model routing](/guide/model-routing) — map model aliases to your providers.
- [Background tasks](/guide/background-tasks) — run and inspect background work.
- [Command reference](/reference/commands) — the full slash-command catalog.
