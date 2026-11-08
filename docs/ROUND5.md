# Runde 5 – Feedback aus dem Praxistest

Stand 2026-11-08. Sicherungen der geänderten Dateien: `docs/backup_round5/` (Pfad mit `_` statt `/`). Neue Dateien haben keine Sicherung.

## Verifikation (ehrlich)
- `npx tsc --noEmit`: **fehlerfrei**.
- Rust: **nicht mit cargo gebaut** (kein cargo auf dem PC). Geprüft: `rustfmt` parst `lib.rs` und das neue `uifx.rs` fehlerfrei; die reinen Funktionen aus `uifx.rs` (combo_name, valid_combo, forward_in, valid_cursor_url, valid_hex) wurden **außerhalb des Projekts** mit rustc 1.97 kompiliert und getestet (4 Tests grün). `page_fx_script` (braucht serde_json) und `set_page_fx` (Tauri) sind nicht kompiliert; die erzeugte JS-Hülle wurde mit Node auf Syntax geprüft.
- **Nichts am Gerät getestet.** Kein `vite build` ausgeführt (würde `dist/` leeren).
- Keine neuen Abhängigkeiten.

## Umsetzung je Punkt

| # | Feedback | Status | Umsetzung |
|---|---|---|---|
| 1 + 3 | Einstellungen & Co. immer in neuem Tab; Seitenleisten-Einträge öffnen/schließen nicht sauber | **implementiert** | `openPage()` öffnet jede interne Seite (settings, history, bookmarks, downloads, privacy, themes, audio) als **eigenen Tab**. Pro Seite höchstens ein Tab: ist er schon offen, wird er fokussiert (Doppelklick-Schutz über `pendingPages`). Interner Tab = normaler Rust-Tab mit `about:blank`, dessen native Webview über den vorhandenen `set_content_visible`-Mechanismus versteckt bleibt; Schließen, Ziehen, Anheften, Gruppen wie bei jedem Tab. Die Seitenleisten-Knöpfe sind keine Umschalter mehr (Lesezeichen, Verlauf, Downloads, Datenschutz, Einstellungen; aktiver wird hervorgehoben). Adressleiste `jtech://…`: vorhandenen Tab fokussieren, sonst leeren/internen Tab umwidmen, sonst neuer Tab. **Sitzung** speichert/stellt interne Tabs als `jtech://<seite>` wieder her. **Popovers** (Schild, Downloads, Menü, Lesezeichen-Stern) schließen jetzt beim zweiten Klick auf ihren Knopf (vorher: mousedown schloss, click öffnete sofort wieder), bei Klick außerhalb und mit Esc – Knöpfe tragen `data-pop-toggle`. |
| 2 | „Neuer Tab“ unter den Tabs | **implementiert** | Knopf steht direkt unter dem letzten Tab in der Liste und scrollt mit. |
| 4 | Eigene Tastenkürzel für alles | **implementiert** | Zentrale Befehlsliste `src/lib/commands.ts` (≈ 50 Befehle: Tabs inkl. Tab 1–8/letzter, Navigation, Seite, Öffnen, Ansicht). Gleiche Quelle für Kürzel, Befehlspalette und Menü-Hinweise. Editor unter Einstellungen → Tastenkürzel: Aufnahme per Tastendruck (Esc bricht ab), bis 4 Kürzel je Befehl, Konflikterkennung mit „übernehmen“, Standard je Befehl / alle zurücksetzen, Suche. Gespeichert in `settings.shortcuts` (SQLite wie bisher). Regeln: nur Strg/Alt-Kombinationen oder F-Tasten; reserviert: Strg+C/V/X/A/Z/Y, Alt+F4. Hinweis bei Strg+Alt (= AltGr). **Rust**: neues Modul `uifx.rs`, Command `set_shortcuts` (validiert jede Kombination, max. 400) – `AcceleratorKeyPressed` nimmt der Seite **nur** belegte Kombinationen weg und schickt den Namen an die UI, die den Befehl ausführt. Vor dem ersten `set_shortcuts` gilt die alte feste Liste. Neue Standardkürzel: Strg+1…9, Strg+J (Downloads), Strg+Umschalt+O (Lesezeichen), Strg+Umschalt+B (Lesezeichenleiste), Strg+F4, Strg+Bild↑/↓, Alt+D/F6, Alt+Pos1. In der UI-Webview werden Browser-Standardkürzel (F5, Strg+R, Strg+P …) immer abgefangen, auch wenn unbelegt (sonst würde die Oberfläche neu laden). |
| 5 | Einstellungen aufräumen | **implementiert** | Linke Unternavigation: Allgemein, Darstellung, Suche, Tabs, Datenschutz & Sicherheit, Werbeblocker & Filterlisten, Berechtigungen, Downloads, Tastenkürzel, Über JTech. Suchfeld filtert Abschnitte **und** einzelne Zeilen. Einheitliche Zeilen (`Row`: Titel, Beschreibung, Bedienelement). Neu: „Sitzung wiederherstellen“ (Schalter), Filterlisten kompakt direkt in den Einstellungen (gleiche Commands wie die Datenschutzseite), Cookies/Cache beim Beenden, Downloads-Übersicht. Die Datenschutzseite bleibt unverändert als Dashboard. |
| 6 | Design-Studio: animierte Hintergründe, Custom Cursor, Cursor-Trails | **implementiert** | Port aus Standardprojekt: `src/lib/fx/backgrounds.ts` (alle 9 Szenen unverändert: Ruhig, Netzwerk, Synthwave, Strömung, Hyperdrive, Hex-Netz, Nebula, Wellenbänder, Glut) und `src/lib/fx/cursorFx.ts` (7 Spuren: Spur, Komet, Funken, Wellen, Laser, Blasen; neu: Parameter Länge). Canvas liegt hinter Seitenleiste/Kopf/internen Seiten (`FxLayer`, z-index −1), Flächen werden teiltransparent (Regler „Deckkraft der Oberfläche“). Regler: Intensität, Geschwindigkeit, Leuchten; Leistung 20/30/60 fps mit reduzierter Auflösung; pausiert bei minimiertem Fenster/`document.hidden`, respektiert „Bewegung reduzieren“; optional pausieren, solange eine Webseite angezeigt wird. Vorschau-Kacheln (animiert bei Hover). **Cursor**: 13 SVG-Presets aus dem Original (Farbe, Größe 16–64 px) oder eigenes Bild (wird auf Cursorgröße als PNG verkleinert, max. 150 KB, Klickpunkt Mitte/oben links). **Spur**: Stil, 2 Farben (oder Akzentfarben übernehmen), Größe, Länge, Stärke. Theme-Vorlagen bringen wie in Electron ihren Hintergrund/Spur mit (abschaltbar). Befehl „Animierten Hintergrund ein/aus“. Standard: Hintergrund aus, Spur aus (bisheriges Aussehen bleibt). |

