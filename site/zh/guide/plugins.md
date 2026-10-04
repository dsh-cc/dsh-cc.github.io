---
title: Plugins（插件）
description: dsh-cc 如何通过 dsh profile 与 bundle 完成自身组合，以及如何加载磁盘上已有的 Claude Code 插件。
---

# Plugins（插件）

在 dsh-cc 中，"插件"有两个互补的含义，本页两者都讲：

- **故事 A —— dsh 原生组合。** dsh-cc 本身以普通 dsh 插件的形式安装，按 `@dsh-cc/bundle-*` 包分组并挂载到 dsh profile 中。你的本地微调放在 `cordis.patch.yml` 文件里。
- **故事 B —— 加载 Claude Code 插件。** 通过 cc-plugin-loader，dsh-cc 可以发现并挂载磁盘上已有的 Claude Code 插件（一个 `plugin.json` 清单加若干组件目录），让你手头的插件资产继续可用。

前置条件：dsh >= 0.2.0-rc.2，并安装 `@dsh-cc/cli` 启动器（`npm install -g @dsh-cc/cli`）。

## 故事 A：dsh profile 与 bundle

### dsh-cc 是如何安装的

`dsh-cc` 启动器会创建并启动面向 CC 的 `tui` profile。如果不想依赖启动器，也可以显式组合这个 profile：

```sh
$ dsh plugin --profile tui add \
    @dsh-cc/bundle-permissions \
    @dsh-cc/bundle-shell \
    @dsh-cc/bundle-tui
$ dsh --profile tui
```

同一套后端也可以配合 dsh 的 Web UI 使用：

```sh
$ dsh plugin --profile web add \
    @dsh-cc/bundle-permissions \
    @dsh-cc/bundle-shell
$ dsh web
```

上面命令中挂载的三个可安装 bundle 包是
`@dsh-cc/bundle-permissions`、`@dsh-cc/bundle-shell` 和 `@dsh-cc/bundle-tui`
（`web` profile 不含 `bundle-tui`，因为它没有终端界面）。

官方包只来自 `@dsh-cc` npm scope。

### 用 cordis.patch.yml 做本地微调

你的 profile 仍然是普通的 dsh 组合。本地微调可以放在：

```text
~/.dsh/profiles/tui/cordis.patch.yml
```

它们在已安装的 bundle 之后生效，所以 patch 文件是你调整或覆盖 bundle 所挂载内容的地方，无需 fork 任何东西。

::: tip
把 bundle 包当作"已安装的基础"，把 `cordis.patch.yml` 当作其上的一层薄薄的本地配置。通过 `dsh plugin ... add` 升级 bundle；patch 文件里只保留真正属于你个人的内容。
:::

## 故事 B：加载 Claude Code 插件

dsh-cc 内置一个兼容插件加载器，读取 Claude Code 插件的 `plugin.json` 清单，并把每个组件作为内存中的 dsh 插件挂载。它本身不是一个运行时：它产出类型化的挂载点和结构化报告，把执行留给它注册到的主机接缝（seam）。

### 插件在哪里被发现

默认情况下，发现逻辑遵循磁盘布局，且插件状态是**双 home 制**：dsh home（`$DSH_HOME`，回退到 `~/.dsh`）是写入根目录，而 Claude home（`$CLAUDE_CONFIG_DIR`，回退到 `~/.claude`）保持完全可读。

- 启用集合是 `enabledPlugins`（按 claude-user → dsh-user → project → local 的 settings 级联，后读文件按键覆盖）与两个 home 合并后的 `plugins/installed_plugins.json` 的交集。键必须是精确的 `name@marketplace` 形式。
- 当两个 home 持有相同的键时，dsh 条目获胜——dsh 的 `enabledPlugins` 条目遮蔽 Claude 侧的对应项，dsh 的 `installed_plugins.json` 条目列表（即使是空列表）也会遮蔽该插件 id 的 Claude 侧条目。
- 无法读取的 JSON 和缺失的 `installPath` 会被跳过，而不是报错。

值得知道的几个后果：这个分叉是单向的（dsh-cc 能看到两个 home；真正的 Claude Code 只看到自己的）；一旦 dsh-cc 把某个 id 写入 dsh 的 `installed_plugins.json`，之后 Claude 侧对该 id 的改动对 dsh-cc 不可见（接管陈旧化）；`CLAUDE_CONFIG_DIR` 不再能搬移写入位置——所有 `/plugin` 修改都落在 dsh home 下，如需换位置请改用 `DSH_HOME`。

