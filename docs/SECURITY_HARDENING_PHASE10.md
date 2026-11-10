# JTech Browser – Security Hardening, Phase 10

Stand: 10. November 2026

## Zusammenfassung

Dieser Bericht hält die damalige Hardening-Phase und die anschließend ergänzten Prüfungen fest. Die UI-CSP und das Entfernen automatischer Klartext-Fallback-Zugriffe wurden umgesetzt. Spätere Änderungen ergänzten URL-/Tab-ID-Validierung und sichere Grenzen für Filterlisten-Downloads. SQLCipher/DPAPI bleiben nicht implementiert.

## Ausgangszustand

- Tauri 2, React/TypeScript und eigene native WebView2-Instanzen für externe Seiten.
- `tauri.conf.json` hatte `security.csp: null`.
- `default.json` gibt `core:default` und `opener:default` an das Main-Fenster; Window-Control- und Updater-Rechte sind in lokalen Capabilities auf `ui` begrenzt.
- Externe WebViews werden über Rust/WebView2 erstellt und erhalten keine Tauri-Capabilities. Die Page Bridge nutzt WebView2-`postMessage`, nicht Tauri-IPC.
- Bridge-Nachrichten besitzen feste Typen, Größenbegrenzung und URL-/Feldvalidierung.
- `storage.rs` öffnete `jtech.sqlite3` mit `rusqlite`/`bundled`, WAL und `synchronous=NORMAL`; SQL-Abfragen verwenden überwiegend Parameter. Die SQLite-Datei war unverschlüsselt.
- Bestehende `localStorage`-Daten werden beim ersten Storage-Start einmal importiert und verbleiben als Kopie; bei Storage-Ausfall gibt es keinen automatischen neuen localStorage-Fallback.

## Festgestellte Risiken

### Belegt

- Vor der Änderung: keine CSP auf der privilegierten UI. Aktueller Stand: CSP konfiguriert und vom Nutzer für die besuchten UI-Bereiche ohne beobachtete Konsolenverletzungen geprüft; dies ist kein vollständiger automatisierter Laufzeittest.
- Browserdaten in SQLite nicht verschlüsselt.
- Alte `localStorage`-Bestandskopien bleiben im Klartext bestehen.
- Fehlertexte in `storage.rs` enthalten Pfade; es werden aber keine Schlüssel verwendet oder protokolliert.

### Potenziell / nicht vollständig verifiziert

- Nicht jede interne Seite und Ressourcenkombination wurde automatisiert unter CSP getestet; die manuelle Prüfung deckt nur die vom Nutzer besuchten Bereiche ab.
- Eine tatsächliche Capability-Zuordnung für alle dynamischen WebViews wurde nicht zur Laufzeit geprüft.
- Dateisystem-ACLs, Backups, WAL-/SHM-Löschung und private Browsing-Spuren außerhalb SQLite wurden nicht auditiert.

## Implementierte CSP

In `src-tauri/tauri.conf.json` wurde eine restriktive Richtlinie für UI-Ressourcen gesetzt: Scripts nur `'self'`, keine `unsafe-eval`; Objekte blockiert; `base-uri`, `form-action` und `frame-ancestors` eingeschränkt. Für die bestehende UI bleiben Inline-Styles zugelassen. Bilder/Medien erlauben Tauri-Asset, `data:` sowie HTTPS; Verbindungen erlauben Tauri-IPC und im Projekt verwendete Suggest-/GitHub-Hosts. Externe Seiten werden von dieser UI-CSP nicht konfiguriert.

Der Nutzer hat Startseite, Einstellungen, Themes und Effekte in der UI-Konsole geprüft und keine CSP-Meldungen gefunden. Externe Google-/YouTube-/GitHub-Seiten wurden in separaten WebViews stichprobenartig geprüft. Eine automatisierte Abdeckung aller Seiten/Ressourcen ist nicht vorhanden.

## Tauri, IPC und Page Bridge

Capability-Dateien wurden geprüft, in dieser Phase aber nicht verändert. `default.json` ist an `main` gebunden; Fenstersteuerung und Updater sind lokal für `ui` begrenzt. Externe Seitenkommunikation wird über Rust-registrierte WebView2-Skripte und validierte Nachrichten verarbeitet. `pagebridge::parse` begrenzt Nachrichten auf 8 KiB, prüft Typen/Felder und beschränkt URLs auf HTTP(S) ohne Zugangsdaten. Ein nachfolgender gezielter Audit ergänzte die Begrenzung von Navigations-URLs auf 16 KiB, verbietet Steuerzeichen, validiert `close_tab`/`switch_tab`-IDs und begrenzt Peek-URLs.

## SQLite, SQLCipher und DPAPI

