# Runde 4 – Etappe E/F: Filterlisten, Datenschutz, Cookies, Berechtigungen, SQLite

Stand 2026-11-08. Sicherungen der geänderten Dateien: `docs/backup_round4/` (Pfad mit `_` statt `/`; dort auch `patch_lib.py`, mit dem lib.rs geändert wurde).
Versionen laut Cargo.lock: tauri 2.12.5, webview2-com/-sys 0.39.1, windows 0.62.2, adblock 0.13.5.

## Verifikation (ehrlich)
- `npx tsc --noEmit`: **fehlerfrei**.
- Rust: **nicht kompiliert** (kein cargo auf dem PC, Crate-Quellen nicht abrufbar). Geprüft: Syntax aller .rs-Dateien mit `rustfmt` (parst). API-**Namen** wurden gegen die Symbol-Strings der vorhandenen `.rlib/.rmeta` in `src-tauri/target/debug/deps` geprüft (webview2-com-sys, webview2-com, adblock) – existieren: `ClearBrowsingData`, `COREWEBVIEW2_BROWSING_DATA_KINDS_*`, `CookieManager`, `GetCookies`, `DeleteCookie(s)`, `DeleteAllCookies`, `add_PermissionRequested`, `COREWEBVIEW2_PERMISSION_KIND_*/STATE_*`, `GetDeferral`, `SetSavesInProfile`, `ICoreWebView2Profile2`, `ICoreWebView2_13`, Handler `GetCookiesCompletedHandler`, `ClearBrowsingDataCompletedHandler`, `PermissionRequestedEventHandler`; adblock `Engine::serialize/deserialize/url_cosmetic_resources/hidden_class_id_selectors`, Felder `hide_selectors/exceptions/generichide`. **Signaturen** sind damit nicht bewiesen (siehe unten).
- Nichts am Gerät getestet. Neue Unit-Tests: `storage::tests`, `filters::tests`, `privacy::tests`.
- Neue Abhängigkeit: `rusqlite = { version = "0.32", features = ["bundled"] }` (nur deklariert, nichts installiert; erster Build kompiliert SQLite mit – braucht MSVC-C-Compiler, ist bei Tauri ohnehin vorhanden).

## Status je Feature

| # | Feature | Status | Umsetzung |
|---|---|---|---|
| 1 | Filterlisten-Verwaltung | **implementiert** | `src-tauri/src/filters.rs`. Quellen: EasyList, EasyPrivacy (an), uBlock filters, uBlock Privacy, Peter Lowe, Fanboy Annoyance (aus, Schalter). Download nach `<AppData>/filters/<id>.txt` (Timeout 60 s, max. 30 MB, HTML/zu kurze Antworten werden verworfen; bei Fehler bleibt die alte Datei). Engine wird im **Hintergrund-Thread** gebaut, **serialisiert** (`engine.dat`) und nur als Bytes an den UI-Thread gegeben (deserialisieren dort – adblock ist „single-thread“). Start: passt die Signatur (aktive Listen + Stand), lädt der Cache sofort; veraltete Listen (Standard alle 4 Tage, 1–30 einstellbar) werden danach aktualisiert; stündliche Prüfung. „Jetzt aktualisieren“. Status/Stand/≈Regelzahl/Fehler je Liste, Event `filter-status`. **Allowlist** pro Site (inkl. Subdomains) – Schalter in Shield-Popover und Datenschutzseite. Interception, Drittanbieter-Logik (`source` = Top-Level-URL) und „Hauptdokument nie blockieren“ unverändert. |
| 1b | Kosmetische Filter | **implementiert (Basis)** | Bei `DOMContentLoaded`: `url_cosmetic_resources(url).hide_selectors` -> `<style id="jtech-cosmetic">` (eine Regel je Selektor, max. 8000); danach einmaliges Einsammeln von Klassen/IDs (max. 3000) -> `hidden_class_id_selectors` -> zweites Stylesheet. Abschaltbar. |
| 2 | Datenschutz-Dashboard | **implementiert** | Pro Tab (Sitzung), pro Seite (gesamt, SQLite `site_stats`), Top blockierte Domains (gesamt `domain_stats` + Sitzung), Gesamtzähler persistent (`meta stats.total`). Zähler im Handler nur im Speicher, Hintergrund-Thread schreibt alle 20 s + beim Beenden (`RunEvent::Exit`). Zurücksetzen. |
| 3 | Cookies / Browserdaten | **implementiert** | `ICoreWebView2_2::CookieManager`: Liste je Seite (`GetCookies(url)`), Übersicht aller Domains (`GetCookies("")`), Löschen je Domain (inkl. Subdomains, `DeleteCookie` je Cookie) und alle (`DeleteAllCookies`). Werte werden nicht an die UI gegeben. `ICoreWebView2_13::Profile` -> `ICoreWebView2Profile2::ClearBrowsingData` für Cache, Cookies, Website-Speicher, WebView2-Verlauf, Downloadliste; Rückfall nur Cookies. „Beim Beenden löschen“ (Cookies/Cache) wird **beim nächsten Start** vor dem ersten Laden ausgeführt (asynchrones Löschen beim Beenden ist nicht verlässlich). Benötigt mindestens einen offenen Web-Tab. |
| 4 | Website-Berechtigungen | **implementiert** | `PermissionRequested` je Tab: gespeicherte Entscheidung -> sofort; sonst `GetDeferral`, Event `permission-request`, Leiste `PermissionBar` im Header (außerhalb des Content-Rechtecks) mit Erlauben/Blockieren/„Für diese Seite merken“; `resolve_permission` setzt State + `Deferral.Complete`. `SetSavesInProfile(false)` (WebView2 speichert nicht selbst). Offene Anfragen eines geschlossenen/schlafenden Tabs werden abgelehnt. Verwaltung in Einstellungen (`PermissionSettings`). Nicht-http(s)-Origins werden abgelehnt. |
| 5 | Persistenz (SQLite) | **implementiert** | `src-tauri/src/storage.rs`, Datei `<AppData>/jtech.sqlite3` (WAL). UI-Daten (settings, bookmarks, history, zoom, groups, session, customTheme, savedThemes, downloads) als validierte JSON-Werte in `kv` (nur erlaubte Schlüssel, max. 8 MB, muss gültiges JSON sein). Berechtigungen, Statistik, Filter-Konfiguration, Allowlist in eigenen Tabellen/`meta`. `storage.ts` lädt vor dem ersten Render (`initStorage`), schreibt entprellt (400 ms, `beforeunload` flusht). **Migration**: beim ersten Start ohne Flag werden `jtech.*` aus localStorage importiert (vorhandene Schlüssel nicht überschrieben); localStorage bleibt als Sicherung. Ohne SQLite Rückfall auf localStorage. Verlauf/Lesezeichen sind weiterhin JSON-Listen (keine eigene Tabelle) – bewusste Vereinfachung. |
| 6 | Doku | dieses Dokument |

