---
title: CI 与非交互使用
description: 面向维护者与 CI 任务：在无终端、无 LLM 调用的环境下验证 dsh-cc profile 组合可正常启动，并收集可用于离线排查的健康诊断。
---

# CI 与非交互使用

本文面向需要证明某个 dsh-cc profile 组合能真正启动的维护者与 CI 作者——
在全新的 `DSH_HOME` 中、没有交互终端、且零 LLM 调用的条件下完成验证。这
不是无头批处理模式：dsh-cc 主要是一个交互式环境（`tui` profile 的终端
TUI、`web` profile 的浏览器界面），这里没有任何内容会无人值守地执行编码
任务。你能得到的是一个快速、失败即报的启动门禁，以及可附在 issue 里用于
离线排查的健康诊断。

## 冒烟路径：`pnpm smoke:profile-boot`

dsh-cc 仓库为此提供了一个专用脚本。它就是 presubmit 与 publish 运行的同
一道门禁，定义在 `scripts/smoke-profile-boot.sh`，并通过 `package.json` 暴露：

```sh
$ pnpm smoke:profile-boot
```

按脚本自身的说明，它会：

- 在一个全新的、一次性的 `DSH_HOME`（临时目录）里启动**生产 TUI bundle
  集合**，并证明插件树可以挂载。
- 绝不预先创建 `$DSH_HOME/profiles/node_modules`。由 CLI 自己的
  `prepareProfile()` 执行 `healProfilesModuleFallback(INSTALL_ANCHOR)`，从
  harness CLI 的安装树物化出 harness-healed fallback——与真实用户的插件
  解析所依赖的组合完全一致。
- 在**伪终端**（Python 标准库的 `pty.spawn`）下运行启动过程，因为 TUI 拒
  绝非 TTY 的 stdout。无论脚本是从 CI 步骤、管道还是 hook 调用，macOS 与
  Linux 上行为一致。
- **零 LLM 调用**。
- 只有当 pty 转录非空、包含 `dsh cc-mode`（TUI 渲染出的第一帧，只有在完
  整插件树挂载后才会出现）、且没有任何加载失败签名时才算通过。健康门禁
  约 10-15 秒结束；计时窗口外的一次 warm-up 运行吸收冷缓存下较慢的 heal。

::: info
脚本期望 harness CLI 已预构建在 `<repo>/../deepseek-harness/apps/cli`；可
用 `DSH_HARNESS_DIR` 覆盖位置。本地 checkout 的 harness `lib/` 只构建了一
半时，脚本会回退到 npm 全局安装的 `dsh` 并在 stderr 上提示。CI 机器没有
全局 `dsh`，因此坏的 harness 构建会让门禁失败，而不是悄悄改道。
:::

## 接入 CI 任务

脚本自身的错误提示点名了它依赖的两个构建步骤：仓库的构建与 harness CLI
的 `build:lib`。一个最小的任务形态：

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm run build
- run: npm --prefix ../deepseek-harness run build:lib
- run: pnpm smoke:profile-boot
```

对 runner 的要求：Node 与 `python3`（pty 中继是标准库），macOS 或 Linux。
不需要模型端点或 API key——门禁设计上就不做 LLM 调用。启动失败时脚本会
打印 `smoke:profile-boot FAIL` 及启动日志尾部，把它贴进 issue 即可。

## 离线健康诊断

当某台你无法复现的机器上会话表现异常时，请对方提供内置的健康报告而不是
截图。`/doctor` 是一个满配平价的 CC 风格命令（见 parity matrix），无需模
型轮次即可产出会话健康报告：

| 调用 | 作用 |
| --- | --- |
| `/doctor` | 以文本形式渲染会话健康报告。 |
| `/doctor --verbose` | 同样的检查，详细渲染。 |
| `/doctor --json` | 以相同方式收集报告，并把完整 JSON 写入 `$DSH_HOME/tui/doctor-report.json`（逐级建目录、覆盖旧文件）。会话转录里的命令文本只包含路径、summary 计数与 fail/warn 检查 id——绝不会出现大块 JSON。 |

`--verbose --json` 同时使用时按详细模式收集并输出 JSON。`$DSH_HOME` 下的
JSON 文件就是附在兼容性报告里的那份。

该报告同样覆盖 MCP：`/doctor` 在 `mcp.serena` 检查项下报告 Serena 连接。

### `DSH_CCTUI_ALLOW_NO_TTY`

stdout 不是 TTY 时 TUI 会拒绝挂载。设置 `DSH_CCTUI_ALLOW_NO_TTY='1'` 允许
在没有交互终端的情况下挂载 TUI——这是从脚本接入 dsh-cc 进程时的逃生舱。
上面的冒烟门禁刻意**不**使用它：它给子进程一个真正的伪终端，因为门禁的
目的正是证明用户级、交互优先的启动路径可用。完整变量目录见
[/reference/env-vars](/reference/env-vars)。

::: warning
非交互挂载是诊断用的逃生舱，不是批处理模式。dsh-cc 没有无头任务执行器；
需要非终端交互请使用下文的 web profile。
:::

## web profile：非终端的界面

如果目标只是在没有终端的情况下使用 dsh-cc，受支持的答案是 `web`
profile——同一个 CC 导向后端通过 dsh web UI 暴露。显式组合（来自 README）：

```sh
$ dsh plugin --profile web add \
    @dsh-cc/bundle-permissions \
    @dsh-cc/bundle-shell
$ dsh web
```

这是浏览器界面，不是自动化 API——安装步骤见 [/quickstart](/quickstart)。

## 下一步

- [/reference/cli](/reference/cli) — `dsh-cc` 启动器及其参数
- [/reference/env-vars](/reference/env-vars) — 环境变量目录
- [/guide/from-claude-code](/guide/from-claude-code) — 迁移既有
  Claude Code 工作流
