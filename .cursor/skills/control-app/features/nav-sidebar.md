# Nav and sidebar

The top nav links to Quick start, Guides, and Reference (plus external GitHub,
npm, and Releases links). Guides and Reference each have a sidebar listing
their pages.

## Sub-features

- `nav-guides` opens the guides section and a sidebar page.
- `nav-reference` opens the reference section and a sidebar page.
- `nav-active` marks the current page as active in the sidebar.

## How to get to it (user POV)

- Click `Guides` / `Reference` (EN) or `使用场景` / `参考` (ZH) in the top nav.
- Click a sidebar entry, for example `Permissions & approvals` / `权限与审批`.

## Driving it with control-app

Preconditions:

- A launched instance with a clean `control-app doctor`.

- **Guides.** Plan `"features": ["nav"]`. Step `nav:en:Guides>Permissions & approvals` clicks `.VPNavBarMenuLink` "Guides", waits for `.VPSidebar`, clicks the sidebar link, and passes when the URL starts with `/guide/permissions`, the page `h1` equals the sidebar label, and a sidebar item is active. Evidence is `nav-en-guide-permissions.png`.
- **Reference.** Step `nav:en:Reference>Slash commands` lands on `/reference/commands`. Evidence is `nav-en-reference-commands.png`.
- **Chinese.** Steps `nav:zh:使用场景>权限与审批` and `nav:zh:参考>斜杠命令` land on the `/zh/` twins. Evidence is `nav-zh-*.png`.

## Gotchas

- Nav and sidebar labels come from `site/.vitepress/config.mts`. When a label
  changes there, update the `LOCALES` table in `scripts/drive.mjs`.
- External nav links (GitHub, npm, Releases) leave the site; the driver does
  not click them.
