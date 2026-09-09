---
title: Hooks（事件钩子）
description: 用你自己的 Claude Code 风格 hooks.json 响应 agent 生命周期事件——工具调用、提示词、会话开始/结束。
---

# Hooks（事件钩子）

如果你已经在用 Claude Code 的 hooks，dsh-cc 可以近乎原样地运行你现有的
`hooks.json`：command 与 http 执行器始终开启，受支持的事件子集覆盖会话、
提示词、工具、权限、压缩、任务和子 agent 生命周期。本页介绍配置结构、
哪些事件被桥接，以及各执行器类型的开关方式。

::: info
dsh-cc 不是 Claude Code，也不是 Claude Code 的包装器。hooks 桥接层只是为
已映射的 CC command-hook 子集提供的兼容路径——全站免责声明见
[兼容性参考](/zh/reference/compatibility)。
:::

## 这适合谁

你想对 agent 的行为做出反应——每次文件读取时提醒、拦截危险的工具调用、
在会话开始时注入上下文、或在权限被拒绝时记录日志——但又不想写原生插件。
你带来一份现有的 Claude Code `hooks.json`（或 settings 文件里的 `hooks`
键），dsh-cc 在它的规范拦截点上运行其中受支持的子集。

## 配置结构

桥接层是 `@dsh-cc/hooks-claude-code` cordis 插件。它的 `configPath` 指向
一个 `hooks.json`——或 settings 文件里的 `hooks` 键——对于桥接层支持的
事件与执行器类型，Claude Code 的 hooks.json 结构原样沿用。在
`cordis.yml` 中挂载：

```yaml
- dsh-hooks-claude-code:
    configPath: ./.claude/hooks.json
    pluginRoot: ./.claude/plugins/my-plugin
    projectDir: .
```

加载规则（照搬包 README 的表述）：

- 配置在加载时**只解析一次**。
- `configPath` 是**进程级**的：相对路径按加载时进程的启动 cwd 解析，因此
  单份配置作用于整个进程——目前还没有按会话（`session/new.cwd`）的配置
  发现机制。
- 读取/解析失败会被容错处理——包括在消费 matcher 的事件上出现非法的正则
  matcher——桥接层记录一条警告并不注册任何内容，而不是让启动崩溃。未知的
  handler `type` 会被跳过并给出警告。
- 没有设置 per-hook `timeout` 的 hook 使用协议的参考默认值
  （`dsh-hook-protocol` 的 `DEFAULT_HOOK_TIMEOUT_MS`，10 分钟——即 CC
  默认值）。
- hook **本身**运行在 agent 的会话工作区中：对 agent 作用域的拦截点，桥接
  层把会话的 `cwd` 作为 hook 进程的工作目录，因此 hook 的 `pwd`/相对路径
  操作的是用户的项目树，而不是服务端启动目录。

dsh-cc 仓库自身就带有一份纳入版本管理的 `hooks.json`（CC preset 从启动
cwd 加载它）用于自举（dogfooding）。

其他插件选项（除注明外均可选）：`pluginRoot` 替换命令字符串中的
`${CLAUDE_PLUGIN_ROOT}`；`projectDir` 替换 `${CLAUDE_PROJECT_DIR}` 并设置
对应的 hook 环境变量（省略时默认为会话 cwd）；`defaultTimeoutMs` 是 hook
未自行设置时的 per-hook 超时；`stderrSummaryMaxChars` 限制持久化的 stderr
摘要字符数；`allowedHttpHookUrls` 是 http hook 的 URL 白名单；
`httpAllowedEnvVars` 列出允许插值到 http hook header 值中的环境变量名。

## 事件覆盖

桥接层支持 **Claude Code hook 事件中的 18 个**：

| 事件 | 状态 | 桥接层的行为 |
| --- | --- | --- |
| `SessionStart` | 支持 | additionalContext 注入新会话（不能阻塞）；部分——纯 stdout 上下文、`initialUserMessage`、`sessionTitle`、`watchPaths`、`reloadSkills` 和 `CLAUDE_ENV_FILE` 不支持 |
| `UserPromptSubmit` | 支持（部分） | 阻塞与 JSON `additionalContext` 可用；纯 stdout 上下文、`sessionTitle` 和 `suppressOriginalPrompt` 不支持 |
| `PreToolUse` | 支持（部分） | `deny`、`ask` 和 `allow`（预批准）可用；`additionalContext` 作为结果后上下文注入；`updatedInput` 只记录并告警、不被采纳 |
| `PostToolUse` | 支持 | 阻塞反馈、JSON `additionalContext`，以及 `updatedToolOutput` / `updatedMCPToolOutput` 可用 |
| `PostToolUseFailure` | 支持 | 只观察；在工具结果为错误时触发，与同一次调用上的 `PostToolUse` 互斥 |
| `Stop` | 支持（部分） | 阻塞会强制再走一轮模型，连续阻塞上限为 8 |
| `SubagentStart` | 支持（部分） | 启动上下文尽力而为（仅限存活的进程内子 agent） |
| `SubagentStop` | 支持（部分） | 只观察；不能阻塞子 agent，也不能向其提供上下文 |
| `PermissionRequest` | 支持 | 集合中唯一的拦截点；`deny` 拒绝，`allow`/`approve` 预批准 |
| `PermissionDenied` | 支持 | 只观察 |
| `Notification` | 部分 | 仅 `permission_prompt` 子类型会触发 |
| `PostCompact` | 支持 | 只观察 |
| `SessionEnd` | 支持（部分） | 只观察；`reason` 恒为 `'other'` |
| `StopFailure` | 支持（部分） | 只观察；把错误映射到 CC 的错误码词汇表 |
| `TaskCreated` | 支持 | 每个新出现的 job id 触发一次 |
| `TeammateIdle` | 支持（部分） | 只观察；仅对被视作子 agent 的 agent 触发 |
| `Setup` | 部分 | 首次运行近似：仅对全新（seeded）会话触发 |
| `SessionResume` | 部分 | 仅在 `resume` 来源时触发 |

