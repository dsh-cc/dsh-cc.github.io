---
title: MCP 配置
description: dsh-cc 的 .mcp.json 模式、MCP 配置发现优先级、dsh-first 门控规则，以及 /mcp 命令。
distilled-from: dsh-cc v0.6.3
---

# MCP 配置

dsh-cc 通过 `@dsh-cc/mcp-config` 从 Claude Code 风格的 `.mcp.json` 加载 MCP
服务器：解析并校验文档、展开环境变量替换、应用企业级 allow/deny 策略，然后把
被接受的服务器翻译成 `@dsh-cc/mcp-client` 注册项。这个包只拥有文件→配置的读取
与校验面——不做任何网络 I/O，也不挂载任何东西。格式错误的配置在加载时抛出；
加载失败是响亮的，而不是静默丢失服务器。

## `.mcp.json` 模式

文档是一个以服务器名为键的 `mcpServers` 映射（也接受此类对象的数组；数组形式
拒绝重复出现的名字）：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    },
    "web": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${MCP_TOKEN}" }
    },
    "feed": {
      "type": "sse",
      "url": "https://sse.example.com/events"
    }
  }
}
```

| 形态 | `type` | 必填 | 可选 |
|---|---|---|---|
| `stdio` | 省略或 `"stdio"` | `command` | `args`、`env`、`cwd` |
| `http` | `"http"`（也接受旧式 `"streamable-http"`） | `url` | `headers` |
| `sse` | `"sse"` | `url` | `headers` |

每个被接受的服务器变成一个 `@dsh-cc/mcp-client` 注册项：服务器名是模型可见
工具名（`mcp__<serverName>__*`）的 `serverName` 命名空间；注册项默认
`toolCallTimeoutMs` 为 60000、`failOnStartupError` 为 `true`。

`command`、`args`、`cwd`、`env` 值、`url` 和 `headers` 中的字符串支持环境变量
展开：

| 形式 | 含义 |
|---|---|
| `${VAR}` | 替换为环境变量值；未设置时**在加载时抛出**。 |
| `${VAR:-default}` | 变量未设置或为空时回退到 `default`。 |
| `$$` | 字面 `$`。 |

## 发现路径

默认查阅四个文件路径，按以下优先级：

| # | 路径 | 类别 |
|---|---|---|
| 1 | `<project>/.mcp.json` | dsh 原生 |
| 2 | `$DSH_HOME/.mcp.json`（默认 `~/.dsh/.mcp.json`） | dsh 原生 |
| 3 | `$CLAUDE_CONFIG_DIR/.mcp.json`（默认 `~/.claude/.mcp.json`） | Claude Code |
| 4 | `~/.claude.json` | Claude Code |

`DSH_HOME` 会重定位 dsh 路径和 migrate 目标；`CLAUDE_CONFIG_DIR` 重定位 Claude
配置目录，但不影响 `~/.claude.json`。

::: warning dsh-first 规则
当 dsh 原生配置（项目 `.mcp.json` 或 `$DSH_HOME/.mcp.json`）声明了至少一个
服务器时，Claude Code 的 MCP 配置文件**不会**被加载。被跳过的 claude-only
服务器会通过一条 logger 警告、一条一次性的会话启动 TUI 通知和一个自清除的
`/mcp` 状态行呈现。cc-shell-glue 配置上有两个逃生口：`mcpLoadClaudeFiles: true`
恢复旧的全部合并行为；显式的 `mcpConfigFiles` 列表则完全绕过门控。
:::

企业级 allow/deny 策略可以在翻译之前过滤服务器：`deny(name, entry)` 返回
`true` 则丢弃该服务器（先运行，优先）；`allow` 钩子（存在时）只保留返回
`true` 的服务器。被拒绝的服务器永远不会到达客户端。

## `/mcp migrate`

`/mcp migrate` 把 Claude Code 配置文件中的服务器导入 `$DSH_HOME/.mcp.json`：

- **目标：** `$DSH_HOME/.mcp.json`（dsh 原生的用户级文件）。
- **原样 + 原子：** 原始条目按原样复制，采用原子写入，并为旧文件留下 `.bak`
  备份。
- **已有名字获胜：** 目标中已声明的服务器不会被覆盖。
- **幂等：** 成功 migrate 之后重跑不会导入任何新内容。

完整的迁移故事（包括还有什么会从 Claude Code 迁移过来）见
[/guide/from-claude-code](/zh/guide/from-claude-code)。

## `/mcp` 子命令

| 调用 | 行为 |
|---|---|
| `/mcp` | 列出已注册服务器（名称、连接状态、工具数、是否需要 OAuth）。 |
| `/mcp reconnect <name>` | 重连一个服务器。 |
| `/mcp disconnect <name>` | 断开一个服务器。 |
| `/mcp migrate` | 把 Claude Code 服务器导入 `$DSH_HOME/.mcp.json`（见上文）。 |

## 下一步

- [/guide/mcp-servers](/zh/guide/mcp-servers) — 运行与排查 MCP 服务器。
- [/guide/from-claude-code](/zh/guide/from-claude-code) — 完整的迁移指南。
- [/reference/commands](/zh/reference/commands) — 全部斜杠命令，含 `/mcp`。
