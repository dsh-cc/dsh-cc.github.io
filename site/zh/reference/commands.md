---
title: 斜杠命令
description: dsh-cc 全部斜杠命令的参考目录——preset（harness）命令与 TUI 本地命令，附对等状态。
distilled-from: dsh-cc v0.6.0
---

# 斜杠命令

dsh-cc 有两层斜杠命令。**Preset 命令**由 CC preset 通过 `ctx.commands` 注册，
不消耗模型轮次，在任何会分发 harness 命令的界面中可用。**TUI 本地命令**由终
端界面自己拥有（`packages/ui/tui/src/slash.ts`）；TUI 处理它们时不调用
`ctx.commands`，且部分名称（`/resume`、`/model`、`/agents`、`/cost`、
`/provider`）在两层都存在——在 TUI 中以本地实现优先。除非特别注明
（`/init` 会排队一个模型轮次），下列命令的执行都不经过模型。

对等信息来自 `docs/cc-parity-matrix.md`（Full/Partial）。空白单元格表示
matrix 未声明该命令的状态。

## 会话

| Command | What it does | Parity |
| --- | --- | --- |
| `/resume` | 列出最近的会话（id、标题、cwd、可用性、开始时间）供你选择恢复。切换由宿主负责（`dsh --resume <id>`）。 | Partial |
| `/branch [note]` | 将当前会话分叉为新的子分支并报告子会话 id。切换到子分支需要重启。 | Partial |
| `/compact` | 压缩会话，可附带保留指令。 | Full |
| `/rename <title>` | 为当前会话固定一个明确的用户标题。 | Full |
| `/export` | 将当前会话转录写为文件，markdown（默认）或无损 JSON。 | Full |
| `/tasks` | 列出调用方可见的后台作业及其状态。 | Partial |
| `/agents` | 列出、查看和停止可续接的后台 agent：`/agents <id>` 查看详情，`/agents stop <id>` 中断一个（仍可续接）。`/agents attach <id>` 是保留但未实现的命名空间。 | Partial |
| `/plan` | Plan mode 通道（通过 `exit_plan_mode` 退出）。 | Full |

## 模型与 Provider

| Command | What it does | Parity |
| --- | --- | --- |
| `/provider` | 管理 LLM provider 与 API key。子命令：`/provider list` 打印当前路由，`/provider add <preset-id>` 走内置 preset（Moonshot、Z.AI/Zhipu、DeepSeek）或自定义端点的向导，`/provider remove <route>` 移除路由。详情视图可轮换 key、刷新模型列表、设置默认。Key 存入凭据存储（`~/.dsh/.credentials.yaml`），绝不进 settings。 | Full |
| `/model <n\|provider/id>` | 列出或切换当前模型。 | Full |
| `/effort <level\|default>` | 为当前模型设置推理努力级别。 | — |

## 配置

| Command | What it does | Parity |
| --- | --- | --- |
| `/config` | 查看或更新生效的配置命名空间（仅文本渲染/补丁，键集合有白名单，不是交互式编辑器）。 | Partial |
| `/permissions [mode]` | 查看或修改权限模式/规则（CC 规则引擎模式）；裸调用会打开 TUI 覆盖层。 | Full |
| `/memory` | 列出 memdir 记忆文件（名称、类型、首行），或按名称打印某条记忆的正文。 | Full |
| `/skills` | 列出每个可用 skill 及其描述、来源和调用策略（model、user 或两者）。 | Full |
| `/init` | 扫描项目并通过排队的模型轮次生成 CLAUDE.md。 | Partial |
| `/mcp` | 管理 MCP 连接：`/mcp` 列出已注册服务器（名称、连接状态、工具数、OAuth 要求），`/mcp reconnect <name>`、`/mcp disconnect <name>`。`/mcp migrate` 将 Claude Code 配置文件中的服务器导入 `$DSH_HOME/.mcp.json`（条目原样保留，原子写入，`.bak` 备份）。 | Full |
| `/plugin` | 管理插件与 marketplace：`list [--enabled\|--disabled]`，`install\|uninstall\|enable\|disable\|update <plugin[@mkt]> [--scope user\|project\|local]`，`marketplace list\|add <source>\|remove <name>\|update [name]`。纯文本输出（无交互菜单）；以一行静态信任警告代替交互式同意提示；安装会触发重新扫描——新 agent/hook 需重启会话才生效。未实现：`details`/`eval`/`init`/`prune`/`tag`/`validate`、`--config`、`--sparse`、managed scope。 | Partial |
| `/reload-plugins` | 重新扫描磁盘上的发现根目录并即时重新挂载插件。 | Full |
| `/output-style` | 管理 output style。 | Full |

