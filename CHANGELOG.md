# Changelog

All notable changes to JTech Browser. The in-app page `jtech://changelog` shows the same notes
(localized, from `src/data/changelog.ts`).

## [0.1.12]

- Hub menu: one entry point for bookmarks, history, downloads, library, market, extensions, audio, performance, themes, privacy, changelog and settings, with a filter field.
- Settings where you need them: right-click the start page to customize it, right-click empty sidebar space for sidebar options, right-click the toolbar to customize it.
- Address bar quick actions: picture-in-picture on video sites, mute when the tab plays audio, blocked-items count (when the shield button is hidden) and zoom reset.
- Undo instead of confirmations: closing tabs, closing or ungrouping a group, removing a bookmark or history entry, changing the theme, applying a preset and resetting the toolbar, sidebar, start page or shortcuts show a notice with "Undo". Clearing cookies or the whole history still asks first.
- New tabs open next to the current tab, and closing a tab returns to the tab it was opened from (both switchable).
- Settings: simple mode shows the most important options; "Show all settings" reveals everything.
- Customizable toolbar: add, remove and reorder buttons by drag & drop (back, forward, reload, home, split view, radial menu, audio hub, extensions, bookmarks, shield, downloads, hub).
- Presets "Minimal", "Standard", "Power user" and "Streaming" with a preview of what changes.
- Tab switch animations for the address bar, sidebar and internal pages (switchable, follows "reduce motion"). Web pages switch instantly.
- Live search suggestions from Google, DuckDuckGo, Bing or Brave while typing (Startpage uses DuckDuckGo), switchable in Settings › Search. Addresses are never sent.

## [0.1.11]

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
