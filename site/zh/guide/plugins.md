---
title: Plugins（插件）
description: dsh-cc 如何通过 dsh profile 与 bundle 完成自身组合，以及如何加载磁盘上已有的 Claude Code 插件。
---

# Plugins（插件）

在 dsh-cc 中，"插件"有两个互补的含义，本页两者都讲：

- **故事 A —— dsh 原生组合。** dsh-cc 本身以普通 dsh 插件的形式安装，按 `@dsh-cc/bundle-*` 包分组并挂载到 dsh profile 中。你的本地微调放在 `cordis.patch.yml` 文件里。
- **故事 B —— 加载 Claude Code 插件。** 通过 cc-plugin-loader，dsh-cc 可以发现并挂载磁盘上已有的 Claude Code 插件（一个 `plugin.json` 清单加若干组件目录），让你手头的插件资产继续可用。

前置条件：dsh >= 0.1.0-rc.5，并安装 `@dsh-cc/cli` 启动器（`npm install -g @dsh-cc/cli`）。

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

默认情况下，发现逻辑遵循磁盘上的 Claude Code 布局：

- Claude home 是 `$CLAUDE_CONFIG_DIR`，回退到 `~/.claude`。
- 启用集合是 `enabledPlugins`（按 用户 → 项目 → 本地 的 settings 级联）与 `{claudeHome}/plugins/installed_plugins.json` 的交集。键必须是精确的 `name@marketplace` 形式。
- 无法读取的 JSON 和缺失的 `installPath` 会被跳过，而不是报错。

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
| `agents` | `agents/` 目录或清单路径 | 加载为 agent 定义，并把每个注册为具名子代理提供者。 |
| `skills` | `skills/` 目录或清单路径 | 发现 `SKILL.md`，解析 frontmatter，并把每个注册为运行时技能。 |
| `hooks` | `hooks/hooks.json` 或内联 | 注入按事件划分的 hook 映射。 |
| `mcpServers` | 内联记录或 `.mcp.json` | 注册每个 MCP 服务器。 |
| `settings` | 清单记录 | 按允许列表过滤（当前为 `agent`）后应用。 |

::: warning
部分组件依赖 harness 目前并不拥有的主机接缝：除非部署方提供对应的 guest seam，`hooks`、`mcpServers` 和 `settings` 会被报告为 `skipped`。被跳过的组件不会让整个插件加载失败——每个组件的结果都会单独报告。
:::

### 在会话中管理插件

| 命令 | 作用 |
| --- | --- |
| `/plugin` | 管理插件 |
| `/reload-plugins` | 重新读取 `enabledPlugins` 级联并重新扫描；项目级与本地 `enabledPlugins` 以启动时工作目录为准 |

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
- 技能遵循 [Skills](/guide/skills) 中描述的 `SKILL.md` 约定。
- 接缝不可用的组件会被报告为 `skipped` 而不是破坏加载，所以你可以渐进式地发布插件。

## 下一步

- [Skills](/guide/skills) —— `SKILL.md` 技能如何工作，包括从插件挂载的技能。
- [Subagents](/guide/subagents) —— agent 定义与派发，包括插件提供的 agent。
- [Extension formats](/reference/extension-formats) —— dsh-cc 读取的磁盘格式。
- [Settings](/reference/settings) —— settings 级联，包括 `enabledPlugins`。
