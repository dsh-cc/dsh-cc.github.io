---
title: Bring your own models
description: Route the stable Claude-Code-style model aliases in your agent definitions to any provider/model your dsh deployment supports.
---

# Bring your own models

Claude-Code-style agent definitions keep referring to stable model names like `sonnet` or `opus`. With dsh-cc you do not have to rewrite them: each logical lane is routed to a provider/model pair configured for your deployment, so your agents stay stable while you choose the models that fit your environment, cost, and latency needs.

## The alias lanes

Claude Code-style agent definitions often refer to models using aliases:

```yaml
model: sonnet
```

`dsh-cc` can route those aliases to provider/model pairs configured for your deployment. Conceptually:

```text
sonnet / draft      -> <provider>/<general coding model>
opus / blueprint    -> <provider>/<reasoning model>
haiku / sketch      -> <provider>/<fast model>
fable / masterplan  -> <provider>/<maximum-reasoning model>
architect           -> parent agent route (planning / orchestration)
gauge               -> typed-decision cheap lane (System One models; not generative)
inherit             -> parent agent route
```

The key point: **aliases are configuration, not hard-coded vendor bindings.** This lets you preserve familiar agent definitions while choosing the models that fit your own environment.

`gauge` is a decision-only lane for System One models, used by typed-decision consumers such as the permission classifier. **Never use it as agent frontmatter `model:`.** When unconfigured it follows `haiku`. The routes service rejects any chat request for a System One model with `SystemOneChatModelError` (code `SYSTEMONE_NOT_CHAT_MODEL`).

