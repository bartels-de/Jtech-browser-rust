# Etappe C/D – CONNECTION_ABORTED-Fix und Browser-Verbesserungen

Backup: `docs/backup_etappe_cd/` (lib.rs, BrowserStore.tsx, urls.ts, Toolbar.tsx, ipc.ts).
Hinweis: `src-tauri/Cargo.toml` wurde um das windows-Feature `Win32_UI_Input_KeyboardAndMouse` ergaenzt (kein neues Paket).

## Ursache von `NavigationCompleted FEHLER CONNECTION_ABORTED (9)`
Die Google-Ergebnisseite wurde trotz Meldung korrekt angezeigt. Ursache ist eine **ueberholte Navigation**:
Google (gws-wiz-serp, Suche aus dem Suchfeld) startet unmittelbar eine neue Navigation bzw. ersetzt die laufende.
WebView2 beendet die alte NavigationId mit `CONNECTION_ABORTED` (9) bzw. `OPERATION_CANCELED` (14).
Unser Code wertete jedes `IsSuccess=false` als Fehler, ohne die NavigationId zu pruefen, und zeigte die
Fehlermeldung an. Zusaetzlich wurde als URL die *aktuelle* Tab-URL geloggt (nicht die der abgebrochenen Navigation),
deshalb stand dort die Google-URL.

Adblock geprueft: Das Hauptdokument wird nie blockiert (`is_main_document`, URL wird bei jeder NavigationStarting –
auch bei Redirects – aktualisiert). Blockierte Subressourcen bekommen 204; das erzeugt kein NavigationCompleted-Fehler
fuer den Top-Level. Kein Hinweis, dass Adblock beteiligt ist (Test: `JTECH_NO_ADBLOCK=1`).

## Aenderungen
- Rust: pro Tab `nav_id` (neueste NavigationId) und `user_stopped`. NavigationCompleted vergleicht die eigene Id:
  `stale` (ueberholt) und `benign` (stale, Stop durch Nutzer, oder 14) werden mitgesendet und nur als info geloggt.
- UI: ueberholte Completed-Events werden komplett ignoriert; Fehlerpanel nur fuer die aktuelle Navigation und echte Fehler, nicht nach Stop.
- Natives Zurueck/Vorwaerts/Stop (`GoBack`/`GoForward`/`Stop`) statt JS; `HistoryChanged` -> `CanGoBack/CanGoForward` -> Buttons deaktiviert.
- `AcceleratorKeyPressed` am Controller: Strg+T/W/L/R, F5, Strg(+Umschalt)+Tab, Alt+Links/Rechts, Strg+D/H, Strg+, werden als Event `shortcut` an die UI geleitet.
- `NewWindowRequested`: nutzerausgeloeste Popups (http/https) oeffnen als neuer JTech-Tab, alle anderen werden blockiert (Statusmeldung).
- Favicons: bereits `/favicon.ico` der Seite (unveraendert, kein Google-Dienst). FaviconChanged nicht genutzt.
- Sitzung: offene Web-Tabs + Anheft-Status in localStorage (`jtech.session`), Wiederherstellung beim Start.
- Unit-Tests: `benign_aborts`, `shortcuts`.

## Unsichere API-Stellen (beim ersten `cargo build` pruefen)
- `args.SetHandled(true.into())` (BOOL-Parameter: ggf. `true` direkt oder `BOOL::from(true)`).
- `webview2_com::AcceleratorKeyPressedEventHandler`, `HistoryChangedEventHandler`, `NewWindowRequestedEventHandler` (Namen nach Muster der vorhandenen Handler).
- `pwv.controller().cast::<SYS::ICoreWebView2Controller>()`, `GetKeyState`.

## Testcheckliste
1. Google-Suche aus dem Suchfeld der Ergebnisseite: keine Fehlermeldung, Log zeigt "abgebrochen … ignoriert".
2. Ungueltige Domain (z. B. `https://xyz.invalid`): Fehlerpanel HOST_NAME_NOT_RESOLVED erscheint.
3. Laden stoppen: kein Fehlerpanel.
4. Zurueck/Vorwaerts: Buttons nur aktiv wenn moeglich; funktionieren nativ.
5. Fokus in Webseite: Strg+T, Strg+W, Strg+L, F5, Strg+Tab, Alt+Links, Strg+D, Strg+H, Strg+, wirken.
6. Link mit `target=_blank` / Mittelklick: neuer Tab. Automatisches `window.open` ohne Klick: blockiert.
7. Mehrere Tabs + angeheftet, App neu starten: Tabs und Anheftung wiederhergestellt.
8. `cargo test` in src-tauri.
