---
title: 权限模式
description: 五种权限模式、规则引擎的规则形式与求值顺序、auto 模式的风险分类器，以及 /permissions 命令。
distilled-from: dsh-cc v0.6.3
---

# 权限模式

dsh-cc 的权限引擎（`@dsh-cc/permission-rules`）与 Claude Code 兼容：解析
`ToolName` 和 `ToolName(content)` 规则，在 `tools/pre-execute` 瀑布上折叠出一个
感知模式的决策，并通过单调的 guard 层强制执行绕行免疫的内容规则——模式切换
和 `bypassPermissions` 都无法覆盖它。规则在加载时大声失败；设置变更会重建合并
状态并重新注册 guard，实现热重载。

## 五种模式

模式是**持久的**：切换会追加一条 last-wins 的 `permission/mode` 会话事件，所以
模式跨进程重启仍然生效。`plan` 由 plan-mode 拥有，不能通过规则引擎的
`setMode` 设置。

| 模式 | 行为 |
|---|---|
| `default` | 完整求值：guards → 风险分类器 → 按来源优先级的 deny/ask/allow 规则 → 模式短路 → 整工具 allow → 透传到审批缝。 |
| `acceptEdits` | 自动允许文件编辑工具（`fileEditTools` 配置，默认 `['edit']`）。其余与 `default` 相同。 |
| `plan` | 自动允许只读工具（`readOnlyTools`，默认 `['read']`）。非只读调用上遗留的 `ask`/`passthrough` 变为 deny，理由是 `plan mode is read-only; submit via exit_plan_mode`；已匹配的 allow/deny 规则仍然生效。 |
| `auto` | 求值**与 `default` 完全相同**——它不是求值短路。风险分类器在插件层代理每一个 `ask`：classifier-LOW 的调用自动允许，classifier-MEDIUM 仍然询问。可通过设置启用一个可选的 LLM 风险分类器阶段（见下文）。 |
| `bypassPermissions` | 允许一切（除非设置了 `disableBypassPermissionsMode`）。进入时把会话沙箱固定为 `danger-full-access` 并记录 `resumeSandbox`；离开时恢复记录的沙箱限制（或回退到 `workspace-write`）。 |

UI 遵循 `permissions.defaultMode`：statusline、会话切换、Shift+Tab 循环起点和
`/permissions` 选择器都回退到实时合并的设置默认值。已记录的会话模式仍然优先于
设置默认值。

## 规则形式

规则是 `ToolName`（整工具）或 `ToolName(content)`（内容域）。content 可以用
反斜杠转义 `(`/`)`/`\`，用 `*` 作通配符，或以 `:*` 结尾声明前缀规则。

| 规则 | 含义 |
|---|---|
| `Bash` | 覆盖每次 `Bash` 调用的整工具规则 |
| `Bash(npm install)` | 前缀规则：任何以 `npm install` 开头的命令 |
| `Bash(npm publish:*)` | 对主干 `npm publish:` 的前缀规则 |
| `Edit(foo/*.json)` | 通配符：匹配 `foo/*.json` 的命令/路径 |
| `Bash(python -c "print\(1\)")` | content 中的字面括号 |

格式错误的规则（括号未闭合、右括号后有内容、content 缺少工具名）在加载时抛出
`TypeError`。每条规则带有来源（`session` > `cliArg` > `policySettings` >
`flagSettings` > `localSettings` > `projectSettings` > `userSettings` >
`config`），用于内容规则的优先级；第一条匹配的规则说了算。

## 风险分类器与 auto 模式的熔断器

当 `classifierEnabled`（默认开启）时，一个静态风险分类器在**所有**模式下运行：
灾难性 shell 命令（`rm -rf /`、`sudo`、`dd of=/dev`、`kill -9 1`、把
curl/wget 管道进 sh、重定向到系统路径）在每种模式下都是硬 deny；对受保护文件
（`.bashrc`、`.ssh/**`、凭据）的写入也是硬 deny；逃出工作目录范围的写入在
`bypassPermissions` 之外是 `ask`。

在此之上，`auto` 模式可以通过设置启用一个可选的 **LLM 风险分类器阶段**：
`permissions.autoMode` 节——`autoMode.soft_deny` 散文规则（支持 `$defaults`
展开）和 `autoMode.classifier`（`enabled` / `route` / `timeoutMs` /
`cacheMaxEntries`）。只有当 enabled 为真、挂载了 llm 服务且别名路由可解析时，
该阶段才会武装。只读工具调用是豁免的——它们永远不会到达模型。裁决解析严格且
fail-closed：格式错误的模型输出只会产生固定理由 `classifier output
unparseable`，原始模型输出绝不会展示（审计记录只存摘要）。

LLM 阶段有一个**按路由的连续失败熔断器**（阈值 3，按 `provider/model` 为键）：
失败通道打开后——该路由不再发起分类器调用，每个进程一条警告，每个会话一条
`breaker` 审计事件——调用回退到 `ask`。熔断器在会话内可跨重启恢复（恢复的连败
计数 ≥ 阈值时在种子阶段即打开），设置变更（`rebuild()`）会重置熔断器并重新
武装该阶段。

## `/permissions` 的调用形式

| 调用 | 行为 |
|---|---|
| `/permissions` | 打开 TUI 权限浮层。 |
| `/permissions <mode>` | 为 `default \| acceptEdits \| plan \| auto \| bypassPermissions` 切换持久模式。 |

每次切换都会向会话的模型转录注入一条人读通知。配套的不变量模块
（`@dsh-cc/permission-rules/invariant`）在会话边界校验 `permission/mode`
事件：`mode` 必须是可切换的（绝不能是 `plan`），`resumeSandbox`（存在时）必须是
已知的沙箱模式。

## 设置键

`permissions` 命名空间接受：

| 键 | 含义 |
|---|---|
| `permissions.allow` / `permissions.deny` / `permissions.ask` | 按行为分类的规则列表。 |
| `permissions.defaultMode` | UI 和新会话的回退模式。 |
| `permissions.additionalDirectories` | 追加到工作目录范围的额外目录。 |
| `permissions.protectedFiles` | 风险分类器视为受保护写入的文件。 |
| `permissions.dangerousPatterns` | 喂给风险分类器的额外模式。 |
| `permissions.autoMode.soft_deny` | 支持 `$defaults` 展开的散文规则。 |
| `permissions.autoMode.classifier` | `{ enabled, route, timeoutMs, cacheMaxEntries }`，武装 LLM 阶段。 |

设置规则带有 `settingsSource` 标签，并按来源优先级与 Config `rules` 合并——设置
规则获胜。存储变更会立即重新合并并重新注册 guard；格式错误的设置规则在设置边界
大声失败。

## 下一步

- [/guide/permissions](/zh/guide/permissions) — 权限系统的叙事式导览。
- [/reference/commands](/zh/reference/commands) — `/permissions` 命令条目。
- [/reference/settings](/zh/reference/settings) — 这些键所在的设置级联。
