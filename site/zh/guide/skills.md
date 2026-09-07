---
title: Skills（技能）
description: 把可复用的任务级说明打包成 SKILL.md 技能包，由 dsh-cc 从 Claude Code 风格的技能根目录按需发现并加载。
---

# Skills（技能）

技能（Skills）让你把可复用的任务级说明打包起来，由智能体按需加载，而不必每次在提示词里重复同一段指导。dsh-cc 直接兼容 Claude Code 的 `SKILL.md` 格式：项目专属技能、内置工具技能以及旧版命令文件都由 CC 技能提供方（skill provider）发现，并通过 harness 的技能注册表对外服务。本页说明技能放在哪里、`SKILL.md` 可以写什么，以及技能如何被调用。

## 技能放在哪里

技能是以 `<name>/SKILL.md` 形式组织的目录包，从多个根目录发现。根目录按以下优先级顺序发现（rank 越小，同名冲突时越优先）：

| Rank | 来源 | 路径 |
| --- | --- | --- |
| 100 | managed | `config.managedDir` |
| 200 | project | `<projectRoot>/.claude/skills` |
| 300 | user | `<dshHome>/skills` |
| 400 | additional | each `config.additionalDirs` |

来自提供方发现规则的补充说明：

- **项目根目录**是包含 `.git` 的最近祖先目录；找不到时使用当前 cwd。
- **用户根目录**是 harness home（默认 `$DSH_HOME` 或 `~/.dsh`）下的
  `skills` 目录。
- **managed**（`config.managedDir`）是可选的策略根目录，先于所有默认目录扫描；**additional** 根目录（`config.additionalDirs`）追加在 project 和 user 根目录之后。
- **内置（bundled）技能**随提供方包一起分发，以 rank 600 服务。因为 600 是最高 rank，任何同名的 managed（100）、project（200）、user（300）或 additional（400）技能都会赢得命名冲突——本地技能覆盖内置技能，与 Claude Code 的优先级一致。当前内置子集为 `debug`、`simplify` 和 `batch`。
- 旧版 `.claude/commands/*.md` 文件也会被加载，并在其元数据中标记为 `deprecated`。
- 发现按真实路径去重，因此符号链接或互相重叠的文件只会被服务一次。

### Harness 原生根目录（同样会被扫描）

preset 还挂载了 DeepSeek Harness 的文件系统技能提供方（`@deepseek-ai/dsh-skill-filesystem`），因此你在 `/skills` 中看到的合并目录还会覆盖以下根目录（按该提供方自己的 rank 顺序）：

| Rank | 来源 | 路径 |
| --- | --- | --- |
| 100 | project-dsh | `<projectRoot>/.dsh/skills` |
| 200 | project-agents | `<projectRoot>/.agents/skills` |
| 300 | custom | 提供方 `customSkillDirs` |
| 400 | user-dsh | `<dshHome>/skills` |
| 500 | user-agents | `~/.agents/skills` |

- `~/.agents` 是共享的 agent 配置主目录，可用环境变量 `DSH_AGENTS_HOME` 覆盖。
- `.agents` 根目录来自 harness 层而不是 dsh-cc 本身。如果放在那里的技能没有出现在 `/skills` 中，请升级 dsh：`npm install -g @deepseek-ai/dsh@latest`。

## `SKILL.md` 的结构

`SKILL.md` 按 YAML frontmatter 文档解析，frontmatter 与 Markdown 正文分离。提供方读取所有已知的 Claude Code 字段，并容忍未知字段；已知字段取值非法时会在加载时显式报错，而不是静默地错误激活。技能名必须是 kebab-case 才能注册到注册表。

### Frontmatter 字段

提供方文档化以下字段。来源并未逐个标注哪些是必填；实践中 `description` 是模型判断是否激活技能时看到的内容，因此对模型调用的技能而言它最关键。

| 字段 | 含义 |
| --- | --- |
| `description` | 技能做什么；用于模型调用的激活判断。 |
| `name` | 技能名；必须是 kebab-case 才能注册到注册表。 |
| `allowed-tools` | 限制技能运行时的工具面。由 `ccRestriction(allowedTools)` 转换为 allow-only 的 `tools.restrict()` 过滤器；`*` 或空列表得到 `undefined`，即技能继承调用方的工具面。 |
| `argument-hint` | 传参提示文本；作为元数据暴露，由消费方在激活时应用。 |
| `arguments` | 技能的参数声明。 |
| `when_to_use` | 何时应使用该技能的指导；发现阶段会被计入。 |
| `version` | 技能的版本字符串。 |
| `model` | 技能使用的模型，包括值 `inherit`。 |
| `user-invocable` | 用户是否可以直接调用该技能（例如作为斜杠命令）。 |
| `disable-model-invocation` | 阻止模型自行调用该技能。 |
| `context` | 技能的执行上下文，包括值 `fork`。`context: fork` 以 `metadata.executionContext` 暴露；消费方将技能路由到 `ctx.subagents.start()`，并附上渲染后的正文。 |
| `agent` | 技能关联的 agent。 |
| `effort` | 技能的 effort 级别。 |
| `shell` | 技能关联的 shell。 |
| `hooks` | 技能关联的 hooks。 |
| `paths` | gitignore 风格的项目相对路径模式，用于*条件激活*（见下文）。 |

