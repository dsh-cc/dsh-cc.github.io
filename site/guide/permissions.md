---
title: Permissions & approvals
description: Control what the agent may do — five permission modes, a Claude Code-compatible rule engine, durable rules, and an opt-in LLM risk classifier for auto mode.
---

# Permissions & approvals

Every tool call an agent makes passes through dsh-cc's permission layer. You
can run wide open, lock everything down, or land anywhere between — with
durable rules that survive restarts and, if you opt in, an LLM risk classifier
that quietly auto-approves low-risk work in `auto` mode. This page explains the
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
| `auto` | Evaluates identically to `default`; the risk classifier proxies every `ask` at the plugin layer (see below). | Automated runs where you want low-risk asks resolved without you. |
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
  `additionalDirectories` / `protectedFiles` / `dangerousPatterns` feeding the
  risk classifier. Rules carry a source label (default `userSettings`); a
  stored change re-runs the merge and re-registers guards immediately (hot
  reload). A malformed settings rule fails loud at the settings boundary.

Malformed rules in any source throw at load — the engine fails loud rather
than silently dropping a rule you meant to deny with.

Three properties matter for durability:

1. **Bypass-immune rules always deny.** Rules like `Edit(~/.bashrc)` are
   registered as monotonic guards — neither a mode switch nor
   `bypassPermissions` can override them.
2. **Evaluation is ordered.** Bypass-immune denies first, then the risk
   classifier, then whole-tool deny/ask, then content-level rules by source
   priority (first match decides), then mode short-circuits, then whole-tool
   allow as the coarse default. No match passes through to downstream
   listeners — ultimately the approval seam, which may still ask.
3. **Modes are session events.** The `permission/mode` event type is
   registered at plugin load so persistence resumes it; settings changes reset
   classifier state via `rebuild()`.

## The `auto` mode LLM risk classifier

`auto` is opt-in and escalate-only. Without configuration it does nothing
special: an absent `autoMode` key keeps the LLM stage disarmed, and `auto`
evaluates identically to `default`. Even armed, read-only tool calls are
exempt — they never reach the model, so read traffic gains zero latency.

When armed (`permissions.autoMode` with `enabled`, an `llm` service mounted,
and the alias `route` resolving), every `ask` is proxied through a one-shot
auxiliary-model verdict over the tool name + rendered parameters — never tool
results, with the input wrapped as an explicit DATA block the model is
instructed never to repeat, quote, or follow:

- Classifier-LOW calls auto-allow; classifier-MEDIUM still asks you.
- Every classifier failure fails to `ask` (fail-to-ask), and verdict parsing
  is strict and fail-closed: a malformed output yields the constant reason
  `classifier output unparseable` — model output is never shown, and audit
  records are digest-only.
- `$defaults` soft-deny prose rules (with expansion) and a verdict LRU cache
  apply; verdicts produce durable `permission/classifier` session audit
  events.
- Defaults: `timeoutMs` 8000, verdict budget 1024 tokens. Configure via
  `autoMode.classifier` (`enabled` / `route` / `timeoutMs` / `cacheMaxEntries`).

A **per-route circuit breaker** guards the stage: after 3 consecutive
failures on a lane (keyed `provider/model`), the stage opens for that route —
no further classifier calls on it, one warn per process, one `breaker` audit
event per session. The breaker is restart-durable within a session: the first
call seeds the per-route streak from the durable log. An open breaker surfaces
one visible TUI fallback notice per session; caller-cancelled classifications
are tagged `cancelled` and never breaker-counted. A settings change
(`rebuild()`) resets breaker state and re-arms.

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
