# Architecture

JTech Browser is a Tauri 2 application for Windows. The browser UI is a React/TypeScript app,
and web pages are rendered by native Microsoft Edge WebView2 instances that the Rust backend
manages.

## Window and webviews

The app has one native window (`main`). It is frameless (`decorations(false)`, `shadow(true)`):
the toolbar row doubles as the title area. Empty toolbar and sidebar-header space carries
`data-tauri-drag-region` (drag, double-click to maximize); `WindowControls` draws minimize,
maximize/restore and close. Their permissions are granted to the UI webview only
(`capabilities/window.json`). Windows keeps the resize borders. The Windows 11 Snap Layouts
flyout on the maximize button is not available with a custom button (Win+Z and edge snapping
still work). The window contains:

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

### Full screen

- Each tab subscribes to `ContainsFullScreenElementChanged` (HTML5 `requestFullscreen`, e.g. the YouTube/Twitch fullscreen button). Only the active tab may switch the window; Esc inside the page exits element fullscreen and fires the same event.
- F11 (command `ui.fullscreen`, Rust `toggle_fullscreen`) toggles browser fullscreen. `TabManager.fullscreen` tracks both reasons; the OS window stays fullscreen while either is active.
- While fullscreen, `apply_layout` gives the content webview the whole client area (logical px), the window goes `set_fullscreen(true)`, and `content-fullscreen` is emitted. The UI hides sidebar/header via CSS (state stays mounted) and pauses `set_layout` reports, sending a fresh one on exit.
- On exit the window leaves fullscreen (tao restores size/position) and is re-maximized if it was maximized. Switching or closing the tab exits fullscreen (`check_fullscreen_tab`, calls `document.exitFullscreen()` in the old page).
- No "Press Esc to exit" toast: the UI webview lies below the content webview and cannot draw over it.

### Split view

- Two tabs side by side (or stacked). The pair lives in the UI store (`split = { a, b }`, a = left/top). It is shown while one of the two tabs is active; the active tab is the **focused pane** (address bar, toolbar, shortcuts act on it). Activating another tab shows that tab normally; the pair stays joined in the sidebar and returns when one of its tabs is activated.
- `set_layout` takes an optional `split` (`a`, `b`, `ratio`, `vertical`, `showA`, `showB`). Rust validates the tab IDs (known, distinct), clamps the ratio to 0.15–0.85 and drops the split if a tab is gone. `split_bounds` computes two rects with a 6 px gap (`SPLIT_GAP`, same constant in `store/types.ts`); the React divider lies in that gap, outside both webviews. Dragging hides both webviews (like the sidebar resize) and reports the final ratio, which is stored in settings (`splitRatio`, `splitVertical`).
- Focus: each content webview registers `ICoreWebView2Controller::GotFocus` and emits `tab-event` `focus`; the UI then switches the active tab to that pane. Clicks on an internal pane switch focus in React.
- Internal `jtech://` pages are allowed in a pane: their webview stays hidden (`showA/showB = false`) and React renders the page inside the pane rectangle.
- Fullscreen: only the fullscreen tab (or, for F11, the focused pane) fills the screen; a page fullscreen request from either pane focuses that pane. Split tabs are never put to sleep (UI and `sleep_tab`); a sleeping tab in a new split is woken by `set_layout`. Closing one pane ends split view. Session restore stores the pair (`split: "a" | "b"` on the session entries).
- Open/close: tab context menu, command `view.split` (Ctrl+Shift+S, palette), split bar under the toolbar (focus, swap, orientation, end). Dropping a tab onto the content edge is not supported: native webviews cover the content area and receive no HTML drag events.

## Tabs

`TabManager` (Rust) holds the tabs in a fixed order with a stable tab ID, the current URL, title,
loading state and per-tab counters. The UI receives `tabs-changed` and `tab-event` events and
never polls for normal operation.

For every content webview the backend registers WebView2 event handlers through `webview2-com`:
navigation start/completion, source and title changes, history state (back/forward
availability), process failures, new-window requests, downloads, permission requests, zoom
changes, accelerator keys, `DOMContentLoaded` and context menu requests. Event tokens are stored
per tab and removed when the tab is closed.

