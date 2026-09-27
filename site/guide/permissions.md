---
title: Permissions & approvals
description: Control what the agent may do — five permission modes, a Claude Code-compatible rule engine, durable rules, and an opt-in LLM risk classifier for auto mode.
---

# Permissions & approvals

Every tool call an agent makes passes through dsh-cc's permission layer. You
can run wide open, lock everything down, or land anywhere between — with
durable rules that survive restarts and a strict-rule `auto` mode that, if you
opt in, lets an LLM risk classifier decide calls no rule matched. This page explains the
five modes, how rules are written and evaluated, and how approvals surface in
the TUI.

Prerequisites: a running dsh-cc session (see [interactive
basics](/guide/interactive-basics)). If you come from Claude Code, the rule
syntax and mode names should feel familiar — see [from Claude
Code](/guide/from-claude-code) for the general mapping.

## Who this is for

You want predictable agent behavior: let the model read and edit freely, but
get asked before anything destructive runs. The TUI provides terminal-oriented
interactions such as approval flows — when the engine says `ask`, a modal
appears and you allow or deny the call. Rules are Claude Code-compatible:
`ToolName` and `ToolName(content)` strings you already know carry over.

## The five modes

Permission modes are **durable**: switching modes appends a last-wins
`permission/mode` session event, so the mode survives across process restarts.
Switch with `/permissions <mode>`, the `/permissions` picker, or the TUI
`Shift+Tab` cycle; each switch injects a human-facing notice into the session's
model transcript.

| Mode | Behavior | When to use |
| --- | --- | --- |
| `default` | The engine evaluates rules; anything unmatched falls through to the approval seam, which may ask you. | Everyday work with normal guardrails. |
| `acceptEdits` | File-edit tools are auto-allowed; everything else evaluates as in `default`. | Long editing sessions where you trust file writes but still want to gate commands. |
| `plan` | Read-only tools are auto-allowed; leftover `ask`/passthrough on a non-read-only call becomes a deny with the reason `plan mode is read-only; submit via exit_plan_mode`. Matching allow/deny rules still stand. | Reviewing or designing — plan mode is write-deny by construction. `plan` is owned by plan-mode; the rule engine refuses to set it directly. |
| `auto` | Evaluates like `default`, but strict-rule: matched ask rules always prompt and broad allow rules are suspended (see below). | Automated runs where an opt-in classifier decides unmatched calls. |
| `bypassPermissions` | Allows everything — unless `disableBypassPermissionsMode` is set. Entering it pins the session sandbox to `danger-full-access`; leaving restores the recorded confinement (`workspace-write` as fallback). | Fully trusted tasks where you accept the risk. |

The UI honors `permissions.defaultMode` from settings: the statusline, session
switch, Shift+Tab cycle start, and the `/permissions` picker all fall back to
the live merged settings default — a recorded session mode still wins over it,
and the cycle is clamped to its members.

## Durable rules

The engine is `@dsh-cc/permission-rules`, a Claude Code-compatible
permission-rule plugin. A rule is `ToolName` (whole tool) or
`ToolName(content)` (content-scoped):

