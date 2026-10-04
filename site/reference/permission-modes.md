---
title: Permission modes
description: The five permission modes, the rule engine's rule forms and evaluation order, strict-rule auto mode and its risk classifier, and the /permissions and /auto-mode commands.
distilled-from: dsh-cc v0.8.3 (a33c681f)
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
| `default` | Full evaluation in the order below: guards → risk classifier → deny → ask → allow rules → mode short-circuits → whole-tool allow → passthrough to the approval seam. |
| `acceptEdits` | Auto-allows file-edit tools (the `fileEditTools` config, default `['edit', 'write', 'multi_edit', 'notebook_edit', 'str_replace_editor']`). Everything else evaluates as in `default`. |
| `plan` | Auto-allows read-only tools (`readOnlyTools`, default `['read', 'glob', 'grep', 'search', 'web_fetch', 'web_search']`). Leftover `ask`/`passthrough` on a non-read-only call becomes a deny with the reason `plan mode is read-only; submit via exit_plan_mode`; matching allow/deny rules still stand. |
| `auto` | Evaluates like `default` — it is not an evaluate short-circuit — but **strict-rule**, with broad allow rules suspended (see below). An opt-in LLM risk-classifier stage can be armed via settings. |
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

## Evaluation order

The engine folds one decision per call:

1. Bypass-immune content rules always deny.
2. The static risk classifier (see below).
3. Whole-tool deny, then content deny from any source. Content evaluation is
   **deny-first** in every mode: a content deny beats any content allow and
   any whole-tool ask.
4. Whole-tool ask, then content ask, then content allow, by source priority.
5. Mode short-circuits, then whole-tool allow as the coarse default.
6. No match passes through to the approval seam, which may still ask.

For shell commands the content phases evaluate per top-level **segment**:
deny and ask match on any segment, while a content allow must match every
segment. Segments with command substitution or writing redirections never
match an allow. Commands the scanner cannot trust (unterminated quotes,
heredocs, subshells, groups, reserved words) skip content allow entirely.

## The risk classifier

When `classifierEnabled` (default on), a static risk classifier runs in every
mode with three tiers for shell commands:

| Tier | Examples | Result |
|---|---|---|
| HIGH | `rm -rf /` or `~`, `sudo`, `dd of=/dev`, `kill -9 1`, piping curl/wget into sh, redirecting into system paths; writes to protected files (`.bashrc`, `.ssh/**`, credentials) | Hard deny in every mode. |
| MEDIUM | `git push --force`, `git reset --hard`, `git clean -f`, `rm -rf` on ordinary targets, `npm\|pnpm\|yarn publish`, `gh repo\|release delete`, `kubectl delete`, `terraform apply\|destroy` | Falls through the rules and asks afterwards, unless a rule or session grant already allowed it. |
| LOW | everything else | Normal evaluation. |

Writes that escape the working-directory scope are `ask` outside
`bypassPermissions`. A curated critical tier (force/recursive remove of root
or home, and the fork-bomb define form) plus the append-only
`permissions.criticalDeny` list are mounted as bypass-immune denies, so they
hold in every mode, including `bypassPermissions`.

## `auto` mode

`auto` is **strict-rule**: a matched ask rule prompts even at LOW risk.
Broad allow rules are suspended while `auto` is active: whole-tool
bash/PowerShell allows, effectively-blanket bash content allows, interpreter
and package-runner prefixes (`python`, `node`, `npm run`, `npx`, …), and any
`Task`/`Agent`/`subagent`/`subagent_fork` allow. Set
`permissions.autoMode.classifyAllShell: true` to suspend every bash and
PowerShell allow rule. "Allow for this session" grants apply to rule-derived
asks in every non-plan mode.

### The opt-in LLM classifier stage

`auto` can arm an **LLM risk-classifier stage** through the
`permissions.autoMode` settings section. The stage is armed only when
enabled, an llm service is mounted, and the alias route resolves.

- **What it judges.** Passthrough-class LOW and MEDIUM calls only; rule-derived
  asks are never arbitrated. Read-only tool calls are exempt and never reach
  the model. An enabled but unavailable stage (unarmable, route missing,
  breaker open) asks you with an availability reason.
