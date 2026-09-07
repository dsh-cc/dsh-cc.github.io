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

Inside a session, `/resume` lists sessions so you can resume an interrupted one. Note this is partial parity: `/resume` lists sessions, but switching is host-owned (`dsh --resume <id>` from the shell). Rename the current session with `/rename <title>`; the full list lives in the [slash-command catalog](/reference/commands).

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

## Working in parallel safely

To isolate experiments from your main checkout, start the session inside a git worktree:

```sh
$ dsh-cc --worktree my-experiment
```

`--worktree [name]` starts the session inside a git worktree at `<repoRoot>/.claude/worktrees/<slug>` on branch `worktree-<slug>` (a random slug when no name is given). A newly created worktree starts a fresh session. Re-invoking `--worktree <name>` when that directory already exists reuses it and falls back to the default auto-resume, because sessions are scoped to the project (the main git root; worktrees share it). `--resume` / `--new` still override. Requires a git repository with at least one commit.

In-session, `/branch` provides worktree branch management. The worktree tools are full parity. When you quit, the TUI offers to keep or remove the worktree.

## Next

- [Model routing](/guide/model-routing) — map model aliases to your providers.
- [Background tasks](/guide/background-tasks) — run and inspect background work.
- [Command reference](/reference/commands) — the full slash-command catalog.
