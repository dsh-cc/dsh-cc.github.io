# Language switch

The language menu in the nav switches between the English and Chinese twin of
the current page. On a first visit to `/`, a browser whose language starts
with `zh` is routed to `/zh/`. An explicit click on a cross-locale link is
meant to be remembered in `localStorage` `dshcc-lang` so the first-visit
routing never overrides it (README "Language routing").

## Sub-features

- `langswitch-menu` switches to the twin page through the language menu.
- `langswitch-remember` stores `dshcc-lang` on an explicit cross-locale click.
- `langswitch-first-visit` routes a fresh zh browser from `/` to `/zh/`.
- `langswitch-explicit-wins` keeps a zh browser on `/` after it chose English.

## How to get to it (user POV)

- Hover the nav button labelled `Change language` and click `简体中文` or
  `English`.
- Open `/` in a browser whose language is Chinese, with no stored choice.

## Driving it with control-app

Preconditions:

- A launched instance with a clean `control-app doctor`.

- **EN to ZH.** Plan `"features": ["langswitch"]`. Step `langswitch:en->zh` opens `/guide/permissions`, clears `dshcc-lang`, hovers `.VPNavBarTranslations button[aria-label="Change language"]`, clicks the `简体中文` link, and passes when the URL starts with `/zh/guide/permissions` and `dshcc-lang` is `zh`.
- **ZH to EN.** Step `langswitch:zh->en` switches back and requires `dshcc-lang` to be `en`.
- **First visit.** Step `langswitch:first-visit-zh-browser-routes-to-zh` opens `/` in a fresh `zh-CN` context and passes when it lands on `/zh/`.
- **Explicit choice wins.** Step `langswitch:explicit-en-choice-wins` picks `English` in that context, reopens `/`, and passes when it stays on `/`.

## Gotchas

- Known product bug, found 2026-09-28 with this skill: the remember steps fail
  on a real mouse click. VitePress's router handles link clicks in a
  `window` capture listener and updates the URL before the theme's `document`
  capture listener (`site/.vitepress/theme/index.ts`) runs, so the theme sees
  the target locale as the current one and never writes `dshcc-lang`. A
  script-dispatched `element.click()` hides the bug because microtasks do not
  run between listeners. Keep the real click; do not weaken these assertions.
- The first-visit steps use a second browser context, so they are not in
  `walkthrough.webm`; their screenshots are the evidence.