## Filter-Abdeckung (ehrlich – keine uBlock-Origin-Parität)
- **Erfasst**: alle Anfragen, die WebView2 über `WebResourceRequested` (Filter `*`, Kontext ALL) meldet: Bilder, Skripte, Styles, Fonts, XHR/Fetch, Media, Subframes, WebSocket-**Handshake**.
- **Lücken**: Anfragen aus **Service Workern** werden je nach Runtime-Version nicht oder nur teilweise gemeldet (neuere Runtimes melden sie nur mit `AddWebResourceRequestedFilterWithRequestSourceKinds`, nicht genutzt). WebSocket-**Nachrichten** nach dem Handshake: nicht filterbar. Anfragen in manchen Cross-Origin-iframes / Popups ggf. unvollständig. Kein Blocken des Hauptdokuments (Absicht). `$redirect`/Ersatz-Ressourcen, `$csp`, `$removeparam`, `$header` werden nicht angewendet (blockiert wird mit leerer 204-Antwort).
- **Kosmetisch**: nur einmal bei DOMContentLoaded – später nachgeladene Elemente mit neuen Klassen/IDs werden von den generischen Regeln **nicht** erfasst (kein MutationObserver); kurzes Aufblitzen möglich; nur Hauptframe (keine iframes). **Prozedurale Filter** (`:has-text`, `:upward` …) und **Scriptlets** (`##+js(...)`, `injected_script`) werden **nicht** ausgeführt – deshalb wirken Teile von uBlock filters / Fanboy Annoyance nicht.
- Regelzahl ist eine Näherung (Zeilen ohne Kommentar/Kopf), nicht die Zahl der von adblock-rust akzeptierten Regeln.

