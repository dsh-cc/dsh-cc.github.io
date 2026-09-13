---
title: 扩展格式
description: 每个 Claude Code 兼容扩展文件（hooks、skills、plugins、subagents）的存放位置、最小骨架，以及指向完整指南的链接。
distilled-from: dsh-cc v0.6.3
---

# 扩展格式

dsh-cc 直接消费 Claude Code 的扩展格式：`hooks.json`、`SKILL.md`、插件
`plugin.json` 清单和 `.claude/agents/*.md` 子代理定义，都无需转换即可挂载到
dsh-cc 的扩展点上。本页是一个索引：对每个扩展面给出文件位置、最小骨架，以及
深入讲解行为的指南链接。

## hooks — `hooks.json`

**文件位置：** 一个 `hooks.json`，或设置文件中的 `hooks` 键，通过
`@dsh-cc/hooks-claude-code` 的 `configPath` 配置传入（cc preset 自带一个跟踪
在仓库根部的 `hooks.json`）。该路径是进程级的：相对路径在加载时按进程的启动
cwd 解析。读取/解析失败是被兜底的——bridge 只记录警告、不注册任何 hook。

**最小骨架**（一个事件、一个 matcher、一个带显式 `timeout` 的 `command`
hook；单 hook 默认为 600 000 毫秒）：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./scripts/gate.sh", "timeout": 5000 }
        ]
      }
    ]
  }
}
```

支持四种执行器类型：`command`、`http`，以及——默认关闭、由
`enablePromptHooks` / `enableAgentHooks` 配置开启——`prompt` 和 `agent`
（二者都 fork 一个一次性子代理）。支持 18 种 hook 事件；配置里不支持的事件
在分组解析之前就被忽略。

**完整内容：** [/guide/hooks](/zh/guide/hooks)

## skills — `SKILL.md`

**文件位置：** 一个 skill 是 `<name>/SKILL.md` 目录包，位于以下根目录之一，
按优先级排列（rank 越低，同名冲突时越优先）：

| Rank | 来源 | 路径 |
|---|---|---|
| 100 | managed | `config.managedDir` |
| 200 | project | `<projectRoot>/.claude/skills` |
| 300 | user | `<dshHome>/skills` |
| 400 | additional | 每个 `config.additionalDirs` |

project root 是包含 `.git` 的最近祖先目录；没有则用当前 cwd。旧式
`.claude/commands/*.md` 文件也会被加载，并在元数据中标记为 `deprecated`。
harness 原生的文件系统提供方还会追加 `<projectRoot>/.dsh/skills`、
`<projectRoot>/.agents/skills`、`~/.agents/skills` 这些根目录（完整的合并根目录清单见[技能指南](/zh/guide/skills)）。

**最小骨架：**

```markdown
---
name: my-skill
description: What the skill does and when to use it
---

Body with $ARGUMENTS substitution and optional inline-shell !`cmd` commands.
```

已知 frontmatter 字段包括 `allowed-tools`、`argument-hint`、`model`（含
`inherit`）、`user-invocable`、`disable-model-invocation`、`context`（含
`fork`）、`when_to_use` 和 `paths`。name 必须是 kebab-case 才能注册。声明
`paths` 的 skill 是条件式的：在 Read/Write/Edit 工具触碰匹配文件之前不会
出现在目录中。

**完整内容：** [/guide/skills](/zh/guide/skills)

## plugins — `plugin.json`

**文件位置：** 插件根目录持有 `.claude-plugin/plugin.json`（首选）或顶层
`plugin.json`（旧式）。插件状态是**双 home 制**：默认发现逻辑将
`enabledPlugins`（按 claude-user → dsh-user → project → local 级联，后读
文件按键覆盖）与两个 home 合并后的 `plugins/installed_plugins.json` 求交集
——Claude home `$CLAUDE_CONFIG_DIR`（否则 `~/.claude`）保持完全可读，dsh
home `$DSH_HOME`（否则 `~/.dsh`）是写入根目录，同名键 dsh 条目获胜。显式
`pluginDirs` 则改为扁平展开：本身或一层子目录中持有
`.claude-plugin/plugin.json` 或顶层 `plugin.json` 的目录。

**最小骨架：**

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What the plugin provides"
}
```

`name` 必填且为 kebab-case。组件字段有 `commands`、`agents`、`skills`、
`hooks`、`mcpServers` 和 `settings`；省略 `commands` 时加载器扫描
`commands/*.md`。未知的顶层字段被忽略。每个组件挂载到对应的宿主 seam
（`commands`、`subagents`、`skills`、`hooks`、`mcp`、`settings`）；seam 缺失
的组件会被报告为 `skipped`，不会让整个加载失败。agents 以插件名为命名空间
挂载，因此 Task 工具通过限定 id（`plugin:agent`）派发它们。

**完整内容：** [/guide/plugins](/zh/guide/plugins)

## subagents — `.claude/agents/*.md`

**文件位置：** 从会话工作目录可见的 `.claude/agents` 目录——project 层是从
project root 向上走找到的最近 `.claude/agents`，user 层是 `~/.claude/agents`。
project 遮蔽 user（包内捆绑层在两者之下）。定义以文件 basename 为键，该名字
即成为 `subagent_type`。

**最小骨架：**

```markdown
---
description: When to delegate to this agent
tools: Read, Grep, Glob
model: haiku
---

The agent's system prompt, written as the markdown body.
```

`description` 成为何时使用的指引；`tools`/`disallowedTools` 编译为有效的
allow/deny 工具限制；`model`（含 `inherit`）通过 `ccModelRoutes` 别名服务
解析；`effort`、`permissionMode`、`maxTurns`、`initialPrompt`、`background`、
`memory`、`skills`、`mcpServers`、`hooks` 和 `isolation` 都会透传。未知字段
被忽略；已知字段的坏值在加载时大声失败。保留类型 `general-purpose`（全新
spawn）和 `fork`（继承会话的 fork）是哨兵名——名为 `fork.md` 的工作区文件
不可达。

**完整内容：** [/guide/subagents](/zh/guide/subagents)

## 下一步

- [/guide/hooks](/zh/guide/hooks) — hook 事件、决策与 payload。
- [/guide/skills](/zh/guide/skills) — 调用策略与条件激活。
- [/guide/plugins](/zh/guide/plugins) — 组件挂载与发现。
- [/reference/commands](/zh/reference/commands) — `/plugin` 与 `/reload-plugins`。
