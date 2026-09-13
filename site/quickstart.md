---
title: Quick start
description: Install dsh-cc, start your first session, and route it to your own models in about five minutes.
---

# Quick start

dsh-cc is for developers who want familiar Claude Code-style workflows — slash commands, `.claude/` project assets, hooks, resumable sessions — running on the DeepSeek Harness runtime with the models *you* choose. By the end of this page you will have installed the launcher, booted a working terminal session, and pointed it at your own provider.

## Prerequisites

- **Node.js** `^22.19 || >=24`
- **npm** (ships with Node)

## Install

Install DeepSeek Harness and the `dsh-cc` launcher, then start coding:

```sh
$ npm install -g @deepseek-ai/dsh @dsh-cc/cli
$ dsh-cc
```

`dsh-cc` requires `dsh` **>= 0.1.5-rc.1**; the default `npm install -g @deepseek-ai/dsh` currently satisfies this (as of 2026-09-12), and the launcher enforces the floor at bootstrap.

Already have `dsh` **>= 0.1.5-rc.1**? Install only the launcher:

```sh
$ npm install -g @dsh-cc/cli
$ dsh-cc
```

::: tip
Official packages come only from the `@dsh-cc` npm scope.
:::

### Optional: official plugins

The install above is the whole quick start. Two optional official plugins — shipped through the dsh-cc repo's `dsh-cc` marketplace — add preconfigured subagent lanes:

- **`dsh-cc-agents`** — the `dsh-cc-agents:critic` (reasoning and plan review) and `dsh-cc-agents:executor` (mechanical execution) subagents, plus the `dsh-cc-agents:marathon` (long-horizon, repo-wide work) subagent and an orchestration routing skill.
- **`dsh-cc-shunt`** — gates that redirect bulk file reads and boilerplate generation to cheap-lane worker subagents, keeping large file corpora out of the main context.

Install them inside a session:

```text
/plugin marketplace add dsh-cc/dsh-cc
/plugin install dsh-cc-agents@dsh-cc
/plugin install dsh-cc-shunt@dsh-cc
```

Restart the session after installing so the new agents and hooks are picked up. Details and configuration: [Plugins](/guide/plugins).

## First run

Run `dsh-cc`. On first launch it creates and boots the CC-oriented `tui` profile, so there is nothing else to configure to get started:

- **CC Mode** is the default agent preset on the `tui` profile.
- The terminal profile launches **fullscreen** by default. To opt out for one invocation:

```sh
$ DSH_CCTUI_UI_MODE=regular dsh --profile tui
```

On a fresh install with no model configured, the TUI opens the provider panel automatically: pick a preset, paste your API key (stored only in the credential store `~/.dsh/.credentials.yaml`), and set the default model. Dismissing with `Esc` skips it for the current session only — it is re-offered on next boot. To opt out permanently, set `cc-onboarding.suppressed: true` under the user settings namespace in `~/.dsh/settings.json`; re-arm any time with `/onboard`. Non-interactive (non-TTY) runs never trigger the flow.

## Your first task

Type a request in natural language — for example, ask it to explore a file or make a small edit — and the agent plans, uses tools, and reports back. The interaction model is the familiar one: queued prompts, approval flows for sensitive actions, and slash commands.

Verify the installation from inside the session:

- `/doctor` — session health report (supports `--verbose` / `--json`)
- `/status` — environment and session status

## Choose models

`dsh-cc` does not bind you to one vendor. Aliases such as `sketch`, `draft`, `blueprint`, and `masterplan` are configuration, not hard-coded bindings — you map them to any provider/model pair your dsh deployment supports.

1. `/provider` opens an overlay over your configured model providers: `/provider list` prints the current routes, and `/provider add <preset-id>` walks a wizard for the built-in presets (Moonshot, Z.AI/Zhipu, DeepSeek) or a fully custom endpoint.
2. API keys are typed into a masked field and stored in the credential store (`~/.dsh/.credentials.yaml`), never in settings. Changes take effect for new sessions immediately; the running session keeps its provider until you pick again with `/model`.

The full alias-to-route mapping, routing semantics, and per-agent overrides are covered in the [model routing guide](/guide/model-routing).

## Alternative paths

The launcher is a convenience — the same backend can be composed explicitly, or used with the dsh web UI:

```sh
$ dsh plugin --profile tui add \
    @dsh-cc/bundle-permissions \
    @dsh-cc/bundle-shell \
    @dsh-cc/bundle-tui
$ dsh --profile tui
```

```sh
$ dsh plugin --profile web add \
    @dsh-cc/bundle-permissions \
    @dsh-cc/bundle-shell
$ dsh web
```

## Next steps

- [Interactive basics](/guide/interactive-basics) — the day-to-day TUI workflow
- [Model routing](/guide/model-routing) — alias lanes and provider setup in depth
- [Coming from Claude Code](/guide/from-claude-code) — what carries over, what differs
