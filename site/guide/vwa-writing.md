---
title: VWA writing and review
description: Write and review documents with source evidence, claim markers, an argument graph, and a semantic review lane.
---

# VWA writing and review

This page is for anyone who wants a document — a research article, a historical
or literary analysis, a technical report — whose claims can be traced back to
source files and checked by a review process, not just asserted. VWA is that
lane: it pairs a writing skill with evidence registration, an argument graph,
and a semantic review that grades the result. CC stays the default preset —
installing the `dsh-cc-agents` plugin alone selects nothing.

## Prerequisites

- dsh >= 0.2.0-rc.2 with the `@dsh-cc/cli` launcher installed.
- The `dsh-cc-agents` plugin (see [Plugins](/guide/plugins)).
- A dsh-cc build with the lane-2 delivery tools. A different
  Claude-compatible host can load the `vwa-writing` skill without the
  necessary tools, so the workflow below will not run there.

## Setup

1. Install or update `dsh-cc-agents` as described in
   [Plugins](/guide/plugins) — a marketplace update alone does not update the
   installed plugin.
2. Add these settings to `$DSH_HOME/settings.json` (default directory
   `~/.dsh`):

```json
{
  "vwa-argument": {
    "semantic-enabled": true,
    "review-alias": "sonnet"
  },
  "vwa-evidence": {
    "enabled": true
  }
}
```

3. Restart dsh so the enabled tools mount.
4. Run `/preset vwa`. If the session is locked, start a new session.
5. Run `/vwa init` one time in the workspace.
6. Check that `vwa-writing` appears via `/skills`.

The `vwa-writing` skill checks prerequisites itself before doing any work. If
setup is not complete, it reports the missing user actions in one message —
you do not have to hunt for what went wrong.

## Using the skill

After setup, just tell the agent what you want. To review an existing article
against a directory of sources:

```text
Use vwa-writing to review docs/article.md against docs/sources/. Do not change the article.
```

For a new article, give the research question, the source scope, and the
output path. If you want repairs rather than a read-only report, say so — the
agent changes the body only when you allow it. For example:

```text
Use vwa-writing to write a Chinese article about the port closure.
Use docs/sources/ as evidence. Write docs/article.md.
Explain the supported conclusions, disputed claims, and missing evidence.
You may revise the article after review.
```

::: tip
Name the output path in your request. An explicit request for evidence work
without article changes still belongs to `vwa-writing`; the
`dsh-cc-writing` plugin's own skills are a different lane (see below).
:::

## What a run looks like

Behind the scenes, a `vwa-writing` run follows this sequence:

1. Check the available tools, settings, and active project.
2. Set the research contract.
3. Read sources, then register source excerpts without changes.
4. Record actual searches in the search log.
5. Build claims, evidence groups, and arguments.
6. Bind the body.
7. Start the review over all stages.
8. Wait for the host job and inspect the findings.
9. Make approved repairs within the frozen budget, re-bind changed material,
   and review it again.
10. Report, then present the specified body and report paths through the host.

You do not drive these steps — the skill does. Knowing the shape helps you
read its reports: findings reference claims and evidence groups, and a
repaired body always goes back through a fresh binding and review.

## Evidence rules

Two rules carry most of the lane's guarantees:

- **Claim markers.** Every verifiable claim in a deliverable carries an
  evidence marker `〔src:ws:<path>#L<a>-L<b>〕` immediately after the claim
  it supports. The path is POSIX and relative to the workspace root;
  `L<a>-L<b>` is the supporting line range (one line: `#L7-L7`). Multiple
  sources join with `;` inside one marker, and markers never point outside
  the workspace — an out-of-bounds marker fails the whole artifact.
  Verifiable claims include numbers with units or percentages, dates,
  versions, and API or identifier shapes; entity names alone are not claims,
  and markers are recognized only in prose, never inside code spans or fenced
  code blocks. External material (web pages, papers, third-party docs) has
  no legal marker until it is snapshotted into the workspace first.
- **Editing tools only.** File changes go through the write/edit tools
  only — a bash-redirect edit is invisible to the evidence pipeline, so the
  document leaves no receipt and never verifies.

Bound artifact paths are hash-watched: any editor change — including one made
through shell redirection — invalidates the binding and forces a re-bind and
a full re-review.

## Review behavior and limits

The workflow registers source excerpts, builds the argument graph, binds the
body, and starts the review over all stages. The agent waits for the job
before making its report. After related changes, approved repairs need a new
binding and review.

What the runtime says is authoritative:

- The runtime sets grades and delivery status — a skill or a critic opinion
  cannot replace them.
- A pending job, a failed check, or an exhausted budget never counts as a
  passed review; the runtime can deliver an unverified draft.
- Project review limits are frozen at initialization. Review adds model
  calls, time, and token use.
- Only the user can run `/vwa sign` and `/vwa adjudicate`.

`review-alias` selects the reviewer model alias; its default is `sonnet`. A
missing built-in alias can inherit the parent model. An alias is a configured
name, not a fixed model — see [Model routing](/guide/model-routing) for how
aliases map to providers.

::: warning
Semantic review is experimental. The human annotation study has 60 cases;
that study and the acceptance tests with live models are incomplete. A grade
does not show that all claims are correct.
:::

## Commands

The VWA preset adds `/vwa` project commands:

| Command | What it does |
| --- | --- |
| `/preset vwa` | Switch the saved default preset for new sessions (back with `/preset cc`). |
| `/vwa init` | Initialize the workspace VWA project — run once per workspace. |
| `/vwa status` | Inspect the current project. |
| `/vwa sign` / `/vwa adjudicate` | User-only commands; the agent cannot run them. |

## Relationship to dsh-cc-writing

The separate `dsh-cc-writing` plugin ships article-writing, article-review,
and language-editing skills (see [Plugins](/guide/plugins)):

- In **ordinary mode** it works standalone — no VWA setup is needed. It
  plans, reviews, and does preservation-checked edits, keeping its editorial
  report on disk.
- In **evidence mode** it requires the VWA runtime (delivery tools, semantic
  settings, the VWA preset, an initialized project) and keeps its editorial
  report separate from the VWA report.

In short: `vwa-writing` owns evidence review; `dsh-cc-writing` owns the
editorial loop, and only borrows the VWA runtime when you ask for registered
sources.

## Next

- [Skills](/guide/skills) — how `SKILL.md` skills are discovered and invoked,
  including plugin-provided ones.
- [Settings](/reference/settings) — the settings cascade, including the
  `vwa-argument` and `vwa-evidence` namespaces.
- [Plugins](/guide/plugins) — installing `dsh-cc-agents` and
  `dsh-cc-writing` from the `dsh-cc` marketplace.
