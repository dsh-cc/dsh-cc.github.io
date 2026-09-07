---
title: 快速开始
description: 安装 dsh-cc，启动第一个会话，并把模型路由到你自己的 provider，全程约五分钟。
---

# 快速开始

dsh-cc 面向希望在 DeepSeek Harness 运行时上使用熟悉的 Claude Code 风格工作流——斜杠命令、`.claude/` 项目资产、hooks、会话恢复——并自由选择模型的开发者。读完本页，你将完成启动器安装、启动一个可用的终端会话，并把它指向自己的模型供应商。

## 前置要求

- **Node.js** `^22.19 || >=24`
- **npm**（随 Node 一起安装）

## 安装

安装 DeepSeek Harness 和 `dsh-cc` 启动器，然后直接启动：

```sh
$ npm install -g @deepseek-ai/dsh @dsh-cc/cli
$ dsh-cc
```

如果已经安装 `dsh` **>= 0.1.0-rc.5**，只需安装启动器：

```sh
$ npm install -g @dsh-cc/cli
$ dsh-cc
```

::: tip
官方软件包只来自 `@dsh-cc` npm scope。
:::

## 首次运行

运行 `dsh-cc`。首次启动时会创建并运行面向 CC 工作流的 `tui` profile，无需其他配置即可开始：

- 在 `tui` profile 上，**CC Mode** 是默认的 agent preset。
- 终端 profile 默认以**全屏模式**启动。单次关闭全屏模式：

```sh
$ DSH_CCTUI_UI_MODE=regular dsh --profile tui
```

## 你的第一个任务

用自然语言输入一个请求——例如让它查看某个文件或做一个小修改——agent 会规划、调用工具并汇报结果。交互方式是你熟悉的那一套：排队输入、敏感操作的审批流程，以及斜杠命令。

在会话内验证安装状态：

- `/doctor` — 会话健康检查（支持 `--verbose` / `--json`）
- `/status` — 环境和会话状态

## 选择模型

`dsh-cc` 不会把你绑定到某一家供应商。`sketch`、`draft`、`blueprint`、`masterplan` 等别名只是配置，不是硬编码——你可以把它们映射到 dsh 部署支持的任意 provider/model 组合。

1. `/provider` 在覆盖层中管理已配置的模型供应商：`/provider list` 列出当前路由，`/provider add <preset-id>` 通过向导添加内置预设（Moonshot、Z.AI/智谱、DeepSeek）或完全自定义的端点。
2. API 密钥通过掩码输入框录入并保存到凭据存储（`~/.dsh/.credentials.yaml`），不写入 settings。变更对新会话立即生效；当前会话保持原供应商，直到用 `/model` 重新选择。

完整的别名到路由映射、路由语义和按 agent 覆盖，详见[模型路由指南](/zh/guide/model-routing)。

## 其他方式

启动器只是便捷入口——同一套后端也可以显式组合，或用于 dsh Web UI：

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

## 下一步

- [交互基础](/zh/guide/interactive-basics) — 日常 TUI 工作流
- [模型路由](/zh/guide/model-routing) — 别名通道与 provider 配置详解
- [从 Claude Code 迁移](/zh/guide/from-claude-code) — 哪些延续，哪些不同
