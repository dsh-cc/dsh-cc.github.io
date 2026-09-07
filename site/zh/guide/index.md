---
title: 使用场景指南
description: 面向具体任务的 dsh-cc 工作流指南，从首次启动到扩展与进阶配置。
---

# 使用场景指南

这些页面讲解具体的 dsh-cc 工作流：运行交互式会话、路由模型、委派子代理，以及通过 hooks、技能和插件扩展环境。新手建议从入门部分开始；已明确需求的读者可直接跳转到对应分组。

## 入门

- [交互式会话基本功](/zh/guide/interactive-basics) — 会话生命周期、检查命令与 worktree 基础。
- [模型路由](/zh/guide/model-routing) — 把模型别名映射到自己的 provider/model 组合。
- [记忆](/zh/guide/memory) — CLAUDE.md 风格的项目记忆与持久记忆。
- [MCP 服务器](/zh/guide/mcp-servers) — 接入 MCP 工具、资源与提示。

## 迁移

- [从 Claude Code 迁移](/zh/guide/from-claude-code) — 复用 `.claude/agents`、`SKILL.md`、`CLAUDE.md`、hooks 和斜杠命令。
- [权限](/zh/guide/permissions) — 权限规则、审批流程与工作区边界。
- [无头 / CI](/zh/guide/ci-headless) — 在没有交互式 TUI 的环境中运行 dsh-cc。

## 扩展

- [Hooks](/zh/guide/hooks) — 响应会话、提示、工具与生命周期事件。
- [技能](/zh/guide/skills) — 基于 `SKILL.md` 的技能与内置实用技能。
- [子代理](/zh/guide/subagents) — 派发并管理 `.claude/agents` 子代理。
- [插件](/zh/guide/plugins) — 组合并管理插件与市场。

## 进阶

- [后台任务](/zh/guide/background-tasks) — 运行、检查并继续后台工作。
