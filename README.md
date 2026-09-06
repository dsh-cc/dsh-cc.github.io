# dsh-cc.github.io

Project homepage for [dsh-cc](https://github.com/dsh-cc/dsh-cc), served at
<https://dsh-cc.github.io> via GitHub Pages.

## Layout

- `site/` — the static site (plain HTML/CSS/JS, no build step)
- `.github/workflows/pages.yml` — deploys `site/` on every push to `main`

Pages source is **GitHub Actions** (configured at the repo level), so no
`gh-pages` branch and no Jekyll processing are involved.

## Editing

Edit `site/index.html`, push to `main`, and the site is live in about a
minute. There is intentionally no framework or build chain — keep it that
way unless the site grows beyond a landing page.
