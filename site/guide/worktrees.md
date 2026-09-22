---
title: Worktrees
description: Run a session, tool, or subagent in an isolated git worktree — launcher flag, in-session tools, per-child isolation, and the managed lifecycle around them.
---

# Worktrees

A git worktree gives you a second checkout of the same repository on its own branch, so experimental work never touches your working tree. dsh-cc builds a managed worktree surface on that: three ways to get into one, a lifecycle that cleans up after you, and hooks to observe it all.

## Three entry points

| Entry point | What it does | Covered in |
| --- | --- | --- |
| Launcher `--worktree [name]` | Starts the whole session inside a worktree. | [Launcher](#launcher-worktree) |
| `EnterWorktree` / `ExitWorktree` tools | Model-driven enter and exit mid-session. | [In-session tools](#in-session-tools) |
| Subagent `isolation: worktree` | Dispatches a `Task` child into its own worktree. | [Subagent isolation](#subagent-isolation) |

## Launcher `--worktree`

Pass `--worktree [name]` to `dsh-cc` to start the session inside a worktree at `<repoRoot>/.claude/worktrees/<slug>` on branch `worktree-<slug>`. With no name, a random slug (for example `swift-fox-8f3a`) is generated. Requirements and behavior:

- Requires a git repository with at least one commit.
- A **newly created** worktree starts a fresh session (equivalent to `--new`).
- **Reusing** an existing `--worktree <name>` directory falls back to the default auto-resume — because sessions are scoped to the *project* (the main git root; worktrees share it), the TUI resumes the project's last session. `--resume` / `--new` still override.
- Created and reused worktrees are locked with `git worktree lock --reason="dsh-cc session <slug>"` for the session's duration.

### PR references

The `--worktree` value can also reference a pull request:

```sh
dsh-cc --worktree '#12'
dsh-cc --worktree https://github.com/<owner>/<repo>/pull/12
dsh-cc --worktree https://gitlab.com/<owner>/<repo>/-/merge_requests/12
```

Quote the `#` so the shell does not treat it as a comment. All three forms resolve to slug `pr-<n>` on branch `worktree-pr-<n>`, fetching the PR head from origin: `pull/<n>/head` on github.com, `merge-requests/<n>/head` on gitlab.com, and both tried in that order on any other host.

## Lifecycle

**Boot-time sweep.** Every launch runs a sweep (never network I/O, 10s cap, fail-silent): worktrees under `.claude/worktrees/` on `worktree-*` branches older than `worktree.cleanupPeriodDays` (default 30, read fail-open from user → project → local settings) are removed only when clean and nothing is unpushed. Stale dsh-cc session locks are never auto-released — they surface as advisory `git worktree unlock <path>` lines.

**Base selection.** New worktrees branch from the base chosen by `worktree.baseRef`:

| Value | Base |
| --- | --- |
| `fresh` (default) | Cached `origin/HEAD`, refreshed with one fetch capped at 5s when its reflog is older than 24h. |
| `head` | The literal current `HEAD`. |

Any probe failure degrades to local `HEAD`. A reused named worktree is hard-reset to that base when it is clean and all its own commits are already merged into it; PR-reference worktrees skip the reuse-reset.

**Quitting.** A launcher worktree session's `/quit` asks whether to keep or remove the worktree; quitting a managed, user-unnamed session with a fully clean tree (zero changes, zero commits) removes the worktree and deletes its owned branch silently, and tombstones the resume anchor. On quit the TUI also prints the session id and the resume command to scrollback; set `DSH_CC_DISABLE_EXIT_TIP='1'` to disable that tip — see [/reference/env-vars](/reference/env-vars).

## In-session tools

The model-facing `EnterWorktree` / `ExitWorktree` tools (from `@dsh-cc/tool-git-worktree`) create, keep, and remove worktrees under `<repo>/.claude/worktrees/`.

### `EnterWorktree`

| Arg | Type | Notes |
| --- | --- | --- |
| `name` | string | Worktree slug. Each `/`-separated segment allows letters, digits, `.`, `_`, `-`; max 64 chars. A random `adjective-noun-suffix` slug is generated when omitted. |

Creation is hardened:

- The repository root is pinned via `git rev-parse --git-common-dir`, so entering from inside a linked worktree creates a sibling under the **main** checkout's `.claude/worktrees/`, never a nested tree.
- The worktree is created from HEAD on a fresh `worktree-<name>` branch.
- Repository-local filter drivers are neutralized before `git worktree add` — LFS-tracked content arrives as pointer files; run `git lfs pull` inside the worktree to restore it.
- `.claude`, `.claude/worktrees`, and the target path may not be symlinks.
- An existing target directory is adopted only when its `.git` entry resolves into this repository's `.git/worktrees/` registration.
- Outside a git working tree it returns a structured error rather than changing anything.

Because the session working directory is fixed at session creation, after entering you (the model) must pass `workdir` equal to the reported `worktreePath` on subsequent shell and fs calls. At most one worktree is active per process. The `path` form — naming a directory outside the convention dir — always asks for confirmation, and only bypassPermissions skips that prompt.

The worktree is locked with `git worktree lock --reason="dsh-cc session <slug>"` and unlocked on both exit actions.

### `ExitWorktree`

| Arg | Type | Notes |
| --- | --- | --- |
| `action` | `"keep"` \| `"remove"` | `keep` leaves the worktree and branch on disk; `remove` deletes both (destructive). |
| `discard_changes` | boolean | Required `true` with `action: "remove"` when the worktree has uncommitted files or commits not on the base branch; the tool refuses and lists the evidence otherwise. |

`ExitWorktree` only operates on worktrees created by `EnterWorktree` in the current session — never on manually-created or previous-session worktrees. Before a `remove` it probes `git status --porcelain` and `git rev-list --count <base>..HEAD` and fails closed: if the state cannot be verified it refuses without `discard_changes: true`.

## `.worktreeinclude`

A `.worktreeinclude` file at the repo root names gitignore'd files that should be copied into every newly created worktree (preserving relative paths). It uses a gitignore subset: comments, `!` negation, trailing `/`, `*`, `?`, and `**`, plus the `**/`-piercing rule (a `**/foo` pattern matches inside a wholly-ignored directory only when the directory itself matches or its path's first name equals the pattern's first literal segment). Matched files must also be confirmed by `git check-ignore`.

Include-copy is tool-side only: launcher `--worktree` sessions get no include-copy.

## Subagent isolation

A subagent definition whose frontmatter pins `isolation: worktree` is dispatched into a per-child worktree at `<mainRepoRoot>/.claude/worktrees/subagent-<childId>` on branch `worktree-subagent-<childId>`, created through the same hardened path as `EnterWorktree` and locked with `git worktree lock --reason="dsh-cc subagent <id>"`. The essentials:

- Any creation failure **refuses the dispatch** — it never silently falls back to the parent tree.
- On cleanup, only a clean, commit-less tree is removed (unlock + `worktree remove --force` + branch delete); anything else stays on disk and the agent's final text says so.
- Status is partial: the child's `header.cwd`, the harness sandbox root, and the bash default workdir remain the parent's, and a sandbox-denied write hard-fails because delegated children cannot answer approval prompts.

The full contract — the child's working-directory contract, refusal conditions, and deviations — is covered in [/guide/subagents](/guide/subagents).

## Hooks

The `WorktreeCreate` and `WorktreeRemove` hook events fire from the worktree tools, subagent isolation, and TUI `/quit` cleanup. A `WorktreeCreate` hook exiting 0 with a stdout path replaces the default creation; a failing `WorktreeRemove` hook keeps the tree. Launcher `--worktree` creation and the boot-time sweep do **not** fire hooks. See [/guide/hooks](/guide/hooks).

## Resume safety

Resuming a session that was recorded inside a `.claude/worktrees/` directory verifies the worktree's git identity — its registration under the same repo's `.git/worktrees/`, no network paths, and similar checks — and warns per refusal class instead of silently following a destroyed or redirected tree.

## Status

Worktree support is **partial** relative to Claude Code: the manifest items `workspace.worktree-ecosystem`, `workspace.worktree-launcher`, `workspace.worktree-lifecycle`, and `workspace.worktree-tools` are all marked behavioral/ux partial. Known downgrades include the tool-side-only include-copy, no hooks or settings cascade in the launcher's git-direct creation, and the subagent deviations above.

## Next

- [/guide/subagents](/guide/subagents) — authoring `.claude/agents` definitions, including `isolation: worktree`.
- [/guide/hooks](/guide/hooks) — the hook system, including `WorktreeCreate`/`WorktreeRemove`.
- [/reference/env-vars](/reference/env-vars) — `DSH_CC_DISABLE_EXIT_TIP` and related variables.