## 系统与诊断

| Command | What it does | Parity |
| --- | --- | --- |
| `/doctor` | 会话健康报告（`--verbose` 详细文本，`--json` 在 `$DSH_HOME` 下生成 JSON 文件）。 | Full |
| `/status` | 会话状态摘要：当前模型、权限 preset、会话 id、工作目录。 | Full |
| `/diff` | 通过 shell 显示 git diff 摘要或单文件 diff；也用于检查 CLAUDE.md / settings 差异。 | Full |
| `/cost` | 按模型的会话用量与费用，对照部署价格表折算。 | Full |
| `/stats` | 会话事件统计：轮次与步数、工具调用分布、token 用量合计。 | Full |
| `/version` | 打印插件包版本，宿主可见时还打印 harness 版本。 | Full |
| `/release-notes` | 打印内置的 release notes 更新日志。 | Full |
| `/help` | 列出所有已注册的斜杠命令，或显示某条命令的详情（含输入提示，`/help <cmd>`）。 | Full |

## TUI 本地命令

以下名称由 TUI 自行处理（描述逐字来自
`packages/ui/tui/src/slash.ts`）。preset 侧的 `/model` 和 `/exit` 按设计由宿
主拥有，不在对等范围内；dsh 原生等价物就是这些本地命令。

| Command | What it does | Parity |
| --- | --- | --- |
| `/quit` | 退出 TUI 会话。 | |
| `/exit` | 退出 TUI 会话。 | |
| `/clear` | 开启新对话（清空上下文）。之前的会话仍可恢复。 | |
| `/new` | `/clear` 的别名。 | |
| `/reset` | `/clear` 的别名。 | |
| `/tui-help` | 显示 TUI 键盘与命令帮助。 | |
| `/resume <sessionId>` | 切换到被恢复的会话（选择器或按 id）。 | |
| `/model <n\|provider/id>` | 列出或切换当前模型。 | |
| `/effort <level\|default>` | 为当前模型设置推理努力级别。 | |
| `/agents [<id>\|stop <id>]` | 列出、查看或停止后台 agent。 | |
| `/cost` | 显示 token 用量。 | |
| `/usage` | 打开实时的 token 与上下文用量面板。 | |
| `/export-md <path>` | 将会话转录导出为 Markdown 文件。 | |
| `/copy` | 将最近的助手回复复制到剪贴板。 | |
| `/provider [list \| add <preset-id> \| remove <route>]` | 管理 LLM provider 路由与 API key。 | Full |

## 说明

- 每个斜杠命令——preset 与 TUI 本地——都接受结尾的 `help`（或 `-h` / `--help`）参数，
  无需模型轮次即可打印其用法、参数和子命令；`/help` 索引中对此有提示。
- 冒号形式的插件命令 `plugin:command`（例如 `codex:review`）通过
  `ccPlugins` 服务分发，TUI 将其视为本地命令。
- 手工输入的未知 `/name` 若没有匹配的已注册命令，会作为用户提示词透传，因此
  user-invocable skill 到达模型的方式与菜单选择相同。
- dsh-cc 不是 Claude Code，也不是 Claude Code 的包装器。
