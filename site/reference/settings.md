---
title: Settings cascade
description: How dsh-cc resolves settings.json across five levels, merges them, and applies environment variables safely.
distilled-from: dsh-cc v0.9.5 (4465ee18)
---

# Settings cascade

If you already have a Claude Code-style `settings.json`, dsh-cc reads it. Settings come from five levels, merged from low to high, with a Claude Code-compatible `permissions` schema, camelCase key aliasing, and a guarded `env` section. This page covers where the files live, how they merge, and the two rules most likely to surprise you (`env` gating and key aliasing).

## The five levels

The settings cascade ships as the `cascade` entry point of `@dsh-cc/settings` and merges five file sources **from low to high** — user < project < local < flag < policy — over a plugin-default base:

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

## Settings migrations: removed in v0.8.3

The mechanism-only `@dsh-cc/settings-migrations` package was removed in dsh-cc v0.8.3. Its registry had been empty since it shipped — no concrete migrations ever existed for cc or dsh. The capability will return when the first real settings-shape change ships.

## Profile-level tweaks

Beyond `settings.json`, your profile remains ordinary dsh composition. Local tweaks can be placed in:

```text
~/.dsh/profiles/tui/cordis.patch.yml
```

They are applied after the installed bundles. The microcompaction pass (`@dsh-cc/compaction-micro`: `retainResults` 10, `auto` false, `placeholderChars` 256, `failureCap` 3) is tuned through this profile cordis config like the other preset rows above — it has no settings namespace.

## Preset feature namespaces

Several CC preset features are tuned through their own settings namespaces in `~/.dsh/settings.json`:

