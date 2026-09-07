---
layout: home
title: "dsh-cc — 熟悉的 Claude Code 工作流，自由选择模型"
description: "dsh-cc 将 DeepSeek Harness 组合成开箱即用的编程 Agent 环境：Claude Code 风格工作流，模型、工具与权限策略由你决定。"
hero:
  name: "熟悉的 Claude Code 工作流。"
  text: '<span class="grad">自由选择模型。</span>'
  tagline: 'dsh-cc 将 <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> 组合成一个开箱即用、适合日常开发的编程 Agent 环境。你可以延续熟悉的项目资产与交互方式，同时自行决定使用哪些模型、工具、权限策略和 Agent 组合。'
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/quickstart
    - theme: alt
      text: GitHub
      link: https://github.com/dsh-cc/dsh-cc
features:
  - title: 复用熟悉的工作流
    details: "`.claude/agents`、`SKILL.md`、`CLAUDE.md`、hooks、权限规则、斜杠命令与会话恢复——现有项目资产原样沿用。"
  - title: 自由组合模型
    details: 将 `sketch`、`draft`、`blueprint`、`masterplan` 等稳定别名映射到当前 dsh 部署支持的任意 provider/model。
  - title: 覆盖完整编程闭环
    details: TUI、MCP、记忆、子代理、后台任务、worktree、结构化输出与延迟工具发现——完整闭环，开箱即用。
  - title: 保持可组合
    details: 通过 dsh 原生 profile/plugin 系统安装，无需长期维护 DeepSeek Harness fork。
---

<InstallCommand
  label="快速开始"
  copy-label="复制"
  copied="已复制！"
  :commands="[
    { c: '安装 DeepSeek Harness 和 dsh-cc 启动器' },
    { cmd: 'npm install -g @deepseek-ai/dsh @dsh-cc/cli' },
    { cmd: 'dsh-cc' },
  ]"
/>

<p class="badges">
  <a href="https://www.npmjs.com/package/@dsh-cc/cli"><img src="https://img.shields.io/npm/v/%40dsh-cc%2Fcli" alt="npm version" /></a>
  <a href="https://github.com/dsh-cc/dsh-cc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/dsh-cc/dsh-cc" alt="license" /></a>
  <a href="https://github.com/dsh-cc/dsh-cc"><img src="https://img.shields.io/github/stars/dsh-cc/dsh-cc?style=social" alt="GitHub stars" /></a>
</p>

<div class="notice">官方渠道：所有 dsh-cc 包只发布在 npm 的 @dsh-cc scope 下（例如 <code>@dsh-cc/cli</code>）。scope 之外的任何包均与本项目无关。</div>

<p class="fine">dsh-cc 不是 Claude Code，也不是 Claude Code 的包装器。它在开放、可组合的 DeepSeek Harness 运行时上实现了开发者熟悉的 Claude Code 风格工作流。与 Anthropic 无关联，亦未获其背书。Apache-2.0 许可。</p>
