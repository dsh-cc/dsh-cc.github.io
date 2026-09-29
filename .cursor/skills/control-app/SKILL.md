---
name: control-app
description: Launch the built dsh-cc docs site (VitePress, English at `/`, Chinese at `/zh/`) on a local port and drive it in headless Chromium with Playwright, covering locales, nav and sidebar, local search, the language switch, and per-page and per-section screenshots plus one `.webm` walkthrough. Use it to prove docs changes render before opening a PR, to check how a page looks, or to debug site behavior.
---

# control-app

The user surface is the static docs site that `pnpm docs:build` writes to
`site/.vitepress/dist` and GitHub Pages serves. This skill serves that build
with `pnpm docs:preview` and drives it the way a reader does. Every command
below runs from the repo root through one helper:

```sh
S=.cursor/skills/control-app/scripts/control-app
```

## Prerequisites

- Node >= 22.19 on `PATH` (the repo's `engines`). If the default `node` is
  older, set `CONTROL_APP_NODE_DIR=<dir containing node>`; the helper prepends
  it.
- pnpm 10 (the repo pins `packageManager: pnpm@10.34.5`).
- Run `$S setup` once per machine. It installs `playwright@1.63.0` plus its
  Chromium into `~/.cache/control-app/tools` (override with
  `CONTROL_APP_TOOLS`) and runs `pnpm install --frozen-lockfile`. Playwright
  is kept out of the site's `package.json` on purpose.

## Launch

`$S launch [port]` runs `pnpm docs:build`, then starts
`pnpm docs:preview --port <port>` in its own session (a free port when none is
given). It is ready when the preview log prints `served at
http://localhost:<port>/` and both `/` and `/zh/` answer 200; the command
prints `ready: http://127.0.0.1:<port>`. State (pid, port, URL, hash of the
built `index.html`, logs) lives in
`${CONTROL_APP_STATE:-/tmp/control-app-<repo>-<uid>}`. Launch refuses to start
a second instance on the same state dir.

Relaunch after editing any `site/` file: the preview serves the build, not the
sources.

## Doctor

`$S doctor` is read-only. Run it first whenever anything looks off. It
checks Node, the Playwright install, that the recorded pid is our
`vitepress preview`, that `/` and `/zh/` answer 200, that the served
`index.html` matches the build recorded at launch (so the port is not some
other server), and warns when sources changed after the build. Any `FAIL`
line exits 1.

## Drive

`$S drive [--plan plan.json] [--evidence DIR]` runs
`scripts/drive.mjs` against the running instance in one recorded Chromium
context (1280x800). Without `--plan` it runs every feature against
`/reference/commands`. A plan overrides any of these keys:

```json
{
  "features": ["locales", "nav", "search", "langswitch", "pages"],
  "search": { "en": "auto-mode", "zh": "权限" },
  "pages": [
    { "path": "/reference/commands", "sections": { "en": ["Configuration"], "zh": ["配置"] } }
  ]
}
```

`pages[].path` is the English path without `.html`; the driver also visits
the `/zh` twin. `sections` are h2/h3 heading texts (exact or prefix match) per
locale. A missing heading fails the step, so a section screenshot proves the
content exists. The recipes, stable handles, and gotchas per feature are in
[features/README.md](features/README.md).

## Evidence

`--evidence DIR` defaults to `~/control-app-evidence/<UTC timestamp>`. A run
writes:

- `walkthrough.webm`: the whole main-context session.
- `locales-*.png`, `nav-*.png`, `search-*-results.png`, `langswitch-*.png`.
- `page-<slug>.png` (full page) and `section-<slug>-<n>.png` (clipped from the
  heading to the next heading of the same level) for every plan page.
- `fail-<step>.png` for each failed step.
- `report.json`: every step with its URL, assertion data, screenshot name, and
  error, plus browser console errors. The driver exits 1 when any step fails.

Proof standards:

- Drive the real reader path: click the nav, sidebar, search box, and language
  menu. Do not `goto` the destination and call it navigation.
- Capture the action and the resulting state: the search screenshot shows the
  query and results before Enter, and the step records where Enter landed.
- Check side effects alongside pixels: the language steps read
  `localStorage` `dshcc-lang`, and `report.json` records it.
- Open the screenshots you cite. A green step with the wrong page in its
  screenshot is not proof.

## Cleanup

`$S stop` kills the process group the launch recorded (never by process
name) and deletes the state dir. It never touches evidence. `$S prove [--port
N] [--plan F] [--evidence D]` runs launch, doctor, and drive, and stops the
instance on exit even when a step fails.

## Isolation

Instances are independent per `CONTROL_APP_STATE` and port. Two agents can run
side by side by giving each its own `CONTROL_APP_STATE`. `pnpm docs:build`
writes the shared `site/.vitepress/dist`, so do not launch two instances from
the same checkout at once.

## Maintenance

Keep [features/](features/README.md) in step with `site/.vitepress/config.mts`
(nav labels, sidebar items, search translations). A renamed label breaks the
matching driver step, which is the point.
