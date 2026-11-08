# Runde 3 – Feature-Runde (Downloads, Zoom, Suchen, Drucken, Tab-Schlaf, Palette, Vorschläge, Theme, Gruppen)

Stand 2026-11-08. Sicherungen aller geänderten Dateien: `docs/backup_round3/` (Pfad mit `_` statt `/`).
Versionen laut `src-tauri/Cargo.lock`: tauri 2.12.5, webview2-com / webview2-com-sys 0.39.1, windows 0.62.2.
Cargo.toml und Capabilities **unverändert** (eigene Commands brauchen keine Permission; tauri-plugin-opener war schon Abhängigkeit und wird nur Rust-seitig benutzt).

## Verifikation (ehrlich)
- `npx tsc --noEmit`: **fehlerfrei** (Exit 0).
- Rust: **nicht kompiliert** (kein cargo auf dieser Maschine), Quelltext von webview2-com 0.39 war nicht abrufbar (Netz gesperrt) – APIs aus dem Gedächtnis, siehe Liste unten. Neue Unit-Tests: `round3_validation`.
- Nichts am Gerät getestet.

## Status je Feature

| # | Feature | Status | Umsetzung |
|---|---|---|---|
| 1 | Downloads | **implementiert** | Rust: `ICoreWebView2_4::add_DownloadStarting` je Tab, `SetHandled(true)` (kein WebView2-Dialog), `DownloadOperation` mit `BytesReceivedChanged`/`StateChanged` (Fortschritt gedrosselt 250 ms), Event `download-event`. Commands `list_downloads`, `download_action(id, pause/resume/cancel)`, `open_download(id, reveal)`. Pfad wird kanonisiert und muss im Download-Ordner (`app.path().download_dir()`) liegen; Programme/Skripte (.exe, .msi, .bat, .ps1 …) werden nicht gestartet, nur „Im Ordner zeigen“ (`explorer /select,"…"`). Öffnen über `tauri_plugin_opener::OpenerExt::open_path`. UI: `jtech://downloads` + Toolbar-Panel (`DownloadList`), Badge mit laufenden Downloads, abgeschlossene in localStorage (frühere Sitzungen nur Anzeige). |
| 2 | Zoom pro Tab/Seite | **implementiert** | `set_tab_zoom(id, factor)` (0.25–5, validiert) über Tauri `Webview::set_zoom`. `ZoomFactorChanged` am Controller -> Event `zoom-changed` (erfasst auch Strg+Mausrad). Strg + / − / 0 (UI und Webseite via AcceleratorKeyPressed), Chromium-Stufen. Speicherung je Host (`jtech.zoom`), wird beim Tab-/Hostwechsel angewendet. Anzeige „125 %“ in der Adressleiste (Klick = zurücksetzen), Menüzeile, Liste in Einstellungen. |
| 3 | Suchen auf der Seite | **implementiert** (window.find) | Strg+F / F3 / Umschalt+F3; Leiste im Header (außerhalb des Content-Rechtecks, ResizeObserver meldet neue Höhe). `find_in_page(query, backwards, caseSensitive)`: Suchtext nur als JSON-String eingebettet, max. 300 Zeichen; `ExecuteScript` mit Rückgabe {count, found} -> Event `find-result`. Esc schließt und hebt Markierung auf. ICoreWebView2Find nicht genutzt (in 0.39 unsicher/experimentell). Trefferzahl zählt `innerText` (ohne iframes). |
| 4 | Drucken | **implementiert** | Strg+P / Menü: `ICoreWebView2_16::ShowPrintUI(BROWSER)`, Rückfall `window.print()`. |
| 5 | Tab-Schlaf | **implementiert** | Rust `sleep_tab(id)`: Handler lösen, Webview schließen, URL/Titel in `TabManager.sleeping` (ID bleibt in `order`). Nie aktiver oder Audio-Tab (Rust prüft), nie angeheftete (UI prüft). `switch_tab`/`close_tab` wecken asynchron auf (neue Webview mit Label `content-N-wM`, gleiche Tab-ID). Einstellung „nach X Minuten“ (Standard 30, 0 = nie), Kontextmenü „Tab schlafen legen“, Menü „Inaktive Tabs schlafen legen“. Sidebar: gedimmt + „z“. Achtung: Seitenzustand (Formulare, Scroll) geht verloren; Zurück-Verlauf ebenfalls. |
| 6 | Befehlspalette | **implementiert** | Strg+K (alles) / Strg+Umschalt+P bzw. „>“ (nur Befehle): Befehle, interne Seiten, Tabs, Lesezeichen, Verlauf, „suchen/öffnen“. Pfeiltasten/Enter/Esc. Vollbild-Overlay; Content-Webview dabei versteckt (popover = "palette"). |
| 7 | Adressleisten-Vorschläge | **implementiert** | `src/lib/suggest.ts`: Eingabe, interne Seiten, offene Tabs („Zu Tab wechseln“), Lesezeichen, Verlauf (Häufigkeit + Aktualität), Bangs (bei `!…` -> Kürzel ins Feld). Dropdown unter der Adressleiste; solange offen, ist die Content-Webview versteckt (popover = "suggest", gleiches Muster wie set_content_visible). |
| 8 | Theme-Editor | **implementiert** | Neue Felder: Glas-Deckkraft, Blur, Glow, Schrift (nur Allowlist), eigenes CSS. CSS wird bereinigt (`sanitizeCss`: kein @import, url(), image-set(), expression(), javascript:, behavior, -moz-binding, `<`), max. 20 000 Zeichen, per `textContent` in `<style id="jtech-custom-css">` **nur der UI-Webview**. Export-Format v2 (v1/Electron weiter importierbar). |
| 9 | Tab-Gruppen | **implementiert** (UI) | Farbig (8 Farben), benennbar, einklappbar (aktiver Tab bleibt sichtbar), auflösen / mit Tabs schließen. Kontextmenü am Tab: neue Gruppe / zu Gruppe / entfernen. Gespeichert: Gruppen (`jtech.groups`) + Zugehörigkeit in der Sitzung. Gruppen leben nur in der UI (Rust kennt sie nicht). |
| – | Split-View | **offen (zurückgestellt)** | Braucht zwei gleichzeitig sichtbare Content-Webviews: `apply_layout`/`content_bounds` auf mehrere Rechtecke umbauen, aktiver Bereich, Fokus, Kürzel-Weiterleitung. Eigene Runde. |

