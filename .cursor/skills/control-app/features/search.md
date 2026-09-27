# Search

The site uses VitePress local search (MiniSearch) with a CJK-aware tokenizer.
Each locale searches only its own pages.

## Sub-features

- `search-open` opens the search modal from the nav button.
- `search-match` lists results for a query, all within the current locale.
- `search-open-result` opens the highlighted result with Enter.

## How to get to it (user POV)

- Click the search button in the nav: `Search` (EN) or `搜索文档` (ZH).
- Press `Ctrl+K` (or `/`) outside an input.

## Driving it with control-app

Preconditions:

- A launched instance with a clean `control-app doctor`.

- **English query.** Plan `"features": ["search"]`, optional `"search": {"en": "<q>", "zh": "<q>"}` (default `auto-mode` / `权限`). Step `search:en:<q>` clicks `button.DocSearch-Button[aria-label="Search"]`, fills `.VPLocalSearchBox input.search-input`, and waits for `.VPLocalSearchBox .results li a`. It passes when no result points into `/zh/`, then presses Enter and passes when the URL equals the first result's path. Evidence is `search-en-results.png`; `report.json` lists the result hrefs and the landing URL.
- **Chinese query.** Step `search:zh:<q>` uses the `搜索文档` button and requires every result under `/zh/`. Evidence is `search-zh-results.png`.

## Gotchas

- The search index is built at `pnpm docs:build` time. New headings are
  searchable only after a relaunch.
- Enter opens the highlighted row (the first by default), which is often a
  section anchor such as `/reference/permission-modes.html#auto-mode`.
