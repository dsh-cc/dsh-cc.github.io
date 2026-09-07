---
layout: home
title: "dsh-cc — Claude Code-style workflows. Your models."
description: "dsh-cc turns DeepSeek Harness into a batteries-included coding agent environment: Claude Code-style workflows with your choice of models, tools, and permissions."
hero:
  name: "Claude Code-style workflows."
  text: '<span class="grad">Your models.</span>'
  tagline: 'dsh-cc turns <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> into a batteries-included coding environment for everyday development. Keep familiar project assets and interaction patterns while choosing the models, tools, permissions, and agent composition that fit your environment.'
  actions:
    - theme: brand
      text: Quick start
      link: /quickstart
    - theme: alt
      text: GitHub
      link: https://github.com/dsh-cc/dsh-cc
features:
  - title: Reuse familiar workflows
    details: "`.claude/agents`, `SKILL.md`, `CLAUDE.md`, hooks, permissions, slash commands, and resumable sessions — carry your existing project assets over as-is."
  - title: Bring your own model strategy
    details: Route stable aliases like `sketch`, `draft`, `blueprint`, and `masterplan` to any provider/model pair your dsh deployment supports.
  - title: Run a complete coding loop
    details: TUI, MCP, memory, subagents, background tasks, worktrees, structured output, and deferred tool discovery — the full loop, out of the box.
  - title: Stay composable
    details: Installed through native dsh profiles and plugins — no permanent DeepSeek Harness fork to maintain.
---

<InstallCommand
  label="Quick start"
  copy-label="Copy"
  copied="Copied!"
  :commands="[
    { c: 'install DeepSeek Harness and the dsh-cc launcher' },
    { cmd: 'npm install -g @deepseek-ai/dsh @dsh-cc/cli' },
    { cmd: 'dsh-cc' },
  ]"
/>

<p class="badges">
  <a href="https://www.npmjs.com/package/@dsh-cc/cli"><img src="https://img.shields.io/npm/v/%40dsh-cc%2Fcli" alt="npm version" /></a>
  <a href="https://github.com/dsh-cc/dsh-cc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/dsh-cc/dsh-cc" alt="license" /></a>
  <a href="https://github.com/dsh-cc/dsh-cc"><img src="https://img.shields.io/github/stars/dsh-cc/dsh-cc?style=social" alt="GitHub stars" /></a>
</p>

<div class="notice">Official packages only: every dsh-cc package is published under the @dsh-cc scope on npm (e.g. <code>@dsh-cc/cli</code>). Anything outside that scope is not affiliated with this project.</div>

<p class="fine">dsh-cc is not Claude Code and is not a wrapper around Claude Code. It implements familiar Claude Code-style workflows on the open, composable DeepSeek Harness runtime. Not affiliated with or endorsed by Anthropic. Apache-2.0 licensed.</p>
