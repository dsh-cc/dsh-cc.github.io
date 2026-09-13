---
title: CLI 参数
description: dsh-cc 可执行文件在启动 dsh --profile tui 之前接受的参数。
distilled-from: dsh-cc v0.6.3
---

# CLI 参数

`dsh-cc` 是一个可选的轻量包装器：它翻译少量参数，然后启动规范命令
`dsh --profile tui`。首次运行时，它通过安装三个 CC bundle（固定为启动器
版本的 `@dsh-cc/bundle-permissions`、`@dsh-cc/bundle-shell`、
`@dsh-cc/bundle-tui`）来引导 `$DSH_HOME/profiles/tui`。安装两个包即可开始：

```sh
$ npm install -g @deepseek-ai/dsh @dsh-cc/cli
$ dsh-cc
```

启动器在引导时会强制检查 harness 下限：已安装的 `dsh` 必须 **>= 0.1.5-rc.1**，否则拒绝启动。

## 参数

所有参数都由启动器处理；resume 模式参数会在转发给 `dsh` 之前从 argv 中
剥离。不识别组合短参数（例如 `-cn`）——每个参数必须是独立的 token。

| 参数 | 作用 |
| --- | --- |
| `--version` / `-V` | 输出启动器自身的包版本并退出。 |
| `--new` / `-n` | 开始全新会话：TUI 全新启动，不读取任何 resume 标记。 |
| `--resume <id>` | 恢复指定 id 的会话。`--resume=<id>` 形式效果相同。 |
| `--continue` / `-c` | 继续上一个会话；当标记不存在时，TUI 会显示 "no previous session to continue" 提示。 |
| `--worktree [name]` | 在位于 `<repoRoot>/.claude/worktrees/<slug>`、分支为 `worktree-<slug>` 的 git worktree 内启动会话（未给名称时使用随机 slug）。新建的 worktree 会开始全新会话（等价于 `--new`）；当目录已存在时再次执行 `--worktree <name>` 会复用它，并回退到默认的自动恢复。要求 git 仓库中至少有一个提交。 |
| `--profile` | 启动器本身不消费它：它总是转发 `dsh --profile tui`，即规范命令。 |

如果没有做出明确选择，TUI 会读取自己的项目 resume 标记，并在存在时自动
恢复该项目的上一个会话。`--resume` / `--new` 优先于 worktree 的回退行为。

## 参数如何传递给 TUI

启动器是一个薄参数翻译层：它推导出 TUI 插件消费的会话模式环境变量
（例如 `DSH_CC_PROFILE=tui`、`DSH_CC_RESUME_SESSION=<id>` 或 `''`、
`DSH_CC_CONTINUE='1'`、`DSH_CC_AUTO_RESUME='1'`，以及
`DSH_CC_WORKTREE` 中的 worktree 描述符），然后启动 `dsh --profile tui`。
启动器自己从不读取 resume 标记——标记的读取和写入由 TUI 插件负责。
启动器拥有的 resume 变量会在入口处从继承的环境中清除，只根据本次调用
的 argv 重新推导，因此启动 `dsh-cc` 时请勿手动设置它们。

::: tip
`DSH_CC_*` 变量的完整细节见 [/reference/env-vars](/zh/reference/env-vars)。
:::

## 下一步

- [/reference/env-vars](/zh/reference/env-vars) —— `DSH_CC_*` 环境变量契约。
- [/reference/commands](/zh/reference/commands) —— TUI 中可用的斜杠命令。
- [/reference/permission-modes](/zh/reference/permission-modes) —— 会话内的权限模式。
