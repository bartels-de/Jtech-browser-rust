# Extensions and JTech Market

JTech Browser has its own extension system. Extensions are first-party packages that ship with
every release; the JTech Market lists them and shows which version is current.

## Distribution and updates

- Extensions live in `src-tauri/resources/extensions/<id>/` and are bundled as Tauri resources
  (`bundle.resources` in `tauri.conf.json`, installed to `<resources>/extensions/`).
- Every signed release therefore also updates all bundled extensions through the existing updater.
- "Install" and "uninstall" of a bundled extension mean enable and disable. The state is stored in
  SQLite (table `extensions`).
- The market index `extensions/index.json` (repository root) is fetched from
  `https://raw.githubusercontent.com/bartels-de/Jtech-browser-rust/main/extensions/index.json`.
  It is used for discovery and to show that a newer version arrives with the next release.

### Hotfix installs (disabled)

Installing a newer extension version directly from the index, outside a release, is disabled
(`HOTFIX_INSTALL_ENABLED = false` in `extensions.rs`). The SHA-256 check of every file against the
index (`verify_files`) is implemented and tested. Before hotfix installs can be enabled, the index
must carry a signature (field `signature`, reserved) that is verified against a pinned public key.
Until then no downloaded extension code is executed.

## Manifest (`manifest.json`)

| Field | Type | Notes |
|---|---|---|
| `id` | string | `a-z0-9._-`, 2-64 chars, must equal the folder name |
| `version` | string | `major.minor.patch` |
| `minBrowser` | string? | Minimum JTech Browser version; older browsers list the extension as incompatible |
| `name`, `description` | `{ lang: string }` | `en` is required and used as fallback; `de` recommended |
| `author`, `license` | string | |
| `icon` | string? | Relative path; SVG is returned to the UI as `iconSvg` |
| `permissions` | string[] | `scripts:main-world`, `network`, `styles` |
| `matches` | string[] | `<all_urls>` or `scheme://host/path` with `*` wildcards (`*://*.twitch.tv/*`) |
| `content_scripts` | array | `{ js: [], css: [], run_at: "document_start" \| "document_end", world: "main" }` |
| `filters` | string[] | Adblock-syntax rule files (needs `network`) |
| `defaultEnabled` | bool | Initial state on first start |

All file paths are relative to the extension folder (no `..`, max. 2 MB per file).

## Runtime behaviour

- **Scripts**: when a content tab is created, every active extension registers its scripts with
  `AddScriptToExecuteOnDocumentCreated`. Each script is wrapped in an IIFE with its own guard
  (http/https only, `matches`, per-site switch-off). CSS is added as a `<style data-jtech-ext>`
  element. Enabling, disabling or switching off a site re-registers the scripts in all open tabs;
  the change applies with the next page load in each tab.
- **No bridge**: page and extension scripts get no IPC access. Content tabs load remote URLs, and
  the capabilities in `src-tauri/capabilities/` only cover local content and the `ui` webview.
- **Network rules**: each active extension with `filters` gets its own adblock engine. It is checked
  in the `WebResourceRequested` handler after the main engine and only on pages matching the
  extension's `matches`. It also works when the main adblocker is off or the site is allowlisted.
  Blocked requests count towards the tab/global counters and a per-extension counter (`blocked`).

## Commands

All inputs are validated (extension id format, host normalisation, language tag).

| Command | Arguments | Returns |
|---|---|---|
| `ext_list` | `lang?: string` | `ExtInfo[]` |
| `ext_toggle` | `id: string, enabled: boolean, lang?: string` | `ExtInfo[]` |
| `ext_site_toggle` | `id: string, host: string, enabled: boolean, lang?: string` | `ExtInfo[]` (`enabled=false` switches the extension off for the host and its subdomains) |
| `market_fetch` | `lang?: string` | `MarketResult` |

`ExtInfo`: `id, version, name, description, author, license, iconSvg, permissions, matches, source,
enabled, compatible, error, minBrowser, siteOff[], blocked, updateVersion` (`updateVersion` is set
after `market_fetch` if the index lists a newer version).

`MarketResult`: `fetchedAt, indexUrl, hotfixInstallEnabled, entries[]` with
`MarketEntry`: `id, version, installedVersion, minBrowser, name, description, author, license,
status, enabled`. `status` is one of `installed`, `available`, `update-in-next-release`,
`incompatible`, `not-bundled`.

TypeScript types are in `src/lib/ipc.ts` (`ExtInfo`, `MarketEntry`, `MarketResult`).

