---
title: Settings cascade
description: How dsh-cc resolves settings.json across five levels, merges them, and applies environment variables safely.
distilled-from: dsh-cc v0.6.0
---

# Settings cascade

If you already have a Claude Code-style `settings.json`, dsh-cc reads it. Settings come from five levels, merged from low to high, with a Claude Code-compatible `permissions` schema, camelCase key aliasing, and a guarded `env` section. This page covers where the files live, how they merge, and the two rules most likely to surprise you (`env` gating and key aliasing).

## The five levels

The settings cascade plugin (`@dsh-cc/settings-cascade`) merges five file sources **from low to high** — user < project < local < flag < policy — over a plugin-default base:

| # | Level | Path | Notes |
|---|-------|------|-------|
| 1 | User | `$DSH_HOME/settings.json` (default `~/.dsh/settings.json`) | The only writable layer; `update()`/`persist()` writes land here. |
| 2 | Project | `<cwd>/.claude/settings.json` | Stays at the launch directory. |
| 3 | Local | `<git-main-checkout-root-or-toplevel>/.claude/settings.local.json` | The gitignored per-user file; hoisted git-style (see below). |
| 4 | Flag | the `--settings` file, plus inline `--settings` content merged over it | Session-only. |
| 5 | Policy | first non-empty of remote settings > system managed file > user-writable managed file | Highest priority. |

**Higher wins.** Sources deep-merge recursively: a higher level fills keys a lower one omitted and replaces values it does carry. Plugin registration `base` and schema defaults resolve below every file level, so a missing document still resolves exactly as a leaf provider would.

::: tip Git-style hoisting for `settings.local.json`
When the launch directory is inside a git repo, the local file is read from the git **main checkout root** (worktree) or **toplevel** (launched in a subdirectory), matching Claude Code. Paths *inside* the file still resolve against the launch directory. Hoisting falls back to the launch directory when the repo root is `$HOME`, on Windows, or when ownership of the repo root/`.git`/`.claude` cannot be confirmed (fail-closed).
:::

### Merge rules worth knowing

- **Permission arrays union, `deny` wins.** `allow`, `deny`, and `ask` arrays concatenate and deduplicate across levels; the unioned `deny` set is removed from `allow` — a higher-level `deny` always beats a lower-level `allow`.
- **Other arrays are replaced.** For example `additionalDirectories`: the higher level overrides wholesale.
- **Misconfiguration fails loud.** A present-but-unparsable settings document (bad JSON, non-object root) fails plugin load. An absent file contributes nothing and is not an error.
- **Writes are surgical deltas onto the user file.** Only keys the caller actually changed are written to `~/.dsh/settings.json`; inherited values from higher levels are not copied in. Concurrent writes from multiple dsh processes can silently lose updates (single-process profiles are unaffected), and unsetting a key inherited from a lower level does not persist across restart.

### `enabledPlugins` and plugin state

The `enabledPlugins` key (exact `name@marketplace` ids) gates which installed Claude Code-format plugins mount at startup. For plugin discovery the cascade gains a dsh layer: claude-user → dsh-user → project → local. All `/plugin` mutations write to the dsh home only (`$DSH_HOME` / `~/.dsh`, including user-scope `enabledPlugins` / `extraKnownMarketplaces` entries in `~/.dsh/settings.json`); the Claude home stays read-visible and is never written. Details: [Plugins](/guide/plugins).

## Hot reload

A file watcher (chokidar) watches every concrete settings file that contributes to the merge. When one changes on disk, the cascade reloads and re-merges without a restart. A malformed or unreadable source during reload never takes a live session down: the last good document stays published, the failure is logged as a warning, and the watcher keeps watching. Reloads and persists are serialized on a single operation chain, so a persist racing an external edit retries on fresh bytes instead of clobbering them.

## The `env` section: two-phase application

A top-level `env` section in any settings file is split out of the merged document and exposed as string-coerced key/value pairs. It is applied in **two phases**:

1. `applyEnv()` assigns ordinary variables — applied normally.
2. `applyTrustedEnv()` additionally assigns environment-altering variables and runs **only after you grant trust**.

The second phase is gated by `DANGEROUS_ENV_VARS`, a static allowlist of variables that alter process behavior or library loading. It includes (verbatim):

```
LD_PRELOAD
DYLD_INSERT_LIBRARIES
PATH
```

(also `LD_LIBRARY_PATH`, `DYLD_LIBRARY_PATH`, `PYTHONPATH`, `NODE_OPTIONS`, `NODE_PATH`, `RUBYLIB`, `PERL5LIB`). The list is fixed; deployment-specific variables need an explicit extension point before first use.

## Key aliasing: `statusLine` → `statusline`

To let a `settings.json` shared verbatim with a real Claude Code checkout work, recognized camelCase top-level keys are copied onto dsh-native kebab-case namespaces. The whitelist map **is the contract** — no fuzzy matching, unknown camelCase keys are never aliased:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.dsh/statusline.sh",
    "padding": 0,
    "refreshInterval": 10
  }
}
```

Rules, exactly:

- The alias is injected only when the camelCase key's value is a **plain object** and the kebab key is **absent** from the merged document.
- A dsh-native key already present wins untouched (so `statusline` beats `statusLine`).
- Non-object values (e.g. a string `statusLine`) are ignored.

Currently there is exactly **one** entry in the whitelist: `statusLine` → `statusline`. On the `tui` profile this key replaces the built-in bottom status line with your own shell command; it can live in `~/.dsh/settings.json` or a project `.claude/settings.json`.

## Plugin enablement: `enabledPlugins`

Plugin discovery reads the `enabledPlugins` map with a dual-home layering: claude-user (`$CLAUDE_CONFIG_DIR` / `~/.claude`) → dsh-user (`$DSH_HOME` / `~/.dsh/settings.json`) → project → local, later files overriding per key. `/plugin` mutations write only under the dsh home — user-scope `enabledPlugins` and `extraKnownMarketplaces` entries land in `~/.dsh/settings.json`, and the Claude home stays read-visible, never written. The full dual-home rules are in [Plugins](/guide/plugins).

## Migrations: mechanism ready, nothing shipped

`@dsh-cc/settings-migrations` ships a versioned migration mechanism: `defineMigration({ version, name, migrate(ctx) })` registers into a module registry (deduplicated by version + name), and `runMigrations()` applies every migration whose `version` exceeds the recorded `migrationVersion` (stored in `<home>/migrations.json`, default `$DSH_HOME` / `~/.dsh`), in ascending order, atomically — a mid-batch failure writes nothing and retries on the next mount, so migrations must be idempotent. A `guard(ctx)` returning `false` skips a migration without blocking version advancement.

As of dsh-cc v0.6.0, **no concrete migrations exist** — the registry is empty and neither cc nor dsh has a legacy settings format to migrate; the first real migration lands with the first settings-shape change. Mounting the plugin is currently a no-op. The mechanism also targets only the user `settings.json` — project/local/flag/policy layers are not yet migration targets.

## Profile-level tweaks

Beyond `settings.json`, your profile remains ordinary dsh composition. Local tweaks can be placed in:

```text
~/.dsh/profiles/tui/cordis.patch.yml
```

They are applied after the installed bundles.

## See also

- [/reference/env-vars](/reference/env-vars) — environment variables dsh-cc reads and sets.
- [/guide/permissions](/guide/permissions) — the `permissions` schema, modes, and rule semantics.
- [/guide/from-claude-code](/guide/from-claude-code) — bringing an existing Claude Code setup over.
