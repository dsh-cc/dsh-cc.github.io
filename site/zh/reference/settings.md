---
title: 设置级联
description: dsh-cc 如何在五个层级间解析 settings.json、合并它们，并安全地应用环境变量。
distilled-from: dsh-cc v0.6.0
---

# 设置级联

如果你已经有一份 Claude Code 风格的 `settings.json`，dsh-cc 可以直接读取它。设置来自五个层级，自低向高合并，并带有兼容 Claude Code 的 `permissions` schema、camelCase 键别名，以及受到保护的 `env` 段。本页介绍这些文件放在哪里、如何合并，以及最可能让你意外的两条规则（`env` 门控与键别名）。

## 五个层级

设置级联插件（`@dsh-cc/settings-cascade`）将五个文件来源**自低向高**合并——user < project < local < flag < policy——底层是插件默认值：

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

## 迁移：机制就绪，尚无实际迁移

`@dsh-cc/settings-migrations` 提供了一套版本化的迁移机制：`defineMigration({ version, name, migrate(ctx) })` 注册进模块注册表（按 version + name 去重），`runMigrations()` 以升序原子地应用所有 `version` 大于已记录 `migrationVersion` 的迁移（状态存于 `<home>/migrations.json`，默认 `$DSH_HOME` / `~/.dsh`）——批次中途失败则什么也不写，下次挂载重试，因此迁移必须幂等。`guard(ctx)` 返回 `false` 会跳过该迁移但不阻塞版本推进。

截至 dsh-cc v0.6.0，**尚无任何具体迁移**——注册表为空，cc 与 dsh 都没有需要迁移的旧版设置格式；第一个真实迁移将随第一次设置结构变更落地。当前挂载该插件是空操作。该机制目前也只作用于用户层 `settings.json`——project/local/flag/policy 层还不是迁移目标。

## Profile 级微调

除 `settings.json` 之外，你的 profile 仍是普通的 dsh 组合。本地微调可以放在：

```text
~/.dsh/profiles/tui/cordis.patch.yml
```

它们在已安装的 bundle 之后应用。

## 另请参阅

- [/zh/reference/env-vars](/zh/reference/env-vars) — dsh-cc 读取和设置的环境变量。
- [/zh/guide/permissions](/zh/guide/permissions) — `permissions` schema、模式与规则语义。
- [/zh/guide/from-claude-code](/zh/guide/from-claude-code) — 迁移现有的 Claude Code 配置。
