# Etappe B – Änderungen (Stand 2026-11-08)

**Status: implementiert. NICHT kompiliert. NICHT getestet.** In der Arbeitsumgebung gibt es kein `cargo`. Nur das Frontend wurde mit `tsc --noEmit` geprüft (ohne Fehler).

Architektur bleibt wie in Etappe A empfohlen: Tauri multiwebview (`add_child`), adblock-rust, COM-Filter, React-UI.

## Geänderte Dateien

- `src-tauri/src/lib.rs` (überarbeitet, Struktur bleibt)
- `src-tauri/tauri.conf.json` (`devUrl`)
- `src/App.tsx`, `src/App.css`
- `Cargo.toml` unverändert.

## Änderungen im Einzelnen (lib.rs)

1. **Kein Lock über Tauri-Aufrufe.** `TabManager` wird nur kurz gesperrt, Daten werden kopiert, dann wird der Lock freigegeben. Erst danach `add_child`, `show`, `hide`, `set_size`, `navigate`, `close`. Gilt für `new_tab`, `close_tab`, `switch_tab`, `navigate_active` und den Resize-Handler. Vergiftete Locks werden weiterverwendet statt zu paniken.
2. **`new_tab` ist jetzt `async`.** Webviews in einem synchronen Command zu erzeugen kann unter Windows deadlocken.
3. **DPI.** Neue Funktion `apply_layout`. Sie liest `inner_size()` und `scale_factor()` und rechnet in logische Pixel. Aufruf bei `Resized`, `ScaleFactorChanged`, neuem Tab, Tabwechsel, Schließen, Layout-Änderung.
4. **Eine Quelle für das Layout.** React misst die Toolbar-Höhe (`ResizeObserver`) und ruft `set_layout { topHeight, sidebarWidth }`. Rust berechnet daraus die Content-Bounds (`content_bounds`). Klappt das Fehlerpanel auf, rutscht die Seite nach unten statt verdeckt zu werden.
5. **Erster Tab** wird nicht mehr in `setup` mit `let _ =` erzeugt, sondern per `async_runtime::spawn` nach dem Setup. Fehler werden geloggt und an die UI gesendet. Start-URL: `https://example.com`.
6. **Fehler nicht mehr verschluckt.** Jedes `let _ =` ist ersetzt durch Log (`tracing`) und Event `tab-event` mit `kind: "error"`.
7. **WebView2-Events** (über webview2-com, pro Tab): `NavigationStarting`, `NavigationCompleted` (IsSuccess + WebErrorStatus mit Namen), `SourceChanged`, `DocumentTitleChanged`, `ProcessFailed`. Dazu Log bei Controller-Erzeugung (physische Controller-Bounds) sowie Bounds/Sichtbarkeit aus `apply_layout`. Alles geht als Tauri-Event `tab-event` an die UI.
8. **Adblock-Filter repariert.**
   - Quelle (`source_url`) ist jetzt die echte Top-Level-URL des Tabs (aus NavigationStarting/SourceChanged), nicht mehr die Anfrage-URL. Damit funktionieren `$third-party`-Regeln.
   - Das Hauptdokument wird **nie** blockiert (`is_main_document`). Iframes laufen als `subdocument`.
   - `PWSTR` wird mit `take_pwstr` freigegeben (vorher Speicherleck).
   - Diagnose-Schalter: Umgebungsvariable `JTECH_NO_ADBLOCK=1` schaltet den Filter ab.
9. **Event-Tokens** werden pro Tab gespeichert und beim Schließen mit `remove_*` entfernt.
10. **Tabs geordnet** (`order: Vec`). Beim Schließen wird der Nachbar aktiv. Titel kommt aus `DocumentTitleChanged`. Event `tabs-changed` bei jeder Änderung.
11. Neue Commands: `reload_active`, `set_layout`. `navigate_active` gibt die normalisierte URL zurück. Eingaben ohne Schema bekommen `https://`, Text mit Leerzeichen wird eine Suche.
12. Unit-Tests in `lib.rs`: Layout-Mathe, URL-Normalisierung, Hauptdokument-Regel.

