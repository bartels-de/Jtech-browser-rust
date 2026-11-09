// Runde 4: Filterlisten-Verwaltung, Engine-Cache, Allowlist, kosmetische Filter.
//
// Ablauf:
//  - Listen werden in <AppData>/filters/<id>.txt gespeichert, Metadaten in SQLite (meta "filters.list.<id>").
//  - Die Engine wird in einem Hintergrund-Thread gebaut und serialisiert (engine.dat). Nur die Bytes
//    (Vec<u8>, Send) gehen an den UI-Thread, der sie deserialisiert und in den thread_local ENGINE legt.
//    (adblock ist mit Feature "single-thread" gebaut – die Engine selbst verlaesst ihren Thread nie.)
//  - Start: passt der Cache zur Konfiguration (Signatur), wird er sofort geladen; veraltete Listen
//    werden danach im Hintergrund aktualisiert. Alle 60 Min. wird auf "aelter als N Tage" geprueft.

use adblock::engine::Engine;
use adblock::lists::ParseOptions;
use adblock::FilterSet;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock, RwLock};
use tauri::{AppHandle, Emitter, Manager};

use crate::{lock, now_ms, storage, ENGINE};

pub struct ListDef { pub id: &'static str, pub name: &'static str, pub url: &'static str, pub default_on: bool, pub note: &'static str }

pub const LISTS: &[ListDef] = &[
    ListDef { id: "easylist", name: "EasyList", url: "https://easylist.to/easylist/easylist.txt", default_on: true, note: "Werbung" },
    ListDef { id: "easyprivacy", name: "EasyPrivacy", url: "https://easylist.to/easylist/easyprivacy.txt", default_on: true, note: "Tracker" },
    ListDef { id: "ublock-filters", name: "uBlock filters", url: "https://ublockorigin.github.io/uAssets/filters/filters.txt", default_on: false, note: "Ergaenzungen von uBlock Origin (Scriptlets werden nicht ausgefuehrt)" },
    ListDef { id: "ublock-privacy", name: "uBlock filters – Privacy", url: "https://ublockorigin.github.io/uAssets/filters/privacy.txt", default_on: false, note: "Tracker-Ergaenzungen von uBlock Origin" },
    ListDef { id: "peter-lowe", name: "Peter Lowe's List", url: "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext", default_on: false, note: "Ad-/Tracking-Server (Hosts)" },
    ListDef { id: "fanboy-annoyance", name: "Fanboy's Annoyance", url: "https://secure.fanboy.co.nz/fanboy-annoyance.txt", default_on: false, note: "Cookie-Banner, Popups, Social-Widgets (viel kosmetisch)" },
];

const MAX_LIST_BYTES: usize = 30 * 1024 * 1024;
const DAY_MS: u64 = 24 * 60 * 60 * 1000;
const MAX_COSMETIC_SELECTORS: usize = 8000;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct FilterConfig {
    pub enabled: HashMap<String, bool>,
    pub update_days: u32,
    pub cosmetic: bool,
    /// Execute scriptlets and procedural cosmetic filters in pages.
    pub scriptlets: bool,
}

impl Default for FilterConfig {
    fn default() -> Self {
        Self { enabled: LISTS.iter().map(|l| (l.id.to_string(), l.default_on)).collect(), update_days: 4, cosmetic: true, scriptlets: true }
    }
}

impl FilterConfig {
    fn is_on(&self, id: &str) -> bool {
        self.enabled.get(id).copied().unwrap_or_else(|| LISTS.iter().find(|l| l.id == id).is_some_and(|l| l.default_on))
    }
}

#[derive(Clone, Serialize, Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct ListMeta { pub last_updated: u64, pub last_attempt: u64, pub rules: u64, pub bytes: u64, pub error: Option<String> }

#[derive(Clone, Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ListStatus { id: String, name: String, url: String, note: String, enabled: bool, last_updated: u64, last_attempt: u64, rules: u64, bytes: u64, error: Option<String>, cached: bool }

#[derive(Clone, Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FilterStatus {
    /// idle | loading | building | ready | error | empty
    state: String,
    message: String,
    lists: Vec<ListStatus>,
    /// Summe der Regelzeilen der aktiven Listen (Naeherung: Zeilen ohne Kommentar/Kopf).
    active_rules: u64,
    engine_built_at: u64,
    from_cache: bool,
    update_days: u32,
    cosmetic: bool,
    scriptlets: bool,
    allowlist: Vec<String>,
}

