# Locales

The site has an English root locale at `/` (`lang="en-US"`) and a Chinese
locale at `/zh/` (`lang="zh-CN"`), each with its own nav, sidebar, and footer.

## Sub-features

- `locales-en` renders the English home page.
- `locales-zh` renders the Chinese home page.

## How to get to it (user POV)

- Open `https://dsh-cc.github.io/` or `https://dsh-cc.github.io/zh/`.
- Use the language menu (see [Language switch](./language-switch.md)).

## Driving it with control-app

Preconditions:

- A launched instance with a clean `control-app doctor`.

- **English home.** Plan `"features": ["locales"]`, then run `control-app drive --plan <plan>`. Step `locales:en-home` passes when `html[lang]` is `en-US` and `.VPNavBarTitle` contains `dsh-cc`. Evidence is `locales-en-home.png`.
- **Chinese home.** Same run. Step `locales:zh-home` passes when `html[lang]` is `zh-CN`. Evidence is `locales-zh-home.png`, with the Chinese hero and nav labels (`快速开始`, `使用场景`, `参考`).

## Gotchas

- The hero heading is "Claude Code-style workflows." and does not contain
  `dsh-cc`. The site name lives in `.VPNavBarTitle`.
- The configured site title is `🐋 dsh-cc`. Headless Chromium may render it
  without the emoji, which is a font gap, not a bug.
- The appearance is `force-dark`; there is no light-mode toggle to test.
