---
title: Extension formats
description: Where each Claude Code-compatible extension file lives (hooks, skills, plugins, subagents), with minimal skeletons and links to the full guides.
distilled-from: dsh-cc v0.6.0
---

# Extension formats

dsh-cc consumes the Claude Code extension formats directly: a `hooks.json`, a
`SKILL.md`, a plugin `plugin.json` manifest, and a `.claude/agents/*.md`
subagent definition each mount onto a dsh-cc extension point without
conversion. This page is an index: for each surface it gives the file
location, a minimal skeleton, and a link to the guide that covers behavior in
depth.

## hooks — `hooks.json`

**File location:** a `hooks.json`, or a settings file's `hooks` key, passed to
`@dsh-cc/hooks-claude-code` via its `configPath` config (the cc preset ships a
tracked repo-root `hooks.json`). The path is process-level: a relative path
resolves against the process's launch cwd at load time. A read/parse failure
is contained — the bridge logs a warning and registers nothing.

**Minimal skeleton** (one event, one matcher, one `command` hook with an
explicit `timeout`; the per-hook default is 600 000 ms):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./scripts/gate.sh", "timeout": 5000 }
        ]
      }
    ]
  }
}
```

Four executor kinds are accepted: `command`, `http`, and — off by default,
enabled by the `enablePromptHooks` / `enableAgentHooks` config flags —
`prompt` and `agent` (both fork a one-shot subagent). 18 hook events are
supported; unsupported events in the config are ignored before group parsing.

**Full story:** [/guide/hooks](/guide/hooks)

## skills — `SKILL.md`

**File location:** a skill is a directory bundle `<name>/SKILL.md` under one of
these roots, in precedence order (lower rank wins name conflicts):

| Rank | Source | Path |
|---|---|---|
| 100 | managed | `config.managedDir` |
| 200 | project | `<projectRoot>/.claude/skills` |
| 300 | user | `<dshHome>/skills` |
| 400 | additional | each `config.additionalDirs` |

The project root is the nearest ancestor containing `.git`; without one, the
current cwd is used. Legacy `.claude/commands/*.md` files are also loaded and
marked `deprecated`. The harness-native filesystem provider adds the roots
`<projectRoot>/.dsh/skills`, `<projectRoot>/.agents/skills`, and
`~/.agents/skills` (see [the skills guide](/guide/skills) for the full merged
root set).

**Minimal skeleton:**

```markdown
---
name: my-skill
description: What the skill does and when to use it
---

Body with $ARGUMENTS substitution and optional inline-shell !`cmd` commands.
```

Known frontmatter fields include `allowed-tools`, `argument-hint`, `model`
(including `inherit`), `user-invocable`, `disable-model-invocation`,
`context` (including `fork`), `when_to_use`, and `paths`. Names must be
kebab-case to register. A skill declaring `paths` is conditional: it is not
served until a Read/Write/Edit tool touches a matching file.

**Full story:** [/guide/skills](/guide/skills)

## plugins — `plugin.json`

**File location:** a plugin root holds `.claude-plugin/plugin.json`
(preferred) or a top-level `plugin.json` (legacy). Plugin state is dual-home:
default discovery intersects `enabledPlugins` (cascaded claude-user →
dsh-user → project → local, later files overriding per key) with the merged
`plugins/installed_plugins.json` of both homes — the Claude home
`$CLAUDE_CONFIG_DIR` (else `~/.claude`) stays read-visible while the dsh home
`$DSH_HOME` (else `~/.dsh`) is the write root, dsh entries winning per key.
Explicit `pluginDirs` are flattened instead: the dir itself, or one-level
children, that hold `.claude-plugin/plugin.json` or a top-level
`plugin.json`.

**Minimal skeleton:**

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What the plugin provides"
}
```

`name` is mandatory and kebab-case. Component fields are `commands`, `agents`,
`skills`, `hooks`, `mcpServers`, and `settings`; when `commands` is omitted
the loader scans `commands/*.md`. Unknown top-level fields are ignored. Each
component mounts onto its host seam (`commands`, `subagents`, `skills`,
`hooks`, `mcp`, `settings`); a component whose seam is absent is reported
`skipped`, never failing the whole load. Agents mount namespaced under the
plugin name, so the Task tool dispatches them by scoped id (`plugin:agent`).

**Full story:** [/guide/plugins](/guide/plugins)

## subagents — `.claude/agents/*.md`

**File location:** `.claude/agents` directories discovered from the session's
working directory — the project layer is the nearest `.claude/agents` found by
walking up from the project root, and the user layer is `~/.claude/agents`.
Project shadows user (and the in-package bundled layer sits below both). A
definition is keyed by its file basename, which becomes the `subagent_type`.

**Minimal skeleton:**

```markdown
---
description: When to delegate to this agent
tools: Read, Grep, Glob
model: haiku
---

The agent's system prompt, written as the markdown body.
```

`description` becomes the when-to-use guide; `tools`/`disallowedTools`
compile to an effective allow/deny restriction; `model` (with `inherit`)
resolves through the `ccModelRoutes` alias service; `effort`,
`permissionMode`, `maxTurns`, `initialPrompt`, `background`, `memory`,
`skills`, `mcpServers`, `hooks`, and `isolation` are carried through. Unknown
fields are ignored; a bad known value fails loudly at load. The reserved
types `general-purpose` (fresh spawn) and `fork` (conversation-inheriting
fork) are sentinels — a workspace file named `fork.md` is unreachable.

**Full story:** [/guide/subagents](/guide/subagents)

## Next

- [/guide/hooks](/guide/hooks) — hook events, decisions, and payloads.
- [/guide/skills](/guide/skills) — invocation policy and conditional activation.
- [/guide/plugins](/guide/plugins) — component mounting and discovery.
- [/reference/commands](/reference/commands) — `/plugin` and `/reload-plugins`.
