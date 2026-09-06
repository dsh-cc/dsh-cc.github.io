---
title: Skills
description: Package reusable task-specific instructions as SKILL.md bundles that dsh-cc discovers from Claude Code-style skill roots and loads on demand.
---

# Skills

Skills are the way you package reusable, task-specific instructions so the
agent can load them on demand instead of you pasting the same guidance into
prompts. dsh-cc consumes skills written in Claude Code's `SKILL.md` format
directly: project-specific skills, bundled utility skills, and legacy
command files are all discovered by the CC skill provider and served through
the harness skill registry. This page explains where skills live, what a
`SKILL.md` may contain, and how skills get invoked.

## Where skills live

Skills are directory bundles named `<name>/SKILL.md`, discovered from several
roots. The roots are discovered in this precedence order (lower rank wins
name conflicts):

| Rank | Source | Path |
| --- | --- | --- |
| 100 | managed | `config.managedDir` |
| 200 | project | `<projectRoot>/.claude/skills` |
| 300 | user | `<dshHome>/skills` |
| 400 | additional | each `config.additionalDirs` |

Notes, from the provider's discovery rules:

- The **project root** is the nearest ancestor containing `.git`; without
  one, the current cwd is used.
- The **user root** is the `skills` directory under the harness home
  (`$DSH_HOME` or `~/.dsh` by default).
- **Managed** (`config.managedDir`) is an optional policy root scanned before
  all defaults; **additional** roots (`config.additionalDirs`) are appended
  after project and user roots.
- **Bundled** skills ship inside the provider package and are served at rank
  600. Because 600 is the highest rank, any managed (100), project (200),
  user (300), or additional (400) skill of the same name wins the name
  conflict — local skills override built-ins, matching Claude Code's
  precedence. The current bundled subset is `debug`, `simplify`, and `batch`.
- Legacy `.claude/commands/*.md` files are also loaded and marked
  `deprecated` in their metadata.
- Discovery deduplicates by real path, so a symlinked or overlapping file is
  served once.

## `SKILL.md` anatomy

A `SKILL.md` is parsed as a YAML frontmatter document split from a Markdown
body. The provider reads every known Claude Code field and tolerates unknown
fields; a known field with an invalid value fails loudly at load rather than
silently mis-activating. Skill names must be kebab-case to register on the
registry.

### Frontmatter fields

The provider documents the following fields. The source does not mark any of
them individually as required; in practice `description` is what the model
sees when deciding whether to activate a skill, so it is the field that
matters most for model-invoked skills.

| Field | Meaning |
| --- | --- |
| `description` | What the skill does; used for model-invoked activation. |
| `name` | Skill name; must be kebab-case to register on the registry. |
| `allowed-tools` | Restricts the tool surface when the skill runs. Translated by `ccRestriction(allowedTools)` into an allow-only `tools.restrict()` filter; a `*` or empty list yields `undefined`, so the skill inherits the caller's surface. |
| `argument-hint` | Hint text for supplying arguments; surfaced as metadata and applied by the consumer at activation time. |
| `arguments` | Argument declaration for the skill. |
| `when_to_use` | Guidance on when the skill should be used; counted during discovery. |
| `version` | Version string for the skill. |
| `model` | Model to use for the skill, including the value `inherit`. |
| `user-invocable` | Whether the user can invoke the skill directly (e.g. as a slash command). |
| `disable-model-invocation` | Prevents the model from invoking the skill on its own. |
| `context` | Execution context for the skill, including the value `fork`. `context: fork` is surfaced as `metadata.executionContext`; consumers route the skill to `ctx.subagents.start()` with its rendered body. |
| `agent` | Agent association for the skill. |
| `effort` | Effort level for the skill. |
| `shell` | Shell association for the skill. |
| `hooks` | Hooks associated with the skill. |
| `paths` | Gitignore-style project-relative patterns that gate *conditional activation* (see below). |

