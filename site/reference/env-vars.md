---
title: Environment variables
description: The environment variables dsh-cc reads and sets, with defaults from the launcher and TUI source.
distilled-from: dsh-cc v0.5.0
---

# Environment variables

This page catalogs the environment variables involved in launching dsh-cc: the
home directory the launcher bootstraps into, the resume/worktree contract the
`dsh-cc` launcher passes to the TUI plugin, and TUI escape hatches. Each name,
value, and default below is taken verbatim from the
[`packages/launcher/tui`](https://github.com/dsh-cc/dsh-cc) launcher and TUI
source at v0.5.0.

## Reference

| Variable | Default | What it does |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | Root of the dsh home directory. The launcher resolves it as `process.env.DSH_HOME || join(homedir(), '.dsh')` to locate `profiles/tui` and to default the Node compile cache. |
| `DSH_CC_PROFILE` | `tui` | Set by the launcher on the spawned `dsh` child; the TUI plugin reads it as `process.env.DSH_CC_PROFILE || 'tui'` to report the active dsh profile. |
| `DSH_CC_RESUME_SESSION` | *(launcher-derived)* | Launcher-owned. Set to a session id to resume it (`--resume <id>` / `--resume=<id>`), or to the empty string for an explicit fresh start (`--new`/`-n`, or a freshly created worktree). The launcher sanitizes it from the inherited environment and re-derives it from argv only — do not set it manually. |
| `DSH_CC_AUTO_RESUME` | *(launcher-derived)* | Launcher-owned. Set to `'1'` exactly when `DSH_CC_RESUME_SESSION` is left undefined, i.e. no explicit `--resume`/`--new` chose the session; the TUI then reads its own project resume marker. Do not set it manually. |
| `DSH_CC_CONTINUE` | *(launcher-derived)* | Launcher-owned. Set to `'1'` when `-c`/`--continue` was passed; the TUI shows a "no previous session to continue" notice when no marker exists. Do not set it manually. |
| `DSH_CC_WORKTREE` | *(launcher-set)* | Set by the launcher to a JSON descriptor (`repoRoot`, `worktreePath`, `branch`, `baseHead`) so the TUI recognizes the session as a launcher-managed worktree session and offers to keep or remove the worktree at `/quit`. |
| `DSH_CCTUI_UI_MODE` | `regular` | TUI display mode: `regular` or `fullscreen`. Beats plugin config, config beats the default — use it as the instant escape hatch when a profile pins fullscreen and the terminal cannot cope. |
| `DSH_CCTUI_ALLOW_NO_TTY` | *(unset)* | Set to `'1'` to allow mounting the TUI without an interactive terminal (stdout not a TTY). |
| `NODE_COMPILE_CACHE` | `<DSH_HOME>/.cache/node-compile-cache` | Node's module-compile cache directory. The launcher defaults it on the spawned `dsh` child so compiled modules are reused across boots; a user-set value always wins. |

::: warning
`ANTHROPIC_*` environment variables are **not** honored. Per the CC parity
matrix, they are a listed follow-up under model aliases — dsh-cc currently has
no Anthropic semantics for them. Configure models through settings instead
(see /reference/settings).
:::

## Usage

Opt out of fullscreen mode for one invocation (from the README's CC Mode
section):

```sh
$ DSH_CCTUI_UI_MODE=regular dsh --profile tui
```

First run of the launcher bootstraps `$DSH_HOME/profiles/tui` with the three CC
bundles and then spawns `dsh --profile tui`:

```sh
$ dsh-cc --resume <id>
```

The launcher translates `--resume <id>` into `DSH_CC_RESUME_SESSION=<id>`; the
TUI plugin performs the actual resume. You never need to set the
launcher-owned variables yourself.

## Next

- /reference/settings — configuration files and keys
- /reference/cli — the `dsh-cc` launcher and its flags
- /quickstart — install and first run
