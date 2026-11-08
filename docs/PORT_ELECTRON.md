# Port: Standardprojekt (Electron) -> JTech Browser (Tauri 2 / WebView2)

Stand 2026-11-08. Quelle (nur gelesen): `C:\Users\barte\Documents\Standardprojekt` (v0.8.3).
Sicherungen aller geänderten Dateien: `docs/backup_port/` (Pfad mit `_` statt `/`).

## 1. Ladeanimation bleibt nach dem Laden ("Spinner-Bug")

**Ursache (Code-Analyse, nicht am Gerät reproduziert):** Die Ladeanzeige (`loading` im Store ->
`.omnibox.loading .load-bar` und Sidebar-Spinner) wurde **ausschließlich** durch ein
`navigation-completed` beendet, dessen `navigationId` exakt `latestNav` entsprach. Zwei Lücken:

1. Doppelte, abweichende Stale-Prüfung: Rust wertet `NavigationId == 0` als *nicht* veraltet
   (`nav_id != 0 && …`), die UI verglich aber `ev.navigationId !== latest` und verwarf damit ein
   Completed mit Id 0 (oder eines, dessen Starting die UI verpasst hat) als „stale“ -> Spinner blieb.
2. Gibt es zur neuesten NavigationStarting kein eigenes Completed (z. B. Seite startet eine
   Navigation, die WebView2 ohne Completed verwirft, Download/externes Protokoll), gab es keinen
   Rückfall außer „Stop“.

**Fix:**
- `BrowserStore.tsx`: Completed gilt als veraltet nur, wenn Id > 0 **und** (Rust `stale` oder Id
  **kleiner** als die neueste bekannte). Id 0 / neuere Id beendet das Laden; `latestNav` wird auf
  max gesetzt. Erfolg und Fehler beenden das Laden gleichermaßen (`endLoading()`).
- Neu: Rust-Event `dom-content-loaded` (ICoreWebView2_2::add_DOMContentLoaded, mit NavigationId).
  Für die neueste Navigation startet die UI einen 5-s-Rückfall-Timer, der das Laden beendet, falls
  kein Completed folgt. Neue NavigationStarting bricht den Timer ab.
- Stop beendet das Laden sofort und löscht den Timer; ProcessFailed ebenso.
- NavigationId-Logik (Fehlerpanel nur für aktuelle Navigation, benigne Abbrüche) bleibt erhalten.

Zur Diagnose im Log: `NavigationStarting #N` ohne folgendes `NavigationCompleted #N` -> Fall 2,
dann muss `DOMContentLoaded #N` erscheinen.

## 2. Feature-Inventar

