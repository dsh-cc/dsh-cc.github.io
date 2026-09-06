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

在会话内，`/resume` 列出会话，用于恢复被中断的会话。注意这是部分对齐：`/resume` 只负责列出会话，切换由宿主负责（在 shell 中执行 `dsh --resume <id>`）。当前源文档中没有 `/rename` 命令。

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

源文档中没有记录 `/compact` 或 `/clear` 斜杠命令，因此这里不做罗列。上下文处理由 compaction 包（micro-compaction）和记忆层（`CLAUDE.md` 风格的上下文，外加专门用于持久记忆的写入通道，按工作区隔离）承担；可用 `/memory` 查看记忆。

## 安全地并行开发

若要把实验与主检出隔离开，可在 git worktree 中启动会话：

```sh
$ dsh-cc --worktree my-experiment
```

`--worktree [name]` 会在 `<repoRoot>/.claude/worktrees/<slug>` 下的 git worktree 中启动会话，分支名为 `worktree-<slug>`（未提供名字时使用随机 slug）。新建的 worktree 会启动全新会话。当目录已存在时再次执行 `--worktree <name>` 会复用它，并回退到默认的自动恢复，因为会话以*项目*（主 git 根目录；worktree 共享它）为作用域。`--resume` / `--new` 仍然优先生效。要求 git 仓库至少有一个提交。

在会话内，`/branch` 提供 worktree 分支管理。worktree 工具为完全对齐。退出时，TUI 会询问保留还是删除该 worktree。

## 下一步

- [模型路由](/zh/guide/model-routing) — 把模型别名映射到你自己的供应商。
- [后台任务](/zh/guide/background-tasks) — 运行并检查后台工作。
- [命令参考](/zh/reference/commands) — 完整的斜杠命令目录。