## Unsichere APIs (bitte beim ersten `cargo build` prüfen)
1. adblock 0.13: `FilterSet::add_filter_list(String, ParseOptions)` (wie bisher), `Engine::new_with_filter_set(fs)`, `Engine::serialize()` (Vec<u8> **oder** Result – per Hilfstrait `IntoBytes` beides abgedeckt), `Engine::deserialize(&[u8]) -> Result<(), _>`, `hidden_class_id_selectors(classes.iter(), ids.iter(), &HashSet<String>)` – Parametertypen unsicher (evtl. `&[String]`).
2. Completed-Handler-Closures: `GetCookiesCompletedHandler` mit `(Result<()>, Option<ICoreWebView2CookieList>)`, `ClearBrowsingDataCompletedHandler` mit `(Result<()>)`; ob die Closures `Send` sein müssen (sie halten COM-Zeiger).
3. Rückgabewerte statt Out-Parameter: `ICoreWebView2_2::CookieManager()`, `ICoreWebView2_13::Profile()`, `CookieList::GetValueAtIndex(u32)`, `PermissionRequestedEventArgs::GetDeferral()`; Out-Parameter: `Cookie::Name/Domain/Path(&mut PWSTR)`, `Expires(&mut f64)`, `IsHttpOnly/IsSecure/IsSession(&mut BOOL)`, `SameSite`, `CookieList::Count(&mut u32)`, `PermissionKind`, `IsUserInitiated`.
4. `ICoreWebView2PermissionRequestedEventArgs3::SetSavesInProfile(BOOL)` (Interface-Name „…Args3“ angenommen).
5. `COREWEBVIEW2_BROWSING_DATA_KINDS(i32)` als Bitmaske per `.0 |`.
6. Tauri: `Builder::build(..).run(|app, RunEvent::Exit|)`, `app.path().app_data_dir()`, `async_runtime::spawn_blocking`.
7. rusqlite 0.32: `Connection::unchecked_transaction`, `OptionalExtension::optional`.

## Neue/geänderte Dateien
- Neu Rust: `src-tauri/src/{storage,filters,privacy}.rs`. Geändert: `lib.rs` (Module, Setup ohne festen Listen-Download, Allowlist + Statistik im Handler, PermissionRequested, kosmetische Injektion, Exit-Hook, neue Commands), `Cargo.toml` (rusqlite).
- Neu UI: `src/components/{PermissionBar,PermissionSettings,SiteShieldToggle}.tsx`. Geändert: `src/store/storage.ts`, `src/main.tsx`, `src/App.tsx`, `src/lib/ipc.ts`, `src/pages/{PrivacyPage,SettingsPage}.tsx`, `src/components/Toolbar.tsx`, `src/styles/app.css`. Capabilities unverändert.
- Neue Commands: `storage_load/set/remove/import`, `filter_status/set_list/set_options/update_now`, `allowlist_set/check`, `privacy_stats/reset_stats/get_options/set_options`, `list_cookies`, `delete_cookies`, `clear_browsing_data`, `resolve_permission`, `list_permissions`, `set_permission`.

## Test-Checkliste
- [ ] `cargo build` / `cargo test` (neue Tests in storage/filters/privacy).
- [ ] Erster Start: Lesezeichen/Verlauf/Einstellungen/Zoom/Gruppen aus alter Version noch da (Migration); Log „localStorage-Migration: n Einträge“; `jtech.sqlite3` im AppData-Ordner.
- [ ] Neustart: Daten bleiben; Lesezeichen anlegen + sofort schließen -> nach Neustart vorhanden.
- [ ] Datenschutzseite: Listen-Status „Aktiv“, Stand, Regelzahl. Zweiter Start: „Aus Cache geladen“, Blocker sofort aktiv (auch offline).
- [ ] Liste zuschalten (z. B. Peter Lowe) -> „Lädt …“ -> „Baut Engine …“ -> „Aktiv“, UI bleibt flüssig. Offline „Jetzt aktualisieren“ -> Fehler je Liste, alte Engine bleibt.
- [ ] Shield-Popover: „Schutz auf <site>“ aus -> Seite lädt neu, Zähler bleibt 0, Werbung sichtbar; wieder an.
- [ ] Kosmetik: Seite mit Werbeplätzen – leere Container ausgeblendet; Schalter aus -> nach Neuladen sichtbar.
- [ ] Statistik: Seiten/Domains füllen sich, nach Neustart Gesamtwerte erhalten; Zurücksetzen.
- [ ] Cookies: „Anzeigen“ für aktuelle Seite, „Alle Seiten laden“, Domain löschen, Alle löschen (danach z. B. ausgeloggt).
- [ ] Browserdaten: Cache/Website-Speicher löschen; JTech-Verlauf löschen.
- [ ] „Cookies beim Beenden löschen“ an, beenden, starten -> Cookies weg.
- [ ] Berechtigungen: z. B. https://webcamtests.com oder Standort-Demo -> Leiste oberhalb der Seite (Seite rutscht nach unten), Erlauben/Blockieren, „merken“ -> zweiter Besuch ohne Frage; Einstellungen: ändern/zurücksetzen; Tab mit offener Anfrage schließen.
- [ ] Regression: Downloads, Zoom, Suchen, Drucken, Tab-Schlaf, Palette, Vorschläge, Themes, Gruppen, Audio-Hub, Sitzung, Spinner, Popup-Schutz.
