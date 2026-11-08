# JTech Browser

A privacy-focused desktop web browser for Windows, built with **Tauri 2**, **Rust**, **WebView2**
and a **React/TypeScript** UI, with network-level ad and tracker blocking powered by Brave's
[adblock-rust](https://github.com/brave/adblock-rust).

> Status: early development (0.x). Windows only.

## Features

- Vertical tab sidebar with pinning, drag & drop, tab groups, tab sleep for inactive tabs,
  session restore and per-site zoom.
- Ad & tracker blocker (EasyList, EasyPrivacy, uBlock filters, …) with automatic filter list
  updates, per-site allowlist and cosmetic filtering.
- Privacy dashboard: block statistics, cookies per site, clear browsing data, clear cookies /
  cache on exit.
- Site permissions (camera, microphone, location, notifications) with a prompt bar and
  per-site memory.
- Bookmarks, bookmarks bar, history, downloads, find in page, print, command palette.
- Fully customizable keyboard shortcuts.
- Design studio: themes, presets, animated backgrounds, custom cursors and cursor trails.
- Audio hub: see and mute tabs playing audio.
- Data stored locally in SQLite (`%APPDATA%\com.jtech.browser\jtech.sqlite3`).
- Signed automatic updates from GitHub Releases (see [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md)).

## Ad blocking: what it does and does not cover

Blocking happens in Rust on WebView2's `WebResourceRequested` event. Honest limits:

- Requests from **service workers** may not be reported (depends on the WebView2 runtime).
- **WebSocket messages** after the handshake cannot be filtered; some cross-origin iframes and
  popups may be covered only partially.
- The main document itself is never blocked (by design).
- `$redirect` / replacement resources, `$csp`, `$removeparam` and `$header` rules are not
  applied – blocked requests get an empty 204 response.
- Cosmetic filters are applied once at `DOMContentLoaded`, main frame only; elements added later
  are not re-checked, a brief flash is possible.
- **Procedural cosmetic filters** (`:has-text`, `:upward`, …) and **scriptlets** (`+js(...)`)
  are not executed, so parts of uBlock filters / annoyance lists have no effect.
- The rule count shown is an approximation.

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Tauri 2 (multi-webview, `unstable` feature) |
| Engine | Microsoft Edge WebView2 (via `webview2-com`) |
| Backend | Rust 2024 edition, `adblock` 0.13, `rusqlite` (bundled SQLite), `reqwest` |
| UI | React 19, TypeScript, Vite |
| Updates | `tauri-plugin-updater` + `tauri-plugin-process`, GitHub Actions + `tauri-action` |

## Build from source

Requirements: Windows 10/11, [Node.js](https://nodejs.org/) 20+,
[Rust](https://rustup.rs/) (stable, MSVC toolchain), Visual Studio Build Tools
("Desktop development with C++"), WebView2 runtime (preinstalled on Windows 11).

```
npm install
npm run tauri dev      # development with hot reload
npm run tauri build    # release build + NSIS/MSI installers in src-tauri/target/release/bundle
```

`npm run tauri build` creates signed updater artifacts and therefore needs the environment
variables `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
(see [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md)).

Rust tests: `cd src-tauri && cargo test`.

## Releases & auto-update

1. Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. `git tag v0.x.y && git push --tags`
3. GitHub Actions builds and signs the Windows installer and publishes a release with
   `latest.json`. Installed browsers find it via Settings > Über JTech or the automatic check.

Full step-by-step guide (key generation, secrets, testing): [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md).

## Project layout

```
src/                 React UI (pages, components, store, lib)
src-tauri/src/       Rust backend (tabs/webviews, filters, privacy, storage, UI effects)
src-tauri/capabilities/  Tauri permissions (UI webview only)
.github/workflows/   Release pipeline
docs/                Development notes
```

The development notes `docs/ETAPPE_*.md`, `docs/ROUND*.md` and `docs/PORT_ELECTRON.md` are
currently in German.

## License

TBD – no license has been chosen yet. Until a license is added, all rights are reserved.
