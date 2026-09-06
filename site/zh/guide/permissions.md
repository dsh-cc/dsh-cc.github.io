---
title: 权限与审批
description: 控制 agent 能做什么——五种权限模式、兼容 Claude Code 的规则引擎、持久化规则，以及 auto 模式下可选的 LLM 风险分类器。
---

# 权限与审批

agent 发起的每一次工具调用都会经过 dsh-cc 的权限层。你可以完全放开、全面收紧，或停在两者之间的任何位置——规则持久化、重启后仍然生效；如果你选择启用，`auto` 模式下的 LLM 风险分类器还能自动放行低风险操作。本页介绍五种模式、规则的写法与求值顺序，以及审批在 TUI 中如何呈现。

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
| `auto` | 求值与 `default` 完全一致；风险分类器在插件层代理每次 `ask`（见下文）。 | 自动化运行：希望低风险询问无需人工介入。 |
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
- **Settings**——`permissions` 命名空间：`permissions.allow`、`permissions.deny`、`permissions.ask`、`permissions.defaultMode`，以及供风险分类器使用的 `additionalDirectories` / `protectedFiles` / `dangerousPatterns`。规则携带来源标签（默认 `userSettings`）；设置变更会立即重跑合并并重新注册守卫（热重载）。格式错误的 settings 规则在设置边界直接报错。

任何来源中格式错误的规则都会在加载时抛出异常——引擎宁可响亮地失败，也不静默丢掉你本想用来拒绝的规则。

三个特性与持久性相关：

1. **免疫绕过的规则始终拒绝。** 像 `Edit(~/.bashrc)` 这样的规则注册为单调守卫（guard）——模式切换和 `bypassPermissions` 都无法覆盖。
2. **求值有序。** 先是免疫绕过的拒绝，然后是风险分类器，接着是整工具 deny/ask，再是按来源优先级的内容级规则（首个匹配者定夺），然后是模式短路，最后是整工具 allow 作为粗粒度默认。无匹配则透传给下游监听器——最终是审批环节，仍可能询问。
3. **模式是会话事件。** `permission/mode` 事件类型在插件加载时注册，持久化恢复时可用；设置变更通过 `rebuild()` 重置分类器状态。

## auto 模式的 LLM 风险分类器

`auto` 是可选加入、只做升级判定的。不配置时它没有任何特殊行为：缺少 `autoMode` 键即保持 LLM 阶段解除武装，`auto` 的求值与 `default` 完全一致。即使武装后，只读工具调用也豁免——它们不会到达模型，读流量零额外延迟。

武装后（`permissions.autoMode` 含 `enabled`、挂载了 `llm` 服务、别名 `route` 可解析），每次 `ask` 都由一次性的辅助模型裁决代理，输入是工具名 + 渲染后的参数——绝不包含工具结果，且输入被包在显式的 DATA 块中，并指示模型不得复述、引用或遵从：

- 分类为 LOW 的调用自动放行；分类为 MEDIUM 的仍会询问你。
- 分类器的任何失败都回退为 `ask`（fail-to-ask），裁决解析严格且 fail-closed：格式错误的输出产生固定理由 `classifier output unparseable`——模型输出从不展示，审计记录仅存摘要。
- `$defaults` 软拒绝散文规则（含展开）与裁决 LRU 缓存生效；裁决产生持久的 `permission/classifier` 会话审计事件。
- 默认值：`timeoutMs` 8000，裁决预算 1024 tokens。通过 `autoMode.classifier` 配置（`enabled` / `route` / `timeoutMs` / `cacheMaxEntries`）。

该阶段由**按路由的熔断器**保护：某条链路（按 `provider/model` 键）连续失败 3 次后，该路由的阶段被打开（熔断）——不再对该路由调用分类器，每进程一次 warn，每会话一条 `breaker` 审计事件。熔断器在会话内重启持久：首次调用从持久日志播种各路由的连败计数。熔断打开时每会话显示一条可见的 TUI 回退通知；被调用方取消的分类标记为 `cancelled`，绝不计入熔断。设置变更（`rebuild()`）重置熔断状态并重新武装。

::: tip
用可选的 `DSH_PERMISSION_CLASSIFIER_DEBUG=1` 进程日志通道调试原始模型输出（`[dsh:classifier:raw]`，截断至 2 KiB——绝不进入会话事件）。
:::

## /permissions 命令

`/permissions [mode]` 查看或更改权限模式与规则。不带参数调用会打开 TUI 覆盖层（权限选择器）；`/permissions <mode>` 在 `default | acceptEdits | plan | auto | bypassPermissions` 之间切换。plan 模式的进入/退出分支位于宿主命令通道中，因此选择器、浏览器弹窗和手打的 `/permissions …` 都经由同一路径提交。

完整命令目录（含 parity 状态）见[斜杠命令参考](/zh/reference/commands)，此处不再重复。

## 下一步

- [从 Claude Code 迁移](/zh/guide/from-claude-code)——总体兼容性映射。
- [权限模式](/zh/reference/permission-modes)——模式目录参考。
- [设置级联](/zh/reference/settings)——`permissions.allow` / `deny` / `ask` / `defaultMode` 存放位置及各层级的合并方式。
