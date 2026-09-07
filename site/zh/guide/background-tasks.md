---
title: 后台任务与子代理
description: 让受托工作在后台运行——可用 /tasks 观察的作业，以及可发消息、检查、停止的可持续后台子代理。
---

# 后台任务与子代理

繁重的受托工作不必阻塞你：dsh-cc 可以把 `Task` 子代理放到后台启动，让你在与主代理继续对话的同时它照常运行，之后你可以检查它、给它发送后续消息，或中断它。本页讲的是如何**操作**这些后台工作——如何编写代理定义见 [/guide/subagents](/zh/guide/subagents)。

## 两种机制

dsh-cc 有两类不同的"后台运行"：

| 机制 | 是什么 | 如何管理 |
| --- | --- | --- |
| **后台作业（jobs）** | 由 `bash` 等工具以 `run_in_background: true` 启动的长运行 shell 侧作业。 | 由 `/tasks` 列出。 |
| **后台代理（agents）** | 以 `run_in_background: true`（或定义中 `background: true` 固定）启动的可持续 `Task` 子代理。调用立即返回 `agentId`，真正的结果稍后以唤醒消息送达。 | 以 `agentId` 寻址：`send_message` 继续同一会话，`interrupt` 停止其当前回合，`list` 查看状态。人工检查走 `/agents`。 |

注意这种不对称：`/tasks` 只列出后台**作业**——它不是后台代理的界面。当有代理在运行时，页脚会交叉链接到 `/agents`。可持续代理请用 `/agents` 查看，用 `send_message` / `interrupt` 操作。

何时用哪个：

- **后台作业**：用于一个你想盯着但不想卡住当前回合的命令——长时间构建、watch 进程。
- **后台代理**：用于结果不必立即拿来做后续组装的受托推理或多步工作——你可以继续对话，子代理的结果以唤醒消息送达。

## 后台启动

派发**默认前台（omit 即前台）**：省略 `run_in_background` 时，`Task` 调用会等待子代理完成并返回其文本输出——除非该代理的定义固定了 `background: true`，此时调用在省略时转后台。优先级如下：

| 情形 | 结果 |
| --- | --- |
| `run_in_background: true` | 变为持久的可持续后台代理；立即返回 `{ status: 'async_launched', agentId }`，结果稍后送达。 |
| `run_in_background: false` | 强制前台，即使定义固定了 `background: true`。 |
| 省略，定义固定 `background: true` | 省略时转后台。 |
| 省略，无固定 | 前台：工具等待完成并返回子代理的文本输出。 |

`background: true` 固定位于定义的 frontmatter——见 [/guide/subagents](/zh/guide/subagents)。仓库自带的 `deep-reasoner` 和 `fast-worker` 代理固定了 `background: true`，因此对它们的普通 `Task` 调用会以可持续方式后台启动；自带的 `explore` 和 `dsh-cc-guide` 代理未固定，保持前台收集。

::: warning
`subagent_type: "fork"` 不能后台运行——fork 加后台会被拒绝（上游 issue #2124）；fork 保持为前台一次性运行。
:::

parity 矩阵记录的其他控制项：

- **Ctrl+B 提升（仅 TUI）。** TUI 忙碌时按下 Ctrl+B 会把待定的前台收集提升到后台：挂起的工具调用解析为 `{ status: 'async_launched', agentId, backgroundedByUser: true }`，子代理继续运行。非 TUI 客户端没有提升路径。在 tmux 下，Ctrl+B 是默认前缀——连按两次会透传字面 Ctrl+B。
- **关闭开关。** `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` 设为除 `0`/`false`（大小写不敏感）以外的非空值时，会禁用"省略即后台"的固定；显式 `run_in_background` 参数两种方向仍然生效。
- **容量护栏。** 当父代理已有 25 个存活子代理时，Task 工具会拒绝新的可持续子代理，并给出可操作的错误提示建议 `/agents stop <id>`。

