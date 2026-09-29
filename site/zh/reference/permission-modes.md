---
title: 权限模式
description: 五种权限模式、规则引擎的规则形式与求值顺序、严格规则的 auto 模式及其风险分类器，以及 /permissions 和 /auto-mode 命令。
distilled-from: dsh-cc v0.8.1-rc.1 (main 82576b5)
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
| `default` | 按下文顺序完整求值：guards → 风险分类器 → deny → ask → allow 规则 → 模式短路 → 整工具 allow → 透传到审批缝。 |
| `acceptEdits` | 自动允许文件编辑工具（`fileEditTools` 配置，默认 `['edit', 'write', 'multi_edit', 'notebook_edit', 'str_replace_editor']`）。其余与 `default` 相同。 |
| `plan` | 自动允许只读工具（`readOnlyTools`，默认 `['read', 'glob', 'grep', 'search', 'web_fetch', 'web_search']`）。非只读调用上遗留的 `ask`/`passthrough` 变为 deny，理由是 `plan mode is read-only; submit via exit_plan_mode`；已匹配的 allow/deny 规则仍然生效。 |
| `auto` | 求值方式同 `default`——它不是求值短路——但是**严格规则**的，宽泛的 allow 规则会被挂起（见下文）。可通过设置启用一个可选的 LLM 风险分类器阶段。 |
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

## 求值顺序

引擎对每次调用折叠出一个决策：

1. 绕行免疫的内容规则总是 deny。
2. 静态风险分类器（见下文）。
3. 整工具 deny，然后是任意来源的内容 deny。内容求值在所有模式下都是
   **deny 优先**：内容 deny 胜过任何内容 allow 和任何整工具 ask。
4. 整工具 ask，然后内容 ask，然后内容 allow，按来源优先级。
5. 模式短路，然后以整工具 allow 作为粗粒度默认值。
6. 没有匹配时透传到审批缝，审批缝仍可能询问。

对 shell 命令，内容阶段按顶层**片段**求值：deny 和 ask 匹配任一片段即可，而
内容 allow 必须匹配每一个片段。含命令替换或写重定向的片段永远不会匹配 allow。
扫描器无法信任的命令（未闭合引号、heredoc、子 shell、命令组、保留字）会完全
跳过内容 allow。

## 风险分类器

当 `classifierEnabled`（默认开启）时，一个静态风险分类器在所有模式下运行，
对 shell 命令分三档：

| 档位 | 例子 | 结果 |
|---|---|---|
| HIGH | `rm -rf /` 或 `~`、`sudo`、`dd of=/dev`、`kill -9 1`、把 curl/wget 管道进 sh、重定向到系统路径；写入受保护文件（`.bashrc`、`.ssh/**`、凭据） | 在每种模式下都硬 deny。 |
| MEDIUM | `git push --force`、`git reset --hard`、`git clean -f`、对普通目标的 `rm -rf`、`npm\|pnpm\|yarn publish`、`gh repo\|release delete`、`kubectl delete`、`terraform apply\|destroy` | 穿过规则后询问，除非某条规则或会话授权已经允许。 |
| LOW | 其他一切 | 正常求值。 |

逃出工作目录范围的写入在 `bypassPermissions` 之外是 `ask`。一个精选的 critical
档（对根目录或 home 的强制/递归删除，以及 fork bomb 定义形式）加上只能追加的
`permissions.criticalDeny` 列表，会挂载为绕行免疫的 deny，因此在所有模式下都
生效，包括 `bypassPermissions`。

## `auto` 模式

`auto` 是**严格规则**的：匹配的 ask 规则即使在 LOW 风险下也会询问。`auto` 生效
期间，宽泛的 allow 规则会被挂起：整工具 bash/PowerShell allow、实际上等同全放行
的 bash 内容 allow、解释器与包运行器前缀（`python`、`node`、`npm run`、`npx`
等），以及任何 `Task`/`Agent`/`subagent`/`subagent_fork` allow。设置
`permissions.autoMode.classifyAllShell: true` 可挂起每一条 bash 和 PowerShell
allow 规则。"Allow for this session" 授权在所有非 plan 模式下都适用于规则产生的
ask。

### 可选的 LLM 分类器阶段

`auto` 可以通过 `permissions.autoMode` 设置节武装一个 **LLM 风险分类器阶段**。
只有当 enabled 为真、挂载了 llm 服务且别名路由可解析时，该阶段才会武装。

