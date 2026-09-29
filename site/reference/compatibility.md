---
title: Claude Code compatibility
description: What "Claude Code compatibility" means in dsh-cc — and how to read the parity matrix honestly.
distilled-from: dsh-cc v0.8.1-rc.1 (main 82576b5)
---

# Claude Code compatibility

dsh-cc aims for a useful Claude-Code-style workflow: the same agent loop,
tool names, hooks, slash commands, and permission modes you are used to,
running on the dsh harness. It is **not** byte-for-byte emulation of Claude
Code, and it is not a goal to clone every vendor-bound feature.

> dsh-cc is not Claude Code and is not a wrapper around Claude Code.

## How to read parity honestly

Compatibility here is judged per capability, not as a single blanket claim.
For each capability, four independent dimensions are tracked:

- **Recognized** — does dsh-cc understand the Claude Code form (a hook event,
  a slash command, a config key)?
- **Mounted** — is it actually wired into the shipped profile, or only present
  in the codebase?
- **Behavior** — does the underlying behavior match upstream (full/partial/missing)?
- **UX** — does the user-facing surface match?

A capability can be recognized but not mounted, or behave correctly while the
UX differs. "Partial" is not a footnote to hide: it means usable today with
known, documented differences. Several rows are deliberately marked missing —
either because no design exists yet, or because the feature is vendor-bound
and outside parity scope.

## The single source of truth

The generated parity matrix tracks every capability row with these dimensions,
evidence links, and deviation notes:

[dsh-cc parity matrix](https://github.com/dsh-cc/dsh-cc/blob/main/docs/cc-parity-matrix.md)

It is regenerated from a machine-readable capability manifest, so treat it as
authoritative over any prose — including this page.

::: warning
The examples below describe the state as of dsh-cc v0.8.1-rc.1 (main 82576b5). Check the matrix
for the current state before relying on any of them.
:::

## A few example highlights (as of v0.8.1-rc.1)

- **Hook executors** — `command` and `http` executors are always on; `prompt`
  and `agent` executors are gated behind `enablePromptHooks` /
  `enableAgentHooks`, default off. Partial.
- **/resume** — lists sessions, but switching is host-owned
  (`dsh --resume <id>`). Partial.
- **Schedule / reminders** — `after_seconds` / `at` / `every_seconds`
  (>=300s) are supported; cron-expression selectors are not yet. Partial.
- **Background jobs** — the dsh jobs tools carry the equivalent surface under
  dsh names; CC's `TaskCreate`/`TaskOutput`/`TaskStop` naming is not aliased.
  Partial.
- **WebSearch** and **plan mode** — full parity, mounted by default.
- **Divergent-by-design engine surfaces** — v0.8.0 adds several engine rows
  that are dsh-cc extensions beyond Claude Code, marked divergent in the
  matrix: `compaction-cost-gate` (behavioral/ux full), `microcompact`
  (behavioral/ux full), `tool-use-summary` (behavioral/ux full),
  `post-edit-auto-verify` and `edit-recovery-hint` (behavioral full, ux
  partial), and `prompt-suggest`, `reasoning-effort-surface` (the
  `model$level` suffix), `output-token-continuation`, and
  `error-streak-surfacing` (behavioral/ux partial).
- **Git worktrees** — the worktree rows (`workspace.worktree-ecosystem`,
  `workspace.worktree-launcher`, `workspace.worktree-lifecycle`,
  `workspace.worktree-tools`) are behavioral/ux partial, with downgrade-kind
  deviations (for example, no `.worktreeinclude` include-copy in launcher
  `--worktree` sessions). See [/guide/worktrees](/guide/worktrees).
- **Subagents and plugins** — `subagents.isolation` is behavioral/ux partial
  (downgrade); `plugins.rules` (the Cursor dialect) is behavioral divergent
  with partial ux; `settings.actor-contract` is behavioral divergent with
  partial ux; `hooks.worktree-events` (`WorktreeCreate`/`WorktreeRemove`) is
  behavioral/ux partial.
- **Permissions and auto mode** — auto mode is now strict-rule and content
  evaluation is deny-first, matching Claude Code; `permissions.rules` stays
  partial. `/auto-mode` is partial by design: read-only introspection rather
  than Claude Code's config-file editor. See
  [/reference/permission-modes](/reference/permission-modes).
- **Workflow engine** — `engine.workflow` is behavioral divergent with partial
  ux (same-session replay only, per-user directory under `$DSH_HOME`); the
  Ralph loop is now its own full-parity row.
- **Hooks** — `SubagentStart` / `SubagentStop` are now partial: they report a
  constant `agent_type` of `general-purpose` and a child-scoped `session_id`.
- **New dsh-cc extensions** — `plugins.codex-bridge` and
  `plugins.grok-bridge` (first-party plugins, see [/guide/plugins](/guide/plugins)),
  `plugins.foreign-rules` (imports cline/windsurf/copilot rule files from the
  session cwd; opt out with `cc-foreign-rules.disabled`), and
  `engine.advisor-watchdog` are marked divergent. `/export` is now divergent
  because it redacts secrets, which Claude Code does not.

## Next

- [/reference/cli](/reference/cli) — the `dsh-cc` bin and its flags.
- [/reference/commands](/reference/commands) — slash commands available in the TUI.
