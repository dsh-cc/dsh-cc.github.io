# WRITING.md — docs authoring contract

Every docs page on this site follows these rules. They exist so 46 files written
by many hands stay truthful, consistent, and bilingual.

## Source of truth

- The **only** allowed sources are files in the sibling repo `../dsh-cc`
  (`/Users/bytedance/workspace/github.com/dsh-cc`): its `README.md`,
  `README.zh.md`, `docs/`, and `packages/*/README.md`, plus the source files a
  task prompt explicitly lists.
- Document **only** what those sources contain. Never invent flags, defaults,
  config keys, env vars, version numbers, or output examples. If unsure, omit.
- Commands, flags, subcommands, env var names, and config keys must be copied
  **verbatim** from source. Example output may be shown only if the source
  shows it.

## Bilingual rules

- English at `site/<path>.md`; Chinese mirror at `site/zh/<path>.md`. Every
  page exists in both languages, same section order and same tables/code.
- English is authoritative; Chinese is a faithful adaptation, not word-for-word.
  Use 你 for the reader. Never translate code tokens, commands, file paths,
  config keys, or product names. Code-block content is **byte-identical**
  across locales (CI enforces this); prose comments inside code may be
  localized only if the counterpart differs deliberately — keep them identical
  anyway unless the prompt says otherwise.

## Frontmatter

```yaml
---
title: <page title; English-slug pages keep English slugs, titles localized>
description: <one sentence, used for meta/og>
distilled-from: dsh-cc v0.6.0   # reference/* pages only: version content reflects
---
```

Body starts with `# <title>` matching frontmatter. No other h1.

## Markdown conventions

- VitePress flavored markdown. First link to a page is by clean path
  (`/guide/model-routing`), **never** with cross-page `#anchors` (dead-link and
  stub phases break otherwise); same-page anchors are fine.
- Tables for command/flag/env catalogs. Columns: name, what it does. Mark
  partial/experimental behavior honestly when the source says so (e.g. parity
  status "partial").
- **ZH pages link to ZH pages**: every internal link on a `site/zh/**` page
  carries the `/zh/` prefix (`/zh/guide/…`), never the unprefixed EN path.
- **Code-block comments stay in English** in both locales so blocks remain
  byte-identical; explain the commands in the surrounding prose instead.
- Containers (`::: tip`, `::: warning`, `::: info`, `::: details`) sparingly —
  at most two per page.
- Bash blocks labeled `bash` or `sh`, commands prefixed `$ `. Config blocks
  labeled with their format (`json`, `yaml`). Never claim a block's output
  unless the source shows that output.
- Target length 150–400 lines per page. Lead with the 2-3 sentence "who is
  this for / what does it get you", then prerequisites, then steps, then a
  short "next" section linking 2-3 related pages.

## Positioning statements (fixed wording)

- The site-wide disclaimer lives in the landing footer and
  `reference/compatibility`; do not re-litigate it elsewhere. Fixed EN wording:
  "dsh-cc is not Claude Code and is not a wrapper around Claude Code." ZH:
  "dsh-cc 不是 Claude Code，也不是 Claude Code 的包装器。"
- Official packages come only from the `@dsh-cc` npm scope.

## Hard prohibitions for implementation agents

- Do not run `git` commands, `pnpm install`, or `pnpm docs:build` (the
  orchestrator builds once per batch). Exception: the scaffold unit owns
  install/build.
- Do not create or edit files outside the manifest in your task prompt — this
  includes `site/.vitepress/config.mts` and theme files unless yours.
- Do not link to internal pages you were not told exist (stubs are allowed
  targets only when listed in your prompt).
