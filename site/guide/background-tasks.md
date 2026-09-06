---
title: Background tasks & agents
description: Run delegated work in the background — jobs you can watch with /tasks, and continuable agents you can message, inspect, and stop.
---

# Background tasks & agents

Heavy delegated work does not have to block you: dsh-cc can launch a `Task` child in the background so you keep talking to the main agent while it runs, then inspect it, send it follow-up messages, or interrupt it. This page is about **operating** that background work — writing agent definitions is covered in [/guide/subagents](/guide/subagents).

## The two mechanisms

dsh-cc has two distinct things that can "run in the background":

| Mechanism | What it is | How you manage it |
| --- | --- | --- |
| **Background jobs** | Long-running shell-side jobs started by tools such as `bash` with `run_in_background: true`. | Listed by `/tasks`. |
| **Background agents** | Continuable `Task` children launched with `run_in_background: true` (or a `background: true` definition pin). The call returns promptly with an `agentId` and the real result arrives later as a wake message. | Addressed by `agentId`: `send_message` to continue the same conversation, `interrupt` to stop its current turn, `list` for status. Human-facing inspection via `/agents`. |

Note the asymmetry: `/tasks` lists background **jobs** only — it is not the surface for background agents. The footer cross-links to `/agents` when agents are running. Use `/agents` for continuable agents and `send_message` / `interrupt` to act on them.

When to use which:

- Use a **background job** for a command you want to keep an eye on without stalling the current turn — a long build, a watch process.
- Use a **background agent** for delegated reasoning or multi-step work whose result does not need to be composed on right away — you can keep talking and the child's result arrives as a wake message.

## Launching in the background

Dispatch is **foreground on omit**: with `run_in_background` omitted, a `Task` call waits for the child to finish and returns its text output — unless the agent's definition pins `background: true`, in which case the call backgrounds on omit. Precedence:

| Situation | Result |
| --- | --- |
| `run_in_background: true` | Durable, continuable background agent; returns `{ status: 'async_launched', agentId }` immediately, result arrives later. |
| `run_in_background: false` | Forces foreground, even for a `background: true` definition. |
| Omitted, definition pins `background: true` | Backgrounds on omit. |
| Omitted, no pin | Foreground: the tool waits for completion and returns the child's text output. |

The `background: true` pin lives in the definition's frontmatter — see [/guide/subagents](/guide/subagents). The repo's bundled `deep-reasoner` and `fast-worker` agents pin `background: true`, so a plain `Task` call to them launches continuable in the background; the bundled `explore` and `dsh-cc-guide` agents stay unpinned and collect in the foreground.

::: warning
`subagent_type: "fork"` cannot run in the background — fork plus background is rejected (upstream issue #2124); a fork stays a foreground one-shot.
:::

Related controls, as documented in the parity matrix:

- **Ctrl+B promotion (TUI only).** While the TUI is busy, pressing Ctrl+B promotes an armed foreground collect to the background: the pending tool call resolves `{ status: 'async_launched', agentId, backgroundedByUser: true }` and the child keeps running. There is no promotion path in non-TUI clients. Under tmux, Ctrl+B is the default prefix — a double-press passes a literal Ctrl+B through.
- **Kill switch.** A non-empty `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` value other than `0`/`false` (case-insensitive) disables the backgrounding-by-default pins; explicit `run_in_background` arguments stay honored both ways.
- **Capacity guard.** The Task tool refuses a new continuable child when the parent already has 25 live children, with an actionable error suggesting `/agents stop <id>`.

## Inspecting and intervening

**`/agents`** (partial parity) is a thin snapshot over running agents — list, detail, stop:

```text
/agents              # list running background agents
/agents <id>         # detail for one agent
/agents stop <id>    # interrupt one (it stays resumable)
```

The TUI consumes the same snapshot and adds fold-derived decorations to the detail view (provider, prompt excerpt, last stopReason). `/agents attach <id>` is a reserved, **unimplemented** namespace.

**Model-side tools** address the same children by `agentId`:

- `send_message` — continue the same background agent's conversation with a follow-up prompt.
- `interrupt` — stop the child's current turn; the persisted session survives and can be continued.
- `list` — enumerate children with their status.

**`/tasks`** (partial parity) lists background **jobs** only; the todo-list seam is pending.

## Lifecycle honesty

What happens around exits and resumes, phrased as the sources do:

- **Parent exit drains the in-flight turn.** Exiting your session drains a background child's in-flight turn; its persisted session survives.
- **Cold resume.** The child's persisted session cold-resumes on the next `send_message`.
- **Cold resume drops extra agent options.** A background child's `persona`, `toolFilter`, and model route survive resume, but other fields — such as alias-stamped `reasoningEffort` or token limits — do not.
- **Resume pins.** Each background spawn captures a resume pin (the alias selected at spawn plus `maxTokens`) into a resume-pin store, and resume restores that pinned tuple *including explicit absence* — a pin recording an unset value is honored as absent rather than re-resolved. A pinned model the parent can no longer resolve is gated by the `subagents-resume.onUnavailableModel` setting (`block` or `route-current`, default `block`), with deny codes such as `SUBAGENT_MODEL_UNAVAILABLE`, `WORKSPACE_CHANGED`, `DEFINITION_CHANGED`, `PINNED_TOOL_UNAVAILABLE`, `PIN_ORPHANED`, `PIN_UNREADABLE` naming the policy knob.
- **No output file.** There is no `TaskOutput` alias and no `outputFile` field; a foreground result comes back as text.

::: info
A foreground-launched child (non-fork, named agent or `general-purpose`) is also collected inline as a continuable child with the same resume pinning — so a foreground-launched child is pinnable/resumable exactly like a background one.
:::

## A worked flow

Dispatch a reviewer in the background, keep working, then steer it:

1. **Dispatch.** With a `reviewer.md` definition in `.claude/agents`, call `Task` with `subagent_type: "reviewer"` and `run_in_background: true`. The call returns `{ status: 'async_launched', agentId: … }` immediately.
2. **Keep editing.** You keep talking in the main session — the reviewer reads your repo meanwhile. Its result arrives later as a wake message; do not compose on it inline.
3. **Check status.** Run `/agents` to list running agents, `/agents <agentId>` for detail.
4. **Continue it.** With `send_message` and the `agentId`, send a follow-up — for example narrowing the review to one file. It is the same conversation; the child keeps its context.
5. **Interrupt when it goes wrong.** If the reviewer goes off track, `interrupt` stops its current turn (it stays resumable), or `/agents stop <agentId>` does the same from the human side. Resume it later with `send_message`.

## Next

- [/guide/subagents](/guide/subagents) — authoring `.claude/agents` definitions, including the `background: true` pin.
- [/guide/interactive-basics](/guide/interactive-basics) — the interactive surfaces these commands live in.
- [/reference/commands](/reference/commands) — the full slash-command catalog, including `/tasks` and `/agents`.