static STATUS: Mutex<Option<FilterStatus>> = Mutex::new(None);
static BUSY: AtomicBool = AtomicBool::new(false);
static DIR: OnceLock<PathBuf> = OnceLock::new();
static ALLOW: OnceLock<RwLock<HashSet<String>>> = OnceLock::new();
pub static COSMETIC_ENABLED: AtomicBool = AtomicBool::new(true);
pub static SCRIPTLETS_ENABLED: AtomicBool = AtomicBool::new(true);

fn allow() -> &'static RwLock<HashSet<String>> { ALLOW.get_or_init(|| RwLock::new(HashSet::new())) }

fn dir() -> Option<&'static PathBuf> { DIR.get() }

pub fn load_config() -> FilterConfig { storage::meta_get_json("filters.config").unwrap_or_default() }
fn save_config(c: &FilterConfig) -> Result<(), String> { storage::meta_set_json("filters.config", c) }
fn list_meta(id: &str) -> ListMeta { storage::meta_get_json(&format!("filters.list.{id}")).unwrap_or_default() }
fn save_list_meta(id: &str, m: &ListMeta) { if let Err(e) = storage::meta_set_json(&format!("filters.list.{id}"), m) { tracing::warn!("Listen-Metadaten {id}: {e}"); } }

/// Ungefaehre Regelanzahl: nicht leere Zeilen ohne Kommentar ("!") und Kopf ("[Adblock ...]").
pub fn count_rules(text: &str) -> u64 {
    text.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('!') && !l.starts_with('[')).count() as u64
}

/// Plausibilitaet einer heruntergeladenen Liste (kein HTML-Fehlerportal, nicht leer).
pub fn plausible_list(text: &str) -> Result<(), String> {
    let head = text.trim_start();
    if head.is_empty() { return Err("leere Antwort".into()); }
    if head.starts_with('<') { return Err("Antwort ist HTML, keine Filterliste".into()); }
    if count_rules(text) < 10 { return Err("zu wenige Regeln".into()); }
    Ok(())
}

/// Signatur der Konfiguration – passt sie nicht zum Cache, wird neu gebaut.
fn signature(cfg: &FilterConfig) -> String {
    let mut parts: Vec<String> = LISTS.iter().filter(|l| cfg.is_on(l.id)).map(|l| format!("{}@{}", l.id, list_meta(l.id).last_updated)).collect();
    parts.sort();
    format!("v1|{}", parts.join(","))
}

// ---------- Allowlist ----------

/// Host normalisieren und pruefen (nur a-z 0-9 . - , max. 253 Zeichen). "www." wird entfernt.
pub fn normalize_host(input: &str) -> Option<String> {
    let mut h = input.trim().to_ascii_lowercase();
    if let Ok(u) = url::Url::parse(&h) { if let Some(x) = u.host_str() { h = x.to_string(); } }
    let h = h.trim_end_matches('.').trim_start_matches("www.").to_string();
    if h.is_empty() || h.len() > 253 || h.starts_with('.') || h.starts_with('-') { return None; }
    if !h.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-') { return None; }
    Some(h)
}

pub fn host_of(url: &str) -> Option<String> {
    url::Url::parse(url).ok().and_then(|u| u.host_str().map(|h| h.to_ascii_lowercase()))
}

/// Ist der Host (oder eine uebergeordnete Domain) auf der Allowlist?
pub fn host_in(set: &HashSet<String>, host: &str) -> bool {
    let host = host.trim_end_matches('.');
    let mut h = host;
    loop {
        if set.contains(h) { return true; }
        match h.find('.') { Some(i) => h = &h[i + 1..], None => return false }
    }
}

/// true = Blocken fuer diese Seite abgeschaltet.
pub fn site_allowlisted(top_url: &str) -> bool {
    let Some(host) = host_of(top_url) else { return false };
    let set = allow().read().unwrap_or_else(|p| p.into_inner());
    !set.is_empty() && host_in(&set, &host)
}

fn save_allowlist() -> Vec<String> {
    let mut v: Vec<String> = allow().read().unwrap_or_else(|p| p.into_inner()).iter().cloned().collect();
    v.sort();
    if let Err(e) = storage::meta_set_json("filters.allowlist", &v) { tracing::warn!("Allowlist speichern: {e}"); }
    v
}

// ---------- Status ----------

