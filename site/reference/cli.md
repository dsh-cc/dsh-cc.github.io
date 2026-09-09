---
title: CLI flags
description: The dsh-cc bin and the flags it accepts before spawning dsh --profile tui.
distilled-from: dsh-cc v0.6.0
---

# CLI flags

`dsh-cc` is an optional thin wrapper: it translates a few flags, then spawns
the canonical `dsh --profile tui` command. On first run it bootstraps
`$DSH_HOME/profiles/tui` by installing the three CC bundles
(`@dsh-cc/bundle-permissions`, `@dsh-cc/bundle-shell`, `@dsh-cc/bundle-tui`
pinned to the launcher's version), so install both packages and start:

```sh
$ npm install -g @deepseek-ai/dsh @dsh-cc/cli
$ dsh-cc
```

The launcher enforces a harness floor at bootstrap: the installed `dsh` must be **>= 0.1.2-rc.1** or startup refuses to proceed.

## Flags

All flags are handled by the launcher; resume-mode flags are stripped from
argv before anything is forwarded to `dsh`. Combined shorts (such as `-cn`)
are not recognized — each flag must be its own token.

| Flag | What it does |
| --- | --- |
| `--version` / `-V` | Print the launcher's own package version and exit. |
| `--new` / `-n` | Start a fresh session: the TUI starts clean and must not read any resume marker. |
| `--resume <id>` | Resume the session with that id. The `--resume=<id>` form works identically. |
| `--continue` / `-c` | Continue the previous session; the TUI shows a "no previous session to continue" notice when no marker exists. |
| `--worktree [name]` | Start the session inside a git worktree at `<repoRoot>/.claude/worktrees/<slug>` on branch `worktree-<slug>` (random slug when no name is given). A newly created worktree starts a fresh session (equivalent to `--new`); re-invoking `--worktree <name>` when that directory already exists reuses it and falls back to the default auto-resume. Requires a git repository with at least one commit. |
| `--profile` | Not consumed by the launcher itself: it always forwards `dsh --profile tui`, the canonical command. |

When no explicit choice was made, the TUI reads its own project resume marker
and auto-resumes the project's last session if one exists. `--resume` /
`--new` override the worktree fallback.

## How flags reach the TUI

The launcher is a thin flag translator: it derives the session-mode
environment the TUI plugin consumes (for example `DSH_CC_PROFILE=tui`,
`DSH_CC_RESUME_SESSION=<id>` or `''`, `DSH_CC_CONTINUE='1'`,
`DSH_CC_AUTO_RESUME='1'`, and the worktree descriptor in `DSH_CC_WORKTREE`),
then spawns `dsh --profile tui`. It never reads a resume marker itself —
marker reads and writes are owned by the TUI plugin. The launcher-owned
resume variables are sanitized from the inherited environment at entry and
re-derived only from the current invocation's argv, so do not set them
manually when launching `dsh-cc`.

::: tip
Full details of the `DSH_CC_*` variables live in [/reference/env-vars](/reference/env-vars).
:::

## Next

- [/reference/env-vars](/reference/env-vars) — the `DSH_CC_*` environment contract.
- [/reference/commands](/reference/commands) — slash commands available in the TUI.
- [/reference/permission-modes](/reference/permission-modes) — permission modes inside the session.
