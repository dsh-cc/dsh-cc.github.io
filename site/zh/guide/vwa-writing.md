---
title: VWA 写作与评审
description: 用来源证据、论断标记、论证图和语义评审通道来写作与审查文档。
---

# VWA 写作与评审

这一页面向这样的需求：你要写一篇文档——研究文章、历史或文学分析、技术报告——其中的论断能追溯到来源文件，并由一个评审过程核验，而不只是口头断言。VWA 就是这条通道：它把一个写作技能与证据注册、论证图、以及给结果打分的语义评审组合在一起。CC 仍然是默认 preset——只安装 `dsh-cc-agents` 插件不会选中任何东西。

## 前置条件

- dsh >= 0.2.0-rc.2，并安装 `@dsh-cc/cli` 启动器。
- `dsh-cc-agents` 插件（见[插件](/zh/guide/plugins)）。
- 带 lane-2 交付工具的 dsh-cc 构建。其他 Claude 兼容宿主可以加载 `vwa-writing` 技能，但没有必要的工具，下面的工作流无法在那里运行。

## 安装步骤

1. 按[插件](/zh/guide/plugins)一节的说明安装或更新 `dsh-cc-agents`——只更新 marketplace 并不会更新已安装的插件。
2. 把以下配置加入 `$DSH_HOME/settings.json`（默认目录为 `~/.dsh`）：

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

3. 重启 dsh，让启用的工具挂载。
4. 运行 `/preset vwa`。如果会话已锁定，请新开一个会话。
5. 在工作区内运行一次 `/vwa init`。
6. 用 `/skills` 检查 `vwa-writing` 是否出现。

`vwa-writing` 技能在动手之前会自行检查前置条件。如果安装未完成，它会把缺的用户操作汇总在一条消息里报告——你不需要自己去排查哪里出了问题。

## 使用技能

安装完成后，直接告诉 agent 你要什么。审查一篇已有文章、对照一组来源：

```text
Use vwa-writing to review docs/article.md against docs/sources/. Do not change the article.
```

写新文章时，给出研究问题、来源范围和输出路径。如果你想要的是修复而不仅仅是只读报告，请明确说明——只有你允许时，agent 才会改动正文。例如：

```text
Use vwa-writing to write a Chinese article about the port closure.
Use docs/sources/ as evidence. Write docs/article.md.
Explain the supported conclusions, disputed claims, and missing evidence.
You may revise the article after review.
```

::: tip
在请求里写明输出路径。只要求证据核验、不改文章的请求仍然属于 `vwa-writing`；`dsh-cc-writing` 插件自带的技能是另一条通道（见下文）。
:::

## 一次运行长什么样

在幕后，一次 `vwa-writing` 运行遵循这个顺序：

1. 检查可用工具、设置和当前项目。
2. 设定研究契约。
3. 读取来源，然后不做改动地注册来源摘录。
4. 把实际发生的搜索记录进搜索日志。
5. 构建论断、证据分组和论证。
6. 绑定正文。
7. 对所有阶段启动评审。
8. 等待宿主任务并检视发现。
9. 在冻结的预算内做已批准的修复，重新绑定改动过的材料，并再次评审。
10. 出报告，然后通过宿主呈现指定的正文和报告路径。

这些步骤不需要你来驱动——技能自己完成。了解这个形状有助于你读它的报告：发现会引用论断和证据分组，而修复过的正文总是要经过新的绑定和评审。

## 证据规则

这条通道的保证大部分来自两条规则：

- **论断标记。** 交付物中每个可核验的论断都紧跟证据标记 `〔src:ws:<path>#L<a>-L<b>〕`。路径是 POSIX 路径，相对工作区根；`L<a>-L<b>` 是支撑内容的行区间（单行写作 `#L7-L7`）。多个来源用 `;` 连在同一个标记里，且标记绝不指向工作区之外——越界的标记会让整个产物核验失败。可核验的论断包括带单位或百分比的数字、日期、版本号，以及 API 或标识符形状；只提到实体名不算论断，标记只在正文中被识别，代码 span 和围栏代码块内无效。外部材料（网页、论文、第三方文档）必须先快照进工作区，才能合法地作为标记来源。
- **只用编辑工具改文件。** 文件改动只走 write/edit 工具——bash 重定向的编辑对证据管线不可见，文档不会留下回执，永远无法通过核验。

绑定的产物路径受哈希监视：任何编辑器改动——包括通过 shell 重定向做的改动——都会使绑定失效，强制重新绑定并完整重新评审。

## 评审行为与限制

工作流注册来源摘录、构建论证图、绑定正文，并对所有阶段启动评审。agent 会等待任务完成后再做报告。相关改动之后，已批准的修复需要新的绑定和评审。

运行时的判定是权威的：

- 运行时设置等级和交付状态——技能或 critic 的意见都不能替代它们。
- 未完成的任务、失败的检查或耗尽的预算绝不构成一次通过的评审；运行时可以交付未核验的草稿。
- 项目的评审限额在初始化时冻结。评审会增加模型调用、时间和 token 开销。
- 只有你能运行 `/vwa sign` 和 `/vwa adjudicate`。

`review-alias` 选择评审模型别名，默认为 `sonnet`。缺失的内置别名可以继承父级模型。别名是一个配置名，不是固定模型——别名如何映射到 provider 见[模型路由](/zh/guide/model-routing)。

::: warning
语义评审是实验性的。人工标注研究有 60 个案例；该研究与用真实模型做的验收测试都尚未完成。一个等级并不表示所有论断都正确。
:::

## 命令

VWA preset 会添加 `/vwa` 项目命令：

| 命令 | 作用 |
| --- | --- |
| `/preset vwa` | 切换新会话的默认 preset（用 `/preset cc` 切回）。 |
| `/vwa init` | 初始化工作区的 VWA 项目——每个工作区运行一次。 |
| `/vwa status` | 查看当前项目状态。 |
| `/vwa sign` / `/vwa adjudicate` | 仅限用户运行的命令；agent 无法执行。 |

## 与 dsh-cc-writing 的关系

单独的 `dsh-cc-writing` 插件提供 article-writing、article-review 和 language-editing 技能（见[插件](/zh/guide/plugins)）：

- **普通模式**下它独立工作——无需任何 VWA 安装。它做规划、评审和带保全检查的编辑，编辑报告落在磁盘上。
- **证据模式**下它需要 VWA 运行时（交付工具、语义设置、VWA preset、已初始化的项目），并把它自己的编辑报告与 VWA 报告分开保存。

一句话：`vwa-writing` 负责证据评审；`dsh-cc-writing` 负责编辑循环，只在你要求注册来源时借用 VWA 运行时。

## 下一步

- [Skills](/zh/guide/skills) —— `SKILL.md` 技能如何被发现和调用，包括插件提供的技能。
- [Settings](/zh/reference/settings) —— settings 级联，包括 `vwa-argument` 和 `vwa-evidence` 命名空间。
- [Plugins](/zh/guide/plugins) —— 从 `dsh-cc` marketplace 安装 `dsh-cc-agents` 和 `dsh-cc-writing`。
