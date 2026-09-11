---
title: Plugins（插件）
description: dsh-cc 如何通过 dsh profile 与 bundle 完成自身组合，以及如何加载磁盘上已有的 Claude Code 插件。
---

# Plugins（插件）

在 dsh-cc 中，"插件"有两个互补的含义，本页两者都讲：

- **故事 A —— dsh 原生组合。** dsh-cc 本身以普通 dsh 插件的形式安装，按 `@dsh-cc/bundle-*` 包分组并挂载到 dsh profile 中。你的本地微调放在 `cordis.patch.yml` 文件里。
- **故事 B —— 加载 Claude Code 插件。** 通过 cc-plugin-loader，dsh-cc 可以发现并挂载磁盘上已有的 Claude Code 插件（一个 `plugin.json` 清单加若干组件目录），让你手头的插件资产继续可用。

前置条件：dsh >= 0.1.2-rc.1，并安装 `@dsh-cc/cli` 启动器（`npm install -g @dsh-cc/cli`）。

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

## 官方插件

两个官方插件通过 `dsh-cc` marketplace 发布。

### dsh-cc-agents —— critic、executor 与 marathon 子代理

包含三个子代理和一个在它们之间做路由的编排技能：

- **`dsh-cc-agents:critic`** —— 重推理工作：复杂分析、架构决策、对抗性方案评审、根因分析。运行在 `opus` 模型别名上，默认后台运行。
- **`dsh-cc-agents:executor`** —— 执行已获批、完全明确的计划中的机械性工作：格式化、简单重构、样板代码、改名、测试、文档、检查。运行在 `sonnet` 模型别名上，默认前台运行。
- **`dsh-cc-agents:marathon`** —— 长周期、模糊或全仓库级的复杂任务：架构重设计、跨模块重构、没有明显线索的长时间调试，以及在主线方案失败后的重新进攻。运行在 `fable` 模型别名上（未配置时继承主线程路由）；会执行修改操作的人设，与 executor 一样默认前台运行。

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
