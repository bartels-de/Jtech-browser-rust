# Changelog

All notable changes to JTech Browser. The in-app page `jtech://changelog` shows the same notes
(localized, from `src/data/changelog.ts`).

## [Unreleased]

- Radial menu: hold the middle mouse button or press Alt+Q – 4 to 8 freely assignable commands with icons.
- Resource limits: background tabs get a low memory target, idle background tabs are suspended, optional caps for total memory and CPU.
- Audio hub: media title, artist and artwork, play/pause/next/previous, "only this tab", per-tab volume, always-muted sites and a mini player in the sidebar.
- Start page: background, clock, greeting, search, quick links, density and alignment are customizable via "Customize".
- Theme gallery in the Design Studio and in JTech Market with previews, duplicate and import/export.
- Peek window: Shift+click a link to open it in a floating panel over the page.
- Changelog page (`jtech://changelog`) and a "What's new" notice after an update.
- Reopen closed tab (Ctrl+Shift+T).

## [0.1.10]

- Split view: two tabs side by side or stacked, with a movable divider.
- Groups for internal pages.
- Twitch ad blocker 1.3.0: persisted GQL query, page-side tokens, player reload after ads.

## [0.1.9]

- Extension scripts are registered before the first navigation.
- Twitch ad blocker 1.2.0 (usher v2).
- Opt-in developer tools.

## [0.1.8]

- True full screen for page video and F11.
- Twitch ad blocker 1.1.0: robust mid-roll handling, valid playlist stripping, debug mode.

## [0.1.7]

- Bundled YouTube ad blocker extension.
- "Recently visited" on the start page can be turned off.

## [0.1.6]

- Each bundled extension is mapped explicitly, the legacy flat layout is accepted.
- Extension diagnostics and a CI guard.

## [0.1.5]

- Fixed the folder layout of bundled extensions.

## [0.1.4]

- Redesigned UI: tokens, sidebar, toolbar, start page, command palette, internal pages.
- Frameless window with custom window controls.
- Extension system with a bundled Twitch ad blocker, JTech Market and extensions page.
- German and English localization.
- Compile and test check workflow for `dev`.

## [0.1.3]

- Performance page and sidebar improvements.

## [0.1.2]

- Resizable sidebar.

## [0.1.1]

- JTech logo as app icon.

## [0.1.0]

- Initial release: WebView2 tabs, ad blocking, bookmarks, history, downloads, Design Studio, automatic updates.