fn build_status(state: &str, message: &str) -> FilterStatus {
    let cfg = load_config();
    let mut active = 0;
    let lists = LISTS.iter().map(|l| {
        let m = list_meta(l.id);
        let enabled = cfg.is_on(l.id);
        if enabled { active += m.rules; }
        let cached = dir().is_some_and(|d| d.join(format!("{}.txt", l.id)).exists());
        ListStatus { id: l.id.into(), name: l.name.into(), url: l.url.into(), note: l.note.into(), enabled, last_updated: m.last_updated, last_attempt: m.last_attempt, rules: m.rules, bytes: m.bytes, error: m.error, cached }
    }).collect();
    let prev = lock(&STATUS).clone().unwrap_or_default();
    let mut allowlist: Vec<String> = allow().read().unwrap_or_else(|p| p.into_inner()).iter().cloned().collect();
    allowlist.sort();
    FilterStatus { state: state.into(), message: message.into(), lists, active_rules: active, engine_built_at: prev.engine_built_at, from_cache: prev.from_cache, update_days: cfg.update_days, cosmetic: cfg.cosmetic, scriptlets: cfg.scriptlets, allowlist }
}

fn set_status(app: &AppHandle, state: &str, message: &str, built: Option<(u64, bool)>) {
    let mut s = build_status(state, message);
    if let Some((at, cache)) = built { s.engine_built_at = at; s.from_cache = cache; }
    *lock(&STATUS) = Some(s.clone());
    if let Err(e) = app.emit("filter-status", s) { tracing::warn!("emit filter-status: {e}"); }
}

// ---------- Engine bauen / laden ----------

/// adblock 0.13: Engine::serialize gibt je nach Version Vec<u8> oder Result<Vec<u8>, _> zurueck.
trait IntoBytes { fn into_bytes(self) -> Result<Vec<u8>, String>; }
impl IntoBytes for Vec<u8> { fn into_bytes(self) -> Result<Vec<u8>, String> { Ok(self) } }
impl<E: std::fmt::Debug> IntoBytes for Result<Vec<u8>, E> { fn into_bytes(self) -> Result<Vec<u8>, String> { self.map_err(|e| format!("{e:?}")) } }

/// Im Hintergrund-Thread: Engine aus Texten bauen und serialisieren.
fn build_bytes(texts: Vec<String>) -> Result<Vec<u8>, String> {
    let mut fs = FilterSet::new(false);
    for t in texts { fs.add_filter_list(t, ParseOptions::default()); }
    let engine = Engine::new_with_filter_set(fs);
    engine.serialize().into_bytes()
}

/// Bytes an den UI-Thread schicken und dort als ENGINE installieren. `None` = Adblock leer.
fn install(app: &AppHandle, bytes: Option<Vec<u8>>, from_cache: bool) {
    let app2 = app.clone();
    let r = app.run_on_main_thread(move || {
        match bytes {
            None => { ENGINE.with(|e| *e.borrow_mut() = None); set_status(&app2, "empty", "Keine Filterliste aktiv", Some((now_ms(), false))); }
            Some(b) => {
                let mut engine = Engine::new_with_filter_set(FilterSet::new(false));
                match engine.deserialize(&b) {
                    Ok(_) => {
                        ENGINE.with(|e| *e.borrow_mut() = Some(engine));
                        tracing::info!("Adblock-Engine geladen ({} KB, Cache={from_cache})", b.len() / 1024);
                        set_status(&app2, "ready", if from_cache { "Aus Cache geladen" } else { "Neu gebaut" }, Some((now_ms(), from_cache)));
                    }
                    Err(e) => {
                        tracing::error!("Engine deserialisieren: {e:?}");
                        set_status(&app2, "error", &format!("Engine-Cache ungueltig: {e:?}"), None);
                        // Cache verwerfen; naechster Start/Update baut neu
                        if from_cache {
                            let _ = storage::meta_set("filters.engineSig", "");
                            let app3 = app2.clone();
                            std::thread::spawn(move || run_update(&app3, false));
                        }
                    }
                }
            }
        }
    });
    if let Err(e) = r { tracing::error!("run_on_main_thread (Engine): {e}"); }
}

fn client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .user_agent("JTechBrowser/0.1 (filter-update)")
        .build()
        .unwrap_or_default()
}

fn download(client: &reqwest::blocking::Client, url: &str) -> Result<String, String> {
    let resp = client.get(url).send().map_err(|e| format!("Netz: {e}"))?;
    if !resp.status().is_success() { return Err(format!("HTTP {}", resp.status())); }
    if let Some(len) = resp.content_length() { if len as usize > MAX_LIST_BYTES { return Err("Liste zu gross".into()); } }
    let text = resp.text().map_err(|e| format!("Lesen: {e}"))?;
    if text.len() > MAX_LIST_BYTES { return Err("Liste zu gross".into()); }
    plausible_list(&text)?;
    Ok(text)
}

