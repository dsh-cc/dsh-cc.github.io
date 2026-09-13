---
title: 环境变量
description: dsh-cc 读取和设置的环境变量一览，默认值取自 launcher 与 TUI 源码。
distilled-from: dsh-cc v0.6.3
---

# 环境变量

本页汇总启动 dsh-cc 时涉及的环境变量：launcher 引导使用的家目录、`dsh-cc`
launcher 传递给 TUI 插件的恢复/工作树（worktree）约定，以及 TUI 的紧急开关。
下列变量名、取值与默认值均逐字摘自 v0.6.3 的
[`packages/launcher/tui`](https://github.com/dsh-cc/dsh-cc) launcher 与 TUI
源码，另有一个来自插件加载器的兼容变量。

## 变量参考

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | dsh 家目录的根。launcher 以 `process.env.DSH_HOME || join(homedir(), '.dsh')` 解析它来定位 `profiles/tui`，并为 Node 编译缓存提供默认路径。 |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Claude 家目录。插件发现和 Claude Code MCP 配置发现从这里读取，且始终保持完全可读。自 v0.6.0 起它不再搬移插件管理的写入位置——所有 `/plugin` 修改都落在 `DSH_HOME` 下，如需换位置请设置 `DSH_HOME`（见 [插件](/zh/guide/plugins)）。 |
| `DSH_CC_PROFILE` | `tui` | 由 launcher 设置到派生的 `dsh` 子进程上；TUI 插件以 `process.env.DSH_CC_PROFILE || 'tui'` 读取它来报告当前 dsh profile。 |
| `DSH_CC_RESUME_SESSION` | *（由 launcher 推导）* | launcher 专属。设为会话 id 表示恢复该会话（`--resume <id>` / `--resume=<id>`），设为空字符串表示显式全新开始（`--new`/`-n`，或新建的 worktree）。launcher 会从继承环境中清除该变量，仅根据本次 argv 重新推导——不要手动设置。 |
| `DSH_CC_AUTO_RESUME` | *（由 launcher 推导）* | launcher 专属。仅当 `DSH_CC_RESUME_SESSION` 未定义（即没有显式 `--resume`/`--new`）时设为 `'1'`；此时 TUI 读取自己的项目恢复标记。不要手动设置。 |
| `DSH_CC_CONTINUE` | *（由 launcher 推导）* | launcher 专属。传入 `-c`/`--continue` 时设为 `'1'`；若没有恢复标记，TUI 会显示"没有可继续的上一个会话"提示。不要手动设置。 |
| `DSH_CC_WORKTREE` | *（由 launcher 设置）* | 由 launcher 设为一段 JSON 描述（`repoRoot`、`worktreePath`、`branch`、`baseHead`），让 TUI 将该会话识别为 launcher 管理的 worktree 会话，并在 `/quit` 时询问保留还是移除该 worktree。 |
| `DSH_CCTUI_UI_MODE` | `regular` | TUI 显示模式：`regular` 或 `fullscreen`。优先级高于插件配置，配置高于默认值——当某个 profile 固定了 fullscreen 而终端无法适应时，用它作为即时逃生门。 |
| `DSH_CCTUI_ALLOW_NO_TTY` | *（未设置）* | 设为 `'1'` 允许在非交互终端（stdout 不是 TTY）下挂载 TUI。 |
| `NODE_COMPILE_CACHE` | `<DSH_HOME>/.cache/node-compile-cache` | Node 的模块编译缓存目录。launcher 在派生的 `dsh` 子进程上为其设置默认值，使编译产物跨启动复用；用户已设置的值始终优先。 |

::: warning
`ANTHROPIC_*` 环境变量**不被**支持。根据 CC parity 矩阵，它们列在模型别名的
后续事项（follow-up）中——dsh-cc 目前对它们没有 Anthropic 语义。请改用设置
（settings）配置模型，参见 /reference/settings。
:::

## 用法

单次调用退出全屏模式（来自 README 的 CC Mode 一节）：

```sh
$ DSH_CCTUI_UI_MODE=regular dsh --profile tui
```

launcher 首次运行会用三个 CC bundle 引导 `$DSH_HOME/profiles/tui`，然后派生
`dsh --profile tui`：

```sh
$ dsh-cc --resume <id>
```

launcher 会把 `--resume <id>` 翻译成 `DSH_CC_RESUME_SESSION=<id>`，实际恢复由
TUI 插件完成。你无需亲自设置这些 launcher 专属变量。

## 下一步

- /reference/settings —— 配置文件与配置项
- /reference/cli —— `dsh-cc` launcher 及其参数
- /quickstart —— 安装与首次运行
