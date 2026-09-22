---
title: 交互式会话基本功
description: 日常使用 dsh-cc TUI——启动、恢复、检查会话，以及在 worktree 中安全并行开发。
---

# 交互式会话基本功

本指南面向把 `dsh-cc` 作为日常终端编程助手的开发者，覆盖会话生命周期、最常用的斜杠命令，以及如何在 git worktree 中并行开展隔离工作。在 `tui` profile 上 CC Mode 是默认项，因此启动 `dsh-cc` 即进入熟悉的 CC 风格 TUI。

前置条件：已安装 `@dsh-cc/cli` 启动器（`npm install -g @dsh-cc/cli`），并且有一个可用的 dsh 部署。

## 会话生命周期

在项目根目录启动一个新会话：

```sh
$ dsh-cc -n
```

按 id 恢复指定会话：

```sh
$ dsh-cc --resume <id>
```

继续本项目最近一次会话：

```sh
$ dsh-cc -c
```

如果传入 `-c`/`--continue` 但没有历史会话，TUI 会提示 "no previous session to continue"。不带显式参数时，TUI 读取自己的项目 resume 标记，存在则自动恢复最近会话。

在会话内，`/resume` 列出会话，用于恢复被中断的会话。注意这是部分对齐：`/resume` 只负责列出会话，切换由宿主负责（在 shell 中执行 `dsh --resume <id>`）。用 `/rename <标题>` 重命名当前会话；完整命令见[斜杠命令目录](/zh/reference/commands)。退出时，TUI 会向回滚缓冲区打印一条退出提示，包含会话 id 和恢复命令；设置 `DSH_CC_DISABLE_EXIT_TIP='1'` 可将其关闭。

## 检查工作状态

CC preset 暴露了不断增长的命令面，最常用的有：

| 命令 | 作用 |
| --- | --- |
| `/cost` | token / 费用信息 |
| `/status` | 环境和会话状态 |
| `/diff` | 查看 CLAUDE.md / settings 差异 |
| `/doctor` | 会话健康检查（`--verbose` / `--json`） |

TUI 还提供对话导出、用量/上下文显示、todo 查看、审批、排队输入和本地 shell 命令（对话导出由 TUI 本地的 `/export-md` 提供）。

## 上下文管理

上下文处理：`/compact` 可带保留指令压缩会话；TUI 本地的 `/clear`（别名 `/new`、`/reset`）开启全新对话且旧会话仍可恢复（详见[斜杠命令目录](/zh/reference/commands)）。记忆层（`CLAUDE.md` 风格的上下文，外加专门用于持久记忆的写入通道，按工作区隔离）承载长期知识；可用 `/memory` 查看记忆。

还可选开启 CCR（compress-cache-retrieve）压缩：当 `cc-context-compression.enabled: true` 且 `mode: on` 时（默认 mode 是 `dry-run`，只测量不替换），大体量的 grep/日志形工具结果会被替换为一个全新的文本块加一条 `[dsh-cc compressed BEFORE→AFTER tokens. Original: ccr://<hash>]` 标记。原文缓存在 `$DSH_HOME/ccr/<projectKey>/<hash16>`（projectKey = `sha256(会话工作目录)` 的前 16 位十六进制）下的内容寻址存储中，这是一个上限 200 条、TTL 为 3600 秒的 LRU 存储，可通过 `context_retrieve` 工具逐字还原。配置项：`min-bytes`（8192）、`min-savings-ratio`（0.4）、`protected-tools`——显式设置会整体替换默认列表，不是并集。同一个 `cc-context-compression` 命名空间还带有一组 reducer 配置项，全部默认关闭（ships dark）：`reducer-enabled`（false）、`reducer-commands`、`reducer-max-input-tokens`（30000）、`reducer-min-savings-ratio`（0.5）、`reducer-max-tokens`（1024）、`reducer-timeout-ms`（10000）、`reducer-alias`（`'haiku'`）。reducer 把确定性路由器拒绝处理的嘈杂构建/测试输出升级为一次廉价通道提取，产出一份回执（failing-test 列表加逐字证据引用），先做确定性校验再替换，任何一步失败都回退为原始字节；未路由或继承 provider 的通道会被跳过。注意：回放和 `/export` 保留的是压缩后的形态。

### 微压缩与廉价通道摘要

微压缩（microcompaction）是不调用模型、可重放安全的陈旧工具结果折叠：除最近 `retainResults`（10）条工具结果外，更旧的结果会被替换为确定性的 `[... tool result compacted ...]` 占位符，最多 `placeholderChars`（256）个码点。它是 preset 插件配置（profile 层面的调整，`auto` 默认 `false`），不是一个 settings 命名空间。`auto: true` 时，连续 `failureCap`（3）次失败会让该 pass 对本会话暂停，并注入一条模型可见的提示，指向手动的 `/compact`；之后任何一次成功都会重新武装。tool-use-summary 开启时，陈旧占位符会在强制的不可信包装内携带摘要。

