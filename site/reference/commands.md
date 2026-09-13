---
title: Slash commands
description: Reference catalog of every slash command in dsh-cc — preset (harness) commands and TUI-local commands, with parity status.
distilled-from: dsh-cc v0.6.3
---

# Slash commands

dsh-cc has two slash-command layers. **Preset commands** are registered by the
CC preset through `ctx.commands`; they run without a model turn and are
available in every surface that dispatches harness commands. **TUI-local
commands** are owned by the terminal surface (`packages/ui/tui/src/slash.ts`);
the TUI handles them without calling `ctx.commands`, and some names (`/resume`,
`/model`, `/agents`, `/cost`, `/provider`) exist in both layers — in the TUI the
local implementation wins. Every command below executes without a model turn
unless noted (`/init` queues one).

Parity is from `docs/cc-parity-matrix.md` (Full/Partial). A blank cell means
the matrix does not state a status for that command.

## Session

| Command | What it does | Parity |
| --- | --- | --- |
| `/resume` | List recent sessions (id, title, cwd, availability, start time) so you can pick one to resume. Switching is host-owned (`dsh --resume <id>`). | Partial |
| `/branch [note]` | Fork the current session into a new child branch and report the child session id. Switching to the child requires a restart. | Partial |
| `/compact` | Compact the session, with optional preservation instructions. | Full |
| `/rename <title>` | Pin an explicit user title on the current session. | Full |
| `/export` | Write the current session transcript to a file as markdown (default) or lossless JSON. | Full |
| `/tasks` | List caller-visible background jobs and their status. | Partial |
| `/agents` | List, inspect, and stop continuable background agents: `/agents <id>` for detail, `/agents stop <id>` to interrupt one (it stays resumable). `/agents attach <id>` is a reserved, unimplemented namespace. | Partial |
| `/plan` | Plan mode channel (exit via `exit_plan_mode`). | Full |
| `/learn [apply\|all\|days=N]` | Distill recurring session failure patterns into workspace memory. Dry-run by default — only `apply` writes. `apply` writes the `session-learnings` memory topic (a managed marker block, regenerated wholesale; content outside the block is untouched) and updates `MEMORY.md`; `all` scans every project instead of the current workspace; `days=N` overrides the recency window (default 14). Tuned via the `cc-learn` settings namespace (`enabled` default true, `days` 14, `min-occurrences` 2). | Full |

## Model & provider

| Command | What it does | Parity |
| --- | --- | --- |
| `/provider` | Manage LLM providers and API keys. Subcommands: `/provider list` prints current routes, `/provider add <preset-id>` walks a wizard for built-in presets (Moonshot, Z.AI/Zhipu, DeepSeek) or a custom endpoint, `/provider remove <route>` removes a route. The detail view rotates keys, refreshes the model list, and sets the default. Keys go to the credential store (`~/.dsh/.credentials.yaml`), never settings. | Full |
| `/model <n\|provider/id>` | List or switch the active model. | Full |
| `/effort <level\|default>` | Set reasoning effort for the current model. | — |

## Configuration

| Command | What it does | Parity |
| --- | --- | --- |
| `/config` | Show or update effective configuration namespaces (text-only render/patch with an allowlisted key set, not an interactive editor). | Partial |
| `/permissions [mode]` | Inspect or change permission mode/rules (CC rule-engine modes); the bare invocation opens a TUI overlay. | Full |
| `/memory` | List memdir memory files (name, type, first line) or print one memory's body by name. | Full |
| `/skills` | List every available skill with description, source, and invocation policy (model, user, or both). | Full |
| `/init` | Scan a project and scaffold CLAUDE.md via a queued model turn. | Partial |
| `/mcp` | Manage MCP connections: `/mcp` lists registered servers (name, connection state, tool count, OAuth requirement), `/mcp reconnect <name>`, `/mcp disconnect <name>`. `/mcp migrate` imports servers from Claude Code config files into `$DSH_HOME/.mcp.json` (raw entries verbatim, atomic write, `.bak` backup). | Full |
| `/plugin` | Manage plugins and marketplaces: `list [--enabled\|--disabled]`, `install\|uninstall\|enable\|disable\|update <plugin[@mkt]> [--scope user\|project\|local]`, `marketplace list\|add <source>\|remove <name>\|update [name]`. Text output only (no interactive menu); a static trust-warning line replaces interactive consent; installs trigger a rescan — restart the session for new agents/hooks. Not implemented: `details`/`eval`/`init`/`prune`/`tag`/`validate`, `--config`, `--sparse`, managed scope. | Partial |
| `/reload-plugins` | Rescan the on-disk discovery roots and remount plugins live. | Full |
| `/output-style` | Manage output styles. | Full |

