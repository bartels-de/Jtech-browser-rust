# Changelog

All notable changes to JTech Browser. The in-app page `jtech://changelog` shows the same notes
(localized, from `src/data/changelog.ts`).

## [0.3.1] (Unreleased)

- Browser Activity explains popup-blocking reasons more clearly, including popup-window creation failures.
- Activity history now safely normalizes older or malformed saved entries and bounds retained event data.
- Added an optional five-band equalizer with presets and selectable per-tab controls for web audio in the Audio Hub; it is off by default and leaves unsupported media sources untouched.
- Improved YouTube ad handling with faster active-ad checks and detection of dynamically inserted skip controls.
- Equalizer settings now reapply after same-tab navigation, retain their status between media updates and can be adjusted while bypassed.
- Refactored large settings and Rust modules into smaller, responsibility-focused modules without changing browser commands or features.

## [0.3.0]

- Download manager: search and status filters, transfer speed, clearer progress and status, plus pause, resume, cancel, open and reveal actions.
- OAuth and sign-in popups open in a linked WebView2 window that preserves `window.opener` and the originating browser profile. Blocked popup events are recorded with their source and reason in Browser Activity.
- Added a restrictive Content Security Policy for the privileged browser UI. Storage failures no longer silently switch to a new plaintext `localStorage` fallback.
- Hardened navigation and tab commands with URL length/control-character and tab-ID validation; Peek URLs are bounded.
- Filter-list updates require HTTPS, reject redirects and URL credentials, use a 10-second connection timeout and enforce the 30 MiB limit while streaming.
- Updated architecture, extension, ad-blocking and security documentation. SQLCipher and Windows DPAPI remain unimplemented and are documented as open risks.

## [0.2.0]

- Design Studio: 32 fonts instead of 7 in the theme editor, grouped into sans serif, serif, monospace and display.
  - New: Arial, Calibri, Candara, Corbel, Tahoma, Franklin Gothic, Lato, Ebrima, Times New Roman, Cambria, Constantia, Palatino Linotype, Book Antiqua, Garamond, Rockwell, Sitka, Consolas, Courier New, Lucida Console, Cambria Math, Segoe UI Black, Segoe UI Semibold, Gabriola, Comic Sans MS and Impact.
  - Every font is checked against the Windows font folder, so the list only contains fonts that are actually installed.
  - A live preview below the selection shows the pangram in the chosen font.
- All previous changes from 0.1.14 and older are included in this release.

## [0.1.14]

- New website with six pages, real screenshots and rich animations, deployed via GitHub Pages.
- Better ad blocker: scriptlets (`+js(...)`) and procedural cosmetic filters (`:has-text`, `:upward`, `:matches-css`, `:min-text-length`, `:xpath` and more) are now executed in pages.
- New toggle in Settings › Ad blocker to enable or disable scriptlets and procedural filters.
- New tab (Ctrl+T / new tab button) now focuses the address bar immediately instead of the start page search box stealing focus.

## [0.1.13]

- Own context menu on web pages: the native WebView2 menu now carries JTech actions.
  - Links: open in new tab, open in background tab, open in Peek, open in split view, copy link address, copy link as Markdown, add link to bookmarks.
  - Images: open image in new tab, copy image address, save image.
  - Selected text: search with the selected search engine, copy, copy as plain text.
  - Video/audio: picture-in-picture, mute tab, copy media address.
  - Page: back, forward, reload, add page to bookmarks, split view with a new tab, save as and print. "Inspect" only appears with developer tools enabled.
  - Input fields keep cut, copy, paste, undo, redo, select all and spell check suggestions.
- The menu also works in the Peek window (without "Open in Peek") and in split-view panes; labels follow the UI language.
- New setting (Settings › Radial menu & peek) to switch back to the standard WebView2 menu.
- Reworked browser layout: one 44 px top band for sidebar head and toolbar, a centred address bar (32 px, max. 720 px) and a calmer sidebar (36 px tab rows, 56 px compact width).
  - Internal pages show their own icon in the sidebar and address bar; the address bar reads "JTech · Settings" instead of `jtech://settings` until it is focused.
  - Sidebar footer: one row with a "Library" button (bookmarks, history, downloads | audio hub, performance | extensions, market, Design Studio, privacy) and settings. The library menu no longer covers the mini player.
  - Mini player as a single row (artwork, title, play, mute); the title is no longer shown twice.
  - Hub menu: eight tiles with short labels, then the actions, then Performance, Market and Changelog under "More". The zoom row only appears on web pages.
  - The blocked-request dot on tabs is gone (the count stays on the shield button).
- All internal pages share one layout: title and subtitle left, actions right on one line, 880 px content width, consistent sections, list rows and empty states. "Clear history" is a quiet button now.
- Loading and error states: every value on the Performance page shows a placeholder while loading instead of zeros; the Market shows a readable message when it is offline. Settings keep only the "Show all settings" switch.
- Dropdowns look the same everywhere.
- New defaults for new installations: grouping tabs by domain is off (when on, a domain only becomes a group from its second tab and "www." is ignored), the bookmarks bar only shows on the start page, and the toolbar no longer contains the Home button (still available in "Customize toolbar"). Existing settings are kept.

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
