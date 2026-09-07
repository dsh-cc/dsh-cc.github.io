---
title: Plugins
description: How dsh-cc composes itself from dsh profiles and bundles, and how it loads existing on-disk Claude Code plugins.
---

# Plugins

"Plugins" means two complementary things in dsh-cc, and this page covers both:

- **Story A — dsh-native composition.** dsh-cc itself is installed as ordinary dsh plugins grouped into `@dsh-cc/bundle-*` packages and mounted into a dsh profile. Your local tweaks live in a `cordis.patch.yml` file.
- **Story B — Claude Code plugin loading.** Through the cc-plugin-loader, dsh-cc can discover and mount existing on-disk Claude Code plugins (a `plugin.json` manifest plus component directories), so plugin assets you already have keep working.

Prerequisites: dsh >= 0.1.0-rc.5 with the `@dsh-cc/cli` launcher installed (`npm install -g @dsh-cc/cli`).

## Story A: dsh profiles and bundles

### How dsh-cc is installed

The `dsh-cc` launcher creates and boots the CC-oriented `tui` profile. To compose the profile explicitly instead of relying on the launcher:

```sh
$ dsh plugin --profile tui add \
    @dsh-cc/bundle-permissions \
    @dsh-cc/bundle-shell \
    @dsh-cc/bundle-tui
$ dsh --profile tui
```

The same backend also works with the dsh web UI:

```sh
$ dsh plugin --profile web add \
    @dsh-cc/bundle-permissions \
    @dsh-cc/bundle-shell
$ dsh web
```

The three installable bundle packages mounted by the command above are
`@dsh-cc/bundle-permissions`, `@dsh-cc/bundle-shell`, and `@dsh-cc/bundle-tui`
(the `web` profile omits `bundle-tui`, since it has no terminal surface).

Official packages come only from the `@dsh-cc` npm scope.

### Local tweaks with cordis.patch.yml

Your profile remains ordinary dsh composition. Local tweaks can be placed in:

```text
~/.dsh/profiles/tui/cordis.patch.yml
```

They are applied after the installed bundles, so a patch file is the place to adjust or override what a bundle mounted without forking anything.

::: tip
Treat the bundle packages as the "installed base" and `cordis.patch.yml` as your thin local layer on top. Upgrade bundles through `dsh plugin ... add`; keep only genuinely personal rows in the patch file.
:::

## Story B: loading Claude Code plugins

dsh-cc ships a compatibility plugin loader that reads a Claude Code plugin's `plugin.json` manifest and mounts each component as an in-memory dsh plugin. It is not a runtime of its own: it produces typed mounts and a structural report, leaving execution to the host seams it registers onto.

### Where plugins are discovered

By default, discovery uses the on-disk Claude Code layout:

- The Claude home is `$CLAUDE_CONFIG_DIR`, falling back to `~/.claude`.
- The enabled set is the intersection of `enabledPlugins` (cascaded through user → project → local settings) and `{claudeHome}/plugins/installed_plugins.json`. Keys must be exact `name@marketplace` entries.
- Unreadable JSON and missing `installPath`s are skipped rather than throwing an error.

If you configure explicit plugin directories instead, those dirs are flattened: the directory itself, or its one-level children, are used as plugin roots when they hold `.claude-plugin/plugin.json` or a top-level `plugin.json`. Marketplace-only directories are not flatten roots. An empty list disables discovery.

### Manifest forms

For each plugin root, the manifest is resolved in this order:

1. `${root}/.claude-plugin/plugin.json` — the preferred Claude Code path.
2. `${root}/plugin.json` — legacy / explicit-plugin-dirs form.
3. `${root}/.claude-plugin/marketplace.json` matching the plugin name — synthesizes the overlay and replaces the default `skills/` scan. A marketplace file with no matching name is a hard miss, never a fall-through.
4. Otherwise the loader synthesizes a manifest named after the plugin root, so an optional manifest still mounts the default directories.

The loader validates `name` (mandatory, kebab-case), `version`, `description`, `author`, and the component fields `commands`, `agents`, `skills`, `hooks`, `mcpServers`, and `settings`. A malformed manifest throws at load with the plugin name. Unknown top-level fields are ignored, matching Claude Code's tolerant handling.

### What gets mounted

| Component | Source | What happens |
| --- | --- | --- |
| `commands` | Manifest entries, or a default scan of `commands/*.md` when the manifest omits `commands` | Each slash command is registered; the handler returns the command content. Nested command directories are skipped with a reason; declared `commands` replace the default directory scan. |
| `agents` | `agents/` directory or manifest paths | Loaded as agent definitions and registered each as a named subagent provider. |
| `skills` | `skills/` directory or manifest paths | `SKILL.md` files are discovered, frontmatter parsed, and each registered as a runtime skill. |
| `hooks` | `hooks/hooks.json` or inline | Injects the per-event hook map. |
| `mcpServers` | Inline record or `.mcp.json` | Registers each MCP server. |
| `settings` | Manifest record | Filtered to the allowlist (currently `agent`) and applied. |

::: warning
Some components depend on host seams the harness does not own today: `hooks`, `mcpServers`, and `settings` report as `skipped` unless your deployment supplies the corresponding guest seam. A skipped component never fails the whole plugin load — each component's outcome is reported individually.
:::

### Managing plugins in a session

| Command | What it does |
| --- | --- |
| `/plugin` | Manage plugins |
| `/reload-plugins` | Re-read the `enabledPlugins` cascade and rescan; project and local `enabledPlugins` are boot-cwd-biased |

## Authoring a plugin

A minimal Claude Code plugin is a directory with a manifest and the component directories you actually use. Per the loader's resolution rules, either manifest location works, and everything except the name is optional:

```text
my-plugin/
  .claude-plugin/
    plugin.json        # name (kebab-case, required), version, description, author
  commands/            # optional; one slash command per .md file
    review.md
  agents/              # optional; agent definition files
  skills/              # optional; SKILL.md directories
  hooks/
    hooks.json         # optional; per-event hook map
  .mcp.json            # optional; inline mcpServers alternative
```

Notes for authors:

- `name` is the only mandatory manifest field and must be kebab-case.
- If the manifest omits `commands`, the loader scans `commands/*.md`; nested subdirectories of `commands/` are skipped.
- Skills follow the `SKILL.md` conventions described in [Skills](/guide/skills).
- Components whose seams are unavailable are reported `skipped` rather than breaking the load, so you can ship a plugin incrementally.

## Next

- [Skills](/guide/skills) — how `SKILL.md` skills work, including those mounted from plugins.
- [Subagents](/guide/subagents) — agent definitions and dispatch, including plugin-provided agents.
- [Extension formats](/reference/extension-formats) — the on-disk formats dsh-cc reads.
- [Settings](/reference/settings) — the settings cascade, including `enabledPlugins`.
