---
title: 从 Claude Code 迁移
description: 把已有的 `.claude/` 工作区搬到 dsh-cc，agents、skills、hooks 和 MCP 服务器原样继续工作。
---

# 从 Claude Code 迁移

本指南面向已经积累了 `.claude/` 项目资产——agents、skills、`CLAUDE.md`、hooks、settings、MCP 服务器——的团队：你们想要模型选择上的自由，又不想重做这套配置。dsh-cc 的 CC preset 会就地发现并加载这些熟悉的 Claude Code 风格资产，约定全部保留，底层运行时则换成了 DeepSeek Harness。

先说清定位，因为它决定你的预期：**dsh-cc 不是 Claude Code，也不是 Claude Code 的包装器。** 它在 DeepSeek Harness 运行时上重新实现了许多相同的交互模式，刻意保留的差异见[切换前须知](#切换前须知)。

## 原样保留的部分

下面这份清单不需要你复制或转换任何东西——CC preset 会在原位置发现既有文件：

| 资产 | 迁移方式 |
| --- | --- |
| `.claude/agents/*.md` | 项目内 `.claude/agents` 下的 Claude Code 风格 Agent 定义可以由 CC preset 发现并派发。Agent frontmatter 可以继续使用熟悉的模型别名，实际 provider/model 由 dsh 决定。 |
| `SKILL.md` 技能 | 由 CC skill provider 发现，包括项目自有技能和已安装的通用技能。 |
| `CLAUDE.md` | 记忆层支持 `CLAUDE.md` 风格的项目上下文，另有面向长期信息的独立写入通道。记忆按工作区隔离，也可配置团队共享记忆。 |
| `hooks.json` | Claude Code 风格 hooks 可以响应会话、用户输入、工具、权限、压缩、任务和子代理生命周期事件；CC preset 会从启动目录加载仓库跟踪的 `hooks.json`。已桥接的事件集见[切换前须知](#切换前须知)。 |
| `.claude/settings.json` | 与 Claude Code checkout 共享的项目 `.claude/settings.json` 文件可以直接使用——见[Settings 映射](#settings-映射)。 |
| 斜杠命令习惯 | CC preset 提供不断增长的命令面（`/cost`、`/doctor`、`/status`、`/memory`、`/skills`、`/config`、`/permissions`、`/mcp`、`/plugin` 等），肌肉记忆基本可以直接迁移。 |

子代理 frontmatter 中的模型别名会被识别，但实际走哪个 provider/model 由 dsh 的路由决定——这正是迁移的意义所在。

## MCP 服务器

这是 dsh-cc 刻意与 Claude Code 分道扬镳的唯一领域，所以单独立一步。

### dsh 优先的加载规则

当 dsh 原生配置——项目 `.mcp.json` 或 `~/.dsh/.mcp.json`——声明了至少一个 server 时，Claude Code 的 MCP 配置文件（如 `~/.claude/.mcp.json` 和 `~/.claude.json`）**不会**被加载。被跳过的 claude-only server 会通过 logger 警告、一次性的会话启动提示，以及 `/mcp` 输出中的一行自清除状态呈现，例如：

```text
MCP: dsh config takes precedence — skipped Claude Code MCP config: ~/.claude/.mcp.json (2 servers), ~/.claude.json (1 server). Run /mcp migrate to import them into ~/.dsh/.mcp.json, then restart the session.
```

两个逃生舱配置可以恢复旧的合并加载行为：

- `mcpLoadClaudeFiles: true` — 位于 cc-shell-glue；重新加载 Claude Code MCP 文件。
- 显式的 `mcpConfigFiles` 列表 — 完全绕过门控。

### `/mcp migrate`

`/mcp migrate` 会把 Claude Code 的 `mcpServers` 导入 `~/.dsh/.mcp.json`。精确行为：

- server 条目**原样**复制——不做 `${VAR}` 展开、不做名称归一化、不改写传输类型。Claude Code 磁盘上是什么，目标文件里就是什么。
- 先读目标文件：不存在 → 创建为 `mcpServers` 映射；已有映射 → 原地合并，既有键在前；其他顶层键全部保留。
- **名称冲突：目标文件中已有的名称胜出**——报告为 `kept`，绝不被覆盖。多个来源之间，先声明者胜出；后续重名会报告哪个来源保留、哪个来源跳过。
- 若目标文件已存在，会先复制为 `~/.dsh/.mcp.json.bak`；然后通过同目录临时文件 + 原子 rename 写入新文件。备份会连带复制 `env`/`headers` 中的机密——请相应地妥善处理。
- 没有可迁移的内容时，dsh-cc 会如实报告且不写任何文件（幂等——可以放心重跑）。
- Claude Code 源文件永远不会被修改；之后你可以手动删除它们。

迁移完成后，**重启会话**——server 只有重启后才会可见——然后运行 `/mcp` 查看导入的连接。`/mcp migrate` 是纯文件操作，即使 MCP 连接尚未挂载也能执行。

## Settings 映射

有两个文件需要关心，它们不是竞争对手——而是同处 settings 级联之中：

- `~/.dsh/settings.json` — dsh 原生的**用户** settings 文件。例如自定义状态栏配置块可以放在这里。
- `.claude/settings.json` — **与 Claude Code checkout 共享**的项目文件。可以直接使用；无需改名，无需改格式。

键名别名：如果同时存在 camelCase 的 `statusLine` 和 dsh 原生的 kebab 风格 `statusline` 键，dsh 原生键优先。你现有的 Claude Code 键可以直接用；冲突时 dsh 原生键获胜。

来自源材料的两条诚实的注意事项：

- 在运行中的会话之外对 `settings.json` 的修改要等到下次重启才生效（该路径没有文件监听）。
- `ANTHROPIC_*` 环境变量**不被支持**——dsh-cc 中没有 Anthropic 语义。模型与端点配置走 dsh 自己的 provider/model 路由，例如通过 `/provider` 命令和模型别名 settings 命名空间。

## 切换前须知

在团队决定迁移之前，值得了解的诚实差异。完整矩阵的每一行都在 [/reference/compatibility](/zh/reference/compatibility)：

- **没有 `/rewind`。** 文件检查点与回滚缺失——还没有按 prompt 的文件快照机制。会话持久化、恢复和 fork 是完全对齐的；`/resume` 可以列出会话，但切换由宿主负责（`dsh --resume <id>`）。
- **子代理的后台语义不同。** 省略 `run_in_background` 时子代理保持前台，除非 agent 定义固定了 `background: true`——这与 Claude Code 交互式的 omit=background 不同。后台子代理是可继续的，可通过 `agentId`（`send_message` / `interrupt`）寻址，Ctrl+B 提升仅为 TUI 表面。
- **Hook 事件为部分桥接。** 会话、输入、工具、权限、任务和子代理生命周期事件大多完全对齐，但若干上游事件在 dsh 中还没有发出点——例如 PreCompact、PostToolBatch、MessageDisplay 和 UserPromptExpansion 尚未桥接。prompt/agent hook executor 存在，但由 `enablePromptHooks` / `enableAgentHooks` 门控（默认关闭）。已桥接的事件集见 [/reference/compatibility](/zh/reference/compatibility)。
- **部分斜杠命令由宿主负责。** `/model` 和 `/exit` 刻意不作为 preset 命令——dsh 原生的 TUI 等价物（`/model`、`/effort`、空闲双击 Ctrl+C）承担这些角色。另一些是部分对齐，例如 `/config` 是仅文本的渲染/修补，键集在白名单内；`/init` 通过追加一轮对话来写入/刷新 `CLAUDE.md`。
- **状态栏接近但不完全一致。** 命令输出最多渲染 3 行（CC 会渲染每一行），dsh-cc 会在命令输出下方追加一行自己的模式行，stdin 负载只提供 dsh-cc 能真实取到来源的字段子集。
- **`ANTHROPIC_*` 环境变量不被支持**（见上文）——provider 与 API key 配置遵循 dsh-cc 自己的凭证与路由模型。

## 迁移清单

从 `.claude/` checkout 到可用的 dsh-cc 会话，一条具体路径：

1. **安装 dsh-cc**（来自 `@dsh-cc` npm scope）并选择 profile（CC preset 在 `tui` 上默认启用）。`.claude/` 资产原地不动。
2. **在项目目录中启动**，让 CC preset 从启动目录发现 `.claude/agents`、`SKILL.md` 技能、`CLAUDE.md`、`hooks.json` 和 `.claude/settings.json`。
3. **运行 `/mcp migrate`**，把 Claude Code MCP 服务器导入 `~/.dsh/.mcp.json`——或者设置 `mcpLoadClaudeFiles: true` 采用全量合并行为。然后重启会话。
4. **运行 `/mcp` 和 `/doctor`**，验证 MCP 连接与会话整体健康；运行 `/skills` 和 `/memory`，确认技能和 `CLAUDE.md` 上下文已被拾取。
5. **配置 provider 与模型**（通过 `/provider` 和模型别名 settings）——记住 `ANTHROPIC_*` 环境变量不被支持——再用 `/config` 和 `/permissions` 检查团队关心的配置。

## 下一步

- [/quickstart](/zh/quickstart) — 还没跑起来的话，从这里开始。
- [/guide/mcp-servers](/zh/guide/mcp-servers) — 迁移之后管理 MCP 服务器。
- [/reference/settings](/zh/reference/settings) — 完整的 settings 级联。
- [/reference/compatibility](/zh/reference/compatibility) — 支撑上文每一条结论的完整 Claude Code 兼容矩阵。