- SQL-Abfragen in `storage.rs` verwenden an den sichtbaren Stellen gebundene Parameter; Tabellen-/Sortierauswahl erfolgt über feste Literale.
- Foreign Keys, Integritätsprüfung und gesicherte Backup-/Restore-Prozeduren sind nicht nachgewiesen.
- SQLCipher ist nicht integriert. Schlüssel werden nicht erstellt oder verwaltet.
- Windows-DPAPI ist nicht integriert.
- Keine Behauptung über verschlüsselte Datenbankseiten, geschützte WAL-Dateien oder DPAPI-gebundene Benutzerschlüssel.

Die Implementierung erfordert eine Migration, die die unverschlüsselte Quelldatei bis zur erfolgreichen Verschlüsselungs- und Inhaltsvalidierung unangetastet lässt, Crash-Stände erkennt und sichere Wiederherstellung ermöglicht. Das wurde nicht risikoreich durch bloßen Austausch der SQLite-Abhängigkeit ersetzt.

## Migration und Datenlebenszyklus

Der bestehende Import aus `localStorage` in Rust-SQLite bleibt als einmaliger Import aktiv und überschreibt vorhandene SQLite-Schlüssel nicht. Alte `localStorage`-Werte werden als Sicherung nicht gelöscht. Das ist weiterhin Klartextspeicherung und muss zusammen mit einer verschlüsselten Migration geplant werden.

Backups, WAL/SHM und temporäre Dateien wurden nicht eigens verschlüsselt oder bereinigt. Die aktuelle Datenbank verwendet WAL und `synchronous=NORMAL`. Keine Lösch- oder Migrationsoperation an Bestandsdaten wurde ausgeführt.

## Geänderte Dateien

- `src-tauri/tauri.conf.json` – UI-CSP gesetzt.
- `src-tauri/src/lib.rs` – Storage-Fehler meldet keinen localStorage-Fallback mehr.
- `src/store/storage.ts` – bei Backendausfall keine localStorage-Lese-/Schreib-Fallbacks; einmaliger Import bleibt.
- Nachfolgender Audit: `src-tauri/src/lib.rs`, `src-tauri/src/peek.rs`, `src-tauri/src/filters.rs` – Eingabegrenzen für Navigation, Tab-IDs, Peek und Filterlisten-Downloads.
- `docs/SECURITY_HARDENING_PHASE10.md` – dieser Bericht, später um Audit-Folgeänderungen ergänzt.

## Tests und Ergebnisse

- `npm run build` – erfolgreich (TypeScript-Prüfung und Vite-Produktionsbuild).
- `cargo test --manifest-path src-tauri/Cargo.toml` – Rust-Code kompilierte; Testprozess endete beim Start mit Windows-Status `0xc0000139 (STATUS_ENTRYPOINT_NOT_FOUND)`. Daher kein erfolgreiches Rust-Testergebnis.
- Keine Tauri-Release-Prüfung und keine SQLCipher-/DPAPI-/Migrationstests.
- Nachfolgend erfolgreich: `cargo check`, `cargo test --test filter_test` (3 Tests) und `npm run build`. Vollständige Library-Tests scheitern in dieser Windows-Umgebung beim Start mit `STATUS_ENTRYPOINT_NOT_FOUND`.

## Verbleibende Risiken und Empfehlungen

1. **Hoch:** Browserdaten und verbliebene `localStorage`-Sicherungen sind unverschlüsselt; SQLCipher plus benutzergebundenes DPAPI und crash-sichere Migration fehlen.
2. **Mittel:** Laufzeit-CSP in Tauri-WebView2 prüfen; Hosts und Inline-Style-Anforderungen anhand konkreter Verletzungen eng abstimmen.
3. **Mittel:** Capability- und IPC-Audit für jeden Befehl, dynamisches WebView und externe Protokolle fortsetzen.
4. **Mittel:** ACLs, WAL/SHM, Backups, temporäre Dateien, Download-Metadaten und private Sitzungen prüfen.
5. **Niedrig:** Rust-Test-Startproblem in Windows-Umgebung untersuchen; auf unterstützter CI erneut ausführen.

### Kurze Sicherheitsübersicht

| Kategorie | Befund |
|---|---|
| Kritisch | Kein kritischer Exploit durch diese statische Prüfung bestätigt; keine Penetrationsprüfung ausgeführt. |
| Hoch | Sensible SQLite- und verbliebene localStorage-Daten liegen unverschlüsselt vor; SQLCipher/DPAPI fehlen. |
| Mittel | CSP manuell für ausgewählte UI-Seiten geprüft; vollständige CSP-Automatisierung sowie Backups/WAL/ACLs und komplette IPC-Fläche offen. |
| Niedrig | Rust-Tests wegen `STATUS_ENTRYPOINT_NOT_FOUND` nicht ausgeführt; Frontend-Build erfolgreich. |
