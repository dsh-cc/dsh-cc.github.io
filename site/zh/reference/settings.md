---
title: 设置级联
description: dsh-cc 如何在五个层级间解析 settings.json、合并它们，并安全地应用环境变量。
distilled-from: dsh-cc v0.9.5 (4465ee18)
---

# 设置级联

如果你已经有一份 Claude Code 风格的 `settings.json`，dsh-cc 可以直接读取它。设置来自五个层级，自低向高合并，并带有兼容 Claude Code 的 `permissions` schema、camelCase 键别名，以及受到保护的 `env` 段。本页介绍这些文件放在哪里、如何合并，以及最可能让你意外的两条规则（`env` 门控与键别名）。

## 五个层级

设置级联以 `@dsh-cc/settings` 的 `cascade` 入口发布，将五个文件来源**自低向高**合并——user < project < local < flag < policy——底层是插件默认值：

| # | 层级 | 路径 | 说明 |
|---|-------|------|------|
| 1 | User | `$DSH_HOME/settings.json`（默认 `~/.dsh/settings.json`） | 唯一可写层；`update()`/`persist()` 的写入都落在这里。 |
| 2 | Project | `<cwd>/.claude/settings.json` | 始终位于启动目录。 |
| 3 | Local | `<git 主检出根或顶层>/.claude/settings.local.json` | gitignore 的个人文件；按 git 风格上提（见下文）。 |
| 4 | Flag | `--settings` 文件，及其上内联 `--settings` 内容合并于其上 | 仅限当前会话。 |
| 5 | Policy | 按顺序取第一个非空来源：远程设置 > 系统托管文件 > 用户可写托管文件 | 优先级最高。 |

**高层胜出。** 各来源递归深合并：高层填充低层省略的键，并覆盖其携带的值。插件注册 `base` 与 schema 默认值解析在所有文件层之下，因此缺失文档时仍会像叶子 provider 一样解析。

::: tip `settings.local.json` 的 git 风格上提
当启动目录位于 git 仓库内时，local 文件从 git **主检出根**（worktree）或**顶层**（从子目录启动）读取，与 Claude Code 一致。文件*内部*的路径仍然相对于启动目录解析。当仓库根是 `$HOME`、在 Windows 上，或仓库根/`.git`/`.claude` 的属主无法确认为当前用户（fail-closed）时，上提回退到启动目录。
:::

### 值得了解的合并规则

- **权限数组取并集，`deny` 胜出。** `allow`、`deny`、`ask` 数组跨层级拼接去重；并集后的 `deny` 集合会从 `allow` 中移除——高层的 `deny` 始终压过低层的 `allow`。
- **其他数组整体替换。** 例如 `additionalDirectories`：高层整体覆盖。
- **配置错误会大声失败。** 存在但无法解析的设置文档（JSON 损坏、根不是对象）会导致插件加载失败。文件不存在则不贡献任何内容，也不是错误。
- **写入是对用户文件的外科式增量。** 只有调用方实际修改的键才会写入 `~/.dsh/settings.json`；来自高层级的继承值不会被复制进来。多个 dsh 进程并发写同一用户设置文件可能静默丢失更新（单进程 profile 不受影响）；unset 一个继承自低层的键不会跨重启持久化。

### `enabledPlugins` 与插件状态

`enabledPlugins` 键（精确的 `name@marketplace` id）决定哪些已安装的 Claude Code 格式插件在启动时挂载。用于插件发现时，级联会多出一个 dsh 层：claude-user → dsh-user → project → local。所有 `/plugin` 修改只写入 dsh home（`$DSH_HOME` / `~/.dsh`，包括 `~/.dsh/settings.json` 里 user 作用域的 `enabledPlugins` / `extraKnownMarketplaces` 条目）；Claude home 保持只读可见、从不写入。详见[插件](/zh/guide/plugins)。

## 热重载

文件监视器（chokidar）监视参与合并的每一个具体设置文件。当其中之一在磁盘上变化时，级联无需重启即重新加载并重新合并。重载时遇到损坏或不可读的来源绝不会拖垮存活会话：最后一份完好的文档保持发布状态，失败记为警告，监视器继续监视。重载与持久化在单一操作链上串行执行，因此持久化与外部编辑竞争时会基于最新字节重试，而不是互相覆盖。

