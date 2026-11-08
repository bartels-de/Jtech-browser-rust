// Runde 4: Rust-seitige Persistenz (SQLite via rusqlite, Feature "bundled").
//
// Tabellen:
//   kv          – UI-Daten als JSON (Lesezeichen, Verlauf, Einstellungen, Zoom, Gruppen, Sitzung, Themes, Downloads)
//   meta        – interne Rust-Daten (Migration, Filter-Konfiguration, Allowlist, Datenschutz-Optionen, Gesamtzaehler)
//   permissions – gemerkte Website-Berechtigungen (origin, kind) -> allow | deny
//   site_stats  – blockierte Anfragen je besuchter Seite (Host der Top-Level-URL)
//   domain_stats– blockierte Anfragen je blockierter Domain
//   extensions  – JTech-Erweiterungen: aktiv, Version, Quelle, pro Seite aus (JSON), blockierte Anfragen
//
// Regeln: Die Verbindung liegt in einem globalen Mutex. Nie auf dem UI-Thread in heissen Pfaden
// (WebResourceRequested) benutzen – dort nur In-Memory-Zaehler, die ein Hintergrund-Thread schreibt.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

static DB: OnceLock<Mutex<Connection>> = OnceLock::new();

/// Erlaubte kv-Schluessel (UI). Alles andere wird abgelehnt.
pub const KV_KEYS: &[&str] = &[
    "settings", "bookmarks", "history", "customTheme", "savedThemes", "zoom", "groups", "downloads", "session",
];
/// Max. Groesse eines kv-Werts (JSON-Text).
pub const KV_MAX_BYTES: usize = 8 * 1024 * 1024;

pub fn valid_kv_key(key: &str) -> bool { KV_KEYS.contains(&key) }

/// Wert muss gueltiges JSON und nicht zu gross sein.
pub fn valid_kv_value(value: &str) -> Result<(), String> {
    if value.len() > KV_MAX_BYTES { return Err(format!("Wert zu gross ({} Bytes, max. {KV_MAX_BYTES})", value.len())); }
    serde_json::from_str::<serde_json::Value>(value).map(|_| ()).map_err(|e| format!("kein gueltiges JSON: {e}"))
}

pub fn init(dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("Datenordner {}: {e}", dir.display()))?;
    let path = dir.join("jtech.sqlite3");
    let conn = Connection::open(&path).map_err(|e| format!("SQLite oeffnen {}: {e}", path.display()))?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL);
         CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS permissions (origin TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (origin, kind));
         CREATE TABLE IF NOT EXISTS site_stats (host TEXT PRIMARY KEY, blocked INTEGER NOT NULL DEFAULT 0);
         CREATE TABLE IF NOT EXISTS domain_stats (domain TEXT PRIMARY KEY, blocked INTEGER NOT NULL DEFAULT 0);",
    ).map_err(|e| format!("SQLite-Schema: {e}"))?;
    migrate(&conn)?;
    DB.set(Mutex::new(conn)).map_err(|_| "SQLite schon initialisiert".to_string())?;
    tracing::info!("SQLite geoeffnet: {}", path.display());
    Ok(())
}

/// Schema-Migrationen (meta "schema.version"). Jede Stufe ist idempotent.
fn migrate(conn: &Connection) -> Result<(), String> {
    let v: i64 = conn.query_row("SELECT value FROM meta WHERE key = 'schema.version'", [], |r| r.get::<_, String>(0)).optional()
        .map_err(|e| format!("SQLite-Migration: {e}"))?.and_then(|s| s.parse().ok()).unwrap_or(0);
    if v < 1 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS extensions (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, version TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'bundled', site_off TEXT NOT NULL DEFAULT '[]', blocked INTEGER NOT NULL DEFAULT 0);
             INSERT INTO meta (key, value) VALUES ('schema.version', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
        ).map_err(|e| format!("SQLite-Migration v1: {e}"))?;
        tracing::info!("SQLite-Schema auf Version 1 migriert (extensions)");
    }
    Ok(())
}

fn with<T>(f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
    let db = DB.get().ok_or("Datenbank nicht verfuegbar")?;
    let conn = db.lock().unwrap_or_else(|p| p.into_inner());
    f(&conn).map_err(|e| format!("SQLite: {e}"))
}

pub fn available() -> bool { DB.get().is_some() }

// ---------- kv (UI) ----------

pub fn kv_all() -> Result<HashMap<String, String>, String> {
    with(|c| {
        let mut st = c.prepare("SELECT key, value FROM kv")?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        rows.collect::<rusqlite::Result<HashMap<_, _>>>()
    })
}

