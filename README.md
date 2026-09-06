# dsh-cc.github.io

Project homepage for [dsh-cc](https://github.com/dsh-cc/dsh-cc), served at
<https://dsh-cc.github.io> via GitHub Pages.

## Layout

- `site/index.html` — English landing page, served at `/`
- `site/zh/index.html` — 简体中文 landing page, served at `/zh/`
- `site/assets/` — shared CSS/JS used by both languages (keep them in sync
  through these files, never by copying styles into the HTML)
- `.github/workflows/pages.yml` — deploys `site/` on every push to `main`

First-time visitors with a Chinese browser language are routed from `/` to
`/zh/`; an explicit click on a language switch link is remembered
(`localStorage dshcc-lang`) and always wins thereafter.

Pages source is **GitHub Actions** (configured at the repo level), so no
`gh-pages` branch and no Jekyll processing are involved.

## Editing

Edit `site/index.html`, push to `main`, and the site is live in about a
minute. There is intentionally no framework or build chain — keep it that
way unless the site grows beyond a landing page.
