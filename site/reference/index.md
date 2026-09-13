---
title: Reference
description: Quick catalog of the dsh-cc reference pages — flags, env vars, commands, and configuration.
distilled-from: dsh-cc v0.6.3
---

# Reference

This section is the lookup layer of the docs: exact flags, variables,
commands, and configuration keys, distilled from the dsh-cc sources. Each
page states what something is and what it does — no tutorials, no invented
defaults. When a behavior is partial or missing, the page says so.

- [/reference/cli](/reference/cli) — the `dsh-cc` bin and the flags it accepts before spawning `dsh --profile tui`.
- [/reference/env-vars](/reference/env-vars) — the `DSH_CC_*` environment contract between launcher and TUI plugin.
- [/reference/commands](/reference/commands) — slash commands available in the TUI.
- [/reference/permission-modes](/reference/permission-modes) — permission modes and how prompts are surfaced.
- [/reference/settings](/reference/settings) — the settings cascade.
- [/reference/mcp-config](/reference/mcp-config) — MCP server configuration.
- [/reference/extension-formats](/reference/extension-formats) — supported extension formats.
- [/reference/compatibility](/reference/compatibility) — how dsh-cc relates to Claude Code, honestly.

Start with [/reference/cli](/reference/cli) if you are coming from the
quick-start; read [/reference/compatibility](/reference/compatibility) before
assuming a Claude Code habit carries over.
