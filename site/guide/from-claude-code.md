---
title: Migrate from Claude Code
description: Move an existing `.claude/` workspace to dsh-cc and keep your agents, skills, hooks, and MCP servers working.
---

# Migrate from Claude Code

This guide is for a team that has accumulated `.claude/` project assets — agents, skills, `CLAUDE.md`, hooks, settings, MCP servers — and wants model-choice freedom without re-doing that setup work. The CC preset of dsh-cc discovers and loads the familiar Claude Code-style assets in place, so your conventions carry over while the runtime underneath changes.

One positioning note up front, because it matters for expectations: **dsh-cc is not Claude Code and is not a wrapper around Claude Code.** It re-implements many of the same interaction patterns on the DeepSeek Harness runtime, with the deliberate differences listed in [Know before you switch](#know-before-you-switch).

## What carries over as-is

You do not copy or convert anything in this list — the CC preset discovers the existing files where they are:

| Asset | How it carries over |
| --- | --- |
| `.claude/agents/*.md` | Project-local Claude Code-style agent definitions under `.claude/agents` can be discovered and dispatched by the CC preset. Agent frontmatter can continue using familiar model aliases while dsh decides which provider/model actually serves the request. |
| `SKILL.md` skills | Discovered by the CC skill provider, including project-specific skills and bundled utility skills. |
| `CLAUDE.md` | The memory layer supports `CLAUDE.md`-style context plus a dedicated write channel for durable memories. Memory is isolated by workspace, with optional shared team memory. |
| `hooks.json` | Claude Code-style hooks react to session, prompt, tool, permission, compaction, task, and subagent lifecycle events; the CC preset loads the tracked `hooks.json` from the launch cwd. See [Know before you switch](#know-before-you-switch) for the bridged event set. |
| `.claude/settings.json` | Project `.claude/settings.json` files shared with a Claude Code checkout work as-is — see [Settings mapping](#settings-mapping). |
| Installed Claude Code plugins | Discovered from the Claude home (`~/.claude`) in read-only fashion — nothing there is ever modified or deleted. Anything you install or change through `/plugin` in dsh-cc writes to the dsh home (`~/.dsh`) instead; see [Plugins](/guide/plugins). |
| Slash-command habits | The CC preset exposes a growing command surface (`/cost`, `/doctor`, `/status`, `/memory`, `/skills`, `/config`, `/permissions`, `/mcp`, `/plugin`, and more), so muscle memory mostly transfers. |

Subagent frontmatter model aliases are recognized, but the actual provider/model is decided by dsh's routing — that is the point of moving.

## MCP servers

This is the one area where dsh-cc deliberately diverges from Claude Code, so it gets its own step.

### The dsh-first precedence rule

When a dsh-native config — the project `.mcp.json` or `~/.dsh/.mcp.json` — declares at least one server, Claude Code MCP config files (such as `~/.claude/.mcp.json` and `~/.claude.json`) are **not** loaded. Skipped claude-only servers surface through a logger warning, a one-shot session-start notice, and a self-clearing line in `/mcp` output, for example:

```text
MCP: dsh config takes precedence — skipped Claude Code MCP config: ~/.claude/.mcp.json (2 servers), ~/.claude.json (1 server). Run /mcp migrate to import them into ~/.dsh/.mcp.json, then restart the session.
```

Two escape-hatch settings restore the old all-merge behavior:

- `mcpLoadClaudeFiles: true` — on cc-shell-glue; loads the Claude Code MCP files again.
- An explicit `mcpConfigFiles` list — bypasses gating entirely.

### `/mcp migrate`

`/mcp migrate` imports the Claude Code `mcpServers` into `~/.dsh/.mcp.json`. Exact behavior:

- Server entries are copied **raw** — no `${VAR}` expansion, no name normalization, no transport reshaping. What Claude Code had on disk is what lands in the target.
- The target is read first: absent → created as a `mcpServers` map; an existing map → merged in place with existing keys first; other top-level keys are preserved.
- **Name collisions: existing target names win** — they are reported as `kept` and never overwritten. Across sources, the first declaration wins; subsequent duplicates are reported with which source kept vs. skipped.
- If the target already exists, it is first copied to `~/.dsh/.mcp.json.bak`; the new file is then written via a same-directory temp file + atomic rename. The backup duplicates any secrets in `env`/`headers` — treat it accordingly.
- If there is nothing to migrate, dsh-cc reports so and writes nothing (idempotent — safe to re-run).
- The Claude Code source files are never modified; you may remove them manually afterward.

After migrating, **restart the session** — servers become visible only then — and run `/mcp` to inspect the imported connections. `/mcp migrate` is pure file I/O and works even before MCP connections are mounted.

## Settings mapping

Two files matter, and they are not rivals — they sit in the settings cascade:

- `~/.dsh/settings.json` — the dsh-native **user** settings file. For example, a custom status line block can live here.
- `.claude/settings.json` — the project file **shared with a Claude Code checkout**. It works as-is; no rename, no reformat.

Key aliasing: if both a camelCase `statusLine` and a dsh-native kebab-style `statusline` key are present, the dsh-native key wins. Your existing Claude Code key works; dsh-native keys take precedence on conflict.

Two honest caveats from the sources:

- Settings file sources **hot-reload** in a running session — the user, project, and git-hoisted local files are watched, and a malformed mid-write document keeps the last-good state. Outside hot-reload: inline `--settings` content, remote policy, and `hooks.json` (see [/reference/settings](/reference/settings)).
- `ANTHROPIC_*` environment variables are **not honored** — there are no Anthropic semantics in dsh-cc. Model and endpoint configuration goes through dsh's own provider/model routing instead, e.g. via the `/provider` command and the model-alias settings namespaces.

## Know before you switch

Honest differences worth knowing before your team commits. Each row of the full matrix lives in [/reference/compatibility](/reference/compatibility):

- **No `/rewind`.** File checkpointing and rewind are missing — there is no per-prompt file-snapshot seam yet. Session persistence, resume, and fork are full parity; `/resume` lists sessions but switching is host-owned (`dsh --resume <id>`).
- **Subagent background semantics differ.** Omitting `run_in_background` keeps the child foreground unless the agent definition pins `background: true` — unlike Claude Code's interactive omit=background. Background children are continuable and addressable by `agentId` (`send_message` / `interrupt`), with Ctrl+B promotion as a TUI-only surface.
- **Hook events are partially bridged.** Session, prompt, tool, permission, task, and subagent lifecycle events are largely full parity, but several upstream events have no dsh emit point yet — for example PreCompact, PostToolBatch, MessageDisplay, and UserPromptExpansion are not bridged. Prompt/agent hook executors exist but are gated behind `enablePromptHooks` / `enableAgentHooks` (default off). See the bridged event set in [/reference/compatibility](/reference/compatibility).
- **Some slash commands are host-owned.** `/model` and `/exit` are deliberately not preset commands — the dsh-native TUI equivalents (`/model`, `/effort`, the idle double Ctrl+C gesture) serve those roles. Others are partial, e.g. `/config` is a text-only render/patch with an allowlisted key set, and `/init` drives a follow-up turn that writes/refreshes `CLAUDE.md`.
- **Status line is close but not identical.** The command output is rendered as up to 3 rows (CC renders every row), dsh-cc appends its own mode row below the command output, and a subset of stdin payload fields is supplied — only the fields dsh-cc can source truthfully.
- **`ANTHROPIC_*` env vars are not honored** (see above) — provider and API-key configuration follows dsh-cc's own credential and routing model.

## Migration checklist

A concrete path from a `.claude/` checkout to a working dsh-cc session:

1. **Install dsh-cc** from the `@dsh-cc` npm scope and pick a profile (the CC preset is enabled by default on `tui`). Your `.claude/` assets stay where they are.
2. **Launch in the project directory** so the CC preset discovers `.claude/agents`, `SKILL.md` skills, `CLAUDE.md`, `hooks.json`, and `.claude/settings.json` from the launch cwd.
3. **Run `/mcp migrate`** to import Claude Code MCP servers into `~/.dsh/.mcp.json` — or set `mcpLoadClaudeFiles: true` if you prefer all-merge behavior. Then restart the session.
4. **Run `/mcp` and `/doctor`** to verify MCP connections and overall session health; run `/skills` and `/memory` to confirm skills and `CLAUDE.md` context were picked up.
5. **Configure providers and models** via `/provider` (and the model-alias settings) — remember `ANTHROPIC_*` env vars are not honored — then check `/config` and `/permissions` for the settings that matter to your team.

## Next

- [/quickstart](/quickstart) — get a session running if you have not yet.
- [/guide/mcp-servers](/guide/mcp-servers) — manage MCP servers after migration.
- [/reference/settings](/reference/settings) — the full settings cascade.
- [/reference/compatibility](/reference/compatibility) — the complete Claude Code parity matrix behind every claim above.
