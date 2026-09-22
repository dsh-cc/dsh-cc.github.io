---
title: 工作树
description: 在隔离的 git 工作树中运行会话、工具或子代理——启动器参数、会话内工具、按子代理隔离，以及围绕它们的托管生命周期。
---

# 工作树

git worktree 让你在同一个仓库上获得第二个独立分支的检出，实验性改动不会碰到你自己的工作区。dsh-cc 在此之上构建了一套托管的工作树能力：三种进入方式、一个替你善后的生命周期，以及可观察全程的钩子。

## 三种入口

| 入口 | 作用 | 详见 |
| --- | --- | --- |
| 启动器 `--worktree [name]` | 让整个会话跑在工作树里。 | [启动器](#启动器---worktree) |
| `EnterWorktree` / `ExitWorktree` 工具 | 会话中途由模型驱动的进入与退出。 | [会话内工具](#会话内工具) |
| 子代理 `isolation: worktree` | 把 `Task` 子代理派发到独立的工作树。 | [子代理隔离](#子代理隔离) |

## 启动器 `--worktree`

给 `dsh-cc` 传 `--worktree [name]`，会话就会在 `<repoRoot>/.claude/worktrees/<slug>` 下的工作树中启动，分支为 `worktree-<slug>`。不指定名字时会生成随机 slug（例如 `swift-fox-8f3a`）。要求与行为：

- 要求当前是 git 仓库，且至少有一个提交。
- **新建**的工作树会启动全新会话（等价于 `--new`）。
- **复用**已存在的 `--worktree <name>` 目录时，回退到默认的自动恢复——因为会话按*项目*（主 git 根目录；各工作树共享）划分作用域，TUI 会恢复该项目的上一个会话。`--resume` / `--new` 仍然优先。
- 新建和复用的工作树都会以 `git worktree lock --reason="dsh-cc session <slug>"` 加锁，持续整个会话。

### PR 引用

`--worktree` 的值也可以指向一个 pull request：

```sh
dsh-cc --worktree '#12'
dsh-cc --worktree https://github.com/<owner>/<repo>/pull/12
dsh-cc --worktree https://gitlab.com/<owner>/<repo>/-/merge_requests/12
```

记得给 `#` 加引号，否则 shell 会把它当成注释。三种写法都会解析为 slug `pr-<n>`、分支 `worktree-pr-<n>`，并从 origin 拉取 PR head：github.com 用 `pull/<n>/head`，gitlab.com 用 `merge-requests/<n>/head`，其他主机按此顺序两者都试。

## 生命周期

**启动时清扫。** 每次启动都会跑一次清扫（不做网络 I/O，10 秒上限，失败静默）：`.claude/worktrees/` 下位于 `worktree-*` 分支、超过 `worktree.cleanupPeriodDays`（默认 30，按用户 → 项目 → 本地设置的顺序 fail-open 读取）的工作树，只有在干净且没有未推送内容时才会被移除。残留的 dsh-cc 会话锁从不自动释放——它们只会以 `git worktree unlock <path>` 的建议行出现。

**基线选择。** 新工作树的基线由 `worktree.baseRef` 决定：

| 取值 | 基线 |
| --- | --- |
| `fresh`（默认） | 缓存的 `origin/HEAD`；reflog 超过 24 小时时，用一次封顶 5 秒的 fetch 刷新。 |
| `head` | 字面上的当前 `HEAD`。 |

任何探测失败都退回本地 `HEAD`。复用的具名工作树在干净且自身提交全部已合并时会被硬重置到该基线；PR 引用的工作树跳过复用重置。

**退出。** 启动器工作树会话执行 `/quit` 时会询问保留还是删除工作树；托管的无名会话在完全干净（零改动、零提交）时退出，会静默删除工作树及其所属分支，并作废恢复锚点。退出时 TUI 还会把会话 id 和恢复命令打印到回滚缓冲区；设置 `DSH_CC_DISABLE_EXIT_TIP='1'` 可关闭该提示——见 [/zh/reference/env-vars](/zh/reference/env-vars)。

## 会话内工具

面向模型的 `EnterWorktree` / `ExitWorktree` 工具（来自 `@dsh-cc/tool-git-worktree`）在 `<repo>/.claude/worktrees/` 下创建、保留和删除工作树。

### `EnterWorktree`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | 工作树 slug。每个以 `/` 分隔的段允许字母、数字、`.`、`_`、`-`；最长 64 字符。省略时生成随机的 `adjective-noun-suffix` slug。 |

创建过程有多重加固：

- 仓库根目录通过 `git rev-parse --git-common-dir` 固定，所以在链接工作树内部进入时，新工作树建在**主**检出的 `.claude/worktrees/` 下成为兄弟目录，绝不会嵌套。
- 工作树从 HEAD 创建到全新的 `worktree-<name>` 分支上。
- `git worktree add` 之前会中和仓库本地的 filter driver——LFS 跟踪的内容会以指针文件形式到达；在工作树内运行 `git lfs pull` 即可恢复。
- `.claude`、`.claude/worktrees` 和目标路径都不能是符号链接。
- 已存在的目标目录只有在其 `.git` 条目能解析到本仓库的 `.git/worktrees/` 注册时才会被收编。
- 在 git 工作树之外时返回结构化错误，不做任何改动。

由于会话工作目录在会话创建时就已固定，进入之后你（模型）需要在后续的 shell 和 fs 调用中把 `workdir` 传成报告的 `worktreePath`。每个进程同时最多只有一个活跃工作树。`path` 形式——指定约定目录之外的路径——总是要求确认，只有 bypassPermissions 能跳过该提示。

工作树以 `git worktree lock --reason="dsh-cc session <slug>"` 加锁，两种退出动作都会解锁。

### `ExitWorktree`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `action` | `"keep"` \| `"remove"` | `keep` 把工作树和分支留在磁盘上；`remove` 两者都删（破坏性）。 |
| `discard_changes` | boolean | 当工作树有未提交文件或未合入基线分支的提交时，`action: "remove"` 要求其为 `true`；否则工具会拒绝并列出证据。 |

`ExitWorktree` 只处理当前会话中由 `EnterWorktree` 创建的工作树——手动创建的或之前会话的工作树从不触碰。执行 `remove` 前它会探测 `git status --porcelain` 和 `git rev-list --count <base>..HEAD`，并且 fail closed：状态无法验证时，没有 `discard_changes: true` 就拒绝执行。

## `.worktreeinclude`

仓库根目录的 `.worktreeinclude` 文件列出应复制进每个新建工作树（保留相对路径）的 gitignore 忽略文件。它使用 gitignore 的一个子集：注释、`!` 取反、尾部 `/`、`*`、`?` 和 `**`，外加 `**/` 穿透规则（`**/foo` 模式只有在该目录本身匹配、或其路径首段等于模式的首个字面段时，才会匹配完全被忽略的目录内部）。匹配到的文件还需通过 `git check-ignore` 确认。

包含复制只在工具侧生效：启动器 `--worktree` 会话没有包含复制。

## 子代理隔离

frontmatter 声明 `isolation: worktree` 的子代理定义，会被派发到每个子代理独立的工作树 `<mainRepoRoot>/.claude/worktrees/subagent-<childId>`、分支 `worktree-subagent-<childId>`，创建走与 `EnterWorktree` 相同的加固路径，并以 `git worktree lock --reason="dsh-cc subagent <id>"` 加锁。要点：

- 任何创建失败都会**拒绝派发**——绝不静默回退到父目录树。
- 清理时只有干净且无提交的树会被移除（解锁 + `worktree remove --force` + 删除分支）；其余情况一律留在磁盘上，并且代理的最终输出会说明这一点。
- 状态为部分实现：子代理的 `header.cwd`、沙箱根和 bash 默认 workdir 仍是父会话的，而且沙箱拒绝的写入会硬失败，因为被派发的子代理无法应答审批提示。

完整契约——子代理的工作目录契约、拒绝条件和偏差——见 [/zh/guide/subagents](/zh/guide/subagents)。

## 钩子

`WorktreeCreate` 和 `WorktreeRemove` 钩子事件由工作树工具、子代理隔离和 TUI `/quit` 清理触发。`WorktreeCreate` 钩子以退出码 0 结束并在 stdout 输出路径时，会取代默认的创建流程；失败的 `WorktreeRemove` 钩子会让树保留。启动器 `--worktree` 创建和启动时清扫**不**触发钩子。见 [/zh/guide/hooks](/zh/guide/hooks)。

## 恢复安全

恢复一个记录在 `.claude/worktrees/` 目录内的会话时，dsh-cc 会验证该工作树的 git 身份——是否注册在同一仓库的 `.git/worktrees/` 下、不含网络路径等——并按拒绝类别逐条警告，而不是静默跟随一个已被销毁或被重定向的树。

## 现状

相对 Claude Code，工作树支持为**部分实现**：清单项 `workspace.worktree-ecosystem`、`workspace.worktree-launcher`、`workspace.worktree-lifecycle` 和 `workspace.worktree-tools` 均标记为 behavioral/ux partial。已知降级包括仅工具侧的包含复制、启动器 git 直连创建时不跑钩子也不读设置级联，以及上述子代理偏差。

## 下一步

- [/zh/guide/subagents](/zh/guide/subagents) — 编写 `.claude/agents` 定义，包括 `isolation: worktree`。
- [/zh/guide/hooks](/zh/guide/hooks) — 钩子系统，包括 `WorktreeCreate`/`WorktreeRemove`。
- [/zh/reference/env-vars](/zh/reference/env-vars) — `DSH_CC_DISABLE_EXIT_TIP` 及相关变量。