- **Input.** The tool call plus a bounded transcript window: your recent
  messages, the project instructions (`AGENTS.md`, else `CLAUDE.md`), and
  recent non-read-only tool calls.
- **Verdicts.** `allow`, `ask`, or `deny`. A `deny` must cite the exact
  matched `hard_deny` rule; an uncited deny downgrades to `ask`. Parsing is
  strict and fail-closed: a malformed output yields the constant reason
  `classifier output unparseable`. `classifier.secondPass` (default false)
  allows one reconsider call on an `ask`, which can only turn it into `allow`.
- **Policy slots.** `hard_deny`, `soft_deny`, `allow` (exceptions), and
  `environment` (the trust boundary). Each list accepts the literal
  `"$defaults"` entry. The cascade assembles `autoMode` from trusted layers
  only (user, `--settings` flag, managed policy); project and local layers are
  ignored for this key, so a cloned repository cannot set its own trust
  boundary.
- **Denial backstop.** 3 consecutive or 20 total classifier denies in a
  session pause auto mode and downgrade the session to `default`. Re-enter
  manually with `/permissions auto`.
- **Circuit breaker.** Per route (threshold 3, keyed `provider/model`): a
  failing lane opens, one warn per process, one `breaker` audit event per
  session. After a 60s cooldown the route goes half-open and admits one probe
  call. A settings change (`rebuild()`) resets the breaker.

In `auto` mode an advisory **prompt-injection probe** also scans the text of
executed tool results (by default `read`, `read_image`, `bash`, `web_fetch`,
`web_search`, and every `mcp__*` tool; replace with `autoMode.probe.toolPatterns`).
A flagged result gains a security notice beside it; the probe fails open.

Classifier and probe verdicts append `permission/classifier` /
`permission/probe` session audit events, digest-only by default.
`permissions.autoMode.classifier.auditFullText: true` also stores the raw
rendered input (up to 8192 chars), which may include secrets; keep it off
unless you are reviewing classifier behavior. Review with
`/auto-mode review [full]`.

## `/permissions` and `/auto-mode` invocation forms

| Invocation | Behavior |
|---|---|
| `/permissions` | Opens the TUI permissions overlay. |
| `/permissions <mode>` | Switches the durable mode for `default \| acceptEdits \| plan \| auto \| bypassPermissions`. |
| `/permissions lint` | Reports rule-hygiene findings with a proposed diff; `--apply` cleans the user settings layer only. |
| `/auto-mode defaults` | Prints the built-in slot lists as JSON. |
| `/auto-mode config` | Prints the effective trusted-scoped `permissions.autoMode` slice. |
| `/auto-mode review [full]` | Shows the last 20 classifier/probe verdicts of the session. |

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
| `permissions.dangerousPatterns` | Patterns for the HIGH tier (replace semantics). |
| `permissions.mediumPatterns` | Patterns replacing the curated MEDIUM tier (replace semantics). |
| `permissions.criticalDeny` | Append-only list added to the bypass-immune critical tier. |
| `permissions.autoMode.hard_deny` / `soft_deny` / `allow` / `environment` | Classifier policy slots with `$defaults` expansion. |
| `permissions.autoMode.classifyAllShell` | Suspend every bash/PowerShell allow rule in `auto`. |
| `permissions.autoMode.classifier` | `{ enabled, route, timeoutMs, cacheMaxEntries }` arming the LLM stage, plus `secondPass` and `auditFullText`. |
| `permissions.autoMode.probe` | Prompt-injection probe: `toolPatterns`, `route` (default `haiku`), `timeoutMs` (default 5000). |

Settings rules carry the `settingsSource` label and merge with Config `rules`
by source priority — settings rules win. A stored change re-runs the merge and
re-registers guards immediately; a malformed settings rule fails loud at the
settings boundary.

## Next

- [/guide/permissions](/guide/permissions) — the narrative tour of the permission system.
- [/reference/commands](/reference/commands) — the `/permissions` command entry.
- [/reference/settings](/reference/settings) — the settings cascade these keys live in.
