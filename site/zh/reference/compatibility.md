---
title: Claude Code 兼容性
description: dsh-cc 中"Claude Code 兼容性"的含义——以及如何诚实地解读一致性矩阵。
distilled-from: dsh-cc v0.5.0
---

# Claude Code 兼容性

dsh-cc 追求的是有用的 Claude-Code 风格工作流：你熟悉的 agent 循环、工具
名称、hooks、斜杠命令和权限模式，运行在 dsh 之上。它**不是**对 Claude
Code 的逐字节模拟，也不以克隆每一个绑定厂商的特性为目标。

> dsh-cc 不是 Claude Code，也不是 Claude Code 的包装器。

## 如何诚实地解读一致性

这里的兼容性按能力逐项评判，而不是一个笼统的声明。对每个能力，跟踪四个
独立的维度：

- **Recognized（识别）** —— dsh-cc 是否理解 Claude Code 的形式（某个 hook
  事件、斜杠命令、配置键）？
- **Mounted（挂载）** —— 它是否真的接入了发布的 profile，还是只存在于代码库中？
- **Behavior（行为）** —— 底层行为是否与上游一致（full/partial/missing）？
- **UX（体验）** —— 用户可见的界面是否一致？

一个能力可以是已识别但未挂载，或者行为正确而 UX 不同。"partial" 不是
藏起来的脚注：它表示今天可用，但存在已知的、已记录的差异。若干行被有意
标记为 missing——要么是尚无设计，要么是该特性绑定厂商、不在兼容范围内。

## 唯一的事实来源

生成的 parity 矩阵按上述维度跟踪每个能力行，附证据链接和偏差说明：

[dsh-cc parity matrix](https://github.com/dsh-cc/dsh-cc/blob/main/docs/cc-parity-matrix.md)

它由机器可读的能力清单重新生成，因此请把它视为高于任何散文描述——包括
本页——的权威。

::: warning
下方的例子描述的是 dsh-cc v0.5.0 时的状态。在依赖其中任何一项之前，请先
查看矩阵了解当前状态。
:::

## 几个示例亮点（截至 v0.5.0）

- **Hook 执行器** —— `command` 和 `http` 执行器始终开启；`prompt` 和
  `agent` 执行器由 `enablePromptHooks` / `enableAgentHooks` 控制，默认
  关闭。Partial。
- **/resume** —— 列出会话，但切换由宿主负责（`dsh --resume <id>`）。
  Partial。
- **Schedule / 提醒** —— 支持 `after_seconds` / `at` / `every_seconds`
  （>=300s）；尚不支持 cron 表达式选择器。Partial。
- **后台任务** —— dsh 的 jobs 工具以 dsh 命名提供等价能力；CC 的
  `TaskCreate`/`TaskOutput`/`TaskStop` 命名未做别名。Partial。
- **WebSearch** 和 **plan mode** —— 完全一致，默认挂载。

## 下一步

- [/zh/reference/cli](/zh/reference/cli) —— `dsh-cc` 可执行文件及其参数。
- [/zh/reference/commands](/zh/reference/commands) —— TUI 中可用的斜杠命令。