Erhalten: Adblock, NavigationId-Logik, Spinner-Fix (DOMContentLoaded-Rückfall), Audio-Hub, Bangs, Sitzungswiederherstellung (jetzt zusätzlich Gruppen).

## Unsichere APIs (bitte beim ersten `cargo build` prüfen)
webview2-com / -sys 0.39.1, windows 0.62.2, tauri 2.12.5:
1. Handler-Namen: `webview2_com::DownloadStartingEventHandler`, `BytesReceivedChangedEventHandler`, `StateChangedEventHandler`, `ZoomFactorChangedEventHandler`, `ExecuteScriptCompletedHandler` (Closure-Signatur `(Result<()>, String)` angenommen – Parameter sind untypisiert geschrieben).
2. `ICoreWebView2DownloadStartingEventArgs::DownloadOperation()` als Rückgabewert (nicht Out-Parameter); `ResultFilePath(&mut PWSTR)`, `SetHandled(BOOL)`.
3. `ICoreWebView2DownloadOperation`: `BytesReceived(&mut i64)`, `TotalBytesToReceive(&mut i64)`, `State`, `InterruptReason`, `CanResume`, `Uri`, `Pause/Resume/Cancel`, `add_BytesReceivedChanged/add_StateChanged`.
4. Enum-Werte: `COREWEBVIEW2_DOWNLOAD_STATE_*`; Interrupt-Reason `USER_CANCELED = 26`, `USER_PAUSED = 28` (aus dem Gedächtnis, UI/Rust verwenden die Zahlen).
5. `ICoreWebView2_16::ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER)`.
6. `ICoreWebView2Controller::add_ZoomFactorChanged` / `remove_ZoomFactorChanged` / `ZoomFactor(&mut f64)`.
7. `ICoreWebView2::ExecuteScript(PCWSTR, &handler)`.
8. Tauri: `Webview::set_zoom(f64)` (vor Controller-Bereitschaft nach dem Aufwecken evtl. wirkungslos), `AppHandle::run_on_main_thread`, `app.path().download_dir()`.
9. tauri-plugin-opener: `app.opener().open_path(String, None::<&str>)`.
10. `std::os::windows::process::CommandExt::raw_arg` (stabil seit 1.62 – sicher).
Annahme: alle WebView2-Callbacks und `run_on_main_thread` laufen auf demselben UI-Thread (thread_local `DL_OPS`, wie schon `ENGINE`).