- **判断什么。** 只判断透传类的 LOW 和 MEDIUM 调用；规则产生的 ask 从不交给它
  裁决。只读工具调用豁免，永远不会到达模型。已启用但不可用的阶段（无法武装、
  缺少路由、熔断器打开）会带着可用性理由询问你。
- **输入。** 工具调用加一个有界的转录窗口：你最近的消息、项目指令（`AGENTS.md`，
  否则 `CLAUDE.md`），以及最近的非只读工具调用。
- **裁决。** `allow`、`ask` 或 `deny`。`deny` 必须引用精确匹配的 `hard_deny`
  规则；未引用的 deny 降级为 `ask`。解析严格且 fail-closed：格式错误的输出只会
  产生固定理由 `classifier output unparseable`。`classifier.secondPass`（默认
  false）允许对一次 `ask` 做一次复议调用，只能把它变为 `allow`。
- **策略槽位。** `hard_deny`、`soft_deny`、`allow`（例外）和 `environment`
  （信任边界）。每个列表都接受字面量 `"$defaults"` 条目。级联只从可信层（用户、
  `--settings` flag、托管策略）组装 `autoMode`；项目层和本地层对这个键会被忽略，
  所以克隆下来的仓库无法设定自己的信任边界。
- **拒绝兜底。** 一个会话内连续 3 次或累计 20 次分类器 deny 会暂停 auto 模式，
  并把会话降级为 `default`。用 `/permissions auto` 手动重新进入。
- **熔断器。** 按路由（阈值 3，按 `provider/model` 为键）：失败通道打开，每个
  进程一条警告，每个会话一条 `breaker` 审计事件。冷却 60s 后路由进入半开状态，
  放行一次探测调用。设置变更（`rebuild()`）会重置熔断器。

在 `auto` 模式下，一个建议性的**提示注入探针**还会扫描已执行工具结果的文本
（默认 `read`、`read_image`、`bash`、`web_fetch`、`web_search` 以及所有
`mcp__*` 工具；可用 `autoMode.probe.toolPatterns` 替换）。被标记的结果旁会附上
一条安全提示；探针 fail-open。

分类器和探针的裁决会追加 `permission/classifier` / `permission/probe` 会话审计
事件，默认只存摘要。`permissions.autoMode.classifier.auditFullText: true` 还会
存储原始渲染输入（最多 8192 字符），其中可能包含密钥；除非你正在审查分类器行为，
否则保持关闭。用 `/auto-mode review [full]` 查看。

## `/permissions` 与 `/auto-mode` 的调用形式

| 调用 | 行为 |
|---|---|
| `/permissions` | 打开 TUI 权限浮层。 |
| `/permissions <mode>` | 为 `default \| acceptEdits \| plan \| auto \| bypassPermissions` 切换持久模式。 |
| `/permissions lint` | 报告规则卫生问题并给出 diff 建议；`--apply` 只清理用户 settings 层。 |
| `/auto-mode defaults` | 以 JSON 打印内置槽位列表。 |
| `/auto-mode config` | 打印生效的、仅取可信层的 `permissions.autoMode` 片段。 |
| `/auto-mode review [full]` | 显示本会话最近 20 条分类器/探针裁决。 |

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
| `permissions.dangerousPatterns` | HIGH 档的模式（替换语义）。 |
| `permissions.mediumPatterns` | 替换精选 MEDIUM 档的模式（替换语义）。 |
| `permissions.criticalDeny` | 追加到绕行免疫 critical 档的只追加列表。 |
| `permissions.autoMode.hard_deny` / `soft_deny` / `allow` / `environment` | 支持 `$defaults` 展开的分类器策略槽位。 |
| `permissions.autoMode.classifyAllShell` | 在 `auto` 下挂起每一条 bash/PowerShell allow 规则。 |
| `permissions.autoMode.classifier` | `{ enabled, route, timeoutMs, cacheMaxEntries }`，武装 LLM 阶段；另有 `secondPass` 和 `auditFullText`。 |
| `permissions.autoMode.probe` | 提示注入探针：`toolPatterns`、`route`（默认 `haiku`）、`timeoutMs`（默认 5000）。 |

设置规则带有 `settingsSource` 标签，并按来源优先级与 Config `rules` 合并——设置
规则获胜。存储变更会立即重新合并并重新注册 guard；格式错误的设置规则在设置边界
大声失败。

## 下一步

- [/guide/permissions](/zh/guide/permissions) — 权限系统的叙事式导览。
- [/reference/commands](/zh/reference/commands) — `/permissions` 命令条目。
- [/reference/settings](/zh/reference/settings) — 这些键所在的设置级联。
