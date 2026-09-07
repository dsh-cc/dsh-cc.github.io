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
inherit             -> parent agent route
```

The key point: **aliases are configuration, not hard-coded vendor bindings.** This lets you preserve familiar agent definitions while choosing the models that fit your own environment.

::: tip
The dsh-cc project itself is developed with dsh-cc using this exact routing — see the current development mapping in the project README's [Dogfooding dsh-cc](https://github.com/dsh-cc/dsh-cc#dogfooding-dsh-cc) section. It is a real project configuration, not a required default.
:::

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