如果改为配置显式插件目录，这些目录会被扁平化：目录本身，或其一级子目录，只要包含 `.claude-plugin/plugin.json` 或顶层 `plugin.json`，就会作为插件根。仅包含 marketplace 的目录不是扁平化根。空列表表示禁用发现。

### 清单的几种形式

对每个插件根，清单按以下顺序解析：

1. `${root}/.claude-plugin/plugin.json` —— 首选的 Claude Code 路径。
2. `${root}/plugin.json` —— 旧式 / 显式插件目录形式。
3. `${root}/.claude-plugin/marketplace.json` 且匹配插件名 —— 合成 overlay 并取代默认的 `skills/` 扫描。marketplace 文件匹配不到名字就是硬性未命中，绝不会回落。
4. 否则加载器按插件根目录名合成一个清单，因此没有清单也能挂载默认目录。

加载器会校验 `name`（必填，kebab-case）、`version`、`description`、`author`，以及组件字段 `commands`、`agents`、`skills`、`hooks`、`mcpServers`、`settings`。格式错误的清单会在加载时抛错并带上插件名。未知的顶层字段会被忽略，与 Claude Code 的宽容处理一致。

### 会挂载什么

| 组件 | 来源 | 行为 |
| --- | --- | --- |
| `commands` | 清单条目；清单未声明 `commands` 时默认扫描 `commands/*.md` | 注册每个斜杠命令；处理器返回命令内容。嵌套的命令子目录会被跳过并说明原因；显式声明的 `commands` 会取代默认目录扫描。 |
| `agents` | `agents/` 目录或清单路径 | 加载为 agent 定义，并把每个注册为以插件名为命名空间的具名子代理提供者——Task 工具通过限定 id `plugin:agent` 派发它们（见 [Subagents](/zh/guide/subagents)）。 |
| `skills` | `skills/` 目录或清单路径 | 发现 `SKILL.md`，解析 frontmatter，并把每个注册为运行时技能。 |
| `hooks` | `hooks/hooks.json` 或内联 | 注入按事件划分的 hook 映射；在发布部署中 hook 桥提供该接缝，插件 hooks 会被合并并真正触发。 |
| `mcpServers` | 内联记录或 `.mcp.json` | 注册每个 MCP 服务器；在发布部署中 cc-shell 胶水提供该接缝，插件服务器会真正挂载。 |
| `settings` | 清单记录 | 按允许列表过滤（当前为 `agent`）后应用。 |
| `rules` | `rules/*.mdc`（仅 cursor 味插件） | 解析成带类型的条目并经 `rules` 接缝合并；渲染为一段 `cc:plugin-rules` 系统提示——见下方 Cursor 方言一节。 |

::: warning
`settings` 组件仍依赖部署方提供的接缝：没有它时会报告为 `skipped`。`mcpServers` 与 `hooks` 在发布部署中无需额外配置即可工作。被跳过的组件不会让整个插件加载失败——每个组件的结果都会单独报告。
:::

### 在会话中管理插件

`/plugin` 在会话内管理 marketplace、安装与各作用域的启用状态。输出为纯文本（无交互菜单）；远程来源的安装与 marketplace 添加会附一行静态信任警告，代替交互式确认提示（本地目录来源不打印）。所有修改都写入 dsh home 下。

| 命令 | 作用 |
| --- | --- |
| `/plugin` | 裸命令：已挂载插件视图。未知子命令会路由到帮助块。 |
| `/plugin list [--enabled\|--disabled]` | 列出已安装插件，可按状态过滤。 |
| `/plugin install\|uninstall\|enable\|disable\|update <plugin[@mkt]> [--scope user\|project\|local]` | 管理已安装插件；`--scope` 决定启用状态写入的作用域。 |
| `/plugin marketplace list` | 列出已知 marketplace。 |
| `/plugin marketplace add <source> [--scope user\|project\|local]` | 添加 marketplace。 |
| `/plugin marketplace remove <name>` | 移除 marketplace。 |
| `/plugin marketplace update [name]` | 更新一个或全部 marketplace。 |
| `/reload-plugins` | 重新读取 `enabledPlugins` 级联并重新扫描；项目级与本地 `enabledPlugins` 以启动时工作目录为准 |

### Cursor 插件方言

