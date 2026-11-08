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
  wrapping the `Worker` constructor, inside the video player worker.
- Media playlists from Twitch (`*.ttvnw.net`) are checked for ad markers (stitched-ad / SCTE-35
  date ranges, `X-TV-TWITCH-AD`, non-`live` segment titles such as "Amazon").
- While an ad is running, the script requests a playback token for another player type
  (`embed`, `popout`, `autoplay`) from Twitch's own GQL endpoint and serves that variant's
  playlist if it is ad-free. Otherwise the ad segments are removed from the playlist.
- `rules.txt` blocks Amazon ad system and Twitch ad endpoints on Twitch pages.
- No third-party proxy is used.

### Known limits

- Twitch changes its player regularly; the method can stop working until the extension is updated
  with a release.
- The backup stream can have a lower quality or a short delay; when segments are stripped, the
  player can stall briefly or show a "commercial break" screen.
- A tab that is opened directly on Twitch may load the first page before the script is registered;
  a reload fixes this.
- VODs and clips are not handled.