fn stale(m: &ListMeta, days: u32, now: u64) -> bool { m.last_updated == 0 || now.saturating_sub(m.last_updated) > days.max(1) as u64 * DAY_MS }

fn any_stale() -> bool {
    let cfg = load_config();
    let now = now_ms();
    LISTS.iter().any(|l| cfg.is_on(l.id) && stale(&list_meta(l.id), cfg.update_days, now))
}

/// Listen laden (force = alle aktiven neu, sonst nur fehlende/veraltete) und Engine neu bauen.
/// Laeuft im aufrufenden (Hintergrund-)Thread. Nie parallel.
pub fn run_update(app: &AppHandle, force: bool) {
    if BUSY.swap(true, Ordering::SeqCst) { tracing::info!("Filter-Update laeuft bereits"); return; }
    let Some(d) = dir().cloned() else { BUSY.store(false, Ordering::SeqCst); return };
    let cfg = load_config();
    set_status(app, "loading", "Filterlisten werden geladen …", None);
    let c = client();
    let now = now_ms();
    let mut texts = Vec::new();
    let mut errors = Vec::new();
    for l in LISTS.iter().filter(|l| cfg.is_on(l.id)) {
        let path = d.join(format!("{}.txt", l.id));
        let mut meta = list_meta(l.id);
        let need = force || !path.exists() || stale(&meta, cfg.update_days, now);
        if need {
            meta.last_attempt = now_ms();
            match download(&c, l.url) {
                Ok(text) => {
                    if let Err(e) = std::fs::write(&path, &text) { tracing::warn!("{}: speichern: {e}", l.id); }
                    meta.last_updated = now_ms();
                    meta.rules = count_rules(&text);
                    meta.bytes = text.len() as u64;
                    meta.error = None;
                    tracing::info!("Filterliste {} geladen ({} Regeln)", l.id, meta.rules);
                }
                Err(e) => {
                    tracing::error!("Filterliste {} ({}) nicht geladen: {e}", l.id, l.url);
                    errors.push(format!("{}: {e}", l.name));
                    meta.error = Some(e);
                }
            }
            save_list_meta(l.id, &meta);
        }
        match std::fs::read_to_string(&path) {
            Ok(t) => {
                if meta.rules == 0 { meta.rules = count_rules(&t); meta.bytes = t.len() as u64; save_list_meta(l.id, &meta); }
                texts.push(t);
            }
            Err(_) => { if !need { errors.push(format!("{}: Cache-Datei fehlt", l.name)); } }
        }
    }
    if texts.is_empty() {
        let msg = if errors.is_empty() { "Keine Filterliste aktiv".to_string() } else { format!("Keine Liste verfuegbar – {}", errors.join("; ")) };
        if errors.is_empty() { install(app, None, false); } else { set_status(app, "error", &msg, None); }
        BUSY.store(false, Ordering::SeqCst);
        return;
    }
    set_status(app, "building", "Engine wird gebaut …", None);
    let t0 = std::time::Instant::now();
    match build_bytes(texts) {
        Ok(bytes) => {
            tracing::info!("Engine gebaut in {} ms ({} KB)", t0.elapsed().as_millis(), bytes.len() / 1024);
            let cache = d.join("engine.dat");
            match std::fs::write(&cache, &bytes) {
                Ok(()) => { let _ = storage::meta_set("filters.engineSig", &signature(&cfg)); }
                Err(e) => tracing::warn!("engine.dat schreiben: {e}"),
            }
            install(app, Some(bytes), false);
            if !errors.is_empty() {
                // Status nach install (asynchron auf UI-Thread) – Fehler trotzdem melden
                let msg = format!("Teilweise veraltet: {}", errors.join("; "));
                let app2 = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let built = lock(&STATUS).as_ref().map(|s| (s.engine_built_at, s.from_cache));
                    set_status(&app2, "ready", &msg, built);
                });
            }
        }
        Err(e) => set_status(app, "error", &format!("Engine bauen: {e}"), None),
    }
    BUSY.store(false, Ordering::SeqCst);
}

fn spawn_update(app: &AppHandle, force: bool) {
    let app = app.clone();
    std::thread::spawn(move || run_update(&app, force));
}

