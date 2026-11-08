# Architecture

JTech Browser is a Tauri 2 application for Windows. The browser UI is a React/TypeScript app,
and web pages are rendered by native Microsoft Edge WebView2 instances that the Rust backend
manages.

## Window and webviews

The app has one native window (`main`) with the standard Windows title bar. It contains:

- **One UI webview (`ui`)** that covers the whole window. It renders the tab sidebar, the toolbar
  (address bar, buttons, popovers), the bookmarks bar, notification bars and all internal pages.
- **One content webview per open web tab**, created with Tauri's multi-webview API
  (`Window::add_child`, `unstable` feature). Only the active tab's webview is visible.

Content webviews are native windows layered above the UI webview. They occupy the rectangle to
the right of the sidebar and below the header. The UI measures its header height and sidebar
width and reports them to Rust (`set_layout`). Rust then computes the content bounds in logical
pixels from the window's inner size and scale factor (`apply_layout`). This runs on resize, on
DPI changes and whenever tabs change.

Because a native webview always sits above the React UI, the active page is hidden briefly
while a menu, popover or dialog overlaps the content area (`set_content_visible`).

## Tabs

`TabManager` (Rust) holds the tabs in a fixed order with a stable tab ID, the current URL, title,
loading state and per-tab counters. The UI receives `tabs-changed` and `tab-event` events and
never polls for normal operation.

For every content webview the backend registers WebView2 event handlers through `webview2-com`:
navigation start/completion, source and title changes, history state (back/forward
availability), process failures, new-window requests, downloads, permission requests, zoom
changes, accelerator keys and `DOMContentLoaded`. Event tokens are stored per tab and removed
when the tab is closed.

- **New windows / popups:** user-initiated `http`/`https` popups open as a new tab; others are
  blocked.
- **Tab sleep:** inactive tabs can be put to sleep after a configurable time. The webview is
  destroyed while the tab ID, URL and title are kept, and a new webview is created when the tab
  is activated. Active, pinned and audio-playing tabs are never put to sleep.
- **Session restore:** open tabs (including internal pages and the pinned state) are saved and
  restored on the next start, if enabled.

## Internal pages (`jtech://`)

Internal pages are React views inside the UI webview, not web content:

`jtech://newtab`, `settings`, `history`, `bookmarks`, `downloads`, `privacy`, `themes`, `audio`.

Each internal page is a regular tab in `TabManager`, backed by an `about:blank` webview that
stays hidden while the page is shown. This keeps closing, reordering, pinning and grouping
identical for web and internal tabs. Each internal page is open in at most one tab; opening it
again focuses the existing tab.

## IPC and security model

- Only the UI webview talks to the backend. All UI calls go through Tauri commands
  (`src/lib/ipc.ts` on the UI side, `#[tauri::command]` functions in `src-tauri/src`).
- Web pages are loaded from remote origins. Tauri capabilities apply to the local app origin
  only, so website tabs have no access to the IPC bridge or to plugin APIs.
- The updater and process-restart permissions are granted to the `ui` webview only
  (`src-tauri/capabilities/updater.json`).
- Commands validate their input in Rust: tab IDs, zoom range, find-in-page queries (length limit,
  embedded only as a JSON string), shortcut combinations, cursor images (restricted `data:` URLs)
  and storage keys.
- Downloads are saved to the user's download folder. Opening executables or scripts from the
  download list is refused; they can only be revealed in Explorer.
- Custom CSS for the UI is sanitized (`@import`, `url(…)`, `expression()` and HTML are removed)
  and only affects the browser UI, never websites.
- Site permissions (camera, microphone, location, notifications) are decided by the user via a
  prompt bar; WebView2 is told not to persist decisions itself, and remembered decisions are
  stored by the browser.

## Storage

All persistent data lives in SQLite at `%APPDATA%\com.jtech.browser\jtech.sqlite3` (WAL mode,
`src-tauri/src/storage.rs`):

- **Key/value table** for UI data (settings, bookmarks, history, per-site zoom, tab groups,
  session, themes, downloads). Only known keys are accepted, values must be valid JSON and are
  size-limited.
- **Dedicated tables / metadata** for site permissions, block statistics, filter list
  configuration and the ad blocker allowlist.

The UI loads its data before the first render and writes changes debounced. If SQLite is not
available, the UI falls back to `localStorage`. Filter lists and the serialized filter engine are
cached in the app data folder (`filters/`, `engine.dat`).

Cookies, cache and site storage belong to the WebView2 profile and are managed through the
WebView2 cookie manager and `ClearBrowsingData`.

## Source layout

| Path | Contents |
|---|---|
| `src-tauri/src/lib.rs` | Window setup, tabs and webviews, WebView2 events, request filtering, downloads, zoom, find, print |
| `src-tauri/src/filters.rs` | Filter list management and engine building |
| `src-tauri/src/privacy.rs` | Statistics, cookies, browsing data, site permissions |
| `src-tauri/src/storage.rs` | SQLite storage |
| `src-tauri/src/uifx.rs` | Custom shortcuts and optional cursor effects on web pages |
| `src/store/` | Browser state (React context) and storage access |
| `src/components/` | Sidebar, toolbar, popovers, bars, editors |
| `src/pages/` | Internal `jtech://` pages |
| `src/lib/` | IPC wrappers, URL handling, commands and shortcuts, visual effects, updater |