同一个加载器也接受 Cursor 味的插件——一条宽容的解析管线，而不是第二个加载器。清单按以下顺序探测：`.claude-plugin/plugin.json` → `.cursor-plugin/plugin.json` → 顶层 `plugin.json`，第一个命中生效。两种方言清单同时存在时使用 CC 的那份，报告会带上警告 `cursor manifest ignored: cc manifest takes precedence`。胜出的方言（`cc` 或 `cursor`）记录在清单和加载报告上。

**Rules。** `rules/*.mdc` 文件——清单声明的 `rules` 路径或默认的 `rules/` 目录——渲染成每个插件一段的 `cc:plugin-rules` 系统提示：`alwaysApply` 条目原样出现在 "Rules from plugin `<name>`" 之下，带 glob 的条目渲染为 "When editing files matching `<globs>`: `<body>`"，无作用域条目作为一般性指引出现并附带一条警告。每个插件有 4000 字符预算，超限会明确截断。运行期按轮次激活 glob（Claude Code 的逐次编辑匹配）没有实现——带作用域的规则以条件指令的形式交付。

**Turn rules。** 带 `trigger`（JS 正则源）的规则在正则命中已完成的工具调用/结果或用户提示词之前不占任何上下文。首次命中时，规则正文会在那个位置作为建议性提醒注入：

```yaml
---
description: Prefer Arc<str> over Box::leak in production paths
trigger: \bBox::leak\b          # JS regex source; quote it if it contains YAML-significant characters
triggerOn: [tool-results, user-prompts]   # default: both
repeat: once                    # once | after-gap (default: once)
repeatGap: 10                   # turn stops before re-arm; default 10
---
```

`repeat: after-gap` 会在 `repeatGap` 次轮次结束后重新武装规则。不带 `trigger` 的规则行为与上文完全相同。只有顶层会话会触发 turn rules，而且它们从不阻止工具调用。该引擎由用户层 settings 文件中的 `cc-turn-rules` 命名空间调优（见[设置](/zh/reference/settings)）。除基于文件和触发器的规则外，v0.8.3 还内置了一条 repeat-reminder 规则——当顶层 agent 连续多次以完全相同的参数重复同一个工具调用时，它会发出一条提醒（仅提示，不阻断）。该规则默认关闭，通过 `cc-turn-rules.repeat-reminder` 键调优（见“设置”）。

**Hooks。** camelCase 的 Cursor 事件映射到 CC 事件：

| Cursor 事件 | CC 事件 |
|---|---|
| `sessionStart` | `SessionStart` |
| `sessionEnd` | `SessionEnd` |
| `preToolUse` | `PreToolUse` |
| `postToolUse` | `PostToolUse` |
| `postToolUseFailure` | `PostToolUseFailure` |
| `subagentStart` | `SubagentStart` |
| `subagentStop` | `SubagentStop` |
| `beforeSubmitPrompt` | `UserPromptSubmit` |
| `preCompact` | `PreCompact` |
| `stop` | `Stop` |

未映射的事件（`beforeShellExecution`、`afterShellExecution`、`beforeMCPExecution`、`beforeReadFile`、`afterFileEdit`、`afterAgentResponse`、`afterAgentThought`，以及 Tab 和 app 类 hook）会跳过并警告；`loop_limit` 也会警告。hook 命令串里的 `${CURSOR_PLUGIN_ROOT}` 展开为插件根目录。

**Commands。** 除 `.md` 外，`.txt` 命令文件在 cursor 味插件上也会以纯文本挂载。

**MCP。** 插件根目录下的 `mcp.json` 默认就会被发现，无需清单声明；`mcpServers` 也接受 Cursor 的数组形式。某个未解析的 `${VAR}` 只让那一个服务器失败，并给出点名警告。`dir/**` 形式的 glob 路径递归展开；其他 glob 形式会跳过并警告。

**仅警告。** `minClientVersions`（不执行客户端版本门槛）和 `variables`（不做提示式输入；通过环境变量设置）只产生警告，其余忽略。

管理侧通过 `add`/`update`/`install`/`enable` 以同样的方式消费 `.cursor-plugin` marketplace 与清单；状态文件字节不变。

## 官方插件

四个官方插件通过 `dsh-cc` marketplace 发布。

### dsh-cc-agents —— critic、executor 与 marathon 子代理

包含三个子代理和两个技能——一个在子代理之间做路由，一个用于数据分析工作：

