---
title: 子代理
description: 在 .claude/agents 下编写 Claude Code 风格的代理定义，并让主代理通过 subagent_type 调度它们。
---

# 子代理

子代理（subagent）是主代理可以委派任务的、拥有全新上下文的专注助手。每个子代理是你工作区 `.claude/agents` 目录下的一个 markdown 文件：文件的 frontmatter 决定子代理使用哪个模型、哪些工具，正文则成为子代理的系统提示。本页讲的是**编写**这些定义——如何运行后台或恢复代理，请看 [/guide/background-tasks](/zh/guide/background-tasks)。

## 文件契约

`.claude/agents` 下的每个文件就是一个代理定义。文件正文（frontmatter 之后的所有内容）是代理的**系统提示**——即它的人设和指令。YAML frontmatter 控制调度行为。

```text
.claude/
  agents/
    reviewer.md
    debugger.md
```

发现机制以**会话的**工作目录为准，而不是宿主进程的 cwd——因此即使 harness 从别处启动，这些定义依然可见。用户层和项目层都会加载，项目层覆盖用户层。

### Frontmatter 字段

只有加载器真正消费的字段：

| 字段 | 作用 |
| --- | --- |
| `description` | 一句话说明该代理的用途。`Available subagents` 系统提示区块渲染的就是它，因此它驱动调度——主模型靠阅读这些描述来挑选代理。 |
| `model` | Claude Code 风格的模型别名（`sonnet`、`opus`、`haiku`、`fable`、`inherit` 等）。在 spawn 时通过 `ccModelRoutes` 服务解析，见 [/guide/model-routing](/zh/guide/model-routing)。 |
| `tools` | 收窄子代理的工具集（allow/deny），见下文工具一节。 |
| `background` | 将该代理固定为可继续的后台代理启动，见下文。 |

加载器也会解析 `permissionMode`、`isolation`、`memory`、`effort` 等 CC frontmatter 字段，但 v1 不会把它们投影到子代理上——使用了这些字段的定义，其行为等同于字段不存在。

省略的字段有合理的回退：省略 `model` 则继承父代理的路由；省略 `tools` 则子代理获得完整的父级工具视图。

### 最小示例

```markdown
---
description: Fast codebase lookups
model: haiku
---

You are a read-only codebase scout. Return paths and line numbers,
not implementations.
```

上面的正文会作为子代理的系统提示交付；委派时传入的任务文本则成为子代理的第一条用户消息。

## 调度

主代理通过 `Task` 工具委派，把代理名作为 `subagent_type` 传入。会话的系统提示会渲染一个 `Available subagents` 区块，列出工作区中的文件定义，例如：

```text
## Available subagents

- explore — a fast, read-only codebase scout; returns paths and line numbers, not implementations
- dsh-cc-guide — answers questions about dsh-cc itself: commands, tools, settings, known limits

To delegate to one, pass its name as the `subagent_type` argument of the Task tool.
```

区块列出工作区文件定义，以及插件挂载的代理（后者以限定 id `plugin:agent` 呈现）——后端 provider 名称永远不会被当作可寻址的类型展示。

调度分五种情况：

1. **`subagent_type` 省略、为空或为 `general-purpose`** —— 对调用者做一次全新 spawn：提示文本成为子代理的第一条用户消息，不参与任何定义，也不复制父对话。请写自包含的提示。
2. **`subagent_type: "fork"`** —— 对调用者做一次继承对话的 fork：已完成的父轮次作为子代理的种子；不参与任何定义。`fork` 是**保留哨兵**，优先于同名的工作区文件，因此 `.claude/agents/fork.md` 不可达。
3. **匹配到工作区中的某个定义** —— spawn 的人设是该定义的正文，模型路由是别名解析后的 `model:`，工具按经过清洗的 `tools:` 值过滤。子代理的最大委派深度为 3。
4. **匹配插件代理的限定 id `plugin:agent`** —— 按与工作区定义完全相同的方式折叠（人设、清洗后的工具、别名解析的模型、最大深度 3、后台固定）。插件代理**只能**通过限定 id 寻址——裸插件代理名不可寻址，与 Claude Code 一致。文件定义与限定 id 占据不相交的命名空间：`agentType` 含 `:` 的工作区文件会在发现时被跳过并告警。
5. **其他任何类型** —— 返回错误结果，列出该工作区可用的类型（或说明工作区没有定义）；类型包含 `:` 时会附带相应提示。

### 内置代理

除工作区自定义的定义外，cc 预设还内置两个代理：