## Grenzen (ehrlich)
- Webseiten sind eine **eigene native WebView2 über der Oberfläche**. Hintergrund, Cursor und Spur wirken deshalb nur auf Seitenleiste, Kopfbereich und interne Seiten – nicht hinter/über Webseiten.
- Option **„Auch auf Webseiten“** (Standard **aus**): Rust injiziert Spur-Script + Cursor-Stylesheet bei jedem `DOMContentLoaded` (nur http/https) und sofort in offene Web-Tabs (`set_page_fx`). Cursor-URL wird in Rust auf `data:image/png;base64` / `data:image/svg+xml` mit eingeschränktem Zeichenvorrat geprüft. Kann auf Seiten mit strenger CSP oder eigenem Cursor nicht greifen; Ausschalten entfernt den Cursor, die Spur-Canvas wird geleert. Kein Hintergrund in Webseiten.
- Interne Tabs besitzen weiterhin eine (versteckte) about:blank-Webview – kostet etwas Speicher; eine Webview-lose Variante bräuchte größere Rust-Änderungen.
- Kürzel aus Webseiten erreichen Rust nur, wenn WebView2 sie als Accelerator meldet (Strg/Alt/F-Tasten – genau die erlaubten).

## Neue/geänderte Dateien
- Neu: `src/lib/keys.ts`, `src/lib/commands.ts`, `src/lib/fx/{backgrounds,cursorFx,effects}.ts`, `src/components/{FxLayer,ShortcutEditor}.tsx`, `src-tauri/src/uifx.rs`, dieses Dokument.
- Geändert: `src/store/{BrowserStore.tsx,types.ts}`, `src/components/{Sidebar,Toolbar,Popover,CommandPalette,useShortcuts}.tsx/ts`, `src/App.tsx`, `src/pages/{SettingsPage,ThemesPage}.tsx`, `src/styles/app.css`, `src-tauri/src/lib.rs` (Modul uifx, AcceleratorKeyPressed über `uifx::forward_key`, Injektion bei DOMContentLoaded, Commands `set_shortcuts`/`set_page_fx`, `eval_active` unter Windows mit `allow(dead_code)` → Warnung weg).
- `cursorFx.ts` ist reines JavaScript (mit `// @ts-nocheck`), weil Rust es per `include_str!("../../src/lib/fx/cursorFx.ts")` einbettet – dort keine TS-Syntax einführen.