- **`dsh-cc-agents:critic`** —— 重推理工作：复杂分析、架构决策、对抗性方案评审、根因分析。运行在 `opus` 模型别名上，默认后台运行。
- **`dsh-cc-agents:executor`** —— 执行已获批、完全明确的计划中的机械性工作：格式化、简单重构、样板代码、改名、测试、文档、检查。运行在 `sonnet` 模型别名上，默认前台运行。
- **`dsh-cc-agents:marathon`** —— 长周期、模糊或全仓库级的复杂任务：架构重设计、跨模块重构、没有明显线索的长时间调试，以及在主线方案失败后的重新进攻。运行在 `fable` 模型别名上（未配置时继承主线程路由）；会执行修改操作的人设，与 executor 一样默认前台运行。

- **`dsh-cc-agents-orchestration` 技能**——在子代理之间做选择的路由表、后台不对称性，以及它们的报告契约。
- **`data-analysis` 技能**——数据分析编排（数据分析/口径/对账）：带有口径存疑、对账、外部报告问题的数据分析任务经 critic/executor 处理，评审/核验/执行元规则内联进派发提示词。

在会话内安装，然后重启会话：

```text
/plugin marketplace add dsh-cc/dsh-cc
/plugin install dsh-cc-agents@dsh-cc
```

更新需要两条命令——仅重新拉取 marketplace 并不会刷新已安装的插件缓存：

```text
/plugin marketplace update dsh-cc
/plugin update dsh-cc-agents@dsh-cc
```

注意：

- 如果你的 workspace 定义了名为 `deep-reasoner` 或 `fast-worker` 的文件型 agent，裸名会解析到你的 workspace 定义；插件副本只能通过精确的限定 id 寻址。两者都会出现在 agent 目录中，插件副本可通过其描述区分。
- 这三个 agent 请求 `opus` / `sonnet` / `fable` 别名但不要求其存在：未配置的别名会退化为继承父级路由——功能不受影响，只是失去快慢通道分离。

### Serena hooks（带门槛）

插件还附带可选的 Serena 代码智能 hooks：PreToolUse 提醒挂在 `read`/`grep`（以及 serena 工具调用）上，在一连串原始读取/grep 之后把模型往符号工具方向推一把——短 deny 加提醒，每个会话最多每两分钟一次；SessionEnd 则清理该会话的 hook 状态目录 `<project>/.serena/hook_data/<session-id>/`。

两者都是双重门槛下的静默空操作，除非当前会话的项目已完成 serena 接入（从会话工作目录向上、经过 git 顶层找到 `.serena/project.yml`）**并且** `serena-hooks` 在 `PATH` 上可解析：

```sh
uv tool install git+https://github.com/oraios/serena@v1.7.0
```

门槛包装器把 `SERENA_HOME` 钉在 `<repo>/.serena`：serena 默认的 `~/.serena/hook_data` 在会话沙箱之外，而 serena 会吞掉写入失败——不钉住的话计数器永远不落盘，hooks 静默失效。`.serena/hook_data/` 已加入 gitignore；状态按会话 id 存放，会话结束时移除。

两条运行注意事项：

- **一种行为只留一个通道。** 如果仓库自己的 `hooks.json` 里也有 serena-remind 条目，两处都会触发，共享计数器会重复计数。提醒只留在一个地方——本插件或仓库，二选一。
- 非 serena 项目每次 Read/Grep 多付一次约 50 毫秒的门槛化 node 进程。想彻底省掉就禁用本插件；dsh-cc 发版后跑一次 `/plugin update` 以获取 hook 变更。

### dsh-cc-shunt —— 让大文件内容不进入主上下文

内置两条硬性 PreToolUse 门禁（Read 与 Bash），拦截对大文件的整文件读取，并引导转向 `bulk-reader` / `code-writer` 技能，由它们把活委派给插件的廉价通道 worker——`shunt-reader`（跨大文件回答问题，返回结构化摘要）与 `shunt-writer`（写入测试/配置/桩文件，只返回一行确认）。主上下文只收到摘要或一行确认。

在 `settings.json` 中启用：

```json
{
  "enabledPlugins": { "dsh-cc-shunt@dsh-cc": true }
}
```

通过 settings.json 顶层的 `"env"` 对象配置：

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `SHUNT_MIN_LINES` | `350` | 行数阈值；超过它的整文件读取会被拦截 |
| `SHUNT_MAX_BYTES` | `100000` | 字节阈值；无论行数多少都会拦截压缩/单行文件 |
| `SHUNT_DISABLED` | 未设置 | 设为 `1`/`true`/`yes` 可完全关闭两条门禁 |