## Neue/geänderte Dateien
- Rust: `src-tauri/src/lib.rs` (Commands `sleep_tab`, `set_tab_zoom`, `find_in_page`, `print_active`, `list_downloads`, `download_action`, `open_download`; `spawn_webview`/`wake_tab`/`destroy_webview`; Kürzel ctrl+f/p/k/shift+p/plus/minus/0, F3).
- Neu: `src/components/{DownloadList,FindBar,CommandPalette}.tsx`, `src/lib/suggest.ts`.
- Geändert: `src/store/{BrowserStore.tsx,types.ts}`, `src/lib/{ipc,theme}.ts`, `src/components/{Toolbar,Sidebar,ContentArea,useShortcuts}.tsx|ts`, `src/pages/{DownloadsPage,SettingsPage,ThemesPage}.tsx`, `src/App.tsx`, `src/styles/app.css`.

## Test-Checkliste
- [ ] `cargo build` / `cargo test` (u. a. `round3_validation`).
- [ ] Download (z. B. große Testdatei): erscheint im Panel + Badge, Fortschritt, Pause -> „Pausiert“, Fortsetzen, Abbrechen; fertige Datei „Öffnen“ / „Im Ordner zeigen“ (Explorer markiert Datei); .exe -> Hinweis statt Start; kein WebView2-Download-Flyout.
- [ ] Download ohne Größenangabe -> unbestimmter Balken.
- [ ] Strg + / − / 0 auf Webseite (Fokus in Seite UND in Adressleiste), Strg+Mausrad; Anzeige in Adressleiste; anderer Tab gleicher Host übernimmt Zoom; Neustart behält Zoom.
- [ ] Strg+F: Leiste erscheint, Webseite rutscht nach unten (nicht überdeckt), Treffer, Enter/Umschalt+Enter/F3, Esc entfernt Markierung; Suchtext mit `"` `\` `</script>`.
- [ ] Strg+P: Druckdialog von WebView2; auf interner Seite Hinweis.
- [ ] Tab-Schlaf: Einstellung 5 Min, Tab im Hintergrund -> gedimmt „z“; Klick lädt neu; Audio-Tab und angehefteter Tab schlafen nicht; Schließen eines schlafenden Tabs; aktiver Tab schließen, nächster schläft -> wird geweckt.
- [ ] Strg+K / Strg+Umschalt+P: Suche, Pfeile, Enter, Esc, Klick außerhalb; Webseite währenddessen versteckt und danach wieder sichtbar.
- [ ] Adressleiste tippen: Dropdown (Verlauf/Lesezeichen/Tabs/Seiten), Pfeile + Enter, `!y` -> Bang-Vorschlag füllt Feld, Esc schließt Dropdown, Blur stellt Webseite wieder her.
- [ ] Design-Studio: Glas/Blur/Glow/Schrift live; eigenes CSS mit `@import`/`url()` -> wird entfernt; wirkt nicht in Webseiten; Export/Import v2.
- [ ] Gruppen: anlegen, umbenennen (Enter), Farbe, einklappen, Tab hinzufügen/entfernen, auflösen, mit Tabs schließen; Neustart stellt Gruppen wieder her; kompakte Sidebar.
- [ ] Regression: Adblock-Zähler, Spinner endet, Fehlerbanner, Audio-Hub, Bangs, Sitzung, Drag & Drop.