## Index format (`extensions/index.json`)

```json
{ "schema": 1, "signature": null,
  "extensions": [ { "id": "...", "version": "1.0.0", "minBrowser": "0.1.3",
    "name": { "en": "..." }, "description": { "en": "..." }, "author": "...", "license": "MIT",
    "files": { "manifest.json": "<sha256 hex>", "content.js": "<sha256 hex>" } } ] }
```

When an extension file changes, update its version in `manifest.json` and the index, and refresh
the `files` hashes (LF line endings, as stored in the repository).

## Twitch Ad Blocker (`jtech.twitch-adblock`)

- Content script at `document_start` in the page context. It wraps `fetch` in the page and, by
  wrapping the `Worker` constructor, inside the video player worker (worker script loaded
  synchronously, hook prepended in a new blob worker; module workers are not hooked).
- Media playlists from Twitch (`*.ttvnw.net`) are checked for ad markers (`stitched` date ranges,
  `X-TV-TWITCH-AD`, SCTE-35, segments without the `live` title). `MIDROLL` is logged separately.
- Page side (since 1.3.0): Twitch's own `PlaybackAccessToken` request is switched to
  `playerType: "popout"` (picture-by-picture stays untouched), `parent_domains` is removed from
  the usher URL, and the headers of Twitch's GQL requests (`Client-ID`, `X-Device-Id`,
  `Client-Version`, `Client-Session-Id`, `Client-Integrity`, `Authorization` when logged in) and
  the persisted-query hash are remembered and passed to the worker.
- While an ad runs, a token is requested per backup player type in the order `embed`, `popout`,
  `site`, `mobile_web`, `autoplay` (persisted query `PlaybackAccessToken`, `platform` = `web`,
  `android` only for `autoplay`). GQL requests from the worker are relayed through the page with
  those headers. The backup usher URL is the original one (all parameters kept), only
  `sig`/`token` are replaced. The first ad-free variant (same resolution/frame rate, else closest)
  is served. If none is ad-free, the `embed` playlist (or the original) is stripped of ad
  segments; `MEDIA-SEQUENCE`/`DISCONTINUITY` stay consistent, prefetch hints are dropped during
  ads, and an ad-only playlist is replaced by the last clean one. A backup that still carried ads
  gets a new token after 10 s at the earliest; tokens are renewed after 8 minutes.
- After an ad break the player is reloaded once through its React state
  (`setSrc({ isNewMediaPlayerInstance, refreshAccessToken })`), not while paused, at most every
  3 s. Disable with `localStorage.setItem('jtech-twitch-noreload','1')`.
- Debug: `localStorage.setItem('jtech-twitch-debug','1')`, reload; logs use the prefix
  `[JTech TwitchAB]` (page and `[worker]`). Counter: `window.__jtechTwitchStats`
  (`ads`, `swaps`, `stripped`, `tokenFail`, `reloads`).
- `rules.txt` blocks Amazon ad system and Twitch ad endpoints on Twitch pages.
- No third-party proxy is used. Credits and licenses: `NOTICE` (TwitchAdSolutions/vaft, MIT;
  TTV-AB by GosuDRM, MIT with attribution).
- Offline test: `node scripts/test-twitch-adblock.mjs src-tauri/resources/extensions/jtech.twitch-adblock/content.js`
  (v2 usher master, preroll with backup swap, midroll strip, ad-only playlist, token rewrite, headers).

### Known limits

- Twitch changes its player regularly; the method can stop working until the extension is updated
  with a release. The persisted-query hash, the React fields used for the reload (`setSrc`,
  `mediaPlayerInstance`) and the set of ad-free player types are the most likely to change.
- Without a `Client-Integrity` header (Twitch sends it only in some sessions) token requests can
  fail; `tokenFail` in the counter and `backup ... failed: token ...` in the log show this.
- Twitch serves ads on all player types for some channels/regions; then only stripping is left,
  which can show a short freeze or the "commercial break" screen until the reload.
- The backup stream can have a lower quality (`autoplay` = 360p) or a short delay.
- Since 1.2.0 / browser 0.1.9 tabs start on about:blank and load their URL only after all content
  scripts are registered (3 s fallback), so a directly opened stream is covered too.
- If a `<id>/` subfolder exists, stale legacy flat files (v0.1.4) with the same id are ignored.
- VODs and clips are not handled.

### Debugging in a release build