- **New windows / popups:** user-initiated `http`/`https` popups open as a new tab; others are
  blocked.
- **Tab sleep:** inactive tabs can be put to sleep after a configurable time. The webview is
  destroyed while the tab ID, URL and title are kept, and a new webview is created when the tab
  is activated. Active, pinned and audio-playing tabs are never put to sleep.
- **Groups:** web and internal tabs (settings, history, market …) can join groups the same way (context menu, dragging a tab onto a grouped tab or a group header, command `tab.groupInternal` collects all internal pages in a "JTech" group). Membership is saved with the session. Auto-grouping by domain only covers web tabs.
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

### Page bridge (radial menu, peek, media session)

Mouse events inside the native page webviews never reach React. Three features therefore use one
small, audited script (`src-tauri/src/pagebridge.rs`, `BRIDGE_TEMPLATE`):

- It is registered with `AddScriptToExecuteOnDocumentCreated` before a tab's first navigation
  (same mechanism as extension scripts) and runs in the top frame only.
- It talks to Rust only through `window.chrome.webview.postMessage` with a JSON string of the fixed
  schema `{jtech: 1, type: "radial" | "peek" | "media", ...}`:
  - `radial` – middle button held for 250 ms without moving (`x`, `y`). Short middle clicks and
    autoscroll are not affected; the `auxclick` after an opened menu is suppressed.
  - `peek` – Shift+click on an `http(s)` link (`url`); the default navigation is prevented.
  - `media` – state of the page's media elements and `navigator.mediaSession.metadata` (title,
    artist, album, artwork URL), sent only on change.
- `WebMessageReceived` accepts messages only from `http(s)` documents. `pagebridge::parse`
  validates the type and every field (8 KB limit, finite coordinates, absolute `http(s)` URLs
  without credentials, text truncated, unknown types dropped). A valid message can only show the
  radial menu, open the peek panel or update the audio hub display. Peek requests are
  rate-limited. No Tauri command or privileged API is reachable from pages; any page can send the
  same messages, which is harmless by design.
- Media controls (play/pause/next/previous/volume) run a fixed script from Rust
  (`media_control_script`): the action comes from an allowlist and the volume is clamped; no user
  text is embedded. Per-tab volume sets `HTMLMediaElement.volume` (WebView2 has no native per-tab
  volume; Web Audio output is not affected).
- The radial/peek triggers can be switched off in the settings (`set_bridge_options`); Rust then
  ignores the messages and the script stops preventing Shift+click.

### Page context menu

React cannot draw over a native page webview, so the JTech context menu is the native WebView2 menu,
customised per request (`src-tauri/src/ctxmenu.rs`, `ICoreWebView2_11::ContextMenuRequested`, WebView2
Runtime 1.0.1185 or newer). It is registered in `attach_handlers` (new, popup, restored, woken and
split-view tabs) and on the peek webview; the token is removed with the other tab tokens.

- The target (`ICoreWebView2ContextMenuTarget`: kind, editable, link/source/page URI, link text, selection)
  is read by WebView2, not reported by page scripts. URLs pass `pagebridge::web_url` (absolute
  `http(s)`, no credentials); text is stripped of control characters and size-limited.
- Built-in items stay (navigation, clipboard, spell check, save/copy image, copy link address, save as,
  print); a small drop list removes clutter (QR code, share, web capture, open link in new window …),
  "Inspect" only stays with developer tools on. JTech items are created with
  `ICoreWebView2Environment9::CreateContextMenuItem`; more than seven go into one "JTech" submenu.
  The item lists per target are a pure function (`plan`, unit-tested).
- A chosen item copies text with the Win32 clipboard (link as Markdown, plain text, image/media
  address), runs the fixed picture-in-picture script, or emits `page-menu` (`tabId`, `action`, `url`,
  `text`) to the UI, which checks the URL again and opens tabs (also background tabs:
  `new_tab { background }`), Peek, split view, bookmarks or a search. Per-menu item handlers live with
  the menu items and are released when the menu closes.