## tauri.conf.json

`devUrl` = `http://localhost:1420` (Port aus `vite.config.ts`, `strictPort`). Vorher lud `tauri dev` den alten `dist`-Stand.

## React (App.tsx)

- Alle `invoke`-Aufrufe laufen über `call()` mit `try/catch`. Fehler stehen in einer Statuszeile.
- Adressleiste folgt echten Events (`navigation-starting`, `source-changed`), außer während man tippt.
- Fehlerpanel mit **Neu laden**-Button bei `NavigationCompleted` mit `IsSuccess=false` und bei `ProcessFailed`.
- Tabs zeigen Titel. Sidebar und TopBar hören auf `tabs-changed`. Polling nur noch als Rückfall (3 s).

## Unsichere Stellen (beim Kompilieren zuerst prüfen)

- `args.IsSuccess(&mut ok)` mit `Default::default()` und danach `ok.as_bool()`: verlässt sich auf Typ-Inferenz für `BOOL`. Falls Fehler: `let mut ok = windows::core::BOOL::default();`.
- Namen der Handler in webview2-com 0.39 (`SourceChangedEventHandler`, `DocumentTitleChangedEventHandler`, `ProcessFailedEventHandler`) und `take_pwstr`: Namen im Build-Cache gefunden, Signaturen nicht geprüft.
- `controller.Bounds(&mut RECT)` nutzt `windows::Win32::Foundation::RECT` (Feature vorhanden).
- Events gehen an alle Webviews (`app.emit`), auch an die Content-Webviews. Harmlos, aber unnötig.

## Befehle (Windows, PowerShell)

```powershell
cd C:\Users\barte\Documents\jtech-browser\src-tauri
cargo check
cargo test
cd ..
npm run tauri dev
```

Diagnose ohne Adblock:

```powershell
$env:JTECH_NO_ADBLOCK="1"; npm run tauri dev
```

Alte `tauri-app.exe` vorher im Task-Manager beenden.

## Manuelle Test-Checkliste

1. [ ] `cargo check` ohne Fehler. Fehler hier notieren.
2. [ ] `cargo test`: 3 adblock-Tests + 3 neue Unit-Tests grün.
3. [ ] `npm run tauri dev` startet. Konsole zeigt `Fenster logisch …`, `erzeuge Webview fuer https://example.com/`, `Controller da`, `WebView2-Handler registriert (6 Tokens)`.
4. [ ] example.com ist sichtbar (kein weißer Bereich). Konsole: `NavigationStarting` und `NavigationCompleted ok`.
5. [ ] Adressleiste zeigt `https://example.com/`. Tab-Titel „Example Domain".
6. [ ] `www.wikipedia.org` eintippen, Enter. Seite lädt, Adressleiste zeigt `https://www.wikipedia.org/`.
7. [ ] Auf Wikipedia einen Link klicken: Adressleiste folgt.
8. [ ] Fenster verkleinern/vergrößern: Inhalt füllt den Bereich rechts der Sidebar und unter der Toolbar, ragt nicht heraus.
9. [ ] Windows-Skalierung 150 % (oder Fenster auf zweiten Monitor mit anderer Skalierung): Bounds stimmen weiter.
10. [ ] `https://does-not-exist.invalid` eingeben: rotes Fehlerpanel (z. B. HOST_NAME_NOT_RESOLVED), Seite rutscht nach unten. „Neu laden" funktioniert.
11. [ ] „+": neuer Tab mit example.com. Tabwechsel zeigt richtigen Inhalt. Schließen (×) aktiviert Nachbar-Tab, Konsole zeigt `Handler … entfernt`.
12. [ ] „Blocked"-Zähler steigt auf werbelastigen Seiten. Seiten bleiben trotzdem sichtbar.
13. [ ] Bei weißer Seite: mit `JTECH_NO_ADBLOCK=1` wiederholen und Konsolen-Log sichern.
