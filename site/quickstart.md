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

Already have `dsh` **>= 0.1.0-rc.5**? Install only the launcher:

```sh
$ npm install -g @dsh-cc/cli
$ dsh-cc
```

::: tip
Official packages come only from the `@dsh-cc` npm scope.
:::

## First run

Run `dsh-cc`. On first launch it creates and boots the CC-oriented `tui` profile, so there is nothing else to configure to get started:

- **CC Mode** is the default agent preset on the `tui` profile.
- The terminal profile launches **fullscreen** by default. To opt out for one invocation:

```sh
$ DSH_CCTUI_UI_MODE=regular dsh --profile tui
```

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