1. Settings › About JTech › Advanced › "Enable developer tools".
2. Open the Twitch tab, press F12 (or right-click › Inspect) and open the Console.
3. Run `localStorage.setItem('jtech-twitch-debug','1')` and reload the page.
4. Filter the console for `[JTech TwitchAB]`. Expected order: `1.3.0 active on`, `worker hooked`,
   `page token playerType ... -> popout`, `gql headers updated`, `usher url seen <channel> v2`,
   `master playlist`, then on an ad `ad detected on <channel> ... preroll|midroll`,
   `token ok <type>` or `backup <type> failed: token ... status ...`, `backup <type> ad-free: yes|no`,
   `using ad-free backup` or `no ad-free backup ..., fallback: strip`, and finally
   `ad break over` / `player reloaded`.
5. `window.__jtechTwitchStats` shows the counters. Turn off with `localStorage.removeItem('jtech-twitch-debug')`.

## YouTube Ad Blocker (`jtech.youtube-adblock`)

- Content script at `document_start` in the page context on `youtube.com` and its subdomains
  (`www`, `m`, `music`).
- Data level: wraps `fetch`, `XMLHttpRequest` and `JSON.parse` and traps `ytInitialPlayerResponse`,
  `ytInitialData` and `ytInitialReelWatchSequenceResponse`. Responses of `/youtubei/v1/player`, `next`,
  `browse`, `search` and the Shorts sequence endpoints lose `adPlacements`, `playerAds`, `adSlots`,
  `adBreakHeartbeatParams`, `adEngagementPanels` and ad renderers (promoted videos, in-feed ads,
  masthead/banner promos, merch shelves, Shorts ad entries). `videoDetails` and `streamingData` are untouched.
- Player fallback: while the player has `ad-showing`/`ad-interrupting`, the video is muted, played at
  16x and moved to its end, and skip buttons are clicked; mute, volume and speed are restored afterwards.
  Checks every 250 ms while an ad is active, otherwise every second (paused in background tabs), and
  observes player class and child changes so dynamically inserted skip controls are detected promptly.
- Cosmetic CSS hides remaining ad slots, overlays and companion ads.
- The "ad blockers are not allowed" enforcement dialog is removed and playback resumed; other dialogs
  are left alone.
- `rules.txt` blocks DoubleClick, Google ad services/syndication, IMA SDK and YouTube's `/pagead/`,
  `/ptracking`, `/api/stats/ads` and `get_midroll_info`. Playback requests (`googlevideo.com`,
  `/youtubei/v1/player`, `/api/stats/qoe`, `/api/stats/watchtime`) are never blocked.

### Known limits

- YouTube changes its pages and APIs often; parts can stop working until the extension is updated
  with a release.
- Server-side ad insertion (ads stitched into the video stream) cannot always be stripped; the player
  fallback then skips or fast-forwards, which can show a short flash or stall.
- YouTube may show its anti-adblock notice in new forms that are not recognised yet.
- A tab opened directly on YouTube may load the first page before the script is registered; a reload fixes this.

## UI pages

- `jtech://market` (`src/pages/MarketPage.tsx`): hero header, card grid from `market_fetch` merged with
  `ext_list` (bundled extensions missing from the index are listed too; offline the list is built from
  `ext_list` alone and a notice is shown). Detail view with permissions in plain language, match hosts,
  license, version info and, for `jtech.twitch-adblock`, the known limits. Install = `ext_toggle(id, true)`,
  uninstall = `ext_toggle(id, false)`. The page states that updates arrive with browser releases.
- `jtech://extensions` (`src/pages/ExtensionsPage.tsx`): enabled extensions with on/off switch, per-site
  pause (`ext_site_toggle`) for an open web tab (picker when several sites are open), paused-site chips,
  per-extension and total `blocked` counters (refreshed every 5 s).
- Both are singleton internal pages (command palette, toolbar menu, sidebar library). Wrappers in
  `src/lib/extensions.ts`; every call passes the current UI language as `lang`.
- While open, the installed-extensions page refreshes its status snapshot every 5 seconds.
- The installed-extensions page refreshes its data every 5 seconds while open.
- The extensions page refreshes its installed-extension snapshot every 5 seconds while open.
- Icons: `iconSvg` (SVG text) is rendered via an `<img>` `data:` URL (`src/components/ExtIcon.tsx`), so
  scripts in the SVG never run in the UI webview. Non-SVG icons, missing icons and market entries that are
  not bundled yet (the index carries no icon) fall back to a puzzle tile.
