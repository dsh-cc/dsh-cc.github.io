---
title: Claude Code compatibility
description: What "Claude Code compatibility" means in dsh-cc — and how to read the parity matrix honestly.
distilled-from: dsh-cc v0.5.0
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
The examples below describe the state as of dsh-cc v0.5.0. Check the matrix
for the current state before relying on any of them.
:::

## A few example highlights (as of v0.5.0)

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

## Next

- [/reference/cli](/reference/cli) — the `dsh-cc` bin and its flags.
- [/reference/commands](/reference/commands) — slash commands available in the TUI.