| Rule | Meaning |
| --- | --- |
| `Bash` | whole-tool rule for every `Bash` call |
| `Bash(npm install)` | prefix rule: any command starting with `npm install` |
| `Bash(npm publish:*)` | prefix rule on the stem `npm publish:` |
| `Edit(foo/*.json)` | wildcard: matches `foo/*.json` (a `*` matches any run) |
| `Bash(python -c "print\(1\)")` | literal parens inside content (escape with `\`) |

Rules can come from two places, merged by source priority (settings win):

- **Config** (`rules.deny` / `rules.bypassImmune` on the plugin) — in force
  whenever the plugin is mounted.
- **Settings** — the `permissions` namespace: `permissions.allow`,
  `permissions.deny`, `permissions.ask`, `permissions.defaultMode`, plus
  `additionalDirectories` / `protectedFiles` / `dangerousPatterns` /
  `mediumPatterns` feeding the risk classifier. Rules carry a source label (default `userSettings`); a
  stored change re-runs the merge and re-registers guards immediately (hot
  reload). A malformed settings rule fails loud at the settings boundary.

Malformed rules in any source throw at load — the engine fails loud rather
than silently dropping a rule you meant to deny with.

Three properties matter for durability:

1. **Bypass-immune rules always deny.** Rules like `Edit(~/.bashrc)` are
   registered as monotonic guards — neither a mode switch nor
   `bypassPermissions` can override them.
2. **Evaluation is ordered and deny-first.** Bypass-immune denies first, then
   the risk classifier, then whole-tool deny and content deny, then whole-tool
   ask, content ask, and content allow by source priority, then mode
   short-circuits, then whole-tool allow as the coarse default. A content deny
   beats any allow in every mode. Shell commands are matched per segment: an
   allow must match every segment of `a && b`. No match passes through to downstream
   listeners — ultimately the approval seam, which may still ask.
3. **Modes are session events.** The `permission/mode` event type is
   registered at plugin load so persistence resumes it; settings changes reset
   classifier state via `rebuild()`.

## The risk classifier

The static risk classifier runs in every mode (`classifierEnabled`, default
on) and sorts shell commands into three tiers:

- **HIGH** (catastrophic commands such as `rm -rf /` or `sudo`, and writes to
  protected files) is a hard deny in every mode.
- **MEDIUM** (destructive but recoverable, such as `git push --force`,
  `git reset --hard`, or `npm publish`) asks you unless a rule or session
  grant already allowed it. Replace the curated list with
  `permissions.mediumPatterns`.
- **LOW** evaluates normally.

A small critical tier (force-removing root or home, the fork bomb) plus your
`permissions.criticalDeny` entries deny even under `bypassPermissions`.

## `auto` mode

`auto` is strict-rule. A matched ask rule prompts at any risk level, and
broad allow rules are suspended while `auto` is active: whole-tool Bash
allows, blanket Bash content allows, interpreter and package-runner prefixes
such as `python` or `npx`, and any `Task`/`Agent` allow. `/permissions` marks
them "suspended in auto mode". "Allow for this session" grants work for
rule-derived asks in every non-plan mode.

Without more configuration, calls no rule matched still reach the approval
seam. To have a model decide them, arm the opt-in **LLM risk-classifier
stage** through `permissions.autoMode.classifier` (`enabled` / `route` /
`timeoutMs` / `cacheMaxEntries`). The stage is armed only when enabled, an
`llm` service is mounted, and the alias route resolves.

- It judges passthrough-class LOW and MEDIUM calls only. Rule-derived asks
  always reach you, and read-only tool calls never reach the model.
- An enabled but unavailable stage (route missing, breaker open) asks you with
  a reason instead of allowing silently.
- Verdicts are `allow`, `ask`, or `deny`. A `deny` must cite an exact
  `hard_deny` rule, or it downgrades to `ask`. Parsing is fail-closed: a
  malformed output yields `classifier output unparseable`.
- Policy lives in the `hard_deny`, `soft_deny`, `allow`, and `environment`
  slots of `permissions.autoMode`, each accepting `"$defaults"`. Only trusted
  layers (user, `--settings` flag, managed policy) can set `autoMode`, so a
  cloned repository cannot widen its own trust boundary.
- 3 consecutive or 20 total denies in a session pause auto mode and drop the
  session to `default`; re-enter with `/permissions auto`.
- A per-route circuit breaker opens after 3 consecutive failures and admits
  one probe call after a 60s cooldown. A settings change resets it.

In `auto` mode an advisory prompt-injection probe also scans the text of
tool results such as `read`, `bash`, `web_fetch`, and `mcp__*` tools, and
attaches a security notice to a flagged result.

Verdicts are audited as digest-only session events by default.
`permissions.autoMode.classifier.auditFullText: true` stores the raw input,
which may include secrets. Inspect the setup and the audit with `/auto-mode`
(`defaults`, `config`, `review [full]`). The full key list is in [Permission
modes](/reference/permission-modes).

::: tip
Debug raw model output with the opt-in `DSH_PERMISSION_CLASSIFIER_DEBUG=1`
process-log channel (`[dsh:classifier:raw]`, truncated to 2 KiB — never
session events).
:::

## The `/permissions` command

`/permissions [mode]` inspects or changes permission mode and rules. The bare
invocation opens a TUI overlay (the permission picker); `/permissions <mode>`
switches among `default | acceptEdits | plan | auto | bypassPermissions`.
Plan-mode entry and exit branches live in the host command channel, so the
picker, the browser popup, and typed `/permissions …` all submit through the
same path.

`/permissions lint` reports rule-hygiene findings (malformed rules,
duplicates, rules subsumed by a broader prefix, bare whole-tool `Bash`
allows, unknown tool names) with a proposed diff. Add `--apply` to clean the
user settings layer; other layers are never edited.

The full command catalog — including the parity status — lives in the [slash
commands reference](/reference/commands); it is not duplicated here.

## Next

- [Coming from Claude Code](/guide/from-claude-code) — the general
  compatibility mapping.
- [Permission modes](/reference/permission-modes) — the mode catalog
  reference.
- [Settings cascade](/reference/settings) — where
  `permissions.allow` / `deny` / `ask` / `defaultMode` live and how levels
  merge.