按 parity matrix 的表述：`PreToolUse` 桥接了 matcher 支持和
`permissionDecision` 决策契约，但 `additionalContext` 被忽略；
`Notification` 仅桥接 `permission_prompt` 子类型；`Setup` 是首次运行
近似而非完整的上游契约。

**不支持的事件（14 个）**——它们的配置在分组解析之前就被忽略，因此不会
使 hook 注册失效：`PreCompact`、`InstructionsLoaded`、
`UserPromptExpansion`、`MessageDisplay`、`PostToolBatch`、`TaskCompleted`、
`ConfigChange`、`CwdChanged`、`FileChanged`、`WorktreeCreate`、
`WorktreeRemove`、`Elicitation`、`ElicitationResult` 和 `UserPromptCancel`
（dsh 没有 cancel 缝隙——桥接层不做有损近似）。`Notification` 的
idle / `auth_success` / `elicitation` 子类型以及 `SessionResume` 的
`clear`/`compact` 来源同样未映射。

大多数 emit 点是**分离（detached）运行**的——没有任何扩展点会等待
`SessionStart`/`SubagentStart`/`SubagentStop`/`PermissionDenied`/
`Notification`/`PostCompact`/`SessionEnd`/`StopFailure`/`TaskCreated`/
`TeammateIdle`/`Setup` hook。`PermissionRequest` 是集合中唯一的拦截点。
同一拦截点上多条来自文件的 hook 按**配置顺序串行**运行，并按最严格方向
合并（`deny > ask > allow`）。

每个 agent 作用域的 stdin 载荷都携带 `session_id` 和字符串形态的
`transcript_path`（会话持久化可用时解析，否则为 `''`）。hook 问题
（`timeout`、`exit-code`、`parse-failure`、`spawn-failure`、`stop-cap`、
`config`）会追加写入 `<dsh home>/hooks/diagnostics.jsonl`，并可在
`/doctor` 中查看。

## 执行器类型

配置解析器接受全部四种 CC 执行器类型，按 `type` 分发：

| 执行器 | 可用性 | 说明 |
| --- | --- | --- |
| `command` | 始终开启 | shell 执行器（经 `ctx.shell`） |
| `http` | 始终开启 | 把 hook 输入 JSON POST 到 `hook.url`；200 响应体按结构化 stdout 解析，因此 200 且含 `permissionDecision:deny` 的响应体会阻塞；header 值只对 hook 的 `allowedEnvVars`（与 `httpAllowedEnvVars` 取交集）中列出的 `$VAR`/`${VAR}` 做插值；`allowedHttpHookUrls` 限制目标地址 |
| `prompt` | 受开关控制 | fork 一个一次性 subagent；需要 `enablePromptHooks: true`，否则跳过并告警 |
| `agent` | 受开关控制 | fork 一个验证 subagent；需要 `enableAgentHooks: true`，否则跳过并告警 |

对受控执行器，照搬原文表述：这些执行器**默认关闭**：启用它们需要
`enablePromptHooks: true` / `enableAgentHooks: true`，否则 hook 被跳过并
给出警告（沿用旧的安全默认值）。hook 输入 JSON 通过 `$ARGUMENTS` 嵌入
hook 的 `prompt` 模板，fork 的文本输出按与 command hook 相同的结构化输出
词汇解析。`prompt`/`agent` hook 的代价是一次模型请求而非一个 shell 进程；
省略 `model` 时默认走 `resolve('haiku')` 便宜通道，per-hook `timeout`
不会作用于 fork。

`args`、`async`、`asyncRewake`、`shell`、`if`、`once`、`statusMessage`
等 command handler 选项不被采纳。匹配到的 handler 串行运行且不去重。

## 一个最小可用的例子

一条在每次 `PostToolUse` 事件上运行 shell 命令的配置，只使用桥接层采纳的
字段——matcher 的主体是工具名，`type: 'command'` 的 handler 走 shell
执行器，省略 per-hook `timeout` 时回退到 10 分钟默认值：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/scripts/after-bash.sh"
          }
        ]
      }
    ]
  }
}
```

把文件保存（例如 `./.claude/hooks.json`），把插件的 `configPath` 指向它，
脚本就会在会话工作区里于每次 `Bash` 工具调用之后运行。阻塞结果会以
`blocked by PostToolUse hook` 反馈，除非 hook 自行提供理由。

## 已知限制

- 进程级只有一份 `configPath` 且加载时只解析一次；Claude Code 的项目、
  用户、策略多层发现与热重载均未实现（插件自带的 hooks 改由插件加载器
  挂载——见[插件](/zh/guide/plugins)）。
- `systemMessage` 以持久的暗色提示行呈现（模型可见）；
  `suppressOutput` 和 `terminalSequence` 不被应用。
- `{"continue": false}` 通过 `agent.cancel({kind:'hook'})` 中止运行。
- 在 Claude Code 会提供这些字段的地方，已映射事件的载荷省略 `prompt_id`、
  `transcript_path`、`permission_mode` 和 `effort`。

## 下一步

- [Skills](/zh/guide/skills) — agent 按需加载的可复用指令包。
- [Plugins](/zh/guide/plugins) — hooks 桥接层自身挂载所依赖的更广泛的扩展机制。
- [Extension formats](/zh/reference/extension-formats) — dsh-cc 识别的 CC 方言配置格式完整目录。