## Test-Checkliste
- [ ] `cargo build` / `cargo test` (neue Tests in `uifx::tests`).
- [ ] Seitenleiste: Einstellungen anklicken → neuer Tab „Einstellungen“; nochmal klicken → derselbe Tab wird gezeigt (kein zweiter). Tab schließen per ×/Strg+W/Mittelklick. Gleiches für Verlauf, Lesezeichen, Downloads, Datenschutz, Menü-Einträge, Design-Studio, Audio-Hub, Strg+H/Strg+,/Strg+J.
- [ ] Zwischen Web-Tab und internem Tab wechseln: Webseite erscheint/verschwindet korrekt, kein weißes Rechteck über der Einstellungsseite.
- [ ] `jtech://history` in der Adressleiste eines Web-Tabs → Verlauf in neuem bzw. vorhandenem Tab; im leeren Tab → derselbe Tab wird Verlauf.
- [ ] In internem Tab eine URL eintippen → Tab wird zur Webseite.
- [ ] Neustart mit offenen Einstellungen/Verlauf-Tabs → wieder da. „Sitzung wiederherstellen“ aus → leerer Start.
- [ ] Schild/Downloads/Menü/Stern: Klick öffnet, zweiter Klick schließt, Klick daneben und Esc schließen.
- [ ] „Neuer Tab“ steht unter dem letzten Tab, wandert mit, scrollt bei vielen Tabs mit.
- [ ] Tastenkürzel: Einstellungen → Tastenkürzel → bei „Neuer Tab“ „+“, Strg+Umschalt+Y drücken → funktioniert in UI **und** wenn eine Webseite den Fokus hat. Konflikt (z. B. Strg+K bei anderem Befehl) → Banner, übernehmen. Standard / Alle zurücksetzen. Strg+C wird abgelehnt, Buchstabe ohne Strg abgelehnt.
- [ ] Unbelegte Kombination (z. B. Strg+B in einem Online-Editor) wirkt auf der Webseite. Strg+1…9 springt zu Tabs. Befehlspalette zeigt die eigenen Kürzel.
- [ ] Einstellungen: Unternavigation, Suche („cookies“, „zoom“, „kürzel“), Filterlisten an/aus, Ausnahmen entfernen.
- [ ] Design-Studio: Hintergrund an, Szenen durchklicken, Regler; Vorlage „Synthwave“ → Hintergrund + Spur; Fenster minimieren → CPU sinkt; „Pausieren bei Webseite“.
- [ ] Cursor: Presets, Farbe/Größe, eigenes PNG hochladen, Klickpunkt; Spur-Stile, Länge, Farben.
- [ ] „Auch auf Webseiten“ an → Cursor/Spur auf Webseiten (nach Neuladen bzw. sofort), aus → weg.
- [ ] Regression: Kontextmenüs der Tabs/Gruppen, Downloads, Zoom, Suchen, Drucken, Tab-Schlaf, Gruppen, Audio-Hub, Berechtigungsleiste, Themes/Custom CSS, Filter, Cookies.