| 代理 | 说明 |
| --- | --- |
| `explore` | 快速、只读的代码库侦察。连接 Serena MCP 服务器后，它还携带只读的符号检索工具（`mcp__serena__find_symbol`、`mcp__serena__find_referencing_symbols`、`mcp__serena__get_symbols_overview`）。 |
| `dsh-cc-guide` | 解答关于 dsh-cc 本身的问题——命令、工具、设置、已知限制。 |

## 行为控制

### `model:` 与别名路由

frontmatter 的 `model:` 字段在每次 spawn 时都通过 `ccModelRoutes` 解析，因此 `model: haiku` 会落到你的 `haiku` 路由当时映射到的 provider/model——重新映射某个路由无需改动定义。若别名服务不存在，所有子代理直接继承父代理的路由。细节与示例见 [/guide/model-routing](/zh/guide/model-routing)。

### `tools:` 限制

frontmatter 的 `tools:` 值会收窄子代理的工具集，并针对 spawn 时实际注册的工具做清洗：

- 注册表不认识的名称会被丢弃并告警——包括未挂载服务器的 MCP 工具。
- `mcp__<server>__<tool>` 条目按原样保留，必须使用工具的公开名称；`mcp__<server>` 和 `mcp__<server>__*` 会展开为该服务器已挂载的全部工具。不带服务器段的裸 `mcp__` 作为非法通配符被丢弃。
- allow 列表匹配不到任何名称时会大声报错：如果清洗后一个名称都不剩，子代理将以**零工具**运行（并告警），因为完全省略 `allow` 反而会把子代理放宽到所有工具。
- 尚处于延迟注册状态的显式 `tools:` 条目会在子代理启动前被预加载；服务器级通配符只用于限制，从不预加载。

### `background: true`

默认情况下 `Task` 调用是**前台**的：工具等待子代理完成并返回其文本输出。在定义中设置 `background: true` 会把该代理固定为持久、可继续的后台代理——调用立即返回一个 `agentId`，结果稍后以唤醒消息的形式到达。调用方仍可覆盖这一固定：显式 `run_in_background: false` 强制前台，显式 `run_in_background: true` 则让任何代理都在后台启动。

后台代理的运行、恢复、中断与查看（`send_message` / `interrupt` / `list`、`/tasks`、`/agents`）见 [/guide/background-tasks](/zh/guide/background-tasks)。

## 说明与限制

截至 dsh-cc v0.6.0：

- **`/agents` 是部分的。** 它只是对运行中代理的瘦快照（列表/详情/停止）；分组只有驻留状态，`/agents` attach 是保留但未实现的命名空间。
- **进程级发现缓存。** 定义按工作区根在进程生命周期内缓存，且不监听文件系统：对于尚未建立缓存的条目，编辑在下一个会话生效；否则需重启进程。
- **冷恢复按钉版恢复。** 后台子代理的人设、工具过滤、模型路由和 `maxTokens` 都从恢复钉版还原——钉版中记录为未设置的推理力度或 token 字段按缺失处理，而不是重新解析。其他代理选项在恢复后不保留。
- **没有 TaskOutput 别名，也没有 outputFile 字段。** 前台结果以文本返回，没有输出文件。
- **Task 子代理会剥离工作区指令。** 与 Claude Code 的自定义子代理不同，被委派的子代理在其可见批次中不会收到工作区 `CLAUDE.md` / `AGENTS.md` 基线（fork 子代理仍继承父种子中已有的内容）。

### 大体量子代理产物：handoff 存储

子代理可以用 `handoff_put` 把长报告或计划放进 handoff 存储，并返回一段嵌有 `handoff://<id>` 句柄的简短摘要（≤2 KB 左右为宜）；编排方或后续子代理用 `handoff_get` 解析该句柄。值得知道的事实：

- 句柄只在 cwd 哈希到相同 projectKey 的会话间解析——同一仓库的另一个 git worktree 是**不同**的 key。
- 保留策略为 24 小时 TTL，外加每个项目一个 500 条目的磁盘 LRU。
- 设置命名空间 `cc-handoff`：`enabled`（默认 `true`）与 `threshold-chars`（8192，仅作提示，从不强制）。

## 下一步

- [/guide/background-tasks](/zh/guide/background-tasks) —— 运行、恢复和中断后台代理。
- [/guide/skills](/zh/guide/skills) —— `SKILL.md` 技能，另一种扩展面。
- [/reference/extension-formats](/zh/reference/extension-formats) —— dsh-cc 读取的文件格式，包括 `.claude/agents`。
