import { defineConfig } from 'vitepress'

// The site hostname: GitHub Pages org site, served at root.
const HOST = 'https://dsh-cc.github.io'

function canonicalPath(pageData) {
  // pageData.relativePath is like 'guide/hooks.md' or 'zh/guide/hooks.md'
  const rel = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1')
  const clean = rel.replace(/\.md$/, '')
  return '/' + clean + (clean === '' || clean.endsWith('/') ? '' : '')
}

export default defineConfig({
  lang: 'en-US',
  title: 'dsh-cc',
  siteTitle: '🐋 dsh-cc',
  description:
    'dsh-cc turns DeepSeek Harness into a batteries-included coding agent environment: Claude Code-style workflows with your choice of models, tools, and permissions.',
  appearance: 'force-dark',
  lastUpdated: true,
  sitemap: { hostname: HOST },
  // cleanUrls deliberately NOT enabled: GitHub Pages serves .html files
  // directly and cleanUrls risks 404s without extra rewrite rules.
  head: [
    [
      'link',
      {
        rel: 'icon',
        href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%90%8B%3C/text%3E%3C/svg%3E",
      },
    ],
    // First visit only: route Chinese-preference browsers to /zh/.
    // An explicit click on a language link stores dshcc-lang and always wins.
    [
      'script',
      {},
      `try {
  var pref = localStorage.getItem('dshcc-lang');
  if (!pref && (navigator.language || '').toLowerCase().indexOf('zh') === 0 && location.pathname === '/') {
    location.replace('/zh/');
  }
} catch (e) { /* storage unavailable — stay on this page */ }`,
    ],
  ],
  transformPageData(pageData) {
    if (import.meta.env?.SSR && pageData.relativePath == null) return
    const rel = (pageData.relativePath || '').replace(/\.md$/, '')
    const normalized = rel.replace(/(^|\/)index$/, '$1')
    const enPath = normalized.replace(/^zh\//, '')
    const zhPath = '/zh/' + enPath
    const enUrl = HOST + '/' + enPath
    const zhUrl = HOST + zhPath
    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: enUrl }],
      ['meta', { property: 'og:url', content: enUrl }],
      ['link', { rel: 'alternate', hreflang: 'en', href: enUrl }],
      ['link', { rel: 'alternate', hreflang: 'zh', href: zhUrl }],
    )
  },
  locales: {
    root: { label: 'English', lang: 'en-US' },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        nav: [
          // TODO(P2): flip `文档` to internal entries (/zh/quickstart, /zh/guide/, /zh/reference/)
          // once the doc pages land and are no longer stubs.
          { text: '文档', link: 'https://github.com/dsh-cc/dsh-cc/blob/main/README.zh.md' },
          { text: 'GitHub', link: 'https://github.com/dsh-cc/dsh-cc' },
          { text: 'npm', link: 'https://www.npmjs.com/org/dsh-cc' },
          { text: '发布', link: 'https://github.com/dsh-cc/dsh-cc/releases' },
        ],
        sidebar: {
          '/zh/guide/': [
            { text: '概览', link: '/zh/guide/' },
            {
              text: '入门',
              items: [
                { text: '交互式会话基本功', link: '/zh/guide/interactive-basics' },
                { text: '自带模型路由', link: '/zh/guide/model-routing' },
              ],
            },
            {
              text: '迁移',
              items: [
                { text: '从 Claude Code 迁移', link: '/zh/guide/from-claude-code' },
                { text: 'CI 与非交互使用', link: '/zh/guide/ci-headless' },
              ],
            },
            {
              text: '扩展',
              items: [
                { text: 'Hooks', link: '/zh/guide/hooks' },
                { text: 'Skills', link: '/zh/guide/skills' },
                { text: 'Plugins', link: '/zh/guide/plugins' },
                { text: '子代理', link: '/zh/guide/subagents' },
                { text: 'MCP 服务器', link: '/zh/guide/mcp-servers' },
              ],
            },
            {
              text: '进阶',
              items: [
                { text: '权限与审批', link: '/zh/guide/permissions' },
                { text: '记忆体系', link: '/zh/guide/memory' },
                { text: '后台任务与子代理', link: '/zh/guide/background-tasks' },
              ],
            },
          ],
          '/zh/reference/': [
            { text: '概览', link: '/zh/reference/' },
            { text: 'CLI 参数', link: '/zh/reference/cli' },
            { text: '斜杠命令', link: '/zh/reference/commands' },
            { text: '设置级联', link: '/zh/reference/settings' },
            { text: '环境变量', link: '/zh/reference/env-vars' },
            { text: '权限模式', link: '/zh/reference/permission-modes' },
            { text: 'MCP 配置', link: '/zh/reference/mcp-config' },
            { text: '扩展格式', link: '/zh/reference/extension-formats' },
            { text: 'Claude Code 兼容性', link: '/zh/reference/compatibility' },
          ],
        },
        editLink: {
          pattern: 'https://github.com/dsh-cc/dsh-cc.github.io/edit/main/site/:path',
          text: '在 GitHub 上编辑此页',
        },
        docFooter: {
          prev: '上一页',
          next: '下一页',
        },
        outline: { level: [2, 3], label: '本页目录' },
        footer: {
          message: 'dsh-cc 不是 Claude Code，也不是 Claude Code 的包装器。与 Anthropic 无关联，亦未获其背书。',
          copyright: 'Apache-2.0 许可 · 官方包仅发布于 npm @dsh-cc scope',
        },
      },
    },
  },
  themeConfig: {
    nav: [
      // TODO(P2): flip `Docs` to internal entries (/quickstart, /guide/, /reference/)
      // once the doc pages land and are no longer stubs.
      { text: 'Docs', link: 'https://github.com/dsh-cc/dsh-cc#readme' },
      { text: 'GitHub', link: 'https://github.com/dsh-cc/dsh-cc' },
      { text: 'npm', link: 'https://www.npmjs.com/org/dsh-cc' },
      { text: 'Releases', link: 'https://github.com/dsh-cc/dsh-cc/releases' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Overview',
          link: '/guide/',
        },
        {
          text: 'Getting started',
          items: [
            { text: 'Getting around a session', link: '/guide/interactive-basics' },
            { text: 'Bring your own models', link: '/guide/model-routing' },
          ],
        },
        {
          text: 'Migration',
          items: [
            { text: 'Migrate from Claude Code', link: '/guide/from-claude-code' },
            { text: 'Headless & CI usage', link: '/guide/ci-headless' },
          ],
        },
        {
          text: 'Extending',
          items: [
            { text: 'Hooks', link: '/guide/hooks' },
            { text: 'Skills', link: '/guide/skills' },
            { text: 'Plugins', link: '/guide/plugins' },
            { text: 'Subagents', link: '/guide/subagents' },
            { text: 'MCP servers', link: '/guide/mcp-servers' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Permissions & approvals', link: '/guide/permissions' },
            { text: 'Memory', link: '/guide/memory' },
            { text: 'Background tasks & agents', link: '/guide/background-tasks' },
          ],
        },
      ],
      '/reference/': [
        { text: 'Overview', link: '/reference/' },
        { text: 'CLI flags', link: '/reference/cli' },
        { text: 'Slash commands', link: '/reference/commands' },
        { text: 'Settings cascade', link: '/reference/settings' },
        { text: 'Environment variables', link: '/reference/env-vars' },
        { text: 'Permission modes', link: '/reference/permission-modes' },
        { text: 'MCP configuration', link: '/reference/mcp-config' },
        { text: 'Extension formats', link: '/reference/extension-formats' },
        { text: 'Claude Code compatibility', link: '/reference/compatibility' },
      ],
    },
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                noResultsText: '未找到相关结果',
                resetButtonTitle: '清除查询条件',
                footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
              },
            },
          },
        },
        miniSearch: {
          options: {
            tokenize: (text, lang) => {
              // CJK text has no spaces — segment with Intl.Segmenter when available.
              try {
                const segmenter = new Intl.Segmenter(lang, { granularity: 'word' })
                return Array.from(segmenter.segment(text), (s) => s.segment).filter(Boolean)
              } catch {
                // Intl.Segmenter unavailable — fall back to default whitespace split.
                return text.split(/[\s\-_]+/).filter(Boolean)
              }
            },
          },
        },
      },
    },
    editLink: {
      pattern: 'https://github.com/dsh-cc/dsh-cc.github.io/edit/main/site/:path',
      text: 'Edit this page on GitHub',
    },
    docFooter: {
      prev: 'Previous page',
      next: 'Next page',
    },
    outline: { level: [2, 3] },
    footer: {
      message: 'dsh-cc is not Claude Code and is not a wrapper around Claude Code. Not affiliated with or endorsed by Anthropic.',
      copyright: 'Apache-2.0 licensed · Official packages only from the @dsh-cc npm scope',
    },
  },
})