/// Aus `setup` aufrufen (nach storage::init).
pub fn start(app: &AppHandle) {
    let base = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("jtech-browser"));
    let d = base.join("filters");
    if let Err(e) = std::fs::create_dir_all(&d) { tracing::error!("Filterordner {}: {e}", d.display()); }
    let _ = DIR.set(d.clone());
    let saved: Vec<String> = storage::meta_get_json("filters.allowlist").unwrap_or_default();
    { let mut w = allow().write().unwrap_or_else(|p| p.into_inner()); w.extend(saved.into_iter().filter_map(|h| normalize_host(&h))); }
    let cfg = load_config();
    COSMETIC_ENABLED.store(cfg.cosmetic, Ordering::Relaxed);
    SCRIPTLETS_ENABLED.store(cfg.scriptlets, Ordering::Relaxed);
    *lock(&STATUS) = Some(build_status("idle", "Start"));

    let app = app.clone();
    std::thread::spawn(move || {
        let cfg = load_config();
        let sig = signature(&cfg);
        let cached_sig = storage::meta_get("filters.engineSig").unwrap_or_default();
        let mut loaded = false;
        if !cached_sig.is_empty() && cached_sig == sig {
            match std::fs::read(d.join("engine.dat")) {
                Ok(bytes) if !bytes.is_empty() => { install(&app, Some(bytes), true); loaded = true; }
                Ok(_) => {}
                Err(e) => tracing::info!("kein Engine-Cache: {e}"),
            }
        }
        if !loaded || any_stale() { run_update(&app, false); }
        loop {
            std::thread::sleep(std::time::Duration::from_secs(60 * 60));
            if any_stale() { run_update(&app, false); }
        }
    });
}

// ---------- Kosmetische Filter ----------

/// CSS + Infos fuer die Seite (UI-Thread, da ENGINE thread_local ist).
pub struct Cosmetic {
    pub css: String,
    pub generichide: bool,
    pub exceptions: HashSet<String>,
    /// JavaScript code for scriptlet injections produced by adblock-rust.
    pub script: String,
    /// JSON-encoded procedural cosmetic filters produced by adblock-rust.
    pub procedural: Vec<String>,
}

fn css_from(selectors: impl IntoIterator<Item = String>) -> String {
    let mut out = String::new();
    for (i, s) in selectors.into_iter().enumerate() {
        if i >= MAX_COSMETIC_SELECTORS { break; }
        if s.contains('{') || s.contains('}') || s.contains("</") { continue; }
        // Eine Regel je Selektor: ein ungueltiger Selektor macht sonst die ganze Gruppe wirkungslos.
        out.push_str(&s);
        out.push_str("{display:none!important}\n");
    }
    out
}

pub fn cosmetic_for(url: &str) -> Option<Cosmetic> {
    if !COSMETIC_ENABLED.load(Ordering::Relaxed) || !crate::ADBLOCK_ENABLED.load(Ordering::Relaxed) || site_allowlisted(url) { return None; }
    if !(url.starts_with("http://") || url.starts_with("https://")) { return None; }
    ENGINE.with(|e| {
        let b = e.borrow();
        let engine = b.as_ref()?;
        let r = engine.url_cosmetic_resources(url);
        let mut sel: Vec<String> = r.hide_selectors.into_iter().collect();
        sel.sort();
        let procedural: Vec<String> = r.procedural_actions.into_iter().collect();
        Some(Cosmetic { css: css_from(sel), generichide: r.generichide, exceptions: r.exceptions, script: r.injected_script, procedural })
    })
}

/// Generische Klassen-/ID-Regeln (##.ad, ###banner) fuer die im Dokument gefundenen Namen.
pub fn class_id_css(classes: &[String], ids: &[String], exceptions: &HashSet<String>) -> String {
    ENGINE.with(|e| {
        let b = e.borrow();
        let Some(engine) = b.as_ref() else { return String::new() };
        css_from(engine.hidden_class_id_selectors(classes.iter(), ids.iter(), exceptions))
    })
}

/// JS, das ein Stylesheet einfuegt. CSS nur als JSON-String eingebettet.
pub fn style_script(css: &str, id: &str) -> String {
    let c = serde_json::to_string(css).unwrap_or_else(|_| "\"\"".into());
    let i = serde_json::to_string(id).unwrap_or_else(|_| "\"\"".into());
    format!("(function(c,i){{try{{var s=document.getElementById(i);if(!s){{s=document.createElement('style');s.id=i;(document.head||document.documentElement).appendChild(s);}}s.textContent=c;}}catch(e){{}}}})({c},{i});")
}

