---
title: Permission modes
description: The five permission modes, the rule engine's rule forms and evaluation order, the auto-mode risk classifier, and the /permissions command.
distilled-from: dsh-cc v0.5.0
---

# Permission modes

dsh-cc's permission engine (`@dsh-cc/permission-rules`) is Claude
Code-compatible: it parses `ToolName` and `ToolName(content)` rules, folds a
mode-aware decision on the `tools/pre-execute` waterfall, and enforces
bypass-immune content rules through a monotonic guard layer that neither a
mode switch nor `bypassPermissions` can override. Rules fail loud at load;
settings hot-reload by rebuilding merged state and re-registering guards.

## The five modes

Modes are **durable**: switching appends a last-wins `permission/mode` session
event, so the mode survives process restarts. `plan` is owned by plan-mode and
is not settable through the rule engine's `setMode`.

| Mode | Behavior |
|---|---|
| `default` | Full evaluation: guards → risk classifier → deny/ask/allow rules by source priority → mode short-circuits → whole-tool allow → passthrough to the approval seam. |
| `acceptEdits` | Auto-allows file-edit tools (the `fileEditTools` config, default `['edit']`). Everything else evaluates as in `default`. |
| `plan` | Auto-allows read-only tools (`readOnlyTools`, default `['read']`). Leftover `ask`/`passthrough` on a non-read-only call becomes a deny with the reason `plan mode is read-only; submit via exit_plan_mode`; matching allow/deny rules still stand. |
| `auto` | Evaluates **identically to `default`** — it is not an evaluate short-circuit. The risk classifier proxies every `ask` at the plugin layer: classifier-LOW calls auto-allow, classifier-MEDIUM still asks. An opt-in LLM risk-classifier stage can be armed via settings (see below). |
| `bypassPermissions` | Allows everything (unless `disableBypassPermissionsMode` is set). Entering it pins the session sandbox to `danger-full-access` and records `resumeSandbox`; leaving restores the recorded confinement (or a `workspace-write` fallback). |

The UI honors `permissions.defaultMode`: the statusline, session switch,
Shift+Tab cycle start, and the `/permissions` picker all fall back to the live
merged settings default. A recorded session mode still wins over the settings
default.

## Rule forms

A rule is `ToolName` (whole tool) or `ToolName(content)` (content-scoped).
Content may escape `(`/`)`/`\` with a backslash, use `*` as a wildcard, or end
in `:*` to declare a prefix rule.

| Rule | Meaning |
|---|---|
| `Bash` | whole-tool rule for every `Bash` call |
| `Bash(npm install)` | prefix rule: any command starting with `npm install` |
| `Bash(npm publish:*)` | prefix rule on the stem `npm publish:` |
| `Edit(foo/*.json)` | wildcard: commands/paths matching `foo/*.json` |
| `Bash(python -c "print\(1\)")` | literal parens inside content |

Malformed rules (unclosed paren, content after the closing paren, content with
no tool name) throw a `TypeError` at load. Rules carry a source
(`session` > `cliArg` > `policySettings` > `flagSettings` > `localSettings` >
`projectSettings` > `userSettings` > `config`) used for content-rule priority;
first rule to match decides.

## The risk classifier and the auto-mode circuit breaker

When `classifierEnabled` (default on), a static risk classifier runs in every
mode: catastrophic shell commands (`rm -rf /`, `sudo`, `dd of=/dev`,
`kill -9 1`, piping curl/wget into sh, redirecting into system paths) are a
hard deny in every mode; writes to protected files (`.bashrc`, `.ssh/**`,
credentials) are also hard denies; writes escaping the working-directory scope
are `ask` outside `bypassPermissions`.

On top of that, `auto` mode can arm an opt-in **LLM risk-classifier stage**
through settings: the `permissions.autoMode` section — `autoMode.soft_deny`
prose rules (with `$defaults` expansion) and `autoMode.classifier`
(`enabled` / `route` / `timeoutMs` / `cacheMaxEntries`). The stage is armed
only when enabled, an llm service is mounted, and the alias route resolves.
Read-only tool calls are exempt — they never reach the model. Verdict parsing
is strict and fail-closed: a malformed model output yields the constant reason
`classifier output unparseable`, never the raw model output (audit records are
digest-only).

The LLM stage has a **per-route consecutive-failure circuit breaker**
(threshold 3, keyed `provider/model`): a failing lane opens — no further
classifier calls on that route, one warn per process, one `breaker` audit
event per session — and the call falls back to `ask`. The breaker is
restart-durable within a session (a restored streak ≥ threshold opens at seed
time), and a settings change (`rebuild()`) resets it and re-arms the stage.

## `/permissions` invocation forms

| Invocation | Behavior |
|---|---|
| `/permissions` | Opens the TUI permissions overlay. |
| `/permissions <mode>` | Switches the durable mode for `default \| acceptEdits \| plan \| auto \| bypassPermissions`. |

A human-facing notice is injected into the session's model transcript on each
switch. The invariant companion (`@dsh-cc/permission-rules/invariant`)
validates `permission/mode` session events: `mode` must be switchable (never
`plan`), and `resumeSandbox`, when present, must be a known sandbox mode.

## Settings keys

The `permissions` namespace accepts:

| Key | Meaning |
|---|---|
| `permissions.allow` / `permissions.deny` / `permissions.ask` | Rule lists per behavior. |
| `permissions.defaultMode` | Fallback mode for the UI and new sessions. |
| `permissions.additionalDirectories` | Extra directories added to the working-directory scope. |
| `permissions.protectedFiles` | Files the risk classifier treats as protected writes. |
| `permissions.dangerousPatterns` | Extra patterns feeding the risk classifier. |
| `permissions.autoMode.soft_deny` | Prose rules with `$defaults` expansion. |
| `permissions.autoMode.classifier` | `{ enabled, route, timeoutMs, cacheMaxEntries }` arming the LLM stage. |

Settings rules carry the `settingsSource` label and merge with Config `rules`
by source priority — settings rules win. A stored change re-runs the merge and
re-registers guards immediately; a malformed settings rule fails loud at the
settings boundary.

## Next

- [/guide/permissions](/guide/permissions) — the narrative tour of the permission system.
- [/reference/commands](/reference/commands) — the `/permissions` command entry.
- [/reference/settings](/reference/settings) — the settings cascade these keys live in.
