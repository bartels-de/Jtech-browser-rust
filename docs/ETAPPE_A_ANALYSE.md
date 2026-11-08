# Etappe A – Analyse JTech Browser (Stand 2026-11-08)

Nur Analyse. Kein Code geändert. Grundlage: Quelltext im Ordner. Kein `cargo` in der Analyse-Umgebung (Linux-VM) – nichts wurde kompiliert oder getestet.

## 1. Bestandsaufnahme

| Bereich | Datei | Status |
|---|---|---|
| Rust-Einstieg | src-tauri/src/main.rs (6 Z.), src-tauri/src/lib.rs (233 Z.) | implementiert |
| Fenster + 3 Webview-Arten | lib.rs:179-197, 47-64 | implementiert über **Tauri `Window::add_child` (Feature `unstable`)** |
| Tab-Verwaltung | lib.rs:19-96 (`TabManager` in `Mutex`) | teilweise |
| Netzwerkfilter (WebView2 COM) | lib.rs:106-161 | implementiert, nicht verifiziert |
| Adblock-Engine | lib.rs:13, 98-104, 171-177 | implementiert |
| Frontend | src/App.tsx (58 Z.): TopBar + Sidebar per `?view=` | implementiert |
| Tests | src-tauri/tests/filter_test.rs (3 Tests) | testen nur adblock-rust, nicht unseren Code |
| Config | tauri.conf.json: `windows: []`, `devUrl: null`, `csp: null` | auffällig |

Versionen (Cargo.lock): tauri 2.12.5, wry 0.57.1, webview2-com 0.39.1, adblock 0.13.

Wichtig: Es gibt **keine** native Controller-Implementierung (kein `CreateCoreWebView2Controller`, kein eigenes HWND). "Native COM" bezieht sich nur auf den Request-Filter, der an Tauris eigene Webviews angehängt wird (lib.rs:60, 110). Es gibt keine Doppel-Implementierung.

Abweichung zur Fehlerbeschreibung: Im Code steht nirgends `google.com` (Start-URL lib.rs:228 und App.tsx:13 = `https://example.com`; auch nicht im `dist`-Bundle). Die Adressleiste zeigt nur den lokalen React-State, nicht die echte URL. Entweder läuft ein anderer Stand, oder google.com wurde getippt und `navigate_active` ist still gescheitert (Fehler von `invoke` werden nie behandelt, App.tsx:24-32).

## 2. Gefundene Fehler

1. **Physisch vs. logisch (DPI).** `WindowEvent::Resized` liefert `PhysicalSize` (lib.rs:210-215). Der Wert wird als `LogicalSize` benutzt (216-220). Bei 125/150 % Skalierung werden Webviews zu groß und ragen aus dem Fenster. Außerdem: `inner_size` ist der Client-Bereich, 1200x800 initial passt nur bei 100 %.
2. **Mutex-Reentranz / Deadlock-Risiko.** `new_tab` hält den `TabManager`-Lock während `add_child`, `hide()` und `with_webview` (lib.rs:48-62). Der Resize-Handler nimmt denselben Lock (211-212). Läuft ein Resize-Event synchron auf dem Main-Thread, während der Lock gehalten wird, blockiert `std::sync::Mutex` dauerhaft (gleicher Thread) – App friert, Inhalt bleibt weiß. Gleiches gilt für `switch_tab`/`close_tab`.
3. **`new_tab` im `setup` (lib.rs:228)**, also bevor die Event-Loop läuft. Fehler wird mit `let _ =` verworfen. Wenn `add_child` hier scheitert, gibt es keinen Hinweis.
4. **Alle Fehler werden geschluckt**: `let _ =` bei show/hide/set_size/with_webview (54, 60, 69, 72, 81, 216-223), `register_interceptor` bricht still ab (110-115, 158-160). Darum ist der weiße Bereich nicht diagnostizierbar.
5. **Filter-Logik falsch**: `source = uri` (lib.rs:140). Jede Anfrage gilt als First-Party. `$third-party`-Regeln greifen nie. Kein Ausschluss für `DOCUMENT`/Top-Level-Navigation; trifft eine Regel das Hauptdokument, liefert der Filter 204 mit leerem Body → **weiße Seite**.
6. **COM-Lebensdauer**: Event-Token wird verworfen (159-160), nie `remove_WebResourceRequested`. Handler hält `sys_env` (Closure). Beim Schließen eines Tabs kein Aufräumen. Für jetzt harmlos, später Leck.
7. **Thread-Affinität**: `ENGINE` ist `thread_local` (13). Funktioniert nur, weil WebView2-Callbacks auf dem UI-Thread laufen und `init_engine` per `run_on_main_thread` dort landet (176). Bis die Listen geladen sind (bis 2×30 s), wird nichts geblockt. Kein Cache, kein Offline-Fallback.
8. **Zustand**: Titel = URL (40). `HashMap` → zufällige Tab-Reihenfolge, `close_tab` aktiviert zufälligen Tab (71). Kein Event von Rust zu React, nur Polling alle 1,5 s (App.tsx:19, 41). TopBar zeigt zusätzlich Tabs – Sidebar und TopBar doppelt.
9. **Config**: `capabilities/default.json` gilt für Fenster `main`; Webviews `top`/`sidebar` sind Kinder von `main` → IPC sollte erlaubt sein, aber nicht verifiziert. `devUrl: null` mit `beforeDevCommand: npm run dev` ist widersprüchlich: in `tauri dev` wird `dist` geladen, Vite läuft umsonst; altes `dist` = alter Frontend-Stand. Cargo-Paketname noch `tauri-app`.
10. Content-Webviews ohne Fokus-/Z-Order-Steuerung; Reihenfolge ergibt sich nur aus Erzeugung (top, sidebar, dann Tabs).

