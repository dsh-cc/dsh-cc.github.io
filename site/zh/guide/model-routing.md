---
title: 自带模型路由
description: 把 Agent 定义中稳定的 Claude-Code 风格模型别名，路由到你的 dsh 部署所支持的任意 provider/model。
---

# 自带模型路由

Claude-Code 风格的 Agent 定义通常通过 `sonnet`、`opus` 这类稳定别名引用模型。使用 dsh-cc 时你不必改写它们：每条逻辑通道都会被路由到部署中配置的 provider/model，Agent 定义保持稳定，你可以按自己的环境、成本和任务特点选择实际模型。

## 别名通道

Claude Code 风格 Agent 定义通常通过别名引用模型：

```yaml
model: sonnet
```

`dsh-cc` 可以把这些别名路由到部署中配置的 provider/model。概念上映射如下：

```text
sonnet / draft      -> <provider>/<general coding model>
opus / blueprint    -> <provider>/<reasoning model>
haiku / sketch      -> <provider>/<fast model>
fable / masterplan  -> <provider>/<maximum-reasoning model>
architect           -> parent agent route (planning / orchestration)
inherit             -> parent agent route
```

关键点：**别名只是配置，不会硬编码到某家模型供应商。** 你可以保留熟悉的 Agent 定义，同时根据自己的环境选择合适的模型。

::: tip
dsh-cc 项目本身就使用这套路由进行日常开发——当前开发映射见项目 README 的 [Dogfooding dsh-cc](https://github.com/dsh-cc/dsh-cc#dogfooding-dsh-cc) 章节。那只是项目自身的真实配置，不是强制默认值。
:::

## 用 `/provider` 管理供应商

`/provider` 命令在覆盖层中管理已配置的模型供应商：

| 命令 | 作用 |
| --- | --- |
| `/provider` | 打开供应商覆盖层 |
| `/provider list` | 列出当前路由 |
| `/provider add <preset-id>` | 通过向导添加内置预设（Moonshot、Z.AI/智谱、DeepSeek）或完全自定义的端点 |
| `/model` | 为当前会话重新选择 provider/model |

每个路由的详情页支持轮换密钥、刷新模型列表、设为默认和删除。关于凭据：

- API 密钥通过掩码输入框录入，保存到凭据存储 `~/.dsh/.credentials.yaml`——不写入 settings。
- 由环境变量提供的密钥只读展示。
- 变更对新会话立即生效（凭据按请求解析）；当前会话保持原供应商，直到用 `/model` 重新选择。

## 按任务选择：别名与 Agent frontmatter

子代理定义位于每个工作区的 `.claude/agents` 目录，使用 Claude Code 风格的 frontmatter，其中包括 `model:` 字段。dsh-cc 派发子代理时，人格来自定义的 `systemPrompt`，frontmatter 中的 `model:` 别名则通过 `ccModelRoutes` 别名服务解析——每次 spawn 都会查询——因此定义里的 `model: haiku` 会落到当时代入 `haiku` 通道的那个 provider/model。

同样的解析也适用于其他引用别名的地方：解析 `model:` 字段的 hook executors 同样走 `ccModelRoutes`（省略 model 时回退到 `haiku` 廉价通道）。

::: warning
别名解析覆盖 Agent frontmatter 和 hook executors。主会话默认模型的别名化是已知的后续事项，且 `ANTHROPIC_*` 环境变量没有 Anthropic 语义——详见 parity matrix 的 Models 章节。
:::

## 示例：端到端演练

从一个空部署到让任务跑在快速通道上的最短路径：

```sh
# 1. Add a provider through the preset wizard
/provider add <preset-id>

# 2. Inspect the current routes
/provider list

# 3. In the per-route detail view, set the default
#    and map the lanes (haiku/sketch -> fast model)

# 4. Re-pick the model for the current session if needed
/model
```

通道映射完成后，任何固定到某条通道的 Agent 定义都会跑在那条通道上。例如 `.claude/agents/lookup.md` 中的一个快速查询 Agent：

```yaml
---
name: lookup
description: Fast codebase lookups
model: haiku
---

You are a read-only codebase scout. Return paths and line numbers.
```

派发这个 Agent 时，`haiku` 会在 spawn 时通过 `ccModelRoutes` 解析——之后重新映射快速通道到别的供应商，也无需修改这个定义。

## 下一步

- [/quickstart](/zh/quickstart) —— 先把会话跑起来。
- [/guide/subagents](/zh/guide/subagents) —— 子代理定义与派发机制。
- [/reference/commands](/zh/reference/commands) —— 完整命令面，包括 `/provider` 和 `/model`。
