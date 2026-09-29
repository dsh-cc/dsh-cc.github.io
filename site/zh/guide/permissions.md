---
title: 权限与审批
description: 控制 agent 能做什么——五种权限模式、兼容 Claude Code 的规则引擎、持久化规则，以及 auto 模式下可选的 LLM 风险分类器。
---

# 权限与审批

agent 发起的每一次工具调用都会经过 dsh-cc 的权限层。你可以完全放开、全面收紧，或停在两者之间的任何位置——规则持久化、重启后仍然生效；严格规则的 `auto` 模式在你选择启用时，可以让 LLM 风险分类器裁决没有规则匹配的调用。本页介绍五种模式、规则的写法与求值顺序，以及审批在 TUI 中如何呈现。

前置条件：一个正在运行的 dsh-cc 会话（见[交互基础](/zh/guide/interactive-basics)）。如果你来自 Claude Code，规则语法和模式名应该很眼熟——总体映射见[从 Claude Code 迁移](/zh/guide/from-claude-code)。

## 这写给谁看

你希望 agent 的行为可预期：允许模型自由读取和编辑文件，但在执行任何破坏性操作前先询问你。TUI 提供面向终端的交互，包括审批流程——当引擎给出 `ask` 决定时，会弹出模态框，由你放行或拒绝。规则与 Claude Code 兼容：你已经熟悉的 `ToolName` 和 `ToolName(content)` 字符串可以直接沿用。

## 五种模式

权限模式是**持久的**：切换模式会追加一条 last-wins 的 `permission/mode` 会话事件，因此模式在进程重启后依然生效。用 `/permissions <mode>`、`/permissions` 选择器或 TUI 的 `Shift+Tab` 循环切换；每次切换都会向会话的模型转录注入一条面向人的提示。

| 模式 | 行为 | 适用场景 |
| --- | --- | --- |
| `default` | 引擎求值规则；未匹配的调用落入审批环节，可能会询问你。 | 日常工作的常规防护。 |
| `acceptEdits` | 文件编辑工具自动放行；其余与 `default` 相同。 | 长时间编辑会话：信任文件写入，但仍想把关命令执行。 |
| `plan` | 只读工具自动放行；非只读调用上遗留的 `ask`/passthrough 变为拒绝，理由是 `plan mode is read-only; submit via exit_plan_mode`。已匹配的 allow/deny 规则仍然生效。 | 审阅或设计——plan 模式从构造上就是写拒绝。`plan` 由 plan-mode 插件持有，规则引擎拒绝直接设置它。 |
| `auto` | 求值方式同 `default`，但是严格规则：匹配的 ask 规则总会询问，宽泛的 allow 规则被挂起（见下文）。 | 自动化运行：由可选的分类器裁决未匹配的调用。 |
| `bypassPermissions` | 放行一切——除非设置了 `disableBypassPermissionsMode`。进入时把会话沙箱固定为 `danger-full-access`；退出时恢复已记录的隔离级别（回退为 `workspace-write`）。 | 完全信任的任务，风险自担。 |

UI 遵循设置中的 `permissions.defaultMode`：statusline、会话切换、Shift+Tab 循环起点以及 `/permissions` 选择器都回退到实时合并的设置默认值——但已记录的会话模式仍然优先，且循环被限制在其成员之内。

## 持久化规则

引擎是 `@dsh-cc/permission-rules`，一个兼容 Claude Code 的权限规则插件。规则形如 `ToolName`（整工具）或 `ToolName(content)`（内容限定）：

