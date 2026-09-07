---
title: Headless & CI usage
description: How maintainers and CI jobs prove a dsh-cc profile composition boots cleanly without a terminal or LLM calls, and how to collect health diagnostics off-box.
---

# Headless & CI usage

This page is for maintainers and CI authors who need to prove that a dsh-cc
profile composition actually boots — in a fresh `DSH_HOME`, without an
interactive terminal, and with zero LLM calls. It is not a headless batch
mode: dsh-cc is primarily an interactive environment (terminal TUI on the
`tui` profile, browser UI on the `web` profile), and nothing here runs coding
tasks unattended. What you get is a fast, fail-closed boot gate plus
off-box health diagnostics you can attach to a bug report.

## The smoke path: `pnpm smoke:profile-boot`

The dsh-cc repository ships one script dedicated to this job. It is the same
gate that presubmit and publish run, defined in
`scripts/smoke-profile-boot.sh` and exposed through `package.json`:

```sh
$ pnpm smoke:profile-boot
```

What it does, per the script itself:

- Boots the **production TUI bundle set** against a fresh, throwaway
  `DSH_HOME` (a temp directory), and proves the plugin tree mounts.
- Never pre-creates `$DSH_HOME/profiles/node_modules`. The CLI's own
  `prepareProfile()` runs `healProfilesModuleFallback(INSTALL_ANCHOR)`,
  materializing the harness-healed fallback from the harness CLI's install
  tree — the same composition a real user's plugins resolve against.
- Runs the boot under a **pseudo-TTY** (Python's stdlib `pty.spawn`), because
  the TUI refuses a non-TTY stdout. This works on macOS and Linux alike
  whether the script is invoked from a CI step, a pipe, or a hook.
- Makes **zero LLM calls**.
- Passes only if the pty transcript is non-empty, contains `dsh cc-mode`
  (the TUI's first rendered frame, which appears only after the full plugin
  tree has mounted), and has no loader-failure signatures. A healthy gate
  finishes in ~10-15 seconds; a warm-up run outside the timed window absorbs
  a slow cold-cache heal.

::: info
The harness CLI is expected pre-built at `<repo>/../deepseek-harness/apps/cli`;
override the location with `DSH_HARNESS_DIR`. On a local checkout with a
half-built harness `lib/`, the script falls back to an npm-global `dsh` with a
note on stderr. CI runners have no global `dsh`, so a bad harness build fails
the gate instead of rerouting silently.
:::

## Fitting it into a CI job

The script's own error hints name the two build steps it depends on: the
repo's build and the harness CLI's `build:lib`. A minimal job shape:

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm run build
- run: npm --prefix ../deepseek-harness run build:lib
- run: pnpm smoke:profile-boot
```

Requirements on the runner: Node and `python3` (the pty relay is stdlib), on
macOS or Linux. No model endpoint or API key is needed — the gate makes no
LLM calls by design. If the boot fails, the script prints
`smoke:profile-boot FAIL` with the boot log tail, which is what you paste into
an issue.

## Health diagnostics off-box

When a session is misbehaving on a machine you cannot reproduce on, ask for
the built-in health report instead of screenshots. `/doctor` is a full-parity
CC-style command (per the parity matrix) that produces a session health
report without a model turn:

| Invocation | What it does |
| --- | --- |
| `/doctor` | Renders the session health report as text. |
| `/doctor --verbose` | Same checks, verbose rendering. |
| `/doctor --json` | Collects the same report and writes the full JSON to `$DSH_HOME/tui/doctor-report.json` (created with parents, overwritten). The command text in the transcript is only the path, the summary counts, and the fail/warn check ids — never a JSON blob. |

`--verbose --json` used together collect verbose and emit JSON. The JSON file
under `$DSH_HOME` is what you attach to a compatibility report.

The report also covers MCP: `/doctor` reports a Serena connection under the
`mcp.serena` check.

### `DSH_CCTUI_ALLOW_NO_TTY`

The TUI refuses to mount when stdout is not a TTY. Setting
`DSH_CCTUI_ALLOW_NO_TTY='1'` allows mounting the TUI without an interactive
terminal — that is the escape hatch for piping/tapping into a dsh-cc process
from scripts. The smoke gate above deliberately does **not** use it: it gives
the child a real pseudo-TTY instead, because the point of the gate is to prove
the user-grade, interactive-first boot path works. See
[/reference/env-vars](/reference/env-vars) for the full variable catalog.

::: warning
Non-interactive mounting is a diagnostic escape hatch, not a batch mode.
dsh-cc has no headless task runner; for non-terminal interaction use the web
profile below.
:::

## The web profile: the non-terminal surface

If the goal is simply to use dsh-cc without a terminal, the supported answer
is the `web` profile — the same CC-oriented backend exposed through the dsh
web UI. Compose it explicitly (from the README):

```sh
$ dsh plugin --profile web add \
    @dsh-cc/bundle-permissions \
    @dsh-cc/bundle-shell
$ dsh web
```

This is a browser UI, not an automation API — see [/quickstart](/quickstart)
for setup.

## Next

- [/reference/cli](/reference/cli) — the `dsh-cc` launcher and its flags
- [/reference/env-vars](/reference/env-vars) — the environment variable catalog
- [/guide/from-claude-code](/guide/from-claude-code) — migrating existing
  Claude Code workflows