shunt worker 固定 `model: haiku`。如果你的部署没有配置 haiku 别名，worker 会静默继承父级路由——功能不受影响，但**省不到任何 token**。请配置 haiku 别名以获得实际节省。

子代理调用方会绕过两条门禁：来自存活子代理的 hook payload 带有 `agent_id`（由 hooks bridge 注入，无法通过 `tool_input` 设置），因此 critic、executor、marathon 以及 shunt worker 等可以自由读文件。Read 门禁还会嗅探图片魔数（PNG、JPEG、GIF、WEBP），大图片无论多大都放行；名为 `*.png` 的大文本文件仍会被拦截。

### cc-codex-bridge 与 cc-grok-bridge —— 免审批通道

每个 bridge 让会话无需权限询问即可运行恰好一种规范化、锁死的调用 `node <launcher> [--last] <prompt>`：一个 PreToolUse hook 自动放行这一种命令形式，其他任何形式都回落到正常的审批流程。dsh 外层沙箱仍是唯一的写边界（工作区加临时目录）。

| 插件 | 通道 | 命令 |
| --- | --- | --- |
| `cc-codex-bridge` | Codex rescue。Codex 在关闭内部沙箱的情况下运行，因为嵌套沙箱无法叠加。 | `/cc-codex-bridge:rescue` |
| `cc-grok-bridge` | Grok review。运行期间绕过 Grok 自身的工具审批。 | `/cc-grok-bridge:review` |

```text
/plugin install cc-codex-bridge@dsh-cc
/plugin install cc-grok-bridge@dsh-cc
```

- 一个 SessionStart hook 会注入 `cc-codex-bridge:` 或 `cc-grok-bridge:` 块，说明通道是 **ARMED**（附带确切的规范调用）还是 **NOT armed**（附带原因）。块缺失或显示 NOT armed 时，通道回落到需要审批的路径。
- 多行提示词走 `--prompt-file <path>`，文件放在工作区或规范 tmpdir 中。只有在你明确要求继续上一次运行时才使用 `--last`。
- 对 Grok，`grok login --device-code` 会写入 `~/.grok/auth.json`，bridge 每次运行时把它植入按工作区划分的影子 `GROK_HOME`；环境中的 `XAI_API_KEY` 也会透传。Grok 通道没有轮次上限；每次成功运行会在 stderr 打印一行 `grok-review: session=… cost_usd=… turns=…`。已针对 grok 1.0.41 验证。
- 非空的 `BASH_ENV` 或 `ENV` 会解除通道武装。在 dsh-cc 自身仓库的开发会话中会拒绝武装（`anchor-under-writable-root`）。

**安全模型。** 安装 bridge 意味着对这一种命令形式放弃人工检查点。无人值守的 CLI 可以运行外层沙箱允许的任何子进程，包括 git push、ssh、云 CLI 和不受限的网络；只有文件系统写边界成立。恶意的提示词或仓库内容可以读取影子凭据。卸载或禁用插件就是关闭开关。

## 编写一个插件

一个最小的 Claude Code 插件是一个包含清单和你实际使用的组件目录的目录。按加载器的解析规则，两种清单位置都可以，除 `name` 以外一切都是可选的：

```text
my-plugin/
  .claude-plugin/
    plugin.json        # name (kebab-case, required), version, description, author
  commands/            # optional; one slash command per .md file
    review.md
  agents/              # optional; agent definition files
  skills/              # optional; SKILL.md directories
  hooks/
    hooks.json         # optional; per-event hook map
  .mcp.json            # optional; inline mcpServers alternative
```

给作者的提示：

- `name` 是清单中唯一必填的字段，且必须是 kebab-case。
- 清单未声明 `commands` 时，加载器扫描 `commands/*.md`；`commands/` 的嵌套子目录会被跳过。
- 技能遵循 [Skills](/zh/guide/skills) 中描述的 `SKILL.md` 约定。
- 接缝不可用的组件会被报告为 `skipped` 而不是破坏加载，所以你可以渐进式地发布插件。

## 下一步

- [Skills](/zh/guide/skills) —— `SKILL.md` 技能如何工作，包括从插件挂载的技能。
- [Subagents](/zh/guide/subagents) —— agent 定义与派发，包括插件提供的 agent。
- [Extension formats](/zh/reference/extension-formats) —— dsh-cc 读取的磁盘格式。
- [Settings](/zh/reference/settings) —— settings 级联，包括 `enabledPlugins`。