工具使用摘要（tool-use-summary，TUS）默认开启（命名空间 `cc-tool-use-summary`）：每个较大的工具结果都会得到一份 fire-and-forget 的廉价通道摘要（默认别名 `haiku`，≤150 词，在账本中截断到 800 字符），按 `callId` 记录，压缩时直接消费摘要而不再读取原始输出。默认值：`enabled` true、`topLevelOnly` true、`minResultBytes` 4096、`maxSummariesPerSession` 200、`maxTokens` 256、`timeoutMs` 5000、`excludeTools` `['structured_output']`、`retentionDays` 7（0 = 仅内存）、`upgradeMicroPlaceholders` true。账本位于 `$DSH_HOME/tool-use-summary/<sessionId>.jsonl`。摘要在消费侧会被不可信包装；context-crusher 桩永远不会被替换（它们的 `ccr://` 定位符必须保留）。

成本门控的计划步骤压缩（`cc-compaction-cost-gate`）默认关闭（ships dark，`enabled` false、`mode` `'dry-run'`）：完成一个计划步骤（一次 `todo_write` 到 completed 的状态转移）会武装一个边界，agent 下次空闲时评估压缩是否划算——预期输入 token 节省对比重写成本加债务，`margin` 1.0——划算才真正压缩。真实压缩后进入 `cooldown-ms`（600000）冷却；`window-pressure-tokens` 未设置则没有旁路；`model-table` 可选。账本位于 `$DSH_HOME/compaction-cost-gate/<projectKey>.jsonl`；连续 3 次真实失败会让本功能对会话暂停，并给出指向手动 `/compact` 的提示；`dry-run` 模式把不等式两侧都记入账本但不压缩。

### 可选预览

三个预览功能只读用户层配置：命名空间只存在于用户层的 `~/.dsh/settings.json`——项目作用域永远不会被读取（是不可见，而非拒绝）。

- **prompt-suggest**（`cc-prompt-suggest`，`enabled` false）：turn-stop 时通过一次廉价通道旁路查询（`alias` `'haiku'`、`timeoutMs` 4000、`maxTokens` 128）预测你的下一条输入，≤120 字符，5 分钟 TTL。在 TUI 自动补全中只按前缀匹配呈现——触发字符 `/`/`@` 或强制 Tab，空输入永不触发；输入前几个字符后按 Tab 即可补全。
- **post-edit-verify**（`cc-post-edit-verify`，`enabled` false）：一次被接受的 edit/write 之后，运行第一条匹配的 `rules` 条目 `{glob, command, timeout-ms?}`（POSIX sh，会话工作目录），并把结果以 `[auto-verify]` 块追加到同一个工具结果上。配置项：`rules` `[]`、`debounce-ms` 5000（只用于突发标记——每次匹配的编辑仍会执行）、`max-output-bytes` 4096、`verbose-on-success` false、每条规则的 `timeout-ms` 60000，上限 120000。成功时只静默输出一行，除非开启 verbose。
- **edit-recovery-hint**（`cc-edit-recovery-hint`，`enabled` false）：当 edit 因多行 `old_string` 未找到而失败时，作为旁带上下文追加一段固定的静态建议（改用单行锚点重试，或按 hunk 拆分编辑；只有锚点也失败时，才重新读取目标区域）。歧义失败（"appears more than once"）刻意不匹配；提示文本是静态的——不会插入任何工具输出。

## 安全地并行开发

若要把实验与主检出隔离开，可在 git worktree 中启动会话：

```sh
$ dsh-cc --worktree my-experiment
```

`--worktree [name]` 会在 `<repoRoot>/.claude/worktrees/<slug>` 下的 git worktree 中启动会话，分支名为 `worktree-<slug>`（未提供名字时使用随机 slug）。新建的 worktree 会启动全新会话。当目录已存在时再次执行 `--worktree <name>` 会复用它，并回退到默认的自动恢复，因为会话以*项目*（主 git 根目录；worktree 共享它）为作用域。`--resume` / `--new` 仍然优先生效。要求 git 仓库至少有一个提交。

在会话内，`/branch` 提供 worktree 分支管理。worktree 支持面广但上游标记为部分对齐，详见 [Worktrees](/zh/guide/worktrees)。退出时，TUI 会询问保留还是删除该 worktree。

## 下一步

- [模型路由](/zh/guide/model-routing) — 把模型别名映射到你自己的供应商。
- [后台任务](/zh/guide/background-tasks) — 运行并检查后台工作。
- [命令参考](/zh/reference/commands) — 完整的斜杠命令目录。