/// JS, das Klassen/IDs des Dokuments sammelt (max. 3000) und als JSON zurueckgibt.
pub const COLLECT_CLASS_ID_JS: &str = r#"(function(){try{var c={},i={},n=0,els=document.querySelectorAll('[class],[id]');for(var k=0;k<els.length&&n<3000;k++){var e=els[k];if(e.id){if(!i[e.id]){i[e.id]=1;n++;}}var cl=e.classList;if(cl){for(var j=0;j<cl.length;j++){if(!c[cl[j]]){c[cl[j]]=1;n++;}}}}return {c:Object.keys(c),i:Object.keys(i)};}catch(e){return {c:[],i:[]};}})()"#;

// ---------- Commands ----------

#[tauri::command]
pub fn filter_status() -> FilterStatus {
    lock(&STATUS).clone().unwrap_or_else(|| build_status("idle", ""))
}

#[tauri::command]
pub fn filter_set_list(app: AppHandle, id: String, enabled: bool) -> Result<(), String> {
    if !LISTS.iter().any(|l| l.id == id) { return Err(format!("unbekannte Liste '{id}'")); }
    let mut cfg = load_config();
    cfg.enabled.insert(id, enabled);
    save_config(&cfg)?;
    spawn_update(&app, false);
    Ok(())
}

#[tauri::command]
pub fn filter_set_options(app: AppHandle, update_days: u32, cosmetic: bool, scriptlets: bool) -> Result<(), String> {
    if !(1..=30).contains(&update_days) { return Err("Update-Intervall 1–30 Tage".into()); }
    let mut cfg = load_config();
    cfg.update_days = update_days;
    cfg.cosmetic = cosmetic;
    cfg.scriptlets = scriptlets;
    save_config(&cfg)?;
    COSMETIC_ENABLED.store(cosmetic, Ordering::Relaxed);
    SCRIPTLETS_ENABLED.store(scriptlets, Ordering::Relaxed);
    let built = lock(&STATUS).as_ref().map(|s| (s.engine_built_at, s.from_cache));
    let state = lock(&STATUS).as_ref().map(|s| s.state.clone()).unwrap_or_else(|| "idle".into());
    set_status(&app, &state, "Einstellungen gespeichert", built);
    Ok(())
}

#[tauri::command]
pub fn filter_update_now(app: AppHandle) -> Result<(), String> {
    if BUSY.load(Ordering::SeqCst) { return Err("Update laeuft bereits".into()); }
    spawn_update(&app, true);
    Ok(())
}

#[tauri::command]
pub fn allowlist_set(app: AppHandle, host: String, allowed: bool) -> Result<Vec<String>, String> {
    let h = normalize_host(&host).ok_or_else(|| format!("ungueltiger Host '{host}'"))?;
    {
        let mut w = allow().write().unwrap_or_else(|p| p.into_inner());
        if allowed { if w.len() >= 5000 { return Err("Allowlist voll".into()); } w.insert(h); } else { w.remove(&h); }
    }
    let v = save_allowlist();
    let built = lock(&STATUS).as_ref().map(|s| (s.engine_built_at, s.from_cache));
    let state = lock(&STATUS).as_ref().map(|s| s.state.clone()).unwrap_or_else(|| "idle".into());
    set_status(&app, &state, "", built);
    Ok(v)
}

/// Ist das Blocken fuer diese URL abgeschaltet?
#[tauri::command]
pub fn allowlist_check(url: String) -> bool { site_allowlisted(&url) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hosts() {
        assert_eq!(normalize_host("https://www.Example.com/x").as_deref(), Some("example.com"));
        assert_eq!(normalize_host("sub.example.com").as_deref(), Some("sub.example.com"));
        assert_eq!(normalize_host("bad host"), None);
        assert_eq!(normalize_host("<script>"), None);
        let mut s = HashSet::new();
        s.insert("example.com".to_string());
        assert!(host_in(&s, "a.b.example.com"));
        assert!(host_in(&s, "example.com"));
        assert!(!host_in(&s, "notexample.com"));
    }
    #[test]
    fn lists() {
        assert_eq!(count_rules("! Kommentar\n[Adblock Plus 2.0]\n||ads.example^\n\n##.ad\n"), 2);
        assert!(plausible_list("<html>").is_err());
        assert!(plausible_list(&"||a.example^\n".repeat(20)).is_ok());
        let css = css_from(vec![".ad".into(), "x{y}".into()]);
        assert_eq!(css, ".ad{display:none!important}\n");
        assert!(style_script("a</style>", "x").contains("\"a</style>\""));
    }
}
