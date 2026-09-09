---
title: MCP 服务器
description: 通过 `.mcp.json` 文件把 MCP 服务器（工具、资源、prompts）接入你的 dsh-cc 智能体，并按需配置 Serena 代码智能。
---

# MCP 服务器

本指南面向想为 dsh-cc 会话扩展能力的人——GitHub 访问、网页抓取、自定义内部工具，或符号级代码智能。CC preset 内置一个 MCP 客户端，可连接 [Model Context Protocol](https://modelcontextprotocol.io) 服务器，并把它们的 tools、resources 和 prompts 暴露给智能体，支持 OAuth 2.1 流程用于需要认证的服务器。

## 配置：`.mcp.json`

服务器在 `.mcp.json` 文档的 `mcpServers` map 下声明。典型文档：

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

支持三种服务器形态：

| 形态 | `type` | 必填 | 说明 |
| --- | --- | --- | --- |
| `stdio` | 省略或 `"stdio"` | `command` | `args`、`env`、`cwd` 可选 |
| `http` | `"http"`（也接受旧写法 `"streamable-http"`） | `url` | `headers` 可选 |
| `sse` | `"sse"` | `url` | `headers` 可选 |

`command`、`args`、`cwd`、`env` 值、`url` 和 `headers` 中的字符串支持 `${VAR}` 替换（变量未设置时在加载期抛错）、`${VAR:-default}` 回退值，以及 `$$` 表示字面 `$`。

## 发现顺序

未显式配置时，dsh-cc 按以下顺序发现 `.mcp.json` 文件：

| # | 文件 | 类别 |
| --- | --- | --- |
| 1 | `<cwd>/.mcp.json` | dsh 原生（项目级） |
| 2 | `$DSH_HOME/.mcp.json`（默认 `~/.dsh/.mcp.json`） | dsh 原生（用户级） |
| 3 | `$CLAUDE_CONFIG_DIR/.mcp.json`（默认 `~/.claude/.mcp.json`） | Claude Code 配置 |
| 4 | `~/.claude.json` | Claude Code 配置 |

插件也可以在清单中声明 MCP 服务器（`mcpServers` 或 `.mcp.json`）——见[插件](/zh/guide/plugins)。插件声明的服务器先挂载：同名插件服务器会遮蔽 `.mcp.json` 服务器，且插件声明的服务器不支持 OAuth。

### dsh 优先（dsh-first）规则

dsh-cc 有一条刻意的 dsh-first 规则，Claude Code 没有对应机制：当 dsh 原生配置（项目 `.mcp.json` 或 `$DSH_HOME/.mcp.json`）声明了至少一个服务器时，Claude Code 的 MCP 配置文件**不会**被加载。被跳过的 claude-only 服务器会通过 logger warn、一次性的会话启动 TUI 提示，以及自动清除的 `/mcp` 状态行暴露出来。

两个逃生舱口可恢复或覆盖这一合并行为：

| 配置项 | 效果 |
| --- | --- |
| `mcpLoadClaudeFiles: true` | 在 cc-shell-glue 上恢复旧的 all-merge 行为（即使 dsh 原生配置声明了服务器，也加载 Claude Code 文件）。 |
| `mcpConfigFiles` | 显式指定 `.mcp.json` 路径列表；完全绕过门控，按原样生效。 |

::: info
根据 parity matrix，MCP 配置发现优先级相对 Claude Code 标记为 **divergent / partial**——这条门控是 dsh-cc 特有行为，不是 Claude Code 兼容面。
:::

格式错误的配置会在加载时大声失败——非对象主体、缺失或非 map 的 `mcpServers`、重复的服务器名、未知 transport 类型、缺失必填的 `command`/`url`，或未设置的 `${VAR}`。

## 会话内管理

使用 `/mcp` 查看和管理 MCP 连接：

| 命令 | 作用 |
| --- | --- |
| `/mcp list` | 列出已注册的 MCP 服务器及其连接 |
| `/mcp reconnect <name>` | 按名称重连一个服务器 |
| `/mcp disconnect <name>` | 按名称断开一个服务器 |

如果你来自 Claude Code，`/mcp migrate` 会把你的 Claude Code MCP 服务器导入 `$DSH_HOME/.mcp.json`（原始条目逐字保留，原子写入并留 `.bak` 备份；已存在的名称优先）。完整迁移流程见[从 Claude Code 迁移](/zh/guide/from-claude-code)。

## 实战示例：Serena 代码智能

[Serena](https://github.com/oraios/serena) 是一个提供符号级代码智能的 MCP 服务器。当你的 MCP 配置接上它之后，dsh-cc 会自动加以利用：系统提示会引导代码问题优先使用 Serena 的符号工具，内置的 `explore` 子智能体也获得只读符号检索能力。Serena 严格可选——没有它，会话通过内置 Read/Grep 工具的表现完全一致，只是少了这些引导提示。

把它加入 `~/.dsh/.mcp.json`（或项目级 `.mcp.json`）：

```json
{
  "mcpServers": {
    "serena": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/oraios/serena@v1.7.0", "serena", "start-mcp-server", "--context", "claude-code", "--project-from-cwd"]
    }
  }
}
```

重启会话后，用 `/doctor` 验证——它会在 `mcp.serena` 检查项下报告该连接。

日常运维方面，代码智能健康 runbook 记录了两个 Serena 侧命令：

```bash
$ uvx --from git+https://github.com/oraios/serena@v1.7.0 serena project health-check
```

```bash
$ uvx --from git+https://github.com/oraios/serena@v1.7.0 serena project index
```

runbook 的要点：

- `health-check` 失败时退出码为 1（自 v1.7.0 起）；检查期间出现零匹配的 `find_symbol` 也算失败。它会另起一个独立的 uvx 实例和自己的语言服务器——校验的是项目配置，不是会话中的实时服务器。
- `index` 预热符号缓存，缓存按 worktree 隔离：即使主检出已建立索引，新 worktree 仍从冷缓存开始。预热是可选的——对大项目的长会话有用，其余情况可跳过。
- 启动失败在日志里是响亮的，但不会告知模型（`failOnStartupError` 默认为 `true`）：如果 `mcp__serena__*` 调用莫名失败，先检查 harness 日志。

## 企业级 allow/deny 策略

`@dsh-cc/mcp-config` 加载器在服务器被翻译为客户端注册项之前应用企业级 allow/deny 策略：返回 `true` 的 `deny(name, entry)` 钩子会丢弃该服务器（先执行，优先生效）；存在 `allow(name, entry)` 钩子时，只有它返回 `true` 的服务器会被保留。策略在解析与校验之后、翻译之前，按稳定的配置顺序执行，被拒绝的服务器不会到达客户端。这是库级别的 `McpConfigPolicy` 钩子，供以编程方式组装加载器的部署使用。

## 下一步

- [从 Claude Code 迁移](/zh/guide/from-claude-code)——把现有 `.claude/` 工作区（包括 MCP 服务器）迁移到 dsh-cc。
- [MCP 配置参考](/zh/reference/mcp-config)——完整的 `.mcp.json` schema、环境变量展开与策略细节。
- [快速开始](/zh/quickstart)——安装 dsh-cc 并开始第一个会话。