::: tip
The dsh-cc project itself is developed with dsh-cc, and its model routes are plain user configuration expressed through model aliases — see [model aliases](https://github.com/dsh-cc/dsh-cc#model-aliases) in the project README. It is a real project configuration, not a required default.
:::

## Tiered cascade routing (moa)

The `@dsh-cc/moa` plugin routes main-conversation turns over the four lane aliases `sketch` / `draft` / `blueprint` / `masterplan`: each user turn is classified by a System One decision call into the cheapest sufficient tier, and an optional acceptance judge escalates a rejected answer to the next tier up. Classification runs at the entry-point admission seam, before the step is dispatched, and records the tier durably as the session's model selection (`agent.model.select(…)`; harness 0.2.2 session-persisted selections — the request-time overlay is gone).

moa is **off by default** — with `moa.enabled: false` the plugin mounts nothing and costs nothing. Subagents and forks are out of scope: child sessions are never classified, selected, or judged (see the scope note below).

Configuration lives in the `moa` settings namespace:

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | arm tiered routing on the main agent |
| `acceptance.enabled` | `false` | run the acceptance judge and act on rejects |
| `acceptance.shadow` | `false` | run the judge, log verdicts only |
| `acceptance.tau` | `0.7` | reject when `P(acceptable) < tau` |
| `max-escalations` | `1` | per-message escalation ceiling (read-time clamp to 3) |
| `judge-route` | alias `gauge` | alias or `{provider, model, protocol}`; unset uses the gauge lane alias, which must resolve to a System One route, else moa stays unarmed |
| `classify-budget-tokens` | `4000` | classify input budget |
| `call-budget-ms` | `8000` | per-message cascade deadline |
| `context-routing.mode` | `off` | `off`/`shadow`/`active` — context-aware classification v2 (see below) |
| `context-routing.timeout-ms` | `1500` | per-decision timeout (read-time clamp 100..8000) |
| `context-routing.max-input-tokens` | `4000` | budget for routing state plus question (read-time clamp 512..16000) |
| `context-routing.max-under-tier-probability` | `0.10` | maximum probability mass tolerated above the selected tier (0..0.5) |
| `context-routing.min-top-probability` | `0.60` | below this top probability, fall back to live selection (0.25..1) |

The acceptance judge runs on the `gauge` lane described above — the typed-decision cheap lane for System One models — so a `gauge` mapping that resolves to a System One route is what arms judging when `judge-route` is left unset.

### Context routing v2

`context-routing` is optional and defaults to `off`. When enabled, it replaces the argmax over the four-tier answer with a context-aware classification plus a tail-risk tier policy: the classifier sees only a bounded slice of the turn's history — the current request, the last three user requests, the last assistant answer and tool names, never arguments, paths or results — and the applied tier is the cheapest one whose probability mass above it stays under `max-under-tier-probability`.

`shadow` runs alongside the legacy classifier: the legacy verdict still picks the model, so shadow accepts a double classification call per turn; `active` replaces the legacy classifier entirely. Both require `moa.enabled: true` and a successful arming, and an explicit `/model` still wins. The escalation retry path and subagent/fork sessions never classify.

Turning on `active` requires the offline evaluation gate (`moa/eval/context-routing.json`, 120 blind-labeled cases) to pass first; setting `context-routing.mode` back to `off` is the whole rollback.

### Truthful model bookkeeping

While moa routing is active, several things keep the session honest about which model is actually serving it:

- **Notices are truthful.** The sanitizer publishes the frozen per-step selection and passes every `[model changed: …]` notice through byte-identical — with routing decided before admission, a notice can no longer claim a model the next step will not serve, so the rule that dropped "phantom" notices is retired.
- **`/model` disarms moa.** A mid-session `/model` selection away from the boot pair disarms moa before the next turn is classified — an explicit user precedence, and the wire serves your selection (previously the switch was silently ignored). Switching back to the boot selection re-arms moa from the next turn.
- **Persona states the effective model.** The system-prompt `provider`/`model` variables carry the selected tier pair while moa routing is active; on any fail-open (classification failure or timeout, off-boot selection, disabled) the harness's own selection variables pass through untouched, so the prompt and the wire always agree.
- **Statusline shows the effective pair.** While moa routing is active the statusline renders `<resolved-model> ◂ <tier-alias>` (e.g. `<provider-model> ◂ sketch`) instead of the bare tier alias; custom statusline payloads gain a `moa: {tier, model}` field. A switch-away clears the segment.
- **Statusline shows why moa is not armed.** With `moa.enabled: true` but arming refused (routes unavailable, degenerate ladder, judge-route window failure) the statusline renders `moa:unarmed — <reason>` instead of hiding the misconfiguration in a warn line.

Routing scope is the main session's own turns only. A subagent session — anything carrying a `subagent` origin or a positive `delegationDepth` header, fork-type children and resumed child sessions driven interactively included — is never classified, selected, or judged, so a spawned agent's model stays whatever its declaration resolved to at spawn.

## Managing providers with `/provider`

The `/provider` command opens an overlay over your configured model providers:

| Command | What it does |
| --- | --- |
| `/provider` | Open the provider overlay |
| `/provider list` | Print the current routes |
| `/provider add <preset-id>` | Walk a wizard for a built-in preset (Moonshot, Z.AI/Zhipu, DeepSeek) or a fully custom endpoint |
| `/model` | Re-pick the provider/model for the current session |

The per-route detail view lets you rotate keys, refresh the model list, set the default, or remove the route. Notes on credentials:

- API keys are typed into a masked field and stored in the credential store at `~/.dsh/.credentials.yaml` — never in settings.
- Keys already supplied by the environment are shown read-only.
- Changes take effect for new sessions immediately (credentials resolve per request); the running session keeps its current provider until you pick again with `/model`.

## Per-task choice: aliases and agent frontmatter

Subagent definitions live in per-workspace `.claude/agents` directories and use Claude Code-style frontmatter, including a `model:` field. When dsh-cc dispatches a subagent, the persona comes from the definition's `systemPrompt`, and the `model:` alias in the frontmatter is resolved through the `ccModelRoutes` alias service — queried on every spawn — so a definition that says `model: haiku` lands on whatever provider/model your `haiku` lane maps to at that moment.

The same resolution applies elsewhere aliases are resolved: hook executors that resolve a `model:` field go through `ccModelRoutes` too (an omitted model falls back to the `haiku` cheap lane).

::: warning
Alias resolution covers agent frontmatter and hook executors. Aliasing the main-session default model is a known follow-up, and `ANTHROPIC_*` env vars have no Anthropic semantics — see the Models section of the parity matrix.
:::

## Alias semantics

Resolution follows a fixed lookup order: **settings overlay → config defaults → builtin fallback**. Alias key matching is **case-insensitive** (keys are folded to lowercase at merge and at lookup).

An alias entry comes in two shapes:

- String form — `sonnet: deepseek-v4-flash`: the model id only, the provider inherits.
- Object form — `opus: { provider: deepseek-official, model: deepseek-v4-pro, reasoningEffort: max }`: an explicit route with an optional effort.

A few boundary behaviors worth knowing:

- `inherit` (any case) means no override — the child inherits the parent route.
- Only the **settings** layer may set an entry to `null`, which deletes a same-named config-default entry (entry-shallow). Deleting a builtin alias falls through to the builtin fallback, i.e. inherit — config may never hold `null`.
- Unconfigured builtin aliases (`fable`/`opus`/`sonnet`/`haiku` and the dsh-cc lanes) inherit the parent route. An unconfigured **custom** alias such as `turbo` has no fallback: it passes through verbatim as a literal model id, with a warning logged.
- A configured string-form target that names another alias is followed **one hop** — the hop carries `reasoningEffort`. Object-form targets are concrete routes and are not followed as names.

## Cheap-lane observability

When an unconfigured builtin alias silently inherits the parent route, the resolver logs a warning — once per alias. The warning is gated by the `warnOnInherit` key in the `model-aliases` settings namespace (default `true`; set it to `false` to suppress).

The optional System One decision runtime (`@dsh-cc/decision-usage`, the `ctx.systemoneDecisions` service configured through the trusted `systemone-decisions` settings namespace) keeps a durable per-session ledger of decision calls — mounting it enables no business and triggers no request on its own. When a session has one, `/cost` renders a separate `SystemOne decisions` section: confirmed spend is priced by the attempt's actual model and provider through the same price table, unknown or still-unsettled usage reads as a reserved upper bound on its own line, outside the confirmed subtotal, and a model without a configured price reads as unpriced — never `$0`.

## Cycling models with Ctrl+P

In the TUI, `Ctrl+P` / `Shift+Ctrl+P` cycles through the alias list in `cc-model-cycling.cycleOrder`, resolved through the same alias resolver. Entries that do not resolve, or are not advertised, are skipped with a toast. The switch is in-memory only; nothing is written to settings.

## `model$level`: effort on the reference

Any model reference — agent frontmatter `model:`, an alias target's `model` id, or the auto-mode classifier's `route` — may carry a `` `$<level>` `` suffix (`opus$high`, `glm-5.3$xhigh`):

- The suffix is stripped before the id leaves the resolver, so pricing, breakers, and pins key on bare model ids.
- The level rides `reasoningEffort` on the resolved route and **overrides** an alias target's declared `reasoningEffort`.
- Unknown level spellings are carried to the harness boundary, which fails the request with `UNSUPPORTED_REASONING_EFFORT`.
- Malformed suffixes (a trailing `$`, an empty or bad-charset level, a `$` inside a provider segment) pass the reference through verbatim.

## Effort precedence

When several sources declare a reasoning effort, the effective value is picked by this order (higher rungs never mutate lower ones):

1. An explicit `` `$level` `` suffix.
2. The alias target's declared `reasoningEffort`.
3. Agent frontmatter `effort` (applied at spawn).
4. The `/effort` session selection.
5. The catalog/harness route default.

See the `/effort` row in [/reference/commands](/reference/commands).

## Example: end-to-end walkthrough

A minimal path from a bare deployment to running a task on the fast lane:

```sh
# 1. Add a provider through the preset wizard
/provider add <preset-id>

# 2. Inspect the current routes
/provider list

# 3. In the per-route detail view, set the default
#    and map the lanes (haiku/sketch -> fast model)

# 4. Re-pick the model for the current session if needed
/model
```

After the lanes are mapped, any agent definition pinned to a lane runs there. For example, a fast lookup agent in `.claude/agents/lookup.md`:

```yaml
---
name: lookup
description: Fast codebase lookups
model: haiku
---

You are a read-only codebase scout. Return paths and line numbers.
```

Dispatching this agent resolves `haiku` through `ccModelRoutes` at spawn time — no change to the definition is needed when you later remap the fast lane to a different provider.

## Next

- [/quickstart](/quickstart) — get a session running first.
- [/guide/subagents](/guide/subagents) — how subagent definitions and dispatch work.
- [/reference/commands](/reference/commands) — the full command surface, including `/provider` and `/model`.