## System & diagnostics

| Command | What it does | Parity |
| --- | --- | --- |
| `/doctor` | Session health report (`--verbose` for the verbose rendering, `--json` for a JSON file under `$DSH_HOME`). | Full |
| `/status` | Session status summary: current model, permission preset, session id, working directory. | Full |
| `/diff` | Show git diff summary or a file diff via the shell; also inspects CLAUDE.md / settings differences. | Full |
| `/cost` | Per-model session usage and cost, folded against the deployment price table. The CC preset ships a starter table of official published list prices (USD per 1M tokens); a runtime id with a route prefix (e.g. `llmbox_ant/glm-5.3`) matches the bare model row via `/`-suffix longest-row-wins matching, and there is no `*` wildcard — unmatched models report "no price configured" instead of a misleading zero cost. Prices live in the preset's `modelTable` config. | Full |
| `/cache-health` | Shows prompt-cache prefix stability (stable prefix segment count, estimated tokens, changed-since-last-call flag, drift table) joined with provider-metered cache read/write ratios for this session. A passive observer, detector-only: it reports, never rewrites requests. Disabling is composition config (`config.enabled` in the CC preset's cordis yml), not a settings namespace. | Full |
| `/stats` | Session event statistics: turn and step counts, tool-call distribution, token usage totals. | Full |
| `/version` | Print the plugin bundle version and, when the host surfaces one, the harness version. | Full |
| `/release-notes` | Print the bundled release notes changelog. | Full |
| `/help` | List every registered slash command, or show one command's detail including its input hint (`/help <cmd>`). | Full |

## TUI-local commands

The following names are handled by the TUI itself (descriptions verbatim from
`packages/ui/tui/src/slash.ts`). The preset-side `/model` and `/exit` are
host-owned by design and out of parity scope; the dsh-native equivalents are
these local commands.

| Command | What it does | Parity |
| --- | --- | --- |
| `/quit` | Exit the TUI session. | |
| `/exit` | Exit the TUI session. | |
| `/clear` | Start a new conversation (empty context). Previous session stays resumable. | |
| `/new` | Alias of `/clear`. | |
| `/reset` | Alias of `/clear`. | |
| `/tui-help` | Show TUI keyboard and command help. | |
| `/resume <sessionId>` | Switch to a resumed session (picker or by id). | |
| `/model <n\|provider/id>` | List or switch the active model. | |
| `/effort <level\|default>` | Set reasoning effort for the current model. | |
| `/agents [<id>\|stop <id>]` | List, inspect, or stop background agents. | |
| `/cost` | Show token usage. | |
| `/usage` | Open the live token and context usage panel. | |
| `/export-md <path>` | Export the transcript to a Markdown file. | |
| `/copy` | Copy the latest assistant reply to the clipboard. | |
| `/provider [list \| add <preset-id> \| remove <route>]` | Manage LLM provider routes and API keys. | Full |
| `/onboard` | Re-run the first-run setup (clears the onboarding opt-out). | |

## Notes

- Every slash command — preset and TUI-local — accepts a trailing `help` (or
  `-h` / `--help`) argument that prints its usage, parameters, and
  subcommands without a model turn; the `/help` index advertises this.
- Plugin commands in the colon form `plugin:command` (e.g. `codex:review`)
  dispatch through the `ccPlugins` service and are treated as local commands by
  the TUI.
- A hand-typed unknown `/name` that no registered command matches falls through
  to a user prompt, so user-invocable skills reach the model the same way a
  menu pick would.
- `dsh-cc` is not Claude Code and is not a wrapper around Claude Code.