pub fn kv_set(key: &str, value: &str) -> Result<(), String> {
    let now = crate::now_ms() as i64;
    with(|c| c.execute("INSERT INTO kv (key, value, updated) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated", params![key, value, now]).map(|_| ()))
}

pub fn kv_remove(key: &str) -> Result<(), String> {
    with(|c| c.execute("DELETE FROM kv WHERE key = ?1", params![key]).map(|_| ()))
}

// ---------- meta (Rust) ----------

pub fn meta_get(key: &str) -> Option<String> {
    with(|c| c.query_row("SELECT value FROM meta WHERE key = ?1", params![key], |r| r.get::<_, String>(0)).optional()).ok().flatten()
}

pub fn meta_set(key: &str, value: &str) -> Result<(), String> {
    with(|c| c.execute("INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key, value]).map(|_| ()))
}

pub fn meta_get_json<T: serde::de::DeserializeOwned>(key: &str) -> Option<T> {
    meta_get(key).and_then(|s| serde_json::from_str(&s).ok())
}

pub fn meta_set_json<T: Serialize>(key: &str, v: &T) -> Result<(), String> {
    let s = serde_json::to_string(v).map_err(|e| e.to_string())?;
    meta_set(key, &s)
}

// ---------- Berechtigungen ----------

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PermissionEntry { pub origin: String, pub kind: String, pub state: String, pub updated: u64 }

pub fn perm_all() -> Result<Vec<PermissionEntry>, String> {
    with(|c| {
        let mut st = c.prepare("SELECT origin, kind, state, updated FROM permissions ORDER BY origin, kind")?;
        let rows = st.query_map([], |r| Ok(PermissionEntry { origin: r.get(0)?, kind: r.get(1)?, state: r.get(2)?, updated: r.get::<_, i64>(3)?.max(0) as u64 }))?;
        rows.collect()
    })
}

pub fn perm_set(origin: &str, kind: &str, state: &str) -> Result<(), String> {
    let now = crate::now_ms() as i64;
    with(|c| c.execute("INSERT INTO permissions (origin, kind, state, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(origin, kind) DO UPDATE SET state = excluded.state, updated = excluded.updated", params![origin, kind, state, now]).map(|_| ()))
}

pub fn perm_delete(origin: &str, kind: Option<&str>) -> Result<(), String> {
    with(|c| match kind {
        Some(k) => c.execute("DELETE FROM permissions WHERE origin = ?1 AND kind = ?2", params![origin, k]).map(|_| ()),
        None => c.execute("DELETE FROM permissions WHERE origin = ?1", params![origin]).map(|_| ()),
    })
}

// ---------- Statistik ----------

/// Schreibt Zaehler-Deltas in einer Transaktion.
pub fn stats_add(sites: &HashMap<String, u64>, domains: &HashMap<String, u64>) -> Result<(), String> {
    with(|c| {
        let tx = c.unchecked_transaction()?;
        {
            let mut s1 = tx.prepare("INSERT INTO site_stats (host, blocked) VALUES (?1, ?2) ON CONFLICT(host) DO UPDATE SET blocked = blocked + excluded.blocked")?;
            for (h, n) in sites { s1.execute(params![h, *n as i64])?; }
            let mut s2 = tx.prepare("INSERT INTO domain_stats (domain, blocked) VALUES (?1, ?2) ON CONFLICT(domain) DO UPDATE SET blocked = blocked + excluded.blocked")?;
            for (d, n) in domains { s2.execute(params![d, *n as i64])?; }
        }
        tx.commit()
    })
}

pub fn stats_top(table: &str, limit: u32) -> Result<Vec<(String, u64)>, String> {
    let sql = match table {
        "site" => "SELECT host, blocked FROM site_stats ORDER BY blocked DESC LIMIT ?1",
        _ => "SELECT domain, blocked FROM domain_stats ORDER BY blocked DESC LIMIT ?1",
    };
    with(|c| {
        let mut st = c.prepare(sql)?;
        let rows = st.query_map(params![limit as i64], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?.max(0) as u64)))?;
        rows.collect()
    })
}

pub fn stats_reset() -> Result<(), String> {
    with(|c| c.execute_batch("DELETE FROM site_stats; DELETE FROM domain_stats;"))?;
    meta_set("stats.total", "0")
}

// ---------- Erweiterungen ----------

#[derive(Clone, Debug)]
pub struct ExtRow { pub id: String, pub enabled: bool, pub version: String, pub source: String, pub site_off: String, pub blocked: u64 }