- `set_context_menu` receives the setting (`standardContextMenu`: WebView2 default menu) and the
  localized labels from the UI (fixed key allowlist, length and character checks), so Rust needs no
  translations of its own. In the peek panel "Open in Peek" and "Mute tab" are left out.

### Live search suggestions

`search_suggest` (`src-tauri/src/suggest.rs`) fetches suggestions for the address bar with the existing
`reqwest` client, so the UI webview needs no CORS exception. The engine id comes from a fixed allowlist
(Startpage has no suggest API and uses DuckDuckGo); the query is trimmed, limited to 200 characters,
must not contain control characters, bangs or anything that looks like a URL/IP. The response is limited
to 64 KB and parsed as the OpenSearch format `["q", [...]]` (max. 8 entries). The UI debounces input by
150 ms, drops stale answers and only asks while the setting `liveSuggest` is on. There is no private mode.

### Tab switch transitions

Native webviews cannot be animated or overlaid with CSS. A transition therefore only animates UI parts
(address bar text, active sidebar tab, internal `jtech://` pages) for at most 180 ms; web content
switches instantly. A snapshot crossfade (`ICoreWebView2::CapturePreview`) was not used: it would hide the
page for the duration of an asynchronous capture and needs extra COM stream plumbing. Disabled in split
view, full screen, with `tabAnimations = false` and with `prefers-reduced-motion`.

### Peek panel

`src-tauri/src/peek.rs` creates a second native webview over the content area. It has no page
bridge, no extension scripts and no ad blocking; popups from it open as normal tabs, Esc closes
it. While it is open the page underneath is hidden and the UI draws a dimmed backdrop plus the
frame header above the peek rectangle (native webviews cannot be dimmed or rounded with CSS).

### Resource limits

WebView2 has no hard per-tab memory or CPU cap, and tabs of the same site can share a renderer
process. The limits (off by default) use what WebView2 offers: `MemoryUsageTargetLevel` LOW for
background tabs (`ICoreWebView2_19`), `TrySuspend` for idle hidden tabs (`ICoreWebView2_3`, resumed
automatically when shown) and the existing tab sleep when the total memory of all browser
processes exceeds the cap. Pinned, audio, split-view and active tabs are never touched.

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
| `src-tauri/src/ctxmenu.rs` | Page context menu (customised native WebView2 menu) |
| `src/store/` | Browser state (React context) and storage access |
| `src/components/` | Sidebar, toolbar, popovers, bars, editors |
| `src/pages/` | Internal `jtech://` pages |
| `src/lib/` | IPC wrappers, URL handling, commands and shortcuts, visual effects, updater |

## Languages (i18n)

- `src/i18n/`: `de.ts` (reference), `en.ts` (typed as `Dict`, so a missing or extra key is a TypeScript
  error), `index.tsx` with `t(key, params)` (`{name}` interpolation, plural forms `"one|other"` chosen by
  `params.count` via `Intl.PluralRules`), Intl formatters (`fmtNum`, `fmtPct`, `fmtDate`, `fmtTime`,
  `fmtDateTime`, `fmtBytes`) and `useT()`.
- Setting `language` (`"system" | "de" | "en"`, Settings › General) is stored in the settings KV entry;
  `system` follows `navigator.language` (and `languagechange`). The store sets the language during render
  and wraps the tree in `I18nProvider`, so a change applies instantly; `<html lang>` follows.
- Non-React modules (command list, effects, updater, store messages) call `t()` directly; command titles,
  background/trail/quality/cursor names are getters, so they follow the current language.
- Rust stays German for logs and technical errors. Known user-facing backend messages are mapped in
  `localizeBackend()` (download/open errors, filter engine status, tab errors); filter list notes are mapped
  by list id (`filterListNote`). Unknown messages are shown unchanged.
- New language: add `xx.ts` typed as `Dict`, register it in `DICTS`, `LANGS` and `LOCALES`.