::: info
Most semantic translation is consumer-side: `allowed-tools`, `context: fork`,
and `argument-hint` are surfaced as metadata and helpers and applied by the
consumer, because a provider has no agent reference at load time. `paths`
conditional activation is the exception and is applied by the provider
itself.
:::

### Body and placeholders

The Markdown body is the instruction text the skill delivers when activated.
`renderSkillBody` substitutes the following placeholders in the body:

| Placeholder | Substituted with |
| --- | --- |
| `$ARGUMENTS` | The full argument string passed to the skill. |
| `$ARGUMENTS[n]` / `$n` | The n-th argument. |
| `$name` | The named argument `name`. |
| `${CLAUDE_SKILL_DIR}` | The skill's directory. |
| `${CLAUDE_SESSION_ID}` | The current session id. |

Inline-shell `` !`...` `` commands in the body are extracted (segmented) for
the caller to execute, guarded by `allowInlineShell`; the provider never
executes them itself, and MCP-sourced skills must force it off. During
discovery, only `name`, `description`, and `when_to_use` are counted for
token estimation (`estimateFrontmatterTokens`) — the body is never counted.

## Conditional activation via `paths`

A skill whose frontmatter declares `paths` is a *conditional* skill. It is
not served until a Read/Write/Edit tool touches a file that matches one of
its gitignore-style project-relative `paths`:

1. `list()` parses every candidate; a `paths`-gated skill is **excluded from
   the catalog** until activated.
2. On `fs/observed`, a `read`/`write`/`edit` actor touching a matching path
   inside the project activates that skill (once — repeat touches are
   idempotent); consumers refetch the catalog via `skills/change` and the
   skill now appears.
3. `get()` serves the activated skill normally.

This matches Claude Code's semantics for context-dependent skills: the skill
stays out of the catalog until its file pattern is actually touched.

## Invocation model

The registry resolves an invocation policy from two fields,
via `ccInvocation(parsed)`:

- `user-invocable` — whether you can invoke the skill yourself.
- `disable-model-invocation` — whether the model is barred from invoking the
  skill on its own.

### Model-invoked skills

By default the model decides when a skill applies, based on its
`description` (and `when_to_use`). Keep those fields accurate and specific —
they are the model's only basis for activation, and they are the only
frontmatter counted during discovery.

### User-invoked skills

Skills that are user-invocable can be run as slash commands using their
kebab-case name:

```sh
$ /my-skill-name
```

To list everything available — bundled, project, user, and additional skills
alike — use the `/skills` command:

```sh
$ /skills            list installed skills
```

::: tip
Set `disable-model-invocation: true` on skills you want to run only when you
ask for them, so the model never pulls them in on its own.
:::

## A minimal worked example

The source does not ship an example `SKILL.md` for copy-paste, so the
following is an illustrative bundle built only from fields the provider
documents — it is **not** an official example, and the body conventions are
up to you. Place it at `<projectRoot>/.claude/skills/release-notes/SKILL.md`:

```markdown
---
name: release-notes
description: Draft release notes from recent commits and open pull requests.
argument-hint: [version]
user-invocable: true
---

# Draft release notes

Write release notes for version $ARGUMENTS.

1. Summarize merged commits since the last tag.
2. Group changes into Added / Changed / Fixed.
3. Keep entries user-facing; omit internal refactors.

Reference the skill directory for extra context: ${CLAUDE_SKILL_DIR}/notes.md
```

Because the name is registered under the project root (rank 200), it would
override a bundled skill of the same name — and any user-root skill with the
same name loses to it.

## Next

- [/guide/hooks](/guide/hooks) — reacting to session and tool events
- [/guide/subagents](/guide/subagents) — delegating work to subagents
  (including `context: fork` routing)
- [/reference/extension-formats](/reference/extension-formats) — the
  `SKILL.md`, agent, and plugin file formats in reference form
