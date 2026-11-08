# Etappe G – Design und Browser-Funktionen (Stand 2026-11-08)

**Status: implementiert. Frontend: `tsc --noEmit` ohne Fehler. Rust: NICHT kompiliert (kein cargo). Nichts davon im laufenden Programm getestet.** `vite build` lief in der Prüfumgebung nicht (fehlendes natives rolldown-Binding unter Linux), auf Windows mit `npm run build` prüfen.

Sicherung der alten Dateien: `docs/backup_etappe_g/` (App.tsx, App.css, lib.rs).

## Architektur-Änderung

- Statt zwei UI-Webviews (`top`, `sidebar`) gibt es **eine UI-Webview `ui`** über das ganze Fenster. Die native Content-Webview liegt darüber im Rechteck rechts der Sidebar und unter dem Header. React meldet beide Maße per `set_layout { topHeight, sidebarWidth }`.
- Native Webview liegt immer **über** React. Deshalb:
  - Interne Seiten (`jtech://newtab|settings|history|bookmarks|privacy|downloads`) werden nur angezeigt, während Rust die aktive Content-Webview versteckt (`set_content_visible`).
  - Ist ein Menü/Popover/Kontextmenü offen, wird die Webseite ebenfalls kurz ausgeblendet (an ihrer Stelle ein Platzhalter). Bewusster Kompromiss.
- Ein neuer Tab ist ein Tab mit `about:blank`; die UI zeigt darüber die Startseite. Start-URL in Rust ist jetzt `about:blank`.
- Fensterdekoration bleibt nativ (Windows-Titelleiste). Keine eigenen Fensterknöpfe, keine neuen Capabilities nötig.

## Rust (src-tauri/src/lib.rs)

Etappe-B-Logik und Adblock bleiben erhalten. Neu:
- `set_content_visible(visible)`, `go_back`, `go_forward`, `stop_active` (per `eval` von festem JS: `history.back()`, `history.forward()`, `window.stop()`), `reorder_tabs(order)` (prüft gleiche ID-Menge), `set_adblock_enabled(enabled)` (globales `AtomicBool`, wirkt sofort).
- Zähler blockierter Anfragen pro Tab (`TabInfo.blocked`).
- Fenster 1280×820, Mindestgröße 640×420, Standard-Sidebar 250 px.

Unsicher beim Kompilieren: `Webview::eval(&str)`, `WindowBuilder::min_inner_size`.

## Frontend

- `src/styles/tokens.css` (Design-Tokens, dunkel + hell), `src/styles/app.css` (Komponenten). `App.css` ist leer (nur Hinweis).
- `src/lib/` (IPC, URL/Suchmaschinen), `src/store/` (Context-Store, localStorage), `src/components/` (Sidebar, Toolbar, Lesezeichenleiste, Popover, Icons, Favicon, Tastenkürzel), `src/pages/` (interne Seiten).

## Echt vs. Platzhalter

| Funktion | Stand |
|---|---|
| Vertikale Tabs, kompakt/ausgeklappt, schließen, anheften, Kontextmenü, Drag & Drop, Ladeanzeige | echt (Anheften nur im Frontend gemerkt) |
| Zurück/Vorwärts/Neu laden/Stop/Startseite | echt (über JS-History, kein canGoBack) |
| Adressleiste mit HTTPS-Schloss, Suche über gewählte Suchmaschine | echt |
| Lesezeichen (Stern, Strg+D, Leiste, Verwaltung, Kacheln) | echt, localStorage |
| Verlauf aus NavigationCompleted + Titel, Suche, Löschen | echt, localStorage |
| Einstellungen (Startseite, Suchmaschine, Theme, Adblock, Sidebar, Lesezeichenleiste) | echt, localStorage |
| Datenschutz-Übersicht (pro Tab + gesamt), Adblock-Schalter | echt (Zähler nur pro Sitzung) |
| Downloads | **Platzhalter, „Noch nicht implementiert“** |
| Erweiterungen | **Platzhalter** (Menüeintrag) |

Später: Speicherung in SQLite auf Rust-Seite statt localStorage.

## Bekannte Grenzen

- Tastenkürzel (Strg+T/W/L/Tab/R, F5, Alt+←/→, Strg+D/H/,) wirken nur, wenn die UI den Fokus hat. Hat die Webseite den Fokus, braucht es `AcceleratorKeyPressed` in Rust (offen).
- Favicons werden direkt von `<origin>/favicon.ico` geladen; Fallback: Anfangsbuchstabe.
- Anheften und Override „interne Seite über Tab“ gehen beim Neustart verloren (Tabs werden nicht wiederhergestellt).

## Test-Checkliste

1. [ ] `cargo check`, `cargo test`, `npm run build`.
2. [ ] Start: Startseite mit Suchfeld sichtbar, kein weißer Bereich.
3. [ ] Suche eingeben → Seite lädt im Content-Bereich, Schloss sichtbar.
4. [ ] Menü öffnen → Seite kurz ausgeblendet, Menü sichtbar; schließen → Seite wieder da.
5. [ ] Einstellungen: Theme hell/dunkel, Suchmaschine wechseln, Adblock aus → Zähler steigt nicht mehr.
6. [ ] Tabs ziehen, anheften, Kontextmenü, Sidebar einklappen (Content rückt nach links).
7. [ ] Verlauf füllt sich, Suche und Löschen funktionieren.
