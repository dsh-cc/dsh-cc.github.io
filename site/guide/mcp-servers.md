---
title: MCP servers
description: Connect MCP servers (tools, resources, prompts) to your dsh-cc agent via `.mcp.json` files, and wire optional Serena code intelligence.
---

# MCP servers

This guide is for anyone who wants to give their dsh-cc sessions extra capabilities — GitHub access, web fetching, custom internal tools, or symbol-level code intelligence. The CC preset includes an MCP client that connects [Model Context Protocol](https://modelcontextprotocol.io) servers and exposes their tools, resources, and prompts to the agent, with OAuth 2.1 flows supported for authenticated servers.

## Configuration: `.mcp.json`

Servers are declared in a `.mcp.json` document under a `mcpServers` map. A typical document:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    },
    "web": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${MCP_TOKEN}" }
    },
    "feed": {
      "type": "sse",
      "url": "https://sse.example.com/events"
    }
  }
}
```

Three server shapes are supported:

| Shape | `type` | Required | Notes |
| --- | --- | --- | --- |
| `stdio` | omitted or `"stdio"` | `command` | `args`, `env`, `cwd` optional |
| `http` | `"http"` (also accepts legacy `"streamable-http"`) | `url` | `headers` optional |
| `sse` | `"sse"` | `url` | `headers` optional |

Strings in `command`, `args`, `cwd`, `env` values, `url`, and `headers` support `${VAR}` substitution (throws at load when unset), `${VAR:-default}` fallbacks, and `$$` for a literal `$`.

## Discovery order

When no explicit config is given, dsh-cc discovers `.mcp.json` files in this order:

| # | File | Category |
| --- | --- | --- |
| 1 | `<cwd>/.mcp.json` | dsh-native (project) |
| 2 | `$DSH_HOME/.mcp.json` (default `~/.dsh/.mcp.json`) | dsh-native (user) |
| 3 | `$CLAUDE_CONFIG_DIR/.mcp.json` (default `~/.claude/.mcp.json`) | Claude Code config |
| 4 | `~/.claude.json` | Claude Code config |

Plugins can additionally declare MCP servers in their manifest (`mcpServers` or `.mcp.json`) — see [Plugins](/guide/plugins). Plugin-declared servers mount first: a plugin server with the same name shadows a `.mcp.json` server, and OAuth is not supported for plugin-declared servers.

### The dsh-first precedence rule

dsh-cc applies a deliberate dsh-first rule with no Claude Code analog: when a dsh-native config (the project `.mcp.json` or `$DSH_HOME/.mcp.json`) declares at least one server, Claude Code MCP config files are **not** loaded. Skipped claude-only servers surface via a logger warn, a one-shot session-start TUI notice, and a self-clearing `/mcp` status line.

Two escape hatches restore or override the merge behavior:

| Knob | Effect |
| --- | --- |
| `mcpLoadClaudeFiles: true` | On cc-shell-glue, restores the old all-merge behavior (Claude Code files load even when dsh-native configs declare servers). |
| `mcpConfigFiles` | An explicit list of `.mcp.json` paths; bypasses gating entirely and is honored verbatim. |

::: info
Per the parity matrix, MCP config discovery precedence is marked **divergent / partial** relative to Claude Code — this gating is a dsh-cc-specific behavior, not a Claude Code compatibility surface.
:::

Malformed configuration fails loudly at load — a non-object body, a missing or non-map `mcpServers`, a duplicated name, an unknown transport type, a missing required `command`/`url`, or an unset `${VAR}`.

## Managing in-session

Use `/mcp` to inspect and manage MCP connections:

| Command | What it does |
| --- | --- |
| `/mcp list` | List the registered MCP servers and their connections |
| `/mcp reconnect <name>` | Reconnect one server by name |
| `/mcp disconnect <name>` | Disconnect one server by name |

If you are coming from Claude Code, `/mcp migrate` imports your Claude Code MCP servers into `$DSH_HOME/.mcp.json` (raw entries verbatim, atomic write with a `.bak` backup; existing names win). See [Migrate from Claude Code](/guide/from-claude-code) for the full migration flow.

## Worked example: Serena code intelligence

[Serena](https://github.com/oraios/serena) is an MCP server that provides symbol-level code intelligence. When your MCP configuration connects it, dsh-cc automatically takes advantage of it: the system prompt steers toward Serena's symbol tools for code questions, and the bundled `explore` subagent gains read-only symbol retrieval. Serena is strictly optional — without it, sessions behave identically through the built-in Read/Grep tools, minus the steering hints.

Add it to `~/.dsh/.mcp.json` (or a project `.mcp.json`):

```json
{
  "mcpServers": {
    "serena": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/oraios/serena@v1.7.0", "serena", "start-mcp-server", "--context", "claude-code", "--project-from-cwd"]
    }
  }
}
```

Restart the session, then verify with `/doctor` — it reports the connection under the `mcp.serena` check.

For operational upkeep, the code-intelligence health runbook documents two Serena-side commands:

```bash
$ uvx --from git+https://github.com/oraios/serena@v1.7.0 serena project health-check
```

```bash
$ uvx --from git+https://github.com/oraios/serena@v1.7.0 serena project index
```

Notes from the runbook:

- `health-check` exits 1 on failure (since v1.7.0); a zero-match `find_symbol` during the check counts as failure. It spawns a separate uvx instance with its own language server — it validates project configuration, not the live session's server.
- `index` pre-warms the symbol cache, which is per-worktree: a fresh worktree starts cold even if the main checkout is already indexed. Pre-warming is optional — useful for long sessions on large projects, skippable otherwise.
- Startup failures are loud in logs but not told to the model (`failOnStartupError` defaults to `true`): if `mcp__serena__*` calls fail mysteriously, check the harness logs first.

## Enterprise allow/deny policy

The `@dsh-cc/mcp-config` loader applies an enterprise allow/deny policy before servers are translated into client registrations: a `deny(name, entry)` hook returning `true` drops a server (runs first, wins), and when an `allow(name, entry)` hook is present, only servers where it returns `true` are kept. Policy happens after parsing and validation but before translation, in stable config order, and rejected servers never reach the client. This is a library-level `McpConfigPolicy` hook for deployments that compose the loader programmatically.

## Next

- [Migrate from Claude Code](/guide/from-claude-code) — bring your existing `.claude/` workspace, including MCP servers, over to dsh-cc.
- [MCP configuration reference](/reference/mcp-config) — the full `.mcp.json` schema, env expansion, and policy details.
- [Quick start](/quickstart) — install dsh-cc and start your first session.