::: info
大部分语义转换发生在消费方：`allowed-tools`、`context: fork` 和
`argument-hint` 只是作为元数据和辅助函数暴露，由消费方应用，因为提供方在加载时没有 agent 引用。`paths` 条件激活是例外，由提供方自己完成。
:::

### 正文与占位符

Markdown 正文是技能激活后交付的指令文本。`renderSkillBody` 会在正文中替换以下占位符：

| 占位符 | 替换为 |
| --- | --- |
| `$ARGUMENTS` | 传给技能的完整参数字符串。 |
| `$ARGUMENTS[n]` / `$n` | 第 n 个参数。 |
| `$name` | 名为 `name` 的具名参数。 |
| `${CLAUDE_SKILL_DIR}` | 技能所在目录。 |
| `${CLAUDE_SESSION_ID}` | 当前会话 id。 |

正文中的内联 shell `` !`...` `` 命令会被提取（分段）交由调用方执行，受
`allowInlineShell` 守护；提供方自己不执行它们，且 MCP 来源的技能必须强制关闭该能力。发现阶段只统计 `name`、`description` 和 `when_to_use`
的 token（`estimateFrontmatterTokens`）——正文从不参与统计。

## 通过 `paths` 条件激活

frontmatter 声明了 `paths` 的技能是*条件技能*。在 Read/Write/Edit 工具触碰匹配其 gitignore 风格项目相对 `paths` 的文件之前，它不会被服务：

1. `list()` 解析每个候选技能；被 `paths` 门槛限制的技能在激活前**不进入目录**。
2. 在 `fs/observed` 上，`read`/`write`/`edit` 操作触及项目内匹配路径时会激活该技能（仅一次——重复触发是幂等的）；消费方通过 `skills/change` 重新拉取目录，该技能随即出现。
3. `get()` 正常服务已激活的技能。

这与 Claude Code 对上下文相关技能的语义一致：技能在被真正触及文件模式之前不会进入目录。

## 调用模型

注册表通过 `ccInvocation(parsed)` 从两个字段解析调用策略：

- `user-invocable` —— 你是否可以自己调用该技能。
- `disable-model-invocation` —— 是否禁止模型自行调用该技能。

### 模型调用（model-invoked）

默认情况下由模型判断技能何时适用，依据是它的 `description`（以及
`when_to_use`）。请确保这两个字段准确具体——它们是模型激活判断的唯一依据，也是发现阶段唯一参与统计的 frontmatter 字段。

### 用户调用（user-invoked）

可被用户调用的技能可以用其 kebab-case 名称作为斜杠命令运行：

```sh
$ /my-skill-name
```

要列出所有可用技能——包括内置、project、user 和 additional 技能——使用
`/skills` 命令：

```sh
$ /skills            list installed skills
```

::: tip
对只希望在你主动要求时才运行的技能，设置
`disable-model-invocation: true`，这样模型就不会自行把它们拉进来。
:::

## 最小示例

来源中没有提供可直接复制的示例 `SKILL.md`，因此以下示例只使用提供方文档化的字段搭建，**并非**官方示例，正文写法由你自行决定。把它放在
`<projectRoot>/.claude/skills/release-notes/SKILL.md`：

```markdown
---
name: release-notes
description: Draft release notes from recent commits and open pull requests.
argument-hint: [version]
user-invocable: true
---

# Draft release notes

Write release notes for version $ARGUMENTS.

1. Summarize merged commits since the last tag.
2. Group changes into Added / Changed / Fixed.
3. Keep entries user-facing; omit internal refactors.

Reference the skill directory for extra context: ${CLAUDE_SKILL_DIR}/notes.md
```

由于该名称注册在项目根目录（rank 200）下，它会覆盖同名的内置技能——同名的 user 根目录技能也会输给它。

## 下一步

- [/guide/hooks](/zh/guide/hooks) —— 响应会话与工具事件
- [/guide/subagents](/zh/guide/subagents) —— 把工作委派给子智能体
  （包括 `context: fork` 的路由方式）
- [/reference/extension-formats](/zh/reference/extension-formats) ——
  `SKILL.md`、agent 与插件文件格式的参考手册