pub fn ext_rows() -> Result<Vec<ExtRow>, String> {
    with(|c| {
        let mut st = c.prepare("SELECT id, enabled, version, source, site_off, blocked FROM extensions")?;
        let rows = st.query_map([], |r| Ok(ExtRow {
            id: r.get(0)?, enabled: r.get::<_, i64>(1)? != 0, version: r.get(2)?, source: r.get(3)?, site_off: r.get(4)?, blocked: r.get::<_, i64>(5)?.max(0) as u64,
        }))?;
        rows.collect()
    })
}

/// Neu anlegen oder Version/Quelle aktualisieren (enabled nur beim Anlegen).
pub fn ext_upsert(id: &str, enabled: bool, version: &str, source: &str) -> Result<(), String> {
    with(|c| c.execute("INSERT INTO extensions (id, enabled, version, source) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET version = excluded.version, source = excluded.source", params![id, enabled as i64, version, source]).map(|_| ()))
}

pub fn ext_set_enabled(id: &str, enabled: bool) -> Result<(), String> {
    with(|c| c.execute("INSERT INTO extensions (id, enabled) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled", params![id, enabled as i64]).map(|_| ()))
}

pub fn ext_set_site_off(id: &str, json: &str) -> Result<(), String> {
    with(|c| c.execute("INSERT INTO extensions (id, site_off) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET site_off = excluded.site_off", params![id, json]).map(|_| ()))
}

pub fn ext_add_blocked(deltas: &HashMap<String, u64>) -> Result<(), String> {
    with(|c| {
        let tx = c.unchecked_transaction()?;
        {
            let mut st = tx.prepare("UPDATE extensions SET blocked = blocked + ?2 WHERE id = ?1")?;
            for (id, n) in deltas { st.execute(params![id, *n as i64])?; }
        }
        tx.commit()
    })
}

// ---------- Commands (UI-Persistenz, validiert) ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSnapshot { available: bool, migrated: bool, entries: HashMap<String, String> }

/// Alle UI-Daten beim Start. `migrated = false` -> UI importiert einmalig ihren localStorage.
#[tauri::command]
pub async fn storage_load() -> Result<StorageSnapshot, String> {
    tauri::async_runtime::spawn_blocking(|| {
        if !available() { return Ok(StorageSnapshot { available: false, migrated: false, entries: HashMap::new() }); }
        let migrated = meta_get("storage.migrated").as_deref() == Some("1");
        let entries = kv_all()?.into_iter().filter(|(k, _)| valid_kv_key(k)).collect();
        Ok(StorageSnapshot { available: true, migrated, entries })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn storage_set(key: String, value: String) -> Result<(), String> {
    if !valid_kv_key(&key) { return Err(format!("unbekannter Schluessel '{key}'")); }
    valid_kv_value(&value)?;
    tauri::async_runtime::spawn_blocking(move || kv_set(&key, &value)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn storage_remove(key: String) -> Result<(), String> {
    if !valid_kv_key(&key) { return Err(format!("unbekannter Schluessel '{key}'")); }
    tauri::async_runtime::spawn_blocking(move || kv_remove(&key)).await.map_err(|e| e.to_string())?
}

/// Einmalige Migration aus dem localStorage der UI. Ungueltige Eintraege werden uebersprungen.
/// Bereits vorhandene Schluessel werden nicht ueberschrieben. Rueckgabe: Anzahl uebernommener Eintraege.
#[tauri::command]
pub async fn storage_import(entries: HashMap<String, String>) -> Result<u32, String> {
    if entries.len() > 64 { return Err("zu viele Eintraege".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        if meta_get("storage.migrated").as_deref() == Some("1") { return Ok(0); }
        let existing = kv_all()?;
        let mut n = 0;
        for (k, v) in entries {
            if !valid_kv_key(&k) || existing.contains_key(&k) { continue; }
            if let Err(e) = valid_kv_value(&v) { tracing::warn!("Migration: {k} uebersprungen ({e})"); continue; }
            kv_set(&k, &v)?;
            n += 1;
        }
        meta_set("storage.migrated", "1")?;
        tracing::info!("localStorage-Migration: {n} Eintraege uebernommen");
        Ok(n)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn kv_validation() {
        assert!(valid_kv_key("bookmarks") && valid_kv_key("settings"));
        assert!(!valid_kv_key("../x") && !valid_kv_key("evil") && !valid_kv_key(""));
        assert!(valid_kv_value("[1,2]").is_ok());
        assert!(valid_kv_value("{nope").is_err());
    }

    #[test]
    fn extensions_migration() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);").unwrap();
        migrate(&c).unwrap();
        migrate(&c).unwrap();
        c.execute("INSERT INTO extensions (id, enabled, version) VALUES ('a', 1, '1.0.0')", []).unwrap();
        let n: i64 = c.query_row("SELECT blocked FROM extensions WHERE id = 'a'", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
    }
}
