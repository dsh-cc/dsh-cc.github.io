---
title: Hooks
description: React to agent lifecycle events — tool calls, prompts, session start/stop — with your own Claude Code-style hooks.json.
---

# Hooks

If you already use Claude Code hooks, dsh-cc can run your existing
`hooks.json` mostly as-is: command and HTTP executors are always on, and the
supported event subset covers session, prompt, tool, permission, compaction,
task, and subagent lifecycle. This page shows the config shape, which events
are bridged, and how the executor kinds are gated.

::: info
dsh-cc is not Claude Code and is not a wrapper around Claude Code. The hooks
bridge is a compatibility path for the mapped CC command-hook subset — see the
[compatibility reference](/reference/compatibility) for the site-wide
disclaimer.
:::

## Who is this for

You want to react to what the agent does — remind on every file read, block
dangerous tool calls, inject context at session start, or log when a
permission is denied — without writing a native plugin. You bring an existing
Claude Code `hooks.json` (or a settings file's `hooks` key) and dsh-cc runs
the supported subset of it on its canonical interception points.

## Config shape

The bridge is the `@dsh-cc/hooks-claude-code` cordis plugin. Its `configPath`
points at a `hooks.json` — or a settings file with a `hooks` key — and the
Claude Code hooks.json shape carries over for the events and executor kinds
the bridge supports. Mount it in a `cordis.yml`:

```yaml
- dsh-hooks-claude-code:
    configPath: ./.claude/hooks.json
    pluginRoot: ./.claude/plugins/my-plugin
    projectDir: .
```

Loading rules, verbatim from the package README:

- The config is parsed **once** at load.
- `configPath` is **process-level**: a relative path resolves against the
  process's launch cwd at load time, so a single config applies to the whole
  process — there is no per-session (`session/new.cwd`) config discovery yet.
- A read/parse failure is contained — including an invalid regex matcher on an
  event that consumes matchers — and the bridge logs a warning and registers
  nothing rather than crashing boot. An unknown handler `type` is skipped with
  a warning.
- A hook with no per-hook `timeout` runs under the protocol's reference
  default (`DEFAULT_HOOK_TIMEOUT_MS` from `dsh-hook-protocol`, 10 minutes —
  the CC default).
- The hooks **themselves** run in the agent's session workspace: for
  agent-scoped points the bridge passes the session's `cwd` as the hook
  process's working directory, so a hook's `pwd`/relative paths operate in the
  user's project tree, not the server launch dir.

The dsh-cc repository itself ships a tracked `hooks.json` (the CC preset loads
it from the launch cwd) as dogfooding.

Other plugin options (all optional unless noted): `pluginRoot` replaces
`${CLAUDE_PLUGIN_ROOT}` in command strings; `projectDir` replaces
`${CLAUDE_PROJECT_DIR}` and sets the hook env var (defaults to the session
cwd when omitted); `defaultTimeoutMs` is the per-hook timeout when a hook
sets none; `stderrSummaryMaxChars` caps the persisted stderr summary;
`allowedHttpHookUrls` is the URL allowlist for http hooks; and
`httpAllowedEnvVars` lists env names allowed to interpolate into http hook
header values.

## Event coverage

The bridge supports **18 of Claude Code's hook events**:

| Event | Status | What the bridge does |
| --- | --- | --- |
| `SessionStart` | supported | additionalContext is injected into the new session (cannot block); partial — plain stdout context, `initialUserMessage`, `sessionTitle`, `watchPaths`, `reloadSkills`, and `CLAUDE_ENV_FILE` are unsupported |
| `UserPromptSubmit` | supported (partial) | blocking and JSON `additionalContext` work; plain stdout context, `sessionTitle`, and `suppressOriginalPrompt` are unsupported |
| `PreToolUse` | supported (partial) | `deny`, `ask`, and `allow` (pre-approval) work; `additionalContext` is injected as post-result context; `updatedInput` is logged + warned but not honored |
| `PostToolUse` | supported | blocking feedback, JSON `additionalContext`, and `updatedToolOutput` / `updatedMCPToolOutput` work |
| `PostToolUseFailure` | supported | observe-only; fires when a tool result is an error, mutually exclusive with `PostToolUse` on a single call |
| `Stop` | supported (partial) | blocking forces another model turn, with a consecutive-block cap of 8 |
| `SubagentStart` | supported (partial) | start context is best-effort (live in-process child only) |
| `SubagentStop` | supported (partial) | observe-only; cannot block the subagent or feed it context |
| `PermissionRequest` | supported | the only interception point; `deny` rejects, `allow`/`approve` pre-approves |
| `PermissionDenied` | supported | observe-only |
| `Notification` | partial | only the `permission_prompt` subtype fires |
| `PostCompact` | supported | observe-only |
| `SessionEnd` | supported (partial) | observe-only; `reason` always `'other'` |
| `StopFailure` | supported (partial) | observe-only; maps the error to CC's error-code vocabulary |
| `TaskCreated` | supported | emitted once per newly-appeared job id |
| `TeammateIdle` | supported (partial) | observe-only; fires only for agents seen as subagents |
| `Setup` | partial | first-run approximation: emits only for a brand-new (seeded) session |
| `SessionResume` | partial | fires only on a `resume` source |

Per the parity matrix, `PreToolUse` is bridged with matcher support and the
`permissionDecision` decision contract but `additionalContext` is ignored;
`Notification` is bridged for the `permission_prompt` subtype only; `Setup` is
a first-run approximation rather than the full upstream contract.

**Unsupported events (14)** — config for them is ignored before group parsing,
so they cannot invalidate or register hooks: `PreCompact`,
`InstructionsLoaded`, `UserPromptExpansion`, `MessageDisplay`, `PostToolBatch`,
`TaskCompleted`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`,
`WorktreeRemove`, `Elicitation`, `ElicitationResult`, and `UserPromptCancel`
(dsh has no cancel seam — the bridge does not do a lossy approximation). The
`Notification` idle / `auth_success` / `elicitation` subtypes and
`SessionResume`'s `clear`/`compact` sources are also unmapped.

Most emit points run **detached** — no extension point awaits a
`SessionStart`/`SubagentStart`/`SubagentStop`/`PermissionDenied`/
`Notification`/`PostCompact`/`SessionEnd`/`StopFailure`/`TaskCreated`/
`TeammateIdle`/`Setup` hook. `PermissionRequest` is the only interception
point in the set. Multiple file-configured hooks on one point run serially, in
config order, and fold most-restrictively (`deny > ask > allow`).

Every agent-scoped stdin payload carries `session_id` and a string-shaped
`transcript_path` (resolved when session persistence is available, `''`
otherwise). Hook issues (`timeout`, `exit-code`, `parse-failure`,
`spawn-failure`, `stop-cap`, `config`) are appended to
`<dsh home>/hooks/diagnostics.jsonl` and visible in `/doctor`.

## Executor kinds

The config parser accepts all four CC executor kinds, dispatched by `type`:

| Executor | Availability | Notes |
| --- | --- | --- |
| `command` | always on | the shell executor (through `ctx.shell`) |
| `http` | always on | POSTs the hook input JSON to `hook.url`; a 200 body is parsed as structured stdout, so a 200-with-`permissionDecision:deny` body blocks; header values interpolate `$VAR`/`${VAR}` only for names in the hook's `allowedEnvVars` (intersected with `httpAllowedEnvVars`); `allowedHttpHookUrls` restricts destinations |
| `prompt` | gated | forks a one-shot subagent; needs `enablePromptHooks: true`, else skipped with a warn |
| `agent` | gated | forks a verification subagent; needs `enableAgentHooks: true`, else skipped with a warn |

For the gated executors, verbatim: these executors are **off by default**:
running them needs `enablePromptHooks: true` / `enableAgentHooks: true`, else
the hook is skipped with a warn (the old safe default). The hook input JSON is
embedded in the hook's `prompt` template via `$ARGUMENTS`, and the fork's text
output is parsed for the same structured-output vocabulary as a command hook.
A `prompt`/`agent` hook costs a model request rather than a shell process; an
omitted `model` defaults to the cheap lane `resolve('haiku')`, and a per-hook
`timeout` is not applied to the fork.

Command-handler options such as `args`, `async`, `asyncRewake`, `shell`, `if`,
`once`, and `statusMessage` are not honored. Matching handlers run serially
and are not deduplicated.

## A minimal worked example

One entry that runs a shell command on every `PostToolUse` event, using the
fields the bridge honors — the matcher subject is the tool name, the handler
`type: 'command'` runs through the shell executor, and a per-hook `timeout`
falls back to the 10-minute default when omitted:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/scripts/after-bash.sh"
          }
        ]
      }
    ]
  }
}
```

Save the file (e.g. as `./.claude/hooks.json`), point the plugin's
`configPath` at it, and the script runs after each `Bash` tool call in the
session workspace. A blocking outcome feeds back as
`blocked by PostToolUse hook` unless the hook supplies its own reason.

## Known limitations

- One process-level `configPath` is parsed once at load; Claude Code's layered
  project, user, plugin, and policy discovery and live reload are not
  implemented.
- `systemMessage` is surfaced as a durable dim notice row (model-visible);
  `suppressOutput` and `terminalSequence` are not applied.
- `{"continue": false}` halts the run via `agent.cancel({kind:'hook'})`.
- Mapped event payloads omit `prompt_id`, `transcript_path`,
  `permission_mode`, and `effort` where Claude Code would provide them.

## Next

- [Skills](/guide/skills) — reusable instruction packages the agent loads on demand.
- [Plugins](/guide/plugins) — the broader extension mechanism the hooks bridge itself mounts through.
- [Extension formats](/reference/extension-formats) — the full catalog of CC-dialect config formats dsh-cc recognizes.