## `env` 段：两阶段应用

任何设置文件中的顶层 `env` 段都会从合并后的文档中拆出，并以字符串强转的键值对形式暴露。它分**两个阶段**应用：

1. `applyEnv()` 赋值普通变量——正常应用。
2. `applyTrustedEnv()` 额外赋值会改变环境行为的变量，且**仅在你授予信任后**运行。

第二阶段由 `DANGEROUS_ENV_VARS` 门控——一个静态允许列表，收录会改变进程行为或库加载的变量。其中包括（原文照录）：

```
LD_PRELOAD
DYLD_INSERT_LIBRARIES
PATH
```

（还有 `LD_LIBRARY_PATH`、`DYLD_LIBRARY_PATH`、`PYTHONPATH`、`NODE_OPTIONS`、`NODE_PATH`、`RUBYLIB`、`PERL5LIB`）。列表是固定的；部署特定的变量需要显式的扩展点才能首次使用。

## 键别名：`statusLine` → `statusline`

为了让与真实 Claude Code 检出共享的 `settings.json` 原样可用，被识别的 camelCase 顶层键会被复制到 dsh 原生的 kebab-case 命名空间上。白名单映射**就是契约**——没有模糊匹配，未知的 camelCase 键永远不会被别名化：

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.dsh/statusline.sh",
    "padding": 0,
    "refreshInterval": 10
  }
}
```

规则，一字不差：

- 只有当 camelCase 键的值是**普通对象**且 kebab 键在合并文档中**不存在**时，才注入别名。
- dsh 原生键已存在则原样胜出（即 `statusline` 压过 `statusLine`）。
- 非对象值（例如字符串形式的 `statusLine`）被忽略。

目前白名单中只有**一条**条目：`statusLine` → `statusline`。在 `tui` profile 上，这个键会用你自己的 shell 命令替换内置的底部状态行；它可以放在 `~/.dsh/settings.json` 或项目的 `.claude/settings.json` 中。

## 插件启用：`enabledPlugins`

插件发现读取 `enabledPlugins` 映射，按双 home 分层：claude-user（`$CLAUDE_CONFIG_DIR` / `~/.claude`）→ dsh-user（`$DSH_HOME` / `~/.dsh/settings.json`）→ project → local，后读文件按键覆盖。`/plugin` 的修改只写入 dsh home——用户作用域的 `enabledPlugins` 和 `extraKnownMarketplaces` 条目落在 `~/.dsh/settings.json`，Claude home 保持可读、绝不写入。完整的双 home 规则见 [插件](/zh/guide/plugins)。

## 设置迁移：已在 v0.8.3 移除

仅含机制、从未有实际迁移的 `@dsh-cc/settings-migrations` 包已在 dsh-cc v0.8.3 中移除。该注册表自发布以来一直为空——cc 与 dsh 都从未存在过具体迁移。当第一个真实的设置结构变更落地时，该能力会随之回归。

## Profile 级微调

除 `settings.json` 之外，你的 profile 仍是普通的 dsh 组合。本地微调可以放在：

```text
~/.dsh/profiles/tui/cordis.patch.yml
```

它们在已安装的 bundle 之后应用。微压缩 pass（`@dsh-cc/compaction-micro`：`retainResults` 10、`auto` false、`placeholderChars` 256、`failureCap` 3）与其他 preset 行一样，通过这份 profile cordis 配置调优——它没有 settings 命名空间。

## Preset 功能命名空间

若干 CC preset 功能通过 `~/.dsh/settings.json` 中各自的 settings 命名空间调优：

| 命名空间 | 键（默认值） | 调优对象 | 更多 |
| --- | --- | --- | --- |
| `cc-onboarding` | `suppressed`（未设置/false） | 设为 `true` 可永久跳过首次运行的 onboarding 流程；用 `/onboard` 重新开启。 | [快速开始](/zh/quickstart) |
| `cc-learn` | `enabled`（true）、`days`（14）、`min-occurrences`（2） | `/learn` 命令的时间窗口与写入门槛；`enabled` 同时控制 `manage_skill` 工具。 | [记忆体系](/zh/guide/memory) |
| `cc-skill-usage` | `enabled`（true）、`rollup-stale-hours`（24）、`never-loaded-days`（30） | 技能使用遥测：把已提交的技能加载计入按工作区存放的 sidecar 台账，并派生一份效用报告，其降级候选清单仅作报告展示。仅限主 realm；仅限用户层。 | [技能](/zh/guide/skills) |
| `cc-handoff` | `enabled`（true）、`threshold-chars`（8192，仅提示） | 子代理 handoff 存储的开关及其提示性大小阈值。 | [子代理](/zh/guide/subagents) |
| `cc-context-compression` | `enabled`（true）、`mode`（dry-run）、`min-bytes`（8192）、`min-savings-ratio`（0.4）、`protected-tools`、`reducer-enabled`（false）、`reducer-max-input-tokens`（30000）、`reducer-min-savings-ratio`（0.5）、`reducer-max-tokens`（1024）、`reducer-timeout-ms`（10000）、`reducer-alias`（haiku）、`reducer-commands`、`defer-requests`（0）、`defer-margin`（1.5）、`defer-max-age-ms`（1800000）、`defer-urgency-tokens`（未设置） | 大型工具结果的可逆压缩。自 2026-11-11 起默认开启（此前 ships dark），且默认的 `mode: dry-run` 只记账、不重写——在你设为 `mode: on` 之前，任何结果都不会被替换。`reducer-*` 键调优一条保证据的压缩通道，把超大结果交给廉价通道的 side query；默认仍全部处于关闭状态（`reducer-enabled` 默认 false）。`defer-*` 键推迟外化：符合条件的结果先原样进入会话，在达到该次数的主循环发送计数后才替换为标准 stub（0 表示关闭该延迟）。嵌套的 `reducer-decision-gate` 对象（默认 `mode: off`）会在付出 reducer 成本之前，先由 SystemOne 判定这份回执是否值得尝试。 | [交互基础](/zh/guide/interactive-basics) |
| `model-aliases` | 别名条目，外加 `warnOnInherit`（true） | 别名解析背后的 settings 覆盖层；设 `warnOnInherit: false` 可在别名回退到父路由时关掉廉价通道的继承警告。 | [模型路由](/zh/guide/model-routing) |
| `moa` | `enabled`（false）、`acceptance.enabled`（false）、`acceptance.shadow`（false）、`acceptance.tau`（0.7）、`max-escalations`（1）、`judge-route`（gauge）、`classify-budget-tokens`（4000）、`call-budget-ms`（8000）、`context-routing.mode`（off）、`context-routing.timeout-ms`（1500）、`context-routing.max-input-tokens`（4000）、`context-routing.max-under-tier-probability`（0.10）、`context-routing.min-top-probability`（0.60） | 主会话的分层级联路由：System One 分类调用选出满足需求的最低成本通道（`sketch`/`draft`/`blueprint`/`masterplan`），可选的 acceptance judge 会把被拒答案提升一个层级。默认关闭；子代理永不叠加。`context-routing.*` 组把该 argmax 换成上下文感知分类与尾部风险层级策略；默认关闭（`mode: off`）。 | [模型路由](/zh/guide/model-routing) |
| `worktree` | `baseRef`（fresh）、`cleanupPeriodDays`（30） | worktree 的基底选择（`fresh` 使用带过期刷新的缓存 `origin/HEAD`），以及启动时对过期 `worktree-*` worktree 的清扫。 | [Worktree](/zh/guide/worktrees) |
| `actor-contract` | `models`（['glm-*']） | 哪些模型会在 agent 定义中收到 `<!-- actor-contract -->` 人格块；列表为空则关闭该契约。 | [子代理](/zh/guide/subagents) |
| `cc-tool-use-summary` | `enabled`（true）、`topLevelOnly`（true）、`minResultBytes`（4096）、`retentionDays`（7）等 | 大型工具结果的廉价通道摘要，供 compaction 消费；`topLevelOnly` 会跳过子代理会话，`retentionDays: 0` 表示只在内存中保留。 | [交互基础](/zh/guide/interactive-basics) |
| `cc-prompt-suggest` | `enabled`（false）、`alias`（haiku）、`timeoutMs`（4000）、`maxTokens`（128） | 可选开启的下一轮输入建议；只有顶层轮次停止会产生预测，未路由的别名会被跳过而非继承（`onUnrouted: 'skip'`），因此父路由不会被按轮计费。读取完整的 settings 级联（不像下面两个插件那样仅限用户层）。 | [交互基础](/zh/guide/interactive-basics) |
| `cc-post-edit-verify` | `enabled`（true）、`rules`（[]）、`debounce-ms`（5000） | 在 `edit`/`write` 结果被接受后运行你声明的验证命令，并把结果追加到同一条工具结果中。自 2026-11-11 起默认开启（此前需主动开启）；默认 `rules` 为空时不生效——在声明至少一条规则前什么都不会运行。**仅限用户层**（`~/.dsh/settings.json`）；project 层的规则永远不会被读取。 | [交互基础](/zh/guide/interactive-basics) |
| `cc-edit-recovery-hint` | `enabled`（true） | 当 `edit` 因多行 `old_string` 找不到匹配而失败时，追加一条固定的恢复建议。自 2026-10-16 起默认开启（此前 ships dark）。**仅限用户层**；project 层永远不会被读取。 | [交互基础](/zh/guide/interactive-basics) |
| `cc-compaction-cost-gate` | `enabled`（false）、`mode`（dry-run）、`margin`（1.0）、`cooldown-ms`（600000） | 默认关闭；在真正执行 compaction 前先评估压缩收益是否抵得过重写成本，每次真实压缩后进入冷却期。 | [交互基础](/zh/guide/interactive-basics) |
| `cc-completion-gate` | `enabled`（true）、`nudges-per-session`（1） | 回执台账，外加每个会话一次提醒：当某次轮次停止声称已完成（"tests pass"、"committed"、…）却没有相匹配的已执行证据时触发。无论开关如何，哈希回执字段都会记录；经过隐私擦除的 bash 命令头部（≤200 字节）只在开启期间采集。自 2026-11-11 起默认开启（此前 ships dark）。**仅限用户层。** | [交互基础](/zh/guide/interactive-basics) |
| `retry-attendant` | `enabled`（true）、`guidance`（true）、`escalate`（true）、`expire-minutes`（10） | 针对结果不明确的变更类工具调用，"先验证后重试"专员按类别给出建议行；过期窗口内完全相同的重试会升级为询问（ask）。自 2026-10-16 起默认开启（此前需主动开启）。**仅限用户层。** | [交互基础](/zh/guide/interactive-basics) |
| `progress-rebuild` | `enabled`（true）、`max-lines`（120）、`include-verified`（true） | 在一次成功的 compaction 之后，把一份结构化进度简报注入 compaction 之后构建的第一个模型请求。自 2026-10-16 起默认开启（此前 ships dark）。 | [交互基础](/zh/guide/interactive-basics) |
| `cc-turn-rules` | `enabled`（true）、`max-result-bytes`（200000）、`regex-cache-size`（64）、`judged.enabled`（true）、`repeat-reminder.enabled`（true）、`repeat-reminder.thresholds`（[3,5,8]）、`repeat-reminder.include`/`exclude`（[]）、`repeat-reminder.arguments-preview-chars`（500） | Turn rules：带 `trigger` 正则的 Cursor 插件规则在正则命中时作为建议性提醒注入。默认开启，但在存在这类规则之前没有任何效果。该命名空间还携带内置的 repeat-reminder（自 2026-11-11 起默认开启，此前 ships dark；把 `repeat-reminder.enabled` 设为 false 可退出）：当顶层 agent 连续多次发出参数完全相同的同一工具调用时，会在每个默认阈值（`[3,5,8]`）处触发一条建议性提醒，下一次用户输入会重置计数。`judged.enabled` 同样自 2026-11-11 起开启，但当前不生效——judged 引擎仍只是设计稿，尚无任何组件消费该开关。**仅用户层。** | [插件](/zh/guide/plugins) |
| `cc-advisor` | `enabled`（false）、`alias`（haiku）、`budget`（2）、`immune-turns`（3）、`session-cap`（24）、`severities`（三种全选）、`subagents`（off） | 可选的 advisor watchdog：由第二个模型审查每个完成的轮次。**仅用户层。** | [交互基础](/zh/guide/interactive-basics) |
| `cc-lsp-on-write` | `enabled`（true）、`server-name`（serena）、`timeout-ms`（1500）、`max-diagnostics`（8）、`min-severity`（warning）、`tool-names` | 从运行中的 serena MCP server 拉取 LSP 诊断，追加到 `edit`/`write`/`NotebookEdit` 结果。自 2026-11-11 起默认开启（此前 ships dark）；没有挂载 serena MCP server 时不生效（一次惰性警告，原样透传）。**仅用户层。** | [交互基础](/zh/guide/interactive-basics) |
| `cc-secrets` | `extraPatterns`、`redactCrusherStore` | 为单向密钥脱敏追加正则源；脱敏作用于 `/export` 输出和 context-crusher 存储。 | [斜杠命令](/zh/reference/commands) |
| `cc-foreign-rules` | `disabled` | 关闭从会话 cwd 收集其他 agent 规则文件（cline/windsurf/copilot）并放入 `cc:foreign-rules` 提示段的行为。 | [兼容性](/zh/reference/compatibility) |
| `cc-model-cycling` | `cycleOrder` | TUI 中 `Ctrl+P` / `Shift+Ctrl+P` 循环切换的别名列表。 | [模型路由](/zh/guide/model-routing) |
| `config-snapshot` | `config-snapshot.enabled`（true） | 每次构造会话都向 `<dshHome>/config-snapshot/<encodedId>.jsonl` 写入一行 JSONL（dsh-cc 版本、harness 版本、preset id、插件清单）；仅用于观测——异步写入器 fail-open，从不阻塞会话创建。 | — |
| `cc-compaction-pinning` | `enabled`（true）、`pinned-source-kinds`（`['turn-rules','edit-recovery-hint']`）、`max-pinned`（16，范围 1-64）、`max-pinned-bytes`（16384，范围 1024-262144） | 把治理类用户消息（turn-rules 提醒、编辑恢复提示）原样收进按会话分配的定长 FIFO 环，并在一次摘要式 compaction 报告这些消息被遮蔽后按原样重新追加。默认开启；**仅限用户层**。 | [交互基础](/zh/guide/interactive-basics) |
| `cc-input-ledger` | `enabled`（true）、`include-subagents`（true）、`max-sections-per-row`（64，范围 8-256）、`max-rows-per-file`（2000，范围 100-100000） | 三个只观测的监听器把不含内容的度量行（段与消息来源的构成、UTF-8 字节数、8 字符本地哈希——绝不含文本）追加到 `$DSH_HOME/input-ledger/<projectKey>/<sessionId>.jsonl`。永不改写请求；挂载按引用计数。 | [交互基础](/zh/guide/interactive-basics) |
| `cc-input-budget` | `enabled`（true）、`mode`（observe）、`enter-budget-bytes`（24576，范围 4096-262144）、`advisory-budget-bytes`（8192，范围 512-65536）、`memory-budget-bytes`（16384，范围 1024-131072）、`defer-ttl-steps`（3，范围 1-16） | 一道最外层的 pre-step 关卡按内容类别给最终的 enter 批次做字节预算：governance、task、passthrough 三类从不裁剪也从不延迟，`memory` 与 `advisory` 则按各自预算 FIFO 裁剪，被裁下的消息进入延迟队列，按会话内单调递增的 `gateSeq` 计龄。出厂只观测（`mode: observe` 只记录决策、原样返回批次）；`mode: enforce` 才真正执行，并重置延迟队列。 | [交互基础](/zh/guide/interactive-basics) |
| `cc-skill-recommendation` | `mode`（off）、`timeout-ms`（5000，范围 100-10000）、`max-input-tokens`（8192，范围 512-16384）、`max-candidates`（128，范围 1-256）、`batch-size`（16，范围 1-32）、`max-task-chars`（2048，范围 64-8192）、`max-metadata-chars`（2048，范围 128-8192）、`min-relevance-index`（3，范围 0-4）、`min-prerequisites-met`（0.8，范围 0-1）、`max-recommendations`（3，范围 1-10）、`cache-entries`（128，范围 0-1024）、`cache-ttl-ms`（60000，范围 0-300000）、`min-coverage`（1，范围 0-1） | 建议性的 `recommend_skill` 工具：把可见的技能目录对照任务做判断，返回少数几个技能名，附相关性及前置条件证据。只读——从不读取技能正文、不执行技能、不改变可调用性。cc 与 vwa preset 都挂载但默认关闭（`mode: off`）；`shadow` 只记录，`active` 才返回名单。需要可选的 decision 运行时（`ctx.systemoneDecisions`）；缺失时返回 `unavailable`。 | [技能](/zh/guide/skills) |
| `cc-memory-section` | `truncate`（true）、`max-bytes`（24576，范围 1024-65536）、`description-max-bytes`（160，0 或范围 8-1024） | system-prompt 记忆段的字节预算；该段现在渲染的是所有层合并而成的一份带作用域标签的主题文件目录：`MEMORY.md` 仍留在磁盘上作为 curator 索引与排序来源，但不再进入提示词。`truncate: false` 渲染完整目录；超预算时从交错顺序的底部整条丢弃。每次渲染实时读取；非法值整体拒绝，从不截断取整。 | [记忆体系](/zh/guide/memory) |
| `cc-subagent-catalog` | `truncate`（true）、`max-bytes`（8192，暂定，范围 1024-65536）、`min-entry-bytes`（40，范围 20-400） | 对 `Available subagents` 名单做字节封顶：先保留每个 agent 名，把每条 `whenToUse` 按 UTF-8 安全截断；若仍溢出，尾部折叠成只列名字的一行。`truncate: false` 渲染不封顶的完整名单。`max-bytes` 的默认值是暂定值。 | [子代理](/zh/guide/subagents) |
| `systemone-decisions` | `max-attempts-per-session`（100）、`max-input-tokens-per-session`（1000000）、`max-output-tokens-per-session`（100000）、`max-retries`（0，范围 0-2）、`routes`（{}）、`ledger-max-bytes`（10485760，最小 1048576） | 可选 decision 运行时背后的持久决策台账：按会话的配额、只能收窄 gauge 通道的按别名 `routes` 钉定行，以及 `/cost` 在独立的 **SystemOne decisions** 区块中渲染的 JSONL 台账。受信任命名空间——只有 user、managed 与显式来源生效；project 与 local 永远无法提高配额或放宽边界。 | [模型路由](/zh/guide/model-routing) |
| `cc-tool-discovery` | `mode`（off）、`timeout-ms`（1200，范围 100-5000）、`max-input-tokens`（4096，范围 512-16384）、`max-candidates`（64，范围 1-128）、`batch-size`（8，范围 1-16）、`max-query-chars`（2048，范围 64-8192）、`max-metadata-chars`（2048，范围 128-8192）、`min-relevance-index`（3，范围 0-4，experimental）、`min-direct-fit`（0.75，范围 0-1，experimental）、`max-activations`（3，范围 1-20）、`cache-entries`（128，范围 0-1024）、`cache-ttl-ms`（60000，范围 0-300000） | 延迟工具之上的可选语义发现层：对每个获准进入的候选独立做相关性判断，因此没有字面重叠的查询也能命中正确的延迟工具。`off` 时词法路径逐字节不变，`shadow` 只给建议，`active` 按确定性顺序激活被判定的名字——数量封顶，并在加载前重新过一遍单工具权限门，因此建议永远不会放宽作用域。 | — |

另有三个命名空间只存在于 VWA agent preset 内：

| 命名空间 | 键（默认值） | 调优对象 |
| --- | --- | --- |
| `vwa-argument` | `semantic-enabled`（false）、`review-alias`（sonnet）、`review-claims-batch-size`（1，范围 1-4） | Lane-2 论证工具：`semantic-enabled` 控制语义工具的挂载——为 false 时语义工具不挂载，但 `/vwa` 命令仍然挂载，语义评审处于不生效状态；`review-alias` 是审查方使用的模型别名；`review-claims-batch-size` 决定连续的 `claims` 评审任务如何成批。 |
| `vwa-evidence` | `enabled`（vwa preset 内为 true）、`nudge-budget`（4） | VWA 项目的证据工具，包括其 nudge 预算。 |
| `vwa-preset` | `selectedDefault`（缺省） | `/preset` 指向的已保存默认 agent preset；缺省表示部署默认值 `cc`。 |

## 另请参阅

- [/zh/reference/env-vars](/zh/reference/env-vars) — dsh-cc 读取和设置的环境变量。
- [/zh/guide/permissions](/zh/guide/permissions) — `permissions` schema、模式与规则语义。
- [/zh/guide/from-claude-code](/zh/guide/from-claude-code) — 迁移现有的 Claude Code 配置。
