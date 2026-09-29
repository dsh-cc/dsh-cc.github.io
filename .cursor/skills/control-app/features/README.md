# dsh-cc docs site verification map

This directory is the maintained source for verifying what a reader can do on
the docs site. Read the index before driving, then use the matching feature
file as the recipe.

## Baseline preconditions

- An instance started by `control-app launch` from this checkout.
- `control-app doctor` reports no `FAIL` lines.
- The build is fresh: relaunch after any `site/` edit.
- Never drive an instance this run did not start.

## Driving conventions

- Use the stable handles named in each file (VitePress class names and ARIA
  labels from `site/.vitepress/config.mts`), not coordinates.
- Every feature covers both locales: English at `/`, Chinese at `/zh/`.
- Pages are served as `<path>.html` (the site does not enable `cleanUrls`).

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- Record the feature id and entry point with every artifact (`report.json`
  does this per step).
- Report an unreachable path with the attempted step and the unmet
  precondition. Do not report a skipped entry point as verified through a
  different path.

## Features

- [Locales](./locales.md) covers the English and Chinese home pages.
- [Nav and sidebar](./nav-sidebar.md) covers top-nav sections and sidebar pages in both locales.
- [Search](./search.md) covers local search per locale, results, and opening a result.
- [Language switch](./language-switch.md) covers the language menu, the remembered choice, and first-visit routing.
- [Doc pages](./doc-pages.md) covers rendering a named page and its sections in both locales.