| Feature | Quelle (Standardprojekt) | Status | Begründung / Umsetzung |
|---|---|---|---|
| Design-Studio / Theme-Editor (Farben, Radius, Presets, eigene Themes, Import/Export) | `src/renderer/js/app.js` (PRESETS, Z. 840 ff.), `src/main/config.js` (normalizeTheme), `src/renderer/styles/studio.css` | **teilweise portiert** | `jtech://themes` (`src/pages/ThemesPage.tsx`, `src/lib/theme.ts`). Quellwerte accent/accent2/bg/text/textDim/radius + Modus; alle Tokens aus `tokens.css` werden abgeleitet und als Inline-Variablen auf `:root` gesetzt. Live (ganze UI), gespeichert (localStorage `jtech.customTheme`, `jtech.savedThemes`), 11 Presets übernommen, JSON-Import (auch Electron-Format `accentAlt`) / Export (Datei + Zwischenablage + Textfeld), validiert. Nicht: Glas/Blur/Glow/Schrift/Stil-Varianten, eigenes CSS. |
| Animierte Canvas-Hintergründe (8) | `src/shared/backgrounds.js` | nicht portiert (möglich) | Reiner Canvas-Code, portierbar als React-Komponente für Startseite; zurückgestellt (Umfang, Performance-Abwägung). |
| Cursor-Effekte (UI + Webseiten) | `src/shared/cursor-fx.js` | nicht portiert | UI-Teil möglich; auf Webseiten nur per Script-Injektion (AddScriptToExecuteOnDocumentCreated) – bewusst nicht (Eingriff in fremde Seiten). |
| Eigenes CSS (Chrome/Newtab) | `config.js` customCssChrome | nicht portiert | Möglich, aber Sicherheits-/Stabilitätsrisiko für die UI; später mit Sandbox. |
| Media-/Audio-Hub | `src/main/tabs.js` (media:list/command/volume/pause-all), `index.html` | **teilweise portiert** | `jtech://audio` (`src/pages/AudioPage.tsx`) + Lautsprecher-Knopf im Tab (Sidebar). Rust: `ICoreWebView2_8` `IsDocumentPlayingAudio`, `IsMuted`, Events `IsDocumentPlayingAudioChanged`/`IsMutedChanged` -> Event `audio-changed`; Command `set_tab_muted(id, muted)` mit ID-Validierung. Nicht: Play/Pause, Spulen, Medienliste je Element (bräuchte injiziertes Script + WebMessage). |
| Lautstärke pro Tab / Boost 300 % | `tabs.js` (Web Audio Injektion) | nicht möglich (ohne Injektion) | WebView2 hat keine Lautstärke-API; nur über eingeschleustes Web-Audio-Script je Seite. |
| Tab stummschalten | `tabs.js` setAudioMuted | **portiert** | über Audio-Hub / Sidebar. |
| JTech Bangs (!yt, !yt-d, !g, !ddg, !gh, eigene) | `src/main/main.js` resolveInput, `app.js` BUILTIN_BANGS, `config.js` normalizeBangs | **portiert** | `src/lib/urls.ts` (resolveBang, normalizeBangs), Einstellungen -> „JTech Bangs“. |
| Vertikale Tabs, Anheften, Kontextmenü, Drag & Drop, Sitzung | `tabs.js`, `app.js` | bereits vorhanden | Etappe G/CD. |
| Tab-Gruppen mit Farben | `tabs.js`, `main.js` tabs:*group | nicht portiert (möglich, reines UI) | Umfang. |
| Split-View | `tabs.js` tabs:split | teilweise möglich, Rust-Arbeit | Zwei Content-Webviews gleichzeitig sichtbar -> `apply_layout` umbauen. |
| Tab-Suche / Befehlspalette (Strg+K) | `app.js` | nicht portiert (möglich, UI) | Popover-Muster vorhanden; Umfang. |
| Geschlossene Tabs wiederherstellen (Strg+Shift+T) | `tabs.js` | nicht portiert (möglich) | UI + Kürzel in `shortcut_name`. |
| Vorschläge in der Adressleiste | `app.js` | nicht portiert (möglich, UI) | Daten (Tabs/Lesezeichen/Verlauf) liegen im Store. |
| Zoom pro Seite (gespeichert) | `main.js` tabs:zoom | Rust-Arbeit | `ICoreWebView2Controller::SetZoomFactor`. |
| Suchen auf der Seite (Strg+F) | `main.js` find:* | Rust-Arbeit | `ICoreWebView2_?` Find-API ist neu/experimentell; sonst `window.find` per eval. |
| Drucken | `tabs.js` print | Rust-Arbeit (einfach) | `ICoreWebView2_16::ShowPrintUI` oder `window.print()` per eval. |
| Bild-in-Bild | `tabs.js` | Rust-Arbeit | per eval `requestPictureInPicture()` – braucht Nutzergeste, unsicher. |
| Vollbild (F11) | `main.js` | Rust-Arbeit | Tauri `set_fullscreen` + ContainsFullScreenElementChanged. |
| Gaming-Modus / Tabs schlafen legen | `tabs.js`, `resources.js` | Rust-Arbeit | `ICoreWebView2_3::TrySuspend`/`Resume`, `MemoryUsageTargetLevel`. |
| Ressourcen-Panel (CPU/RAM, Prozessliste) | `src/main/resources.js` | Rust-Arbeit | `ICoreWebView2Environment8::GetProcessInfos` + sysinfo-Crate (Installation verboten). |
| Harte CPU-Grenze (Job-Objekt), niedrige Priorität | `src/main/job-limit.js` (koffi) | Rust-Arbeit | `windows`-Crate Job-Objekte; Features in Cargo.toml nötig. |
| Lesezeichen mit Ordnern/Tags, Favoritenleiste | `config.js`, `app.js` | teilweise vorhanden | Ordner/Tags fehlen. |
| Verlauf | `config.js` history.json | vorhanden | localStorage. |
| Downloads-Verwaltung | `main.js` downloads:* | Rust-Arbeit | `ICoreWebView2_4::add_DownloadStarting`. |
| Werbeblocker (Ghostery) | `main.js` | ersetzt | adblock-rust (Brave) vorhanden. |
| Chrome-Erweiterungen (Web Store, crx) | `main.js` extensions:* | nicht möglich (derzeit) | Electron-`session.loadExtension`; WebView2 hat nur experimentelle `AddBrowserExtension` (ICoreWebView2Profile7, nur entpackte, kein Store). |
| Auto-Update über GitHub-Releases | `main.js` (electron-updater), `.github/workflows/release.yml` | nicht portiert | Electron-only; Ersatz: `tauri-plugin-updater` (Installation nötig). |
| Rahmenloses Fenster, eigene Titelleiste | `main.js`, `index.html` | Rust-Arbeit | Tauri `decorations(false)` + Drag-Region. |
| Changelog nach Update | `src/renderer/changelog.html` | nicht portiert | hängt am Updater. |
| Gebrandete Fehlerseite | `main.js` | vorhanden | Fehlerbanner (Etappe B/CD). |
| Hotkeys konfigurierbar (settings.json) | `src/main/shortcuts.js` | nicht portiert | Feste Kürzel in Rust `shortcut_name`; konfigurierbar = Rust+UI. |
| Settings-Migration aus `%APPDATA%\Pulse` | `config.js` | nicht nötig | anderes Speicherformat. |

