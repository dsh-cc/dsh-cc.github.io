# dsh-cc.github.io

Project homepage and documentation site for [dsh-cc](https://github.com/dsh-cc/dsh-cc),
served at <https://dsh-cc.github.io> via GitHub Pages.

## Layout

The site is built with [VitePress](https://vitepress.dev) (the docs outgrew the
original framework-free landing page):

- `site/*.md` — English pages (root locale)
- `site/zh/*.md` — 简体中文 mirrors, same paths under `/zh/`
- `site/.vitepress/config.mts` — VitePress config (locales, nav/sidebar, search)
- `site/.vitepress/theme/` — custom theme: `custom.css`, `InstallCommand.vue`
- `.github/workflows/pages.yml` — builds and deploys the site on every push to `main`

## Commands

```sh
pnpm install       # install dependencies
pnpm docs:dev      # local dev server
pnpm docs:build    # build the site into site/.vitepress/dist
pnpm docs:preview  # preview the built site locally
pnpm check:docs    # bilingual / consistency checks
```

## Deployment

The site deploys via GitHub Actions on every push to `main` (`.github/workflows/pages.yml`,
Pages source is **GitHub Actions**; no `gh-pages` branch, no Jekyll).

## Writing docs

Authoring rules live in [WRITING.md](WRITING.md):

- Every page exists in English (`site/<path>.md`) and Chinese (`site/zh/<path>.md`)
  and must land in the **same PR**.
- Pages are distilled from files in the sibling `../dsh-cc` repo — never invent
  flags, defaults, or output.

### Maintenance

On every dsh-cc release, review and refresh distilled pages; a weekly CI check
opens a stale-docs issue when upstream README changes.

## Language routing

First-time visitors with a Chinese browser language are routed from `/` to
`/zh/`; an explicit click on a language switch link is remembered
(`localStorage dshcc-lang`) and always wins thereafter.
