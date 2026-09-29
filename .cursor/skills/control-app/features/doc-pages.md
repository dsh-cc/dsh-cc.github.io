# Doc pages

Every docs page exists as an English page and a Chinese twin under `/zh/`.
This feature proves that named pages render and that named sections exist,
with one full-page screenshot per page and one clipped screenshot per section.

## Sub-features

- `page-render` loads a page in both locales without the 404 view.
- `page-section` finds a heading and screenshots its section.

## How to get to it (user POV)

- Open `/<path>.html` or `/zh/<path>.html`, or reach it through the sidebar.
- Scroll to a section, or use the "On this page" outline.

## Driving it with control-app

Preconditions:

- A launched instance with a clean `control-app doctor`, built after the last
  `site/` edit.

- **Render.** Plan `"features": ["pages"]` with `"pages": [{"path": "/reference/commands"}]`. Step `page:/reference/commands` passes on HTTP 200, no `.NotFound`, and a visible `.vp-doc h1`; step `page:/zh/reference/commands` does the same for the twin. Evidence is `page-reference-commands.png` and `page-zh-reference-commands.png`.
- **Sections.** Add `"sections": {"en": ["Configuration"], "zh": ["配置"]}`. Step `section:/reference/commands#Configuration` scrolls the heading into view (visible in the video) and saves `section-reference-commands-1.png`, clipped from the heading to the next heading of the same level. A missing heading fails the step.
- **Docs-sync sweep.** List every changed page with its changed sections in one plan and run all features with `--evidence <dir>`; `walkthrough.webm` then walks through each changed page and section in order.

## Gotchas

- Heading text excludes VitePress's trailing anchor (`#` and a zero-width
  space); the driver strips both.
- Section clips are capped at 3000 px tall. Split a very long section by
  listing its h3 headings instead.