## 3. Wahrscheinlichste Ursache der weißen Seite

Ohne Laufzeit-Logs nicht beweisbar. Rangfolge nach Code:

1. **Geschluckte Fehler + Lock-Problem** (Punkt 2-4): Webview wird nicht sauber erzeugt/positioniert oder der Main-Thread hängt, und nichts wird geloggt.
2. **Bounds/DPI** (Punkt 1): nach dem ersten Resize falsche Größe/Position; bei Fehlplatzierung sieht man nur den weißen Fensterhintergrund.
3. **Interceptor blockt Dokument** (Punkt 5) mit 204 → leere weiße Seite. Leicht zu prüfen: Interceptor (lib.rs:60) testweise aus.
4. Laufender Stand ≠ Quelltext (google.com-Widerspruch, abgebrochener Build nach 120 s). Möglich, dass eine alte `tauri-app.exe` läuft.

## 4. Architektur-Entscheidung

**Ansatz A – Tauri multiwebview (`add_child`, unstable):** Wenig Code, Tauri verwaltet COM, HWND, Lebensdauer, IPC. Nachteile: `unstable`-API, Bugs bei Resize/DPI/Fokus, wenig Kontrolle (kein eigener Environment/Profil, kein `NewWindowRequested` sauber, Filter nur per Workaround über `with_webview`).

**Ansatz B – eigene webview2-com Controller am Haupt-HWND:** Volle Kontrolle (Profil, Downloads, Popups, Filter, Bounds in physischen Pixeln, `put_IsVisible`, `MoveFocus`). Nachteile: viel unsafe COM-Code, eigene Lebensdauer- und Thread-Regeln (STA, UI-Thread), eigenes IPC zu React, höherer Wartungsaufwand.

**Empfehlung: A behalten, aber sauber machen.** Der Fehler liegt nicht an A, sondern an Lock, DPI und geschluckten Fehlern. B lohnt erst, wenn A eine konkrete Grenze zeigt (z. B. Popups, Profile). Zwischenweg: Webview-Erzeugung über Tauri, Spezial-Funktionen per `with_webview` auf dem Controller (wie heute beim Filter).

## 5. Plan Etappe B

1. Logging: alle `let _ =` durch `if let Err(e) … tracing::error!` ersetzen; `register_interceptor` gibt `Result` zurück.
2. Lock nie über Tauri-Aufrufe halten: Daten kopieren, Lock freigeben, dann `add_child`/`show`/`set_bounds`.
3. Layout zentral: eine Funktion `layout(window)` liest `inner_size()` + `scale_factor()`, rechnet in logische Pixel, setzt alle Bounds. Aufruf bei Resize, ScaleFactorChanged, nach `new_tab`, `switch_tab`.
4. Erster Tab nach Fensteraufbau (z. B. `run_on_main_thread` oder Frontend ruft `new_tab` beim Start).
5. Filter: echte Quelle (Top-Level-URL des Tabs) merken; `DOCUMENT` nie blocken; Token speichern und beim Schließen entfernen; Listen cachen.
6. Diagnose-Schalter: Interceptor per Env-Var abschaltbar.
7. Tabs: `Vec`/`IndexMap` für Reihenfolge; Events `tabs-changed` statt Polling; Titel über `DocumentTitleChanged`/`on_page_load`.
8. Config: `devUrl: "http://localhost:1420"`; Paketname anpassen.
9. Tests: Unit-Tests für Layout-Mathe und Filter-Entscheidung (eigene Funktion mit Quelle/Typ), nicht nur adblock-rust.
10. Verifikation auf Windows: `cargo check`, `cargo test`, `npm run tauri dev` bei 100 % und 150 % Skalierung.

## 6. Status-Übersicht

- Implementiert: alles in Abschnitt 1.
- Kompiliert: unbekannt (es existiert `target/debug/tauri-app.exe`, Alter/Stand unbekannt).
- Automatisch getestet: nur 3 adblock-Tests; Ergebnis hier nicht geprüft.
- Nicht verifiziert: Darstellung, Navigation, Filter im Webview, DPI, Tabwechsel.