## 3. Geänderte / neue Dateien
- `src-tauri/src/lib.rs`: TabInfo `playingAudio`/`muted`, TabEvent-Felder, DOMContentLoaded-, IsDocumentPlayingAudioChanged-, IsMutedChanged-Handler (+ Detach), Command `set_tab_muted`, `valid_tab_id` + Test.
- `src/store/BrowserStore.tsx`, `src/store/types.ts`, `src/lib/ipc.ts`, `src/lib/urls.ts`, `src/components/{ContentArea,Toolbar,Sidebar}.tsx`, `src/pages/SettingsPage.tsx`, `src/styles/app.css`.
- Neu: `src/lib/theme.ts`, `src/pages/ThemesPage.tsx`, `src/pages/AudioPage.tsx`.
- `Cargo.toml` unverändert (gesichert).

## 4. Verifikation
- `npx tsc --noEmit`: fehlerfrei.
- Rust: **nicht kompiliert** (kein cargo). Unsichere APIs in webview2-com 0.39: Namen
  `DOMContentLoadedEventHandler`, `IsDocumentPlayingAudioChangedEventHandler`,
  `IsMutedChangedEventHandler`; Signaturen von `IsDocumentPlayingAudio`/`IsMuted`/`SetIsMuted` (BOOL).
- Nichts im laufenden Browser getestet.

## 5. Testcheckliste
1. [ ] `cargo build` / `cargo test` (neuer Test `tab_id_validation`).
2. [ ] example.com, wikipedia.org, Google-Suche, DuckDuckGo-Suche: Ladebalken in der Adressleiste und Spinner im Tab verschwinden nach dem Laden.
3. [ ] Anker-Link (#abschnitt) und SPA-Navigation (YouTube, GitHub): kein hängender Spinner.
4. [ ] Langsame Seite -> Stop: Spinner sofort weg, kein Fehlerbanner.
5. [ ] Nicht erreichbare Domain: Spinner weg, Fehlerbanner erscheint.
6. [ ] Log: zu jeder `NavigationStarting #N` ein `NavigationCompleted #N` oder `DOMContentLoaded #N`.
7. [ ] `!yt lofi`, `!gh tauri`, eigener Bang aus Einstellungen.
8. [ ] `jtech://themes`: Preset wählen -> UI färbt sich sofort; Farbe/Radius ändern; Neustart -> Theme bleibt; Export -> Import der Datei; Electron-Theme-JSON importieren; „Zurücksetzen“.
9. [ ] Popover/Menü über einer Webseite und interne Seiten: Content-Webview wird versteckt.
10. [ ] YouTube-Video abspielen: Lautsprecher im Tab + Eintrag in `jtech://audio`; Stumm/Ton an wirkt; Pause -> Eintrag verschwindet (nur wenn nicht stumm).
11. [ ] Tab mit Audio schließen: keine Fehler im Log (Handler entfernt).
