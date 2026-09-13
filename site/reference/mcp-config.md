---
title: MCP configuration
description: The .mcp.json schema, MCP config discovery precedence, the dsh-first gating rule, and the /mcp command for dsh-cc.
distilled-from: dsh-cc v0.6.3
---

# MCP configuration

dsh-cc loads MCP servers from a Claude Code-style `.mcp.json` through
`@dsh-cc/mcp-config`, which parses and validates the document, expands
environment substitutions, applies an enterprise allow/deny policy, and
translates accepted servers into `@dsh-cc/mcp-client` registrations. The
package owns the file→config reading and validation surface only — it performs
no network I/O and mounts nothing. Malformed configuration throws at load; a
failed load is loud rather than a silently missing server.

## The `.mcp.json` schema

The document is a `mcpServers` map keyed by server name (an array of such
objects is also accepted; the array form rejects a name that appears twice):

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

| Shape | `type` | Required | Optional |
|---|---|---|---|
| `stdio` | omitted or `"stdio"` | `command` | `args`, `env`, `cwd` |
| `http` | `"http"` (also accepts legacy `"streamable-http"`) | `url` | `headers` |
| `sse` | `"sse"` | `url` | `headers` |

Each accepted server becomes one `@dsh-cc/mcp-client` registration: the server
name is the `serverName` namespace for model-facing tool names
(`mcp__<serverName>__*`); registrations default `toolCallTimeoutMs` to 60000
and `failOnStartupError` to `true`.

Strings in `command`, `args`, `cwd`, `env` values, `url`, and `headers`
support environment expansion:

| Form | Meaning |
|---|---|
| `${VAR}` | Substituted with the environment value; **throws at load** when unset. |
| `${VAR:-default}` | Falls back to `default` when the variable is unset or empty. |
| `$$` | A literal `$`. |

## Discovery paths

Four default file paths are consulted, in this precedence order:

| # | Path | Class |
|---|---|---|
| 1 | `<project>/.mcp.json` | dsh-native |
| 2 | `$DSH_HOME/.mcp.json` (default `~/.dsh/.mcp.json`) | dsh-native |
| 3 | `$CLAUDE_CONFIG_DIR/.mcp.json` (default `~/.claude/.mcp.json`) | Claude Code |
| 4 | `~/.claude.json` | Claude Code |

`DSH_HOME` relocates the dsh paths and the migrate target; `CLAUDE_CONFIG_DIR`
relocates the Claude config dir but not `~/.claude.json`.

::: warning The dsh-first rule
When a dsh-native config (the project `.mcp.json` or `$DSH_HOME/.mcp.json`)
declares at least one server, Claude Code MCP config files are **not** loaded.
Skipped claude-only servers surface via a logger warn, a one-shot
session-start TUI notice, and a self-clearing `/mcp` status line. Two escape
hatches exist on the cc-shell-glue config: `mcpLoadClaudeFiles: true` restores
the old all-merge behavior, and an explicit `mcpConfigFiles` list bypasses
gating entirely.
:::

An enterprise allow/deny policy can gate servers before translation:
`deny(name, entry)` returning `true` drops the server (runs first, wins); an
`allow` hook, when present, keeps only servers where it returns `true`.
Rejected servers never reach the client.

## `/mcp migrate`

`/mcp migrate` imports servers from Claude Code config files into
`$DSH_HOME/.mcp.json`:

- **Target:** `$DSH_HOME/.mcp.json` (the dsh-native user-level file).
- **Verbatim + atomic:** raw entries are copied as-is, with an atomic write
  and a `.bak` backup of the previous file.
- **Existing names win:** a server already declared in the target is not
  overwritten.
- **Idempotent:** re-running after a successful migrate imports nothing new.

The full migration story, including what else moves over from Claude Code,
lives in [/guide/from-claude-code](/guide/from-claude-code).

## `/mcp` subcommands

| Invocation | Behavior |
|---|---|
| `/mcp` | Lists registered servers (name, connection state, tool count, OAuth requirement). |
| `/mcp reconnect <name>` | Reconnects one server. |
| `/mcp disconnect <name>` | Disconnects one server. |
| `/mcp migrate` | Imports Claude Code servers into `$DSH_HOME/.mcp.json` (see above). |

## Next

- [/guide/mcp-servers](/guide/mcp-servers) — running and troubleshooting MCP servers.
- [/guide/from-claude-code](/guide/from-claude-code) — the full migration walkthrough.
- [/reference/commands](/reference/commands) — every slash command, including `/mcp`.
