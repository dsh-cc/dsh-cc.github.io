---
title: Subagents
description: Write Claude Code-style agent definitions under .claude/agents and dispatch them from the main agent with subagent_type.
---

# Subagents

Subagents are focused, fresh-context helpers the main agent delegates work to. Each one is a markdown file under `.claude/agents` in your workspace; the file's frontmatter controls which model and tools the child gets, and the body becomes the child's system prompt. This page covers **authoring** those definitions — how to run background or resumed agents is covered in [/guide/background-tasks](/guide/background-tasks).

## The file contract

Each file in `.claude/agents` is one agent definition. The body of the file (everything after the frontmatter) is the agent's **system prompt** — its persona and instructions. The YAML frontmatter controls dispatch behavior.

```text
.claude/
  agents/
    reviewer.md
    debugger.md
```

Discovery is scoped to the **session's** working directory, not the host process cwd — so definitions are visible even when the harness is started from elsewhere. Both a user layer and a project layer are loaded, with the project layer shadowing the user layer.

### Frontmatter fields

Only the fields the loader actually consumes:

| Field | What it does |
| --- | --- |
| `description` | One-line summary of what the agent is for. This is what the `Available subagents` system-prompt section renders, so it is what drives dispatch — the main model picks an agent by reading these descriptions. |
| `model` | A Claude-Code-style model alias (`sonnet`, `opus`, `haiku`, `fable`, `inherit`, …). Resolved through the `ccModelRoutes` service at spawn time; see [/guide/model-routing](/guide/model-routing). |
| `tools` | Restricts the child's tool set (allow/deny). See the tools section below. |
| `background` | Pin the agent to launch as a continuable background agent. See below. |

The loader also parses CC frontmatter fields such as `permissionMode`, `isolation`, `memory`, and `effort`, but v1 does not project them onto the child — a definition using them behaves as if the field were absent.

Fields that are omitted fall back sensibly: an omitted `model` inherits the parent's route; an omitted `tools` leaves the child with the full parent tool view.

### A minimal example

```markdown
---
description: Fast codebase lookups
model: haiku
---

You are a read-only codebase scout. Return paths and line numbers,
not implementations.
```

The body above is delivered to the child as its system prompt; the task text you pass when delegating becomes the child's first user message.

## Dispatch

The main agent delegates with the `Task` tool, passing the agent's name as `subagent_type`. Your session's system prompt renders an `Available subagents` section listing the workspace's file definitions, for example:

```text
## Available subagents

- explore — a fast, read-only codebase scout; returns paths and line numbers, not implementations
- dsh-cc-guide — answers questions about dsh-cc itself: commands, tools, settings, known limits

To delegate to one, pass its name as the `subagent_type` argument of the Task tool.
```

The section lists workspace file definitions plus any agents mounted by plugins, the latter by their scoped `plugin:agent` ids — backend provider names are never shown as addressable types.

Dispatch follows five cases:

1. **`subagent_type` omitted, blank, or `general-purpose`** — a fresh spawn of the caller: your prompt text becomes the child's first user message, no definition participates, and no parent conversation is copied. Write a self-contained prompt.
2. **`subagent_type: "fork"`** — a conversation-inheriting fork of the caller: completed parent turns seed the child; no definition participates. `fork` is a **reserved sentinel** and wins over a workspace file of the same name, so `.claude/agents/fork.md` is unreachable.
3. **A type matching a definition** in the workspace — a spawn whose persona is the definition's body, whose model route is the alias-resolved `model:`, and whose tools are filtered by the sanitized `tools:` value. The child runs with a maximum delegation depth of 3.
4. **A scoped id `plugin:agent` matching a plugin-mounted agent** — folded identically to a workspace definition (persona, sanitized tools, alias-resolved model, max depth 3, background pin). Plugin agents are addressable **only** by their scoped id — a bare plugin agent name is not addressable, matching Claude Code. File definitions and scoped ids occupy disjoint name spaces: a workspace file whose `agentType` contains `:` is skipped with a warning at discovery.
5. **Anything else** — an error result listing the available types in the workspace (or noting the workspace defines none), with a colon-aware hint when the type contains `:`.

### Bundled agents

The cc preset bundles two agents in addition to anything your workspace defines:

| Agent | What it is |
| --- | --- |
| `explore` | A fast, read-only codebase scout. When a Serena MCP server is connected, it additionally carries read-only symbol retrieval (`mcp__serena__find_symbol`, `mcp__serena__find_referencing_symbols`, `mcp__serena__get_symbols_overview`). |
| `dsh-cc-guide` | Answers questions about dsh-cc itself — commands, tools, settings, known limits. |

## Behavior controls

### `model:` and alias routing

The `model:` frontmatter field is resolved through `ccModelRoutes` on every spawn, so `model: haiku` lands on whatever your `haiku` lane maps to at that moment — remapping a lane needs no change to the definition. If the alias service is absent, every child simply inherits its parent's route. Details and examples: [/guide/model-routing](/guide/model-routing).

### `tools:` restrictions

A `tools:` frontmatter value narrows the child's tool set and is sanitized against the tools actually registered at spawn time:

- Names the registry does not know are dropped with a warning — including MCP tools of servers that are not mounted.
- `mcp__<server>__<tool>` entries are kept as written and must be the tool's public name; `mcp__<server>` and `mcp__<server>__*` expand to every mounted tool of that server. A bare `mcp__` is dropped as an invalid wildcard.
- An allow list is loud about matching nothing: if sanitization leaves zero names, the child runs with **zero tools** (with a warning), because omitting `allow` entirely would instead widen it to every tool.
- Explicit `tools:` entries that are still deferred are preloaded before the child starts; server-level wildcards are restrict-only and never preloaded.

### `background: true`

By default a `Task` call is **foreground**: the tool waits for the child to finish and returns its text output. Setting `background: true` in the definition pins the agent to launch as a durable, continuable background agent — the call returns promptly with an `agentId` and the result arrives later as a wake message. The caller can still override the pin: an explicit `run_in_background: false` forces foreground, and `run_in_background: true` starts any agent in the background.

Running, resuming, interrupting, and inspecting background agents (`send_message` / `interrupt` / `list`, `/tasks`, `/agents`) is covered in [/guide/background-tasks](/guide/background-tasks).

## Notes and limits

As of dsh-cc v0.6.0:

- **`/agents` is partial.** It is a thin snapshot (list/detail/stop) over running agents; groups are residency-only and `/agents` attach is reserved but unimplemented.
- **Process-level discovery cache.** Definitions are cached per workspace root for the process lifetime with no filesystem watcher: edits take effect on the next session for an uncached workspace, and on process restart otherwise.
- **Cold resume is pinned.** A background child's persona, tool filter, model route, and `maxTokens` are restored from its resume pin — a pin recording an unset reasoning-effort or token field is honored as absent rather than re-resolved. Other agent options do not survive resume.
- **No TaskOutput alias or outputFile field.** Foreground results come back as text; there is no output file.
- **Workspace instructions are stripped from Task children.** Unlike Claude Code custom subagents, delegated children do not receive the workspace `CLAUDE.md` / `AGENTS.md` baseline in their visible batch (a fork child still inherits what was already in the parent seed).

## Next

- [/guide/background-tasks](/guide/background-tasks) — running, resuming, and interrupting background agents.
- [/guide/skills](/guide/skills) — `SKILL.md`-based skills, the other extension surface.
- [/reference/extension-formats](/reference/extension-formats) — the file formats dsh-cc reads, including `.claude/agents`.