| Namespace | Keys (defaults) | What it tunes | More |
| --- | --- | --- | --- |
| `cc-onboarding` | `suppressed` (unset/false) | Set `true` to permanently skip the first-run onboarding flow; re-arm with `/onboard`. | [Quick start](/quickstart) |
| `cc-learn` | `enabled` (true), `days` (14), `min-occurrences` (2) | The `/learn` command's recency window and write gating; `enabled` also gates the `manage_skill` tool. | [Memory](/guide/memory) |
| `cc-skill-usage` | `enabled` (true), `rollup-stale-hours` (24), `never-loaded-days` (30) | Skill-usage telemetry: counts committed skill loads into per-workspace sidecar ledgers and derives a utility report whose demote-candidate list is report-only. Main-realm only; user layer only. | [Skills](/guide/skills) |
| `cc-handoff` | `enabled` (true), `threshold-chars` (8192, advisory) | Subagent handoff store availability and its advisory size threshold. | [Subagents](/guide/subagents) |
| `cc-context-compression` | `enabled` (true), `mode` (dry-run), `min-bytes` (8192), `min-savings-ratio` (0.4), `protected-tools`, `reducer-enabled` (false), `reducer-max-input-tokens` (30000), `reducer-min-savings-ratio` (0.5), `reducer-max-tokens` (1024), `reducer-timeout-ms` (10000), `reducer-alias` (haiku), `reducer-commands`, `defer-requests` (0), `defer-margin` (1.5), `defer-max-age-ms` (1800000), `defer-urgency-tokens` (unset) | Reversible compression of large tool results. Default ON since 2026-11-11 (was ship-dark), and the default `mode: dry-run` only measures into the ledger — nothing is rewritten until you set `mode: on`. The `reducer-*` keys tune an evidence-preserving pass that sends oversized results to a cheap-lane side query; all still ship dark (`reducer-enabled` false by default). The `defer-*` keys defer externalization, so an eligible result enters the session unmodified and swaps to the standard stub after that many counted main-loop sends (0 disables deferral). The nested `reducer-decision-gate` object (`mode: off` by default) adds a SystemOne verdict on whether a receipt is worth attempting before the reducer is paid. | [Interactive basics](/guide/interactive-basics) |
| `model-aliases` | alias entries plus `warnOnInherit` (true) | The settings overlay backing alias resolution; `warnOnInherit: false` suppresses the cheap-lane inherit warning when an alias falls back to the parent route. | [Model routing](/guide/model-routing) |
| `moa` | `enabled` (false), `acceptance.enabled` (false), `acceptance.shadow` (false), `acceptance.tau` (0.7), `max-escalations` (1), `judge-route` (gauge), `classify-budget-tokens` (4000), `call-budget-ms` (8000), `context-routing.mode` (off), `context-routing.timeout-ms` (1500), `context-routing.max-input-tokens` (4000), `context-routing.max-under-tier-probability` (0.10), `context-routing.min-top-probability` (0.60) | Tiered cascade routing for the main conversation: a System One classify call picks the cheapest sufficient lane (`sketch`/`draft`/`blueprint`/`masterplan`), and an optional acceptance judge escalates a rejected answer one tier up. Ships dark; subagents are never overlaid. The `context-routing.*` group swaps that argmax for a context-aware classification and tail-risk tier policy; it is off by default (`mode: off`). | [Model routing](/guide/model-routing) |
| `worktree` | `baseRef` (fresh), `cleanupPeriodDays` (30) | Worktree base selection (`fresh` uses a cached `origin/HEAD` with a stale refresh) and the boot-time sweep of stale `worktree-*` worktrees. | [Worktrees](/guide/worktrees) |
| `actor-contract` | `models` (['glm-*']) | Which models receive `<!-- actor-contract -->` persona blocks in agent definitions; an empty list disables the contract. | [Subagents](/guide/subagents) |
| `cc-tool-use-summary` | `enabled` (true), `topLevelOnly` (true), `minResultBytes` (4096), `retentionDays` (7), and more | Cheap-lane digests of large tool results, consumed at compaction; `topLevelOnly` skips subagent sessions and `retentionDays: 0` keeps the ledger in memory only. | [Interactive basics](/guide/interactive-basics) |
| `cc-prompt-suggest` | `enabled` (false), `alias` (haiku), `timeoutMs` (4000), `maxTokens` (128) | Opt-in next-prompt suggestion at turn-stop; only top-level turn stops predict, and an unrouted alias is skipped rather than inherited (`onUnrouted: 'skip'`), so the parent route is never billed once per turn. Read through the full settings cascade (not restricted to the user layer, unlike the two plugins below). | [Interactive basics](/guide/interactive-basics) |
| `cc-post-edit-verify` | `enabled` (true), `rules` ([]), `debounce-ms` (5000) | Runs a user-declared verification command after accepted `edit`/`write` results and appends the outcome to the same tool result. Default ON since 2026-11-11 (was opt-in); inert with the default empty `rules` — nothing runs until you declare at least one rule. **User layer only** (`~/.dsh/settings.json`); project-scope rules are never read. | [Interactive basics](/guide/interactive-basics) |
| `cc-edit-recovery-hint` | `enabled` (true) | Appends static recovery advice when `edit` fails with a not-found error on a multi-line `old_string`. Default ON since 2026-10-16 (was ship-dark). **User layer only**; project scope is never read. | [Interactive basics](/guide/interactive-basics) |
| `cc-compaction-cost-gate` | `enabled` (false), `mode` (dry-run), `margin` (1.0), `cooldown-ms` (600000) | Ships dark; evaluates whether projected compaction savings justify the rewrite cost before calling `/compact`-style compaction, with a cooldown after each real pass. | [Interactive basics](/guide/interactive-basics) |
| `cc-completion-gate` | `enabled` (true), `nudges-per-session` (1) | Receipt ledger plus one nudge per session when a turn-stop claims done-ness ("tests pass", "committed", …) with no matching executed evidence. Hashed receipt fields are recorded regardless of the flag; the privacy-scrubbed bash command heads (≤200 bytes) are captured only while enabled. Default ON since 2026-11-11 (was ship-dark). User layer only. | [Interactive basics](/guide/interactive-basics) |
| `retry-attendant` | `enabled` (true), `guidance` (true), `escalate` (true), `expire-minutes` (10) | Verify-before-retry attendant for mutating tool calls with ambiguous outcomes: class-specific advice lines, and identical retries inside the expiry window escalated to an ask. Default ON since 2026-10-16 (was opt-in). User layer only. | [Interactive basics](/guide/interactive-basics) |
| `progress-rebuild` | `enabled` (true), `max-lines` (120), `include-verified` (true) | Restores a structured progress brief into the first model request after a successful compaction. Default ON since 2026-10-16 (was ship-dark). | [Interactive basics](/guide/interactive-basics) |
| `cc-turn-rules` | `enabled` (true), `max-result-bytes` (200000), `regex-cache-size` (64), `judged.enabled` (true), `repeat-reminder.enabled` (true), `repeat-reminder.thresholds` ([3,5,8]), `repeat-reminder.include`/`exclude` ([]), `repeat-reminder.arguments-preview-chars` (500) | Turn rules: Cursor-plugin rules carrying a `trigger` regex are injected as an advisory reminder when it matches. On by default with zero effect until such a rule exists. The namespace also carries the built-in repeat-reminder (default ON since 2026-11-11, was ship-dark; set `repeat-reminder.enabled` false to opt out): when the top-level agent makes the same tool call with identical arguments several times in a row, it fires an advisory reminder at each of the default thresholds (`[3,5,8]`), reset by the next user prompt. `judged.enabled` is also ON since 2026-11-11 but currently inert — the judged engine is design-only, so nothing consumes the flag yet. **User layer only.** | [Plugins](/guide/plugins) |
| `cc-advisor` | `enabled` (false), `alias` (haiku), `budget` (2), `immune-turns` (3), `session-cap` (24), `severities` (all three), `subagents` (off) | Opt-in advisor watchdog: a second model reviews every completed turn. **User layer only.** | [Interactive basics](/guide/interactive-basics) |
| `cc-lsp-on-write` | `enabled` (true), `server-name` (serena), `timeout-ms` (1500), `max-diagnostics` (8), `min-severity` (warning), `tool-names` | LSP diagnostics appended to `edit`/`write`/`NotebookEdit` results, pulled from a running serena MCP server. Default ON since 2026-11-11 (was ship-dark); inert without a serena MCP server mounted (one lazy warn, passthrough). **User layer only.** | [Interactive basics](/guide/interactive-basics) |
| `cc-secrets` | `extraPatterns`, `redactCrusherStore` | Extra regex sources for the one-way secret redaction applied to `/export` output and the context-crusher store. | [Slash commands](/reference/commands) |
| `cc-foreign-rules` | `disabled` | Opts out of harvesting other agents' rule files (cline/windsurf/copilot) from the session cwd into a `cc:foreign-rules` prompt section. | [Compatibility](/reference/compatibility) |
| `cc-model-cycling` | `cycleOrder` | The alias list `Ctrl+P` / `Shift+Ctrl+P` cycles through in the TUI. | [Model routing](/guide/model-routing) |
| `config-snapshot` | `config-snapshot.enabled` (true) | Writes one JSONL row per session construction to `<dshHome>/config-snapshot/<encodedId>.jsonl` (dsh-cc version, harness version, preset id, plugin inventory); observability only — the async writer is fail-open and never blocks session creation. | — |
| `cc-compaction-pinning` | `enabled` (true), `pinned-source-kinds` (`['turn-rules','edit-recovery-hint']`), `max-pinned` (16, range 1-64), `max-pinned-bytes` (16384, range 1024-262144) | Captures governance-class user messages (turn-rule reminders, post-edit recovery hints) verbatim in a bounded per-session FIFO ring and re-appends them after a summarization compaction reports them shadowed. On by default; **user layer only**. | [Interactive basics](/guide/interactive-basics) |
| `cc-input-ledger` | `enabled` (true), `include-subagents` (true), `max-sections-per-row` (64, range 8-256), `max-rows-per-file` (2000, range 100-100000) | Three observe-only listeners append content-free metrics rows (section and message-source composition, UTF-8 bytes, 8-char local hashes — never text) to `$DSH_HOME/input-ledger/<projectKey>/<sessionId>.jsonl`. No request is ever rewritten; the mount is reference-counted. | [Interactive basics](/guide/interactive-basics) |
| `cc-input-budget` | `enabled` (true), `mode` (observe), `enter-budget-bytes` (24576, range 4096-262144), `advisory-budget-bytes` (8192, range 512-65536), `memory-budget-bytes` (16384, range 1024-131072), `defer-ttl-steps` (3, range 1-16) | One outermost pre-step gate byte-budgets the final enter batch by content class: governance, task and passthrough content is never trimmed or deferred, while `memory` and `advisory` are trimmed FIFO against their own budgets, and trimmed messages wait in a defer backlog aged by the monotonic per-session `gateSeq`. Ships observing only (`mode: observe` records the decisions and returns the batch untouched); `mode: enforce` applies them and resets the defer queue. | [Interactive basics](/guide/interactive-basics) |
| `cc-skill-recommendation` | `mode` (off), `timeout-ms` (5000, range 100-10000), `max-input-tokens` (8192, range 512-16384), `max-candidates` (128, range 1-256), `batch-size` (16, range 1-32), `max-task-chars` (2048, range 64-8192), `max-metadata-chars` (2048, range 128-8192), `min-relevance-index` (3, range 0-4), `min-prerequisites-met` (0.8, range 0-1), `max-recommendations` (3, range 1-10), `cache-entries` (128, range 0-1024), `cache-ttl-ms` (60000, range 0-300000), `min-coverage` (1, range 0-1) | The advisory `recommend_skill` tool: judges the visible skills catalog against a task and returns a few names with relevance and prerequisite evidence. Read-only — it never loads a body, runs a skill or changes eligibility. Mounted dark by the cc and vwa presets; `mode: off` by default, `shadow` records only, `active` returns names. Needs the optional decision runtime (`ctx.systemoneDecisions`); `unavailable` without it. | [Skills](/guide/skills) |
| `cc-memory-section` | `truncate` (true), `max-bytes` (24576, range 1024-65536), `description-max-bytes` (160, 0 or range 8-1024) | Byte budget for the system-prompt memory section, which now renders one scope-tagged catalog of topic files across every layer: `MEMORY.md` stays on disk as curator index and ordering source but is no longer prompt-visible. `truncate: false` renders the catalog complete; over budget, whole entries drop from the bottom of the interleaved order. Read live on every render; invalid values are rejected whole, never clamped. | [Memory](/guide/memory) |
| `cc-subagent-catalog` | `truncate` (true), `max-bytes` (8192, provisional, range 1024-65536), `min-entry-bytes` (40, range 20-400) | Byte cap on the `Available subagents` roster: every agent name is kept while each `whenToUse` is truncated UTF-8-safe, and if that still overflows the tail collapses into a names-only line. `truncate: false` renders the roster uncapped. The `max-bytes` default is provisional. | [Subagents](/guide/subagents) |
| `systemone-decisions` | `max-attempts-per-session` (100), `max-input-tokens-per-session` (1000000), `max-output-tokens-per-session` (100000), `max-retries` (0, range 0-2), `routes` ({}), `ledger-max-bytes` (10485760, min 1048576) | The durable decision ledger behind the optional decision runtime: per-session quotas, per-alias `routes` pins that can only narrow the gauge lane, and a JSONL ledger `/cost` renders in its own **SystemOne decisions** section. A trusted namespace — user, managed and explicit sources only; project and local can never raise quota or widen bounds. | [Model routing](/guide/model-routing) |
| `cc-tool-discovery` | `mode` (off), `timeout-ms` (1200, range 100-5000), `max-input-tokens` (4096, range 512-16384), `max-candidates` (64, range 1-128), `batch-size` (8, range 1-16), `max-query-chars` (2048, range 64-8192), `max-metadata-chars` (2048, range 128-8192), `min-relevance-index` (3, range 0-4, experimental), `min-direct-fit` (0.75, range 0-1, experimental), `max-activations` (3, range 1-20), `cache-entries` (128, range 0-1024), `cache-ttl-ms` (60000, range 0-300000) | Optional semantic discovery layer over deferred tools: an independent relevance judgment per admitted candidate, so a query without literal overlap can still reach the right deferred tool. `off` leaves the lexical path byte-identical, `shadow` recommends only, `active` activates the judged names in deterministic order — capped, and re-checked against the per-tool permission gate before loading, so a recommendation never widens scope. | — |

Three more namespaces exist only inside the VWA agent preset:

| Namespace | Keys (defaults) | What it tunes |
| --- | --- | --- |
| `vwa-argument` | `semantic-enabled` (false), `review-alias` (sonnet), `review-claims-batch-size` (1, range 1-4) | Lane-2 argument tools: `semantic-enabled` gates the semantic tools — when it is false they do not mount, while the `/vwa` command still mounts and semantic review is inert; `review-alias` is the model alias used for the reviewer; `review-claims-batch-size` batches consecutive `claims` review tasks. |
| `vwa-evidence` | `enabled` (true inside the vwa preset), `nudge-budget` (4) | Evidence tooling for the VWA project, including its nudge budget. |
| `vwa-preset` | `selectedDefault` (absent) | The saved default agent preset targeted by `/preset`; absent means the deployment default `cc`. |

## See also

- [/reference/env-vars](/reference/env-vars) — environment variables dsh-cc reads and sets.
- [/guide/permissions](/guide/permissions) — the `permissions` schema, modes, and rule semantics.
- [/guide/from-claude-code](/guide/from-claude-code) — bringing an existing Claude Code setup over.