## 检查与干预

**`/agents`**（partial parity）是运行中代理的轻量快照——list、detail、stop：

```text
/agents              # list running background agents
/agents <id>         # detail for one agent
/agents stop <id>    # interrupt one (it stays resumable)
```

TUI 消费同一份快照，并在详情视图中追加折叠派生的装饰（provider、prompt 摘录、最近 stopReason）。`/agents attach <id>` 是保留但**未实现**的命名空间。

**模型侧工具**同样以 `agentId` 寻址这些子代理：

- `send_message` — 向同一后台代理的会话发送后续 prompt。
- `interrupt` — 停止子代理的当前回合；其持久化会话保留，可继续。
- `list` — 枚举子代理及其状态。

**`/tasks`**（partial parity）只列出后台**作业**；todo 列表接缝尚待实现。

## 生命周期的真实表述

围绕退出与恢复发生的事，严格按来源表述：

- **父代理退出会抽干进行中的回合。** 退出会话会抽干后台子代理进行中的回合；其持久化会话保留。
- **冷恢复（cold resume）。** 子代理的持久化会话在下一次 `send_message` 时冷恢复。
- **冷恢复会丢弃额外的代理选项。** 后台子代理的 `persona`、`toolFilter` 和模型路由在恢复后保留，但其他字段——例如别名标注的 `reasoningEffort` 或 token 上限——不会。
- **恢复固定（resume pins）。** 每次后台启动都会把一份恢复固定（spawn 时选定的别名加上 `maxTokens`）写入恢复固定存储，恢复时还原该固定元组*包括显式缺省*——固定中记录为未设置的值会被当作缺省，而不是重新解析。父代理已无法解析的固定模型受 `subagents-resume.onUnavailableModel` 设置门控（`block` 或 `route-current`，默认 `block`），拒绝码如 `SUBAGENT_MODEL_UNAVAILABLE`、`WORKSPACE_CHANGED`、`DEFINITION_CHANGED`、`PINNED_TOOL_UNAVAILABLE`、`PIN_ORPHANED`、`PIN_UNREADABLE` 指明对应的策略旋钮。
- **没有输出文件。** 不存在 `TaskOutput` 别名，也没有 `outputFile` 字段；前台结果以文本返回。

::: info
前台启动的子代理（非 fork，具名代理或 `general-purpose`）也会作为可持续子代理被内联收集，并带同样的恢复固定——因此前台启动的子代理与后台子代理一样可固定、可恢复。
:::

## 一个完整的操作流

在后台派发一个审查者，继续手头工作，然后引导它：

1. **派发。** 在 `.claude/agents` 放好 `reviewer.md` 定义后，调用 `Task`，传入 `subagent_type: "reviewer"` 和 `run_in_background: true`。调用立即返回 `{ status: 'async_launched', agentId: … }`。
2. **继续编辑。** 你在主会话里继续对话——审查者同时在读你的仓库。它的结果稍后以唤醒消息送达；不要在内联中依赖它。
3. **查看状态。** 运行 `/agents` 列出运行中的代理，用 `/agents <agentId>` 看详情。
4. **继续它。** 用 `send_message` 加上 `agentId` 发送后续消息——例如把审查范围收窄到某个文件。这是同一会话；子代理保留其上下文。
5. **偏离时中断。** 如果审查者跑偏了，`interrupt` 停止其当前回合（仍可恢复），人工侧的 `/agents stop <agentId>` 等效。之后用 `send_message` 恢复。

## 下一步

- [/guide/subagents](/zh/guide/subagents) — 编写 `.claude/agents` 定义，包括 `background: true` 固定。
- [/guide/interactive-basics](/zh/guide/interactive-basics) — 这些命令所在的交互界面。
- [/reference/commands](/zh/reference/commands) — 完整斜杠命令目录，包括 `/tasks` 和 `/agents`。
