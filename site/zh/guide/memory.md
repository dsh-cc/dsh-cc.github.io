---
title: 记忆体系
description: 了解 dsh-cc 的两层记忆——每个会话都加载的 CLAUDE.md 项目约定，以及通过 memory_save 通道写入的持久 memdir——以及它们如何在后续会话中浮现。
---

# 记忆体系

本文写给希望 agent 跨会话记住事情的人：项目约定、你的反馈、关于代码库的
事实。dsh-cc 提供两个互补的层——一个每个会话都会加载的 `CLAUDE.md` 约定
文件，以及一个持久的、基于文件的 **memdir**（`MEMORY.md` 加主题文件），
agent 通过专用的 `memory_save` 通道写入，并通过动态召回读回。

## 两层概览

| 层 | 内容 | 谁写入 | 何时加载 |
| --- | --- | --- | --- |
| `CLAUDE.md` | 项目约定、构建命令、代码风格 | 你（由 `/init` 脚手架生成） | 每个会话 |
| memdir（`MEMORY.md` + 主题文件） | 持久事实：用户偏好、反馈、项目与参考笔记 | agent，通过 `memory_save` | `MEMORY.md` 索引始终加载；主题文件按需召回 |

记忆层支持 `CLAUDE.md` 风格的上下文，外加一个专用的持久记忆写入通道。
记忆按工作区隔离，并支持可选的共享团队记忆。

## CLAUDE.md 层

`CLAUDE.md` 是约定文件：你希望在该仓库的每个会话中都生效的持久、人工编写的
指令——构建命令、代码风格、仓库特有规则。它位于仓库根目录，每个会话都作为
上下文挂载。

运行 `/init` 即可脚手架生成。根据兼容性矩阵，dsh-cc 中的 `/init` 会驱动一个
后续模型轮次来写入或刷新 `CLAUDE.md`，而不是 Claude Code 上游的一次性初始化
流程（状态：partial）。之后你可以像编辑普通 Markdown 文件一样手工编辑它。

一个上游特性没有移植：`CLAUDE.md` 的 `@path` 导入机制缺失——目前没有解析器
或加载器处理导入。

## memdir 层

memdir 是持久存储。它的布局：

- **记忆主目录**（默认为 harness home 的 `memory/`）充当所有工作区共享的
  **全局层**。
- 每个 git 仓库在 `<memoryHome>/projects/<slug>/` 下有自己的工作区目录——
  链接的 worktree 与子目录会先折叠到主检出上，因此它们共享同一个存储。
- 每一层都有一个**始终加载的 `MEMORY.md` 入口文件**（上限 200 行 / 25 KB），
  每行索引一个 `.md` **主题文件**。
- 每个主题文件带有 `name`、`description` 和 `type`（`user` / `feedback` /
  `project` / `reference`）frontmatter，以及一个 Markdown 正文。

不同仓库的会话永远不会看到彼此的私有记忆；对所有工作区都有用的事实以
`scope: "global"` 保存。

### `memory_save` 通道

agent 唯一可用的保存通道是 `memory_save` 工具。记忆目录位于所有会话工作区
之外，直接针对它们的 `write`/`edit` 调用会被 fs 沙箱拦截并总是失败——系统
提示中明确说明了这一点。`memory_save` 接收结构化字段（`name`、`type`、
`description`、`body`，可选 `scope`：`workspace`（默认）或 `global`），从调用
agent 的规范化 git 根解析目标目录，在 host 侧生成 frontmatter，并更新
`MEMORY.md` 指针。

::: info
`memory_save` 只写工作区与全局两层；团队范围的保存通道和删除通道均为后续
工作。注册是机会性的：没有工具服务的 host 保持只读。
:::

### `/memory`

面向用户的 `/memory` 命令列出记忆文件，或按名称打印某条记忆的正文。它注册为
全局命令，因此运行时不需要模型轮次。

| 输入 | 结果 |
| --- | --- |
| `/memory` | 按名称排序，以 `- name (type) — 首行` 的形式列出每个主题，并附记忆目录头。 |
| `/memory <name>` | 打印单条记忆的 frontmatter 与完整正文，按 frontmatter `name` 或文件名匹配。未知名称会给出友好提示。 |

它完全只读，斜杠输入与输出不会出现在模型请求中——使用它不消耗模型 token。

## 召回：记忆如何在后续会话浮现

你不需要主动索取记忆。一个 `agent/pre-step` 监听器会运行一次**小模型侧查询**
（一个 fork 出的 subagent），询问哪些主题文件与当前轮次相关，然后将它们的
正文注入上下文：

- 召回扫描两层（agent 的工作区目录加全局层）并去重：本会话已展示过的主题
  文件不会再次注入。
- 会话中早前使用过的工具会被跟踪，正在活跃使用的工具的 reference-doc 类
  记忆会被抑制——关于它的警告和坑仍然会浮现。
- 召回可通过 `recallEnabled`（默认 `true`）关闭；设置
  `recallUseSmallFast: true` 可让召回 fork 走廉价通道。缺少 subagent 服务或
  provider 时召回静默跳过，不报错。

::: tip
召回侧查询依赖一个已注册的一次性 subagent provider；memory 包本身不附带
provider（组合 `fork` 或 `spawn` 即可）。
:::

## 团队记忆（可选开启）

当 `teamEnabled` 为 `true` 时，一个按工作区共享的团队目录
（`<workspaceDir>/team`）会叠加在工作区私有 memdir 之上，`memory` 段渲染
工作区 + 团队 + 全局的合并提示。它**默认关闭**：启用它会改变持久化的记忆
布局和模型的写入目标，并使团队记忆读取指向一个共享目录。

来源对安全边界说得很明确：按访问的校验链会阻断路径穿越（键名清洗、末段
symlink 拒绝、resolve + 包含检查），但中间路径组件的 TOCTOU 窗口没有完全
闭合。不要在多租户或不可信写入者的部署中启用 `teamEnabled`——它面向
单租户、可信写入者的项目。

## 实用卫生

- 把稳定的项目约定（构建命令、风格规则）放进 `CLAUDE.md`；把逐条的知识
  （用户偏好、反馈、工具的坑）通过 `memory_save` 保存，以便被索引和召回。
- 记忆要保持持久而非临时：主题文件在被取代之前会在后续会话中反复注入，
  因此临时任务状态不属于这里。
- 只对确实对每个仓库都有用的事实使用 `scope: "global"`——工作区记忆保持
  在该仓库的存储内，对外不可见。

## 下一步

- [/guide/interactive-basics](/zh/guide/interactive-basics) — 斜杠命令与会话循环
- [/reference/commands](/zh/reference/commands) — 命令目录，包括 `/init` 与
  `/memory`
- [/reference/settings](/zh/reference/settings) — 配置项，包括 memory 插件的
  `memoryHome` 与召回设置