| 规则 | 含义 |
| --- | --- |
| `Bash` | 针对每次 `Bash` 调用的整工具规则 |
| `Bash(npm install)` | 前缀规则：任何以 `npm install` 开头的命令 |
| `Bash(npm publish:*)` | 以 `npm publish:` 为词干的前缀规则 |
| `Edit(foo/*.json)` | 通配符：匹配 `foo/*.json`（`*` 匹配任意一段） |
| `Bash(python -c "print\(1\)")` | 内容中的字面括号（用 `\` 转义） |

规则可来自两处，按来源优先级合并（settings 优先）：

- **Config**（插件上的 `rules.deny` / `rules.bypassImmune`）——插件挂载后即生效。
- **Settings**——`permissions` 命名空间：`permissions.allow`、`permissions.deny`、`permissions.ask`、`permissions.defaultMode`，以及供风险分类器使用的 `additionalDirectories` / `protectedFiles` / `dangerousPatterns` / `mediumPatterns`。规则携带来源标签（默认 `userSettings`）；设置变更会立即重跑合并并重新注册守卫（热重载）。格式错误的 settings 规则在设置边界直接报错。

任何来源中格式错误的规则都会在加载时抛出异常——引擎宁可响亮地失败，也不静默丢掉你本想用来拒绝的规则。

三个特性与持久性相关：

1. **免疫绕过的规则始终拒绝。** 像 `Edit(~/.bashrc)` 这样的规则注册为单调守卫（guard）——模式切换和 `bypassPermissions` 都无法覆盖。
2. **求值有序且 deny 优先。** 先是免疫绕过的拒绝，然后是风险分类器，接着是整工具 deny 和内容 deny，再按来源优先级依次是整工具 ask、内容 ask、内容 allow，然后是模式短路，最后是整工具 allow 作为粗粒度默认。在所有模式下，内容 deny 都胜过任何 allow。shell 命令按片段匹配：allow 必须匹配 `a && b` 的每一个片段。无匹配则透传给下游监听器——最终是审批环节，仍可能询问。
3. **模式是会话事件。** `permission/mode` 事件类型在插件加载时注册，持久化恢复时可用；设置变更通过 `rebuild()` 重置分类器状态。

## 风险分类器

静态风险分类器在所有模式下运行（`classifierEnabled`，默认开启），把 shell 命令分为三档：

- **HIGH**（灾难性命令，如 `rm -rf /` 或 `sudo`，以及对受保护文件的写入）在每种模式下都硬拒绝。
- **MEDIUM**（破坏性但可恢复，如 `git push --force`、`git reset --hard` 或 `npm publish`）会询问你，除非某条规则或会话授权已经允许。可用 `permissions.mediumPatterns` 替换精选列表。
- **LOW** 正常求值。

一个小的 critical 档（强制删除根目录或 home、fork bomb）加上你的 `permissions.criticalDeny` 条目，即使在 `bypassPermissions` 下也会拒绝。

## `auto` 模式

`auto` 是严格规则的。匹配的 ask 规则在任何风险级别都会询问，`auto` 生效期间宽泛的 allow 规则会被挂起：整工具 Bash allow、全放行式的 Bash 内容 allow、`python` 或 `npx` 这类解释器与包运行器前缀，以及任何 `Task`/`Agent` allow。`/permissions` 会把它们标注为 "suspended in auto mode"。"Allow for this session" 授权在所有非 plan 模式下都适用于规则产生的 ask。

不做更多配置时，没有规则匹配的调用仍然落入审批环节。要让模型来裁决它们，就通过 `permissions.autoMode.classifier`（`enabled` / `route` / `timeoutMs` / `cacheMaxEntries`）武装可选的 **LLM 风险分类器阶段**。只有当 enabled 为真、挂载了 `llm` 服务且别名路由可解析时，该阶段才会武装。

- 它只裁决透传类的 LOW 和 MEDIUM 调用。规则产生的 ask 总会交给你，只读工具调用永远不会到达模型。
- 已启用但不可用的阶段（缺少路由、熔断器打开）会带着理由询问你，而不是静默放行。
- 裁决为 `allow`、`ask` 或 `deny`。`deny` 必须引用一条精确的 `hard_deny` 规则，否则降级为 `ask`。解析 fail-closed：格式错误的输出产生 `classifier output unparseable`。
- 策略位于 `permissions.autoMode` 的 `hard_deny`、`soft_deny`、`allow` 和 `environment` 槽位中，每个都接受 `"$defaults"`。只有可信层（用户、`--settings` flag、托管策略）能设置 `autoMode`，所以克隆下来的仓库无法扩大自己的信任边界。
- 一个会话内连续 3 次或累计 20 次 deny 会暂停 auto 模式并把会话降为 `default`；用 `/permissions auto` 重新进入。
- 按路由的熔断器在连续失败 3 次后打开，冷却 60s 后放行一次探测调用。设置变更会重置它。

在 `auto` 模式下，一个建议性的提示注入探针还会扫描 `read`、`bash`、`web_fetch` 和 `mcp__*` 等工具结果的文本，并给被标记的结果附上一条安全提示。

裁决默认以仅含摘要的会话事件审计。`permissions.autoMode.classifier.auditFullText: true` 会存储原始输入，其中可能包含密钥。用 `/auto-mode`（`defaults`、`config`、`review [full]`）查看配置和审计。完整键列表见[权限模式](/zh/reference/permission-modes)。

::: tip
用可选的 `DSH_PERMISSION_CLASSIFIER_DEBUG=1` 进程日志通道调试原始模型输出（`[dsh:classifier:raw]`，截断至 2 KiB——绝不进入会话事件）。
:::

## /permissions 命令

`/permissions [mode]` 查看或更改权限模式与规则。不带参数调用会打开 TUI 覆盖层（权限选择器）；`/permissions <mode>` 在 `default | acceptEdits | plan | auto | bypassPermissions` 之间切换。plan 模式的进入/退出分支位于宿主命令通道中，因此选择器、浏览器弹窗和手打的 `/permissions …` 都经由同一路径提交。

`/permissions lint` 报告规则卫生问题（格式错误的规则、重复规则、被更宽前缀包含的规则、整工具 `Bash` allow、未知工具名）并给出 diff 建议。加 `--apply` 可清理用户 settings 层；其他层从不修改。

完整命令目录（含 parity 状态）见[斜杠命令参考](/zh/reference/commands)，此处不再重复。

## 下一步

- [从 Claude Code 迁移](/zh/guide/from-claude-code)——总体兼容性映射。
- [权限模式](/zh/reference/permission-modes)——模式目录参考。
- [设置级联](/zh/reference/settings)——`permissions.allow` / `deny` / `ask` / `defaultMode` 存放位置及各层级的合并方式。
