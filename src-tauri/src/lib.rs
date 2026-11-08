#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Etappe B: zuverlaessiges Rendering/Navigation der Content-Webviews.
// Regeln:
//  - Der TabManager-Lock wird NIE ueber Tauri-Webview-Aufrufe gehalten.
//  - Alle Bounds werden in logischen Pixeln aus inner_size()/scale_factor() berechnet.
//  - Fehler werden geloggt (tracing) und als Event "tab-event" (kind = "error") an die UI geschickt.

use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, window::WindowBuilder};
use adblock::engine::Engine;
use serde::Serialize;
use std::path::{Path, PathBuf};

// Runde 4: Module fuer Persistenz, Filterlisten und Datenschutz.
mod storage;
mod filters;
mod privacy;
// Runde 5: eigene Tastenkuerzel (AcceleratorKeyPressed-Allowlist) + optionale Cursor-Effekte in Webseiten.
mod uifx;
// JTech-Erweiterungen (gebuendelt, Market-Index, Content-Scripts, eigene Netzwerkregeln).
mod extensions;

thread_local! { static ENGINE: RefCell<Option<Engine>> = RefCell::new(None); }
static BLOCKED: AtomicU64 = AtomicU64::new(0);
/// Etappe G: Adblock zur Laufzeit an/aus (UI-Einstellung). Wirkt sofort auf alle Tabs.
static ADBLOCK_ENABLED: AtomicBool = AtomicBool::new(true);

pub const START_URL: &str = "about:blank"; // Etappe G: UI zeigt darueber die Startseite jtech://newtab
pub const DEFAULT_TOP_HEIGHT: f64 = 72.0;
pub const DEFAULT_SIDEBAR_WIDTH: f64 = 250.0;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TabInfo { id: String, title: String, url: String, active: bool, blocked: u64, playing_audio: bool, muted: bool, /** Runde 3: Tab schlaeft (Webview zerstoert) */ sleeping: bool }

/// Event an die UI. kind: navigation-starting | navigation-completed | source-changed |
/// title-changed | process-failed | controller-ready | bounds | visibility | error | blocked-document
#[derive(Clone, Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
struct TabEvent {
    tab_id: String,
    kind: String,
    url: Option<String>,
    title: Option<String>,
    is_success: Option<bool>,
    web_error_status: Option<i32>,
    error_name: Option<String>,
    detail: Option<String>,
    /// Etappe CD: WebView2-NavigationId (NavigationStarting/Completed).
    navigation_id: Option<u64>,
    /// Etappe CD: true = Completed gehoert NICHT zur neuesten Navigation dieses Tabs (ueberholt).
    stale: Option<bool>,
    /// Etappe CD: true = Abbruch (CONNECTION_ABORTED/OPERATION_CANCELED) ohne echten Fehler.
    benign: Option<bool>,
    can_go_back: Option<bool>,
    can_go_forward: Option<bool>,
    /// Etappe CD: Tastenkuerzel aus der Webseite (AcceleratorKeyPressed), z. B. "ctrl+t".
    key: Option<String>,
    /// Port: Audio-Hub (ICoreWebView2_8 IsDocumentPlayingAudio / IsMuted).
    playing_audio: Option<bool>,
    muted: Option<bool>,
    /// Runde 3: Zoomfaktor (ZoomFactorChanged).
    zoom: Option<f64>,
    /// Runde 3: Trefferzahl der Seitensuche (find-result).
    count: Option<u32>,
}

fn emit_tab(app: &AppHandle, ev: TabEvent) {
    if let Err(e) = app.emit("tab-event", ev.clone()) {
        tracing::error!("emit tab-event fehlgeschlagen: {e} ({ev:?})");
    }
}

fn report_error(app: &AppHandle, tab_id: &str, context: &str, err: impl std::fmt::Display) {
    let msg = format!("{context}: {err}");
    tracing::error!(tab = tab_id, "{msg}");
    emit_tab(app, TabEvent { tab_id: tab_id.to_string(), kind: "error".into(), detail: Some(msg), ..Default::default() });
}

fn emit_tabs_changed(app: &AppHandle) {
    let tabs = snapshot_tabs(app);
    if let Err(e) = app.emit("tabs-changed", tabs) { tracing::error!("emit tabs-changed fehlgeschlagen: {e}"); }
}

/// Gemeinsamer Zustand eines Tabs. Die Arcs werden auch von den COM-Handlern benutzt.
#[derive(Clone)]
struct Tab {
    webview: tauri::Webview,
    /// Aktuelle Top-Level-URL (aus NavigationStarting/SourceChanged). Quelle fuer den Adblock-Check.
    url: Arc<Mutex<String>>,
    title: Arc<Mutex<String>>,
    /// Registrierte WebView2-Event-Tokens (Name, Token) – werden beim Schliessen entfernt.
    tokens: Arc<Mutex<Vec<(&'static str, i64)>>>,
    /// Etappe G: Anzahl blockierter Anfragen in diesem Tab.
    blocked: Arc<AtomicU64>,
    /// Etappe CD: NavigationId der neuesten NavigationStarting.
    nav_id: Arc<AtomicU64>,
    /// Etappe CD: Nutzer hat "Stop" gedrueckt (bis zur naechsten Navigation).
    user_stopped: Arc<AtomicBool>,
    /// Port: spielt das Dokument gerade Audio? / ist der Tab stummgeschaltet?
    playing_audio: Arc<AtomicBool>,
    muted: Arc<AtomicBool>,
}

/// Runde 3 (Tab-Schlaf): Daten eines schlafenden Tabs, dessen Webview zerstoert wurde.
#[derive(Clone, Debug)]
struct SleepInfo { url: String, title: String, waking: bool }

struct TabManager {
    window: Option<tauri::Window>,
    /// Runde 3: schlafende Tabs (ID bleibt in `order`, aber nicht in `tabs`).
    sleeping: HashMap<String, SleepInfo>,
    /// Etappe G: EINE UI-Webview ueber das ganze Fenster (Sidebar + Toolbar + interne Seiten).
    ui: Option<tauri::Webview>,
    tabs: HashMap<String, Tab>,
    order: Vec<String>,
    active: Option<String>,
    counter: u64,
    top_height: f64,
    sidebar_width: f64,
    /// Etappe G: false = aktive Content-Webview verstecken (interne Seiten, Menues).
    content_visible: bool,
}

impl TabManager {
    fn new() -> Self {
        Self { window: None, sleeping: HashMap::new(), ui: None, tabs: HashMap::new(), order: Vec::new(), active: None, counter: 0, top_height: DEFAULT_TOP_HEIGHT, sidebar_width: DEFAULT_SIDEBAR_WIDTH, content_visible: true }
    }
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> { m.lock().unwrap_or_else(|p| p.into_inner()) }

// ---------- reine Logik (testbar) ----------

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Bounds { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }

/// Content-Bereich in logischen Pixeln: Fenster minus Toolbar (oben) und Sidebar (links).
pub fn content_bounds(win_w: f64, win_h: f64, top_h: f64, sidebar_w: f64) -> Bounds {
    Bounds { x: sidebar_w, y: top_h, w: (win_w - sidebar_w).max(1.0), h: (win_h - top_h).max(1.0) }
}

/// Eingabe der Adressleiste in eine URL umwandeln.
pub fn normalize_url(input: &str) -> Result<tauri::Url, String> {
    let s = input.trim();
    if s.is_empty() { return Err("leere URL".into()); }
    let candidate = if s.contains("://") || s.starts_with("about:") {
        s.to_string()
    } else if !s.contains(' ') && (s.contains('.') || s.starts_with("localhost")) {
        format!("https://{s}")
    } else {
        let q: String = url::form_urlencoded::byte_serialize(s.as_bytes()).collect();
        format!("https://duckduckgo.com/?q={q}")
    };
    candidate.parse::<tauri::Url>().map_err(|e| format!("ungueltige URL '{candidate}': {e}"))
}

/// Darf eine Anfrage ueberhaupt geprueft werden? Das Hauptdokument (Top-Level-Navigation)
/// wird nie blockiert, sonst entsteht eine weisse Seite.
pub fn is_main_document(rtype: &str, uri: &str, top_url: &str) -> bool {
    rtype == "document" && (top_url.is_empty() || uri == top_url)
}

pub fn web_error_name(status: i32) -> &'static str {
    match status {
        0 => "UNKNOWN", 1 => "CERTIFICATE_COMMON_NAME_IS_INCORRECT", 2 => "CERTIFICATE_EXPIRED",
        3 => "CLIENT_CERTIFICATE_CONTAINS_ERRORS", 4 => "CERTIFICATE_REVOKED", 5 => "CERTIFICATE_IS_INVALID",
        6 => "SERVER_UNREACHABLE", 7 => "TIMEOUT", 8 => "ERROR_HTTP_INVALID_SERVER_RESPONSE",
        9 => "CONNECTION_ABORTED", 10 => "CONNECTION_RESET", 11 => "DISCONNECTED",
        12 => "CANNOT_CONNECT", 13 => "HOST_NAME_NOT_RESOLVED", 14 => "OPERATION_CANCELED",
        15 => "REDIRECT_FAILED", 16 => "UNEXPECTED_ERROR", 17 => "VALID_AUTHENTICATION_CREDENTIALS_REQUIRED",
        18 => "VALID_PROXY_AUTHENTICATION_REQUIRED",
        _ => "OTHER",
    }
}

/// Etappe CD: Abbrueche, die keine Fehlerseite verdienen. Google & Co. starten beim Tippen/Klicken
/// sofort eine neue Navigation; WebView2 meldet die alte dann mit CONNECTION_ABORTED (9) oder
/// OPERATION_CANCELED (14). Ebenso bei Stop durch den Nutzer.
pub fn is_benign_abort(status: i32, stale: bool, user_stopped: bool) -> bool {
    stale || user_stopped || status == 14 || (status == 9 && stale)
}

/// Etappe CD: Virtual-Key + Modifier -> Kuerzelname fuer die UI (None = an die Seite durchreichen).
pub fn shortcut_name(vk: u32, ctrl: bool, shift: bool, alt: bool) -> Option<&'static str> {
    Some(match (vk, ctrl, shift, alt) {
        (0x54, true, false, false) => "ctrl+t",
        (0x57, true, false, false) => "ctrl+w",
        (0x4C, true, false, false) => "ctrl+l",
        (0x52, true, false, false) => "ctrl+r",
        (0x74, false, false, false) => "f5",
        (0x09, true, false, false) => "ctrl+tab",
        (0x09, true, true, false) => "ctrl+shift+tab",
        (0x25, false, false, true) => "alt+left",
        (0x27, false, false, true) => "alt+right",
        (0x44, true, false, false) => "ctrl+d",
        (0x48, true, false, false) => "ctrl+h",
        (0xBC, true, false, false) => "ctrl+comma",
        // Runde 3: Suchen, Drucken, Befehlspalette, Zoom
        (0x46, true, false, false) => "ctrl+f",
        (0x72, false, false, false) => "f3",
        (0x72, false, true, false) => "shift+f3",
        (0x50, true, false, false) => "ctrl+p",
        (0x50, true, true, false) => "ctrl+shift+p",
        (0x4B, true, false, false) => "ctrl+k",
        (0xBB | 0x6B, true, _, false) => "ctrl+plus",
        (0xBD | 0x6D, true, false, false) => "ctrl+minus",
        (0x30 | 0x60, true, false, false) => "ctrl+0",
        _ => return None,
    })
}

// ---------- Layout ----------

/// Fenstergroesse in logischen Pixeln (physisch / scale_factor).
fn logical_window_size(window: &tauri::Window) -> Result<(f64, f64), String> {
    let scale = window.scale_factor().map_err(|e| format!("scale_factor: {e}"))?;
    let size = window.inner_size().map_err(|e| format!("inner_size: {e}"))?;
    let l = size.to_logical::<f64>(scale);
    Ok((l.width, l.height))
}

/// Setzt Bounds und Sichtbarkeit aller Webviews. Lock nur fuer den Snapshot.
fn apply_layout(app: &AppHandle) {
    let (window, ui, tabs, active, top_h, sb_w, visible) = {
        let state = app.state::<Mutex<TabManager>>();
        let m = lock(&state);
        let tabs: Vec<(String, tauri::Webview)> = m.order.iter().filter_map(|id| m.tabs.get(id).map(|t| (id.clone(), t.webview.clone()))).collect();
        (m.window.clone(), m.ui.clone(), tabs, m.active.clone(), m.top_height, m.sidebar_width, m.content_visible)
    };
    let Some(window) = window else { return };
    let (w, h) = match logical_window_size(&window) { Ok(v) => v, Err(e) => { report_error(app, "", "layout", e); return; } };
    if let Some(ui) = &ui {
        if let Err(e) = ui.set_position(LogicalPosition::new(0.0, 0.0)) { report_error(app, "ui", "ui.set_position", e); }
        if let Err(e) = ui.set_size(LogicalSize::new(w, h)) { report_error(app, "ui", "ui.set_size", e); }
    }
    let b = content_bounds(w, h, top_h, sb_w);
    for (id, cw) in &tabs {
        if let Err(e) = cw.set_position(LogicalPosition::new(b.x, b.y)) { report_error(app, id, "set_position", e); }
        if let Err(e) = cw.set_size(LogicalSize::new(b.w, b.h)) { report_error(app, id, "set_size", e); }
        let is_active = visible && active.as_deref() == Some(id.as_str());
        let r = if is_active { cw.show() } else { cw.hide() };
        if let Err(e) = r { report_error(app, id, if is_active { "show" } else { "hide" }, e); }
        if is_active {
            tracing::info!(tab = id.as_str(), "bounds logical x={} y={} w={} h={} (fenster {w}x{h})", b.x, b.y, b.w, b.h);
            emit_tab(app, TabEvent { tab_id: id.clone(), kind: "bounds".into(), detail: Some(format!("x={} y={} w={} h={}", b.x, b.y, b.w, b.h)), ..Default::default() });
        }
    }
}

enum SnapEntry { Live(Tab), Sleeping(SleepInfo) }

fn snapshot_tabs(app: &AppHandle) -> Vec<TabInfo> {
    let tabs: Vec<(String, SnapEntry, bool)> = {
        let state = app.state::<Mutex<TabManager>>();
        let m = lock(&state);
        m.order.iter().filter_map(|id| {
            let active = m.active.as_deref() == Some(id.as_str());
            if let Some(t) = m.tabs.get(id) { Some((id.clone(), SnapEntry::Live(t.clone()), active)) }
            else { m.sleeping.get(id).map(|s| (id.clone(), SnapEntry::Sleeping(s.clone()), active)) }
        }).collect()
    };
    tabs.into_iter().map(|(id, e, active)| match e {
        SnapEntry::Live(t) => {
            let url = lock(&t.url).clone();
            let title = lock(&t.title).clone();
            let blocked = t.blocked.load(Ordering::Relaxed);
            let (playing_audio, muted) = (t.playing_audio.load(Ordering::Relaxed), t.muted.load(Ordering::Relaxed));
            TabInfo { id, title: if title.is_empty() { url.clone() } else { title }, url, active, blocked, playing_audio, muted, sleeping: false }
        }
        SnapEntry::Sleeping(s) => TabInfo { id, title: if s.title.is_empty() { s.url.clone() } else { s.title }, url: s.url, active, blocked: 0, playing_audio: false, muted: false, sleeping: true },
    }).collect()
}

/// Erweiterungen: alle lebenden Content-Webviews (ohne Lock waehrend der Webview-Aufrufe nutzen).
fn content_webviews(app: &AppHandle) -> Vec<tauri::Webview> {
    let state = app.state::<Mutex<TabManager>>();
    let m = lock(&state);
    m.tabs.values().map(|t| t.webview.clone()).collect()
}

fn active_tab(app: &AppHandle) -> Option<(String, Tab)> {
    let state = app.state::<Mutex<TabManager>>();
    let m = lock(&state);
    let id = m.active.clone()?;
    m.tabs.get(&id).map(|t| (id, t.clone()))
}

// ---------- Tabs ----------

fn create_tab(app: &AppHandle, raw_url: &str) -> Result<String, String> {
    let parsed = normalize_url(raw_url)?;
    let id = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        if m.window.is_none() { return Err("kein Hauptfenster".into()); }
        m.counter += 1;
        format!("content-{}", m.counter)
    }; // Lock frei
    spawn_webview(app, &id, &id, parsed, String::new())?;
    Ok(id)
}

/// Runde 3: erzeugt die Content-Webview fuer Tab `id` – neu oder beim Aufwecken eines schlafenden
/// Tabs. `label` ist das (eindeutige) Tauri-Webview-Label; die Tab-ID bleibt dabei stabil.
fn spawn_webview(app: &AppHandle, id: &str, label: &str, parsed: tauri::Url, title: String) -> Result<(), String> {
    let id = id.to_string();
    let (window, top_h, sb_w) = {
        let state = app.state::<Mutex<TabManager>>();
        let m = lock(&state);
        (m.window.clone().ok_or("kein Hauptfenster")?, m.top_height, m.sidebar_width)
    }; // Lock frei
    let (w, h) = logical_window_size(&window)?;
    let b = content_bounds(w, h, top_h, sb_w);
    tracing::info!(tab = id.as_str(), "erzeuge Webview '{label}' fuer {parsed} bei x={} y={} w={} h={}", b.x, b.y, b.w, b.h);
    let webview = window.add_child(
        tauri::webview::WebviewBuilder::new(label, tauri::WebviewUrl::External(parsed.clone())),
        LogicalPosition::new(b.x, b.y),
        LogicalSize::new(b.w, b.h),
    ).map_err(|e| format!("add_child: {e}"))?;

    let tab = Tab {
        webview: webview.clone(),
        url: Arc::new(Mutex::new(parsed.to_string())),
        title: Arc::new(Mutex::new(title)),
        tokens: Arc::new(Mutex::new(Vec::new())),
        blocked: Arc::new(AtomicU64::new(0)),
        nav_id: Arc::new(AtomicU64::new(0)),
        user_stopped: Arc::new(AtomicBool::new(false)),
        playing_audio: Arc::new(AtomicBool::new(false)),
        muted: Arc::new(AtomicBool::new(false)),
    };
    {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        m.tabs.insert(id.clone(), tab.clone());
        if !m.order.contains(&id) { m.order.push(id.clone()); }
        m.sleeping.remove(&id);
        m.active = Some(id.clone());
        m.content_visible = true;
    }

    #[cfg(windows)]
    {
        let app2 = app.clone();
        let id2 = id.clone();
        let tab2 = tab.clone();
        if let Err(e) = webview.with_webview(move |pwv| {
            if let Err(e) = unsafe { attach_handlers(&pwv, &app2, &id2, &tab2) } {
                report_error(&app2, &id2, "WebView2-Handler", e);
            }
        }) {
            report_error(app, &id, "with_webview", e);
        }
    }

    apply_layout(app); // zeigt neuen Tab, versteckt die anderen
    emit_tabs_changed(app);
    Ok(())
}

/// Runde 3: schlafenden Tab wieder mit einer neuen Webview versehen (gleiche ID, URL, Titel).
fn wake_tab(app: &AppHandle, id: &str) -> Result<(), String> {
    let (info, label) = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        m.counter += 1;
        let label = format!("{id}-w{}", m.counter);
        let Some(s) = m.sleeping.get_mut(id) else { return Ok(()) }; // schon wach
        if s.waking { return Ok(()); }
        s.waking = true;
        (s.clone(), label)
    };
    let parsed = normalize_url(&info.url).or_else(|_| normalize_url(START_URL))?;
    tracing::info!(tab = id, "wecke Tab auf: {parsed}");
    let r = spawn_webview(app, id, &label, parsed, info.title.clone());
    if r.is_err() {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        if let Some(s) = m.sleeping.get_mut(id) { s.waking = false; }
    }
    r
}

/// Webview-Erzeugung nie synchron im Command/COM-Callback (Deadlock-Gefahr) -> asynchron.
fn schedule_wake(app: &AppHandle, id: String) {
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = wake_tab(&app2, &id) { report_error(&app2, &id, "Tab aufwecken", e); }
    });
}

/// Webview eines Tabs abbauen: Handler entfernen, Webview schliessen.
fn destroy_webview(app: &AppHandle, id: &str, tab: Tab) {
    #[cfg(windows)]
    {
        let tokens: Vec<(&'static str, i64)> = std::mem::take(&mut *lock(&tab.tokens));
        let id2 = id.to_string();
        if let Err(e) = tab.webview.with_webview(move |pwv| unsafe { detach_handlers(&pwv, &id2, &tokens) }) {
            report_error(app, id, "with_webview (detach)", e);
        }
    }
    #[cfg(windows)]
    {
        // Runde 4: offene Berechtigungsanfragen dieses Tabs ablehnen
        let (app2, id3) = (app.clone(), id.to_string());
        if let Err(e) = app.run_on_main_thread(move || privacy::cancel_pending_for(&app2, &id3)) { tracing::warn!("cancel permissions: {e}"); }
    }
    extensions::forget(tab.webview.label());
    if let Err(e) = tab.webview.close() { report_error(app, id, "close", e); }
}

#[tauri::command]
fn get_blocked_count() -> u64 { BLOCKED.load(Ordering::Relaxed) }

#[tauri::command]
fn list_tabs(app: AppHandle) -> Vec<TabInfo> { snapshot_tabs(&app) }

/// async: Webview-Erzeugung in einem synchronen Command kann unter Windows deadlocken.
#[tauri::command]
async fn new_tab(app: AppHandle, url: String) -> Result<String, String> {
    create_tab(&app, &url).inspect_err(|e| report_error(&app, "", "new_tab", e))
}

#[tauri::command]
fn close_tab(app: AppHandle, id: String) -> Result<(), String> {
    let (removed, wake) = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        let removed = m.tabs.remove(&id);
        let slept = m.sleeping.remove(&id).is_some();
        if removed.is_none() && !slept { return Err(format!("Tab {id} nicht gefunden")); }
        let pos = m.order.iter().position(|t| t == &id);
        if let Some(p) = pos { m.order.remove(p); }
        if m.active.as_deref() == Some(id.as_str()) {
            let next = pos.and_then(|p| m.order.get(p.min(m.order.len().saturating_sub(1))).cloned());
            m.active = next.or_else(|| m.order.last().cloned());
        }
        // Runde 3: neuer aktiver Tab schlaeft -> aufwecken
        let wake = m.active.clone().filter(|a| m.sleeping.contains_key(a));
        (removed, wake)
    };
    if let Some(tab) = removed { destroy_webview(&app, &id, tab); }
    apply_layout(&app);
    emit_tabs_changed(&app);
    if let Some(w) = wake { schedule_wake(&app, w); }
    Ok(())
}

/// Runde 3 (Tab-Schlaf): Webview eines inaktiven Tabs zerstoeren; URL/Titel bleiben erhalten.
/// Nie fuer den aktiven oder einen Audio abspielenden Tab (angeheftete filtert die UI).
#[tauri::command]
fn sleep_tab(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_tab_id(&id) { return Err(format!("ungueltige Tab-ID '{id}'")); }
    let tab = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        if m.active.as_deref() == Some(id.as_str()) { return Err("aktiver Tab wird nicht schlafen gelegt".into()); }
        let playing = m.tabs.get(&id).map(|t| t.playing_audio.load(Ordering::Relaxed)).ok_or_else(|| format!("Tab {id} nicht gefunden"))?;
        if playing { return Err(format!("Tab {id} spielt Audio")); }
        let Some(t) = m.tabs.remove(&id) else { return Err(format!("Tab {id} nicht gefunden")); };
        let info = SleepInfo { url: lock(&t.url).clone(), title: lock(&t.title).clone(), waking: false };
        m.sleeping.insert(id.clone(), info);
        t
    };
    tracing::info!(tab = id.as_str(), "Tab schlaeft");
    destroy_webview(&app, &id, tab);
    emit_tabs_changed(&app);
    Ok(())
}

#[tauri::command]
fn switch_tab(app: AppHandle, id: String) -> Result<(), String> {
    let wake = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        let sleeping = m.sleeping.contains_key(&id);
        if !m.tabs.contains_key(&id) && !sleeping { return Err(format!("Tab {id} nicht gefunden")); }
        m.active = Some(id.clone());
        sleeping
    };
    apply_layout(&app);
    emit_tabs_changed(&app);
    if wake { schedule_wake(&app, id); }
    Ok(())
}

#[tauri::command]
fn navigate_active(app: AppHandle, url: String) -> Result<String, String> {
    let parsed = normalize_url(&url)?;
    let Some((id, tab)) = active_tab(&app) else {
        // kein Tab offen -> neuen anlegen ist hier nicht erlaubt (sync command), UI ruft new_tab
        return Err("kein aktiver Tab".into());
    };
    tracing::info!(tab = id.as_str(), "navigate {parsed}");
    tab.webview.navigate(parsed.clone()).map_err(|e| { report_error(&app, &id, "navigate", &e); e.to_string() })?;
    Ok(parsed.to_string())
}

#[tauri::command]
fn reload_active(app: AppHandle) -> Result<(), String> {
    let Some((id, tab)) = active_tab(&app) else { return Err("kein aktiver Tab".into()); };
    let current = lock(&tab.url).clone();
    let parsed = normalize_url(&current)?;
    tracing::info!(tab = id.as_str(), "reload {parsed}");
    tab.webview.navigate(parsed).map_err(|e| { report_error(&app, &id, "reload", &e); e.to_string() })
}

// ---------- Etappe G: neue Commands ----------

/// Fuehrt ein festes (nicht vom Nutzer kommendes) Script in der aktiven Content-Webview aus.
/// (Unter Windows ungenutzt – dort laufen go_back/go_forward/stop nativ.)
#[cfg_attr(windows, allow(dead_code))]
fn eval_active(app: &AppHandle, what: &str, js: &str) -> Result<(), String> {
    let Some((id, tab)) = active_tab(app) else { return Err("kein aktiver Tab".into()); };
    tracing::info!(tab = id.as_str(), "{what}");
    tab.webview.eval(js).map_err(|e| { report_error(app, &id, what, &e); e.to_string() })
}

/// Etappe CD: native WebView2-Aktion auf der aktiven Content-Webview (GoBack/GoForward/Stop).
#[cfg(windows)]
fn native_active(app: &AppHandle, what: &'static str) -> Result<(), String> {
    let Some((id, tab)) = active_tab(app) else { return Err("kein aktiver Tab".into()); };
    if what == "stop" { tab.user_stopped.store(true, Ordering::SeqCst); }
    tracing::info!(tab = id.as_str(), "{what} (nativ)");
    let (app2, id2) = (app.clone(), id.clone());
    tab.webview.with_webview(move |pwv| {
        use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
        use windows::core::Interface;
        let r = unsafe { pwv.controller().CoreWebView2() }.and_then(|c| c.cast::<SYS::ICoreWebView2>()).and_then(|core| unsafe {
            match what { "back" => core.GoBack(), "forward" => core.GoForward(), _ => core.Stop() }
        });
        if let Err(e) = r { report_error(&app2, &id2, what, e); }
    }).map_err(|e| { report_error(app, &id, what, &e); e.to_string() })
}

#[cfg(windows)]
#[tauri::command]
fn go_back(app: AppHandle) -> Result<(), String> { native_active(&app, "back") }
#[cfg(windows)]
#[tauri::command]
fn go_forward(app: AppHandle) -> Result<(), String> { native_active(&app, "forward") }
#[cfg(windows)]
#[tauri::command]
fn stop_active(app: AppHandle) -> Result<(), String> { native_active(&app, "stop") }

#[cfg(not(windows))]
#[tauri::command]
fn go_back(app: AppHandle) -> Result<(), String> { eval_active(&app, "go_back", "history.back()") }
#[cfg(not(windows))]
#[tauri::command]
fn go_forward(app: AppHandle) -> Result<(), String> { eval_active(&app, "go_forward", "history.forward()") }
#[cfg(not(windows))]
#[tauri::command]
fn stop_active(app: AppHandle) -> Result<(), String> { eval_active(&app, "stop", "window.stop()") }

/// Aktive Content-Webview zeigen/verstecken (interne Seiten jtech://..., Menues, Dialoge).
#[tauri::command]
fn set_content_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let changed = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        let c = m.content_visible != visible;
        m.content_visible = visible;
        c
    };
    if changed { apply_layout(&app); }
    Ok(())
}

/// Neue Reihenfolge der Tabs (Drag & Drop). Muss genau dieselben IDs enthalten.
#[tauri::command]
fn reorder_tabs(app: AppHandle, order: Vec<String>) -> Result<(), String> {
    {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        if order.len() != m.order.len() { return Err("Reihenfolge: falsche Anzahl".into()); }
        let mut a = order.clone(); a.sort();
        let mut b = m.order.clone(); b.sort();
        if a != b { return Err("Reihenfolge: unbekannte oder doppelte IDs".into()); }
        m.order = order;
    }
    emit_tabs_changed(&app);
    Ok(())
}

/// Port (Audio-Hub): Tab-ID pruefen – nur bekannte IDs der Form "content-<zahl>".
pub fn valid_tab_id(id: &str) -> bool {
    id.len() <= 32 && id.strip_prefix("content-").is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
}

/// Port (Audio-Hub): Tab stumm/laut schalten (WebView2 ICoreWebView2_8::SetIsMuted).
#[tauri::command]
fn set_tab_muted(app: AppHandle, id: String, muted: bool) -> Result<(), String> {
    if !valid_tab_id(&id) { return Err(format!("ungueltige Tab-ID '{id}'")); }
    let tab = {
        let state = app.state::<Mutex<TabManager>>();
        let m = lock(&state);
        m.tabs.get(&id).cloned().ok_or_else(|| format!("Tab {id} nicht gefunden"))?
    };
    #[cfg(windows)]
    {
        let (app2, id2, flag) = (app.clone(), id.clone(), tab.muted.clone());
        tab.webview.with_webview(move |pwv| {
            use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
            use windows::core::Interface;
            let r = unsafe { pwv.controller().CoreWebView2() }
                .and_then(|c| c.cast::<SYS::ICoreWebView2_8>())
                .and_then(|c8| unsafe { c8.SetIsMuted(muted.into()) });
            match r {
                Ok(()) => { flag.store(muted, Ordering::Relaxed); tracing::info!(tab = id2.as_str(), "muted={muted}"); }
                Err(e) => report_error(&app2, &id2, "SetIsMuted (WebView2 >= 1.0.1072 noetig)", e),
            }
        }).map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    { let _ = (tab, muted); return Err("Stummschalten nur unter Windows/WebView2".into()); }
    #[cfg(windows)]
    { emit_tabs_changed(&app); Ok(()) }
}


// ---------- Runde 3: Zoom, Suchen, Drucken ----------

fn tab_by_id(app: &AppHandle, id: &str) -> Result<Tab, String> {
    if !valid_tab_id(id) { return Err(format!("ungueltige Tab-ID '{id}'")); }
    let state = app.state::<Mutex<TabManager>>();
    let m = lock(&state);
    m.tabs.get(id).cloned().ok_or_else(|| format!("Tab {id} nicht gefunden"))
}

pub const ZOOM_MIN: f64 = 0.25;
pub const ZOOM_MAX: f64 = 5.0;
pub fn valid_zoom(f: f64) -> bool { f.is_finite() && (ZOOM_MIN..=ZOOM_MAX).contains(&f) }

/// Zoomfaktor eines Tabs (Tauri Webview::set_zoom -> WebView2 Controller.SetZoomFactor).
#[tauri::command]
fn set_tab_zoom(app: AppHandle, id: String, factor: f64) -> Result<(), String> {
    if !valid_zoom(factor) { return Err(format!("ungueltiger Zoom {factor}")); }
    let tab = tab_by_id(&app, &id)?;
    tab.webview.set_zoom(factor).map_err(|e| { report_error(&app, &id, "set_zoom", &e); e.to_string() })
}

pub const FIND_MAX_LEN: usize = 300;

/// Script fuer die Seitensuche. `query` wird als JSON-String eingebettet (kein Code-Einschleusen).
pub fn find_script(query: &str, backwards: bool, case_sensitive: bool) -> String {
    let q = serde_json::to_string(query).unwrap_or_else(|_| "\"\"".into());
    format!(r#"(function(q,back,cs){{
  try {{
    var sel = window.getSelection();
    if (!q) {{ if (sel) sel.removeAllRanges(); return {{count:0,found:false}}; }}
    var text = (document.body && document.body.innerText) || "";
    var hay = cs ? text : text.toLowerCase(), needle = cs ? q : q.toLowerCase();
    var count = 0, pos = 0;
    while (count < 9999) {{ var i = hay.indexOf(needle, pos); if (i < 0) break; count++; pos = i + needle.length; }}
    var found = count > 0 && window.find(q, cs, back, true, false, false, false);
    return {{count:count,found:!!found}};
  }} catch (e) {{ return {{count:0,found:false}}; }}
}})({q},{backwards},{case_sensitive})"#)
}

/// Seitensuche in der aktiven Webview (window.find per ExecuteScript). Leerer Begriff = Markierung aufheben.
/// Ergebnis kommt als tab-event "find-result" (count, isSuccess = gefunden).
#[tauri::command]
fn find_in_page(app: AppHandle, query: String, backwards: bool, case_sensitive: bool) -> Result<(), String> {
    if query.chars().count() > FIND_MAX_LEN { return Err("Suchbegriff zu lang".into()); }
    if query.chars().any(|c| c == '\0') { return Err("ungueltiger Suchbegriff".into()); }
    let Some((id, tab)) = active_tab(&app) else { return Err("kein aktiver Tab".into()); };
    let js = find_script(&query, backwards, case_sensitive);
    #[cfg(windows)]
    {
        let (app2, id2) = (app.clone(), id.clone());
        tab.webview.with_webview(move |pwv| {
            use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
            use windows::core::{Interface, PCWSTR};
            let core = match unsafe { pwv.controller().CoreWebView2() }.and_then(|c| c.cast::<SYS::ICoreWebView2>()) {
                Ok(c) => c,
                Err(e) => { report_error(&app2, &id2, "find: CoreWebView2", e); return; }
            };
            let wide: Vec<u16> = js.encode_utf16().chain(std::iter::once(0)).collect();
            let (app3, id3) = (app2.clone(), id2.clone());
            let h = webview2_com::ExecuteScriptCompletedHandler::create(Box::new(move |res, json| {
                let _ = &res;
                let v: serde_json::Value = serde_json::from_str(&json).unwrap_or(serde_json::Value::Null);
                let count = v.get("count").and_then(|c| c.as_u64()).unwrap_or(0).min(9999) as u32;
                let found = v.get("found").and_then(|f| f.as_bool()).unwrap_or(false);
                emit_tab(&app3, TabEvent { tab_id: id3.clone(), kind: "find-result".into(), count: Some(count), is_success: Some(found), ..Default::default() });
                Ok(())
            }));
            let r = h.cast::<SYS::ICoreWebView2ExecuteScriptCompletedHandler>()
                .and_then(|h| unsafe { core.ExecuteScript(PCWSTR(wide.as_ptr()), &h) });
            if let Err(e) = r { report_error(&app2, &id2, "find: ExecuteScript", e); }
        }).map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    { tab.webview.eval(&js).map_err(|e| e.to_string()) }
}

/// Drucken: WebView2-Druckdialog (ICoreWebView2_16::ShowPrintUI), Rueckfall window.print().
#[tauri::command]
fn print_active(app: AppHandle) -> Result<(), String> {
    let Some((id, tab)) = active_tab(&app) else { return Err("kein aktiver Tab".into()); };
    #[cfg(windows)]
    {
        let (app2, id2, wv) = (app.clone(), id.clone(), tab.webview.clone());
        tab.webview.with_webview(move |pwv| {
            use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
            use windows::core::Interface;
            let r = unsafe { pwv.controller().CoreWebView2() }
                .and_then(|c| c.cast::<SYS::ICoreWebView2_16>())
                .and_then(|c16| unsafe { c16.ShowPrintUI(SYS::COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER) });
            if let Err(e) = r {
                tracing::warn!(tab = id2.as_str(), "ShowPrintUI nicht verfuegbar ({e}) – window.print()");
                if let Err(e) = wv.eval("window.print()") { report_error(&app2, &id2, "print", e); }
            }
        }).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    { let _ = id; tab.webview.eval("window.print()").map_err(|e| e.to_string()) }
}

// ---------- Runde 3: Downloads ----------

#[derive(Clone, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DownloadInfo {
    id: u64,
    tab_id: String,
    url: String,
    path: String,
    file_name: String,
    received: i64,
    /// -1 = unbekannt
    total: i64,
    /// progressing | interrupted | completed
    state: String,
    paused: bool,
    can_resume: bool,
    interrupt_reason: i32,
    started_at: u64,
}

static DOWNLOADS: Mutex<Vec<DownloadInfo>> = Mutex::new(Vec::new());
static DL_COUNTER: AtomicU64 = AtomicU64::new(0);
const DL_KEEP: usize = 300;

#[cfg(windows)]
thread_local! {
    /// COM-Objekte nur auf dem UI-Thread (dort laufen alle WebView2-Callbacks).
    static DL_OPS: RefCell<HashMap<u64, webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2DownloadOperation>> = RefCell::new(HashMap::new());
    static DL_LAST_EMIT: RefCell<HashMap<u64, std::time::Instant>> = RefCell::new(HashMap::new());
}

fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

fn emit_download(app: &AppHandle, d: &DownloadInfo) {
    if let Err(e) = app.emit("download-event", d.clone()) { tracing::error!("emit download-event: {e}"); }
}

/// Liest den Zustand der DownloadOperation, aktualisiert DOWNLOADS und meldet ihn der UI
/// (Fortschritt hoechstens alle 250 ms, Zustandswechsel immer).
#[cfg(windows)]
unsafe fn refresh_download(app: &AppHandle, id: u64, op: &webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2DownloadOperation, force: bool) {
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    let mut received = 0i64;
    let _ = unsafe { op.BytesReceived(&mut received) };
    let mut total = 0i64;
    let _ = unsafe { op.TotalBytesToReceive(&mut total) };
    let mut st = SYS::COREWEBVIEW2_DOWNLOAD_STATE::default();
    let _ = unsafe { op.State(&mut st) };
    let mut reason = SYS::COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON::default();
    let _ = unsafe { op.InterruptReason(&mut reason) };
    let mut can = Default::default();
    let _ = unsafe { op.CanResume(&mut can) };
    let can: bool = can.as_bool();
    let state = match st {
        SYS::COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED => "completed",
        SYS::COREWEBVIEW2_DOWNLOAD_STATE_INTERRUPTED => "interrupted",
        _ => "progressing",
    };
    if !force && state == "progressing" {
        let now = std::time::Instant::now();
        let skip = DL_LAST_EMIT.with(|m| {
            let mut m = m.borrow_mut();
            let last = m.get(&id).copied();
            if let Some(t) = last { if now.duration_since(t).as_millis() < 250 { return true; } }
            m.insert(id, now);
            false
        });
        if skip { return; }
    }
    let snapshot = {
        let mut list = lock(&DOWNLOADS);
        let Some(d) = list.iter_mut().find(|d| d.id == id) else { return };
        d.received = received;
        d.total = total;
        d.state = state.into();
        d.can_resume = can;
        d.interrupt_reason = reason.0;
        if state != "interrupted" { d.paused = false; }
        // COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON_USER_PAUSED = 28 (laut WebView2-Header; unsicher)
        if state == "interrupted" && reason.0 == 28 { d.paused = true; }
        d.clone()
    };
    if state == "completed" {
        DL_OPS.with(|m| { m.borrow_mut().remove(&id); });
        DL_LAST_EMIT.with(|m| { m.borrow_mut().remove(&id); });
        tracing::info!("Download #{id} fertig: {}", snapshot.path);
    }
    emit_download(app, &snapshot);
}

#[tauri::command]
fn list_downloads() -> Vec<DownloadInfo> { lock(&DOWNLOADS).clone() }

/// pause | resume | cancel fuer einen laufenden Download.
#[tauri::command]
fn download_action(app: AppHandle, id: u64, action: String) -> Result<(), String> {
    if !matches!(action.as_str(), "pause" | "resume" | "cancel") { return Err(format!("unbekannte Aktion '{action}'")); }
    if !lock(&DOWNLOADS).iter().any(|d| d.id == id) { return Err(format!("Download {id} unbekannt")); }
    #[cfg(windows)]
    {
        let app2 = app.clone();
        app.run_on_main_thread(move || {
            let Some(op) = DL_OPS.with(|m| m.borrow().get(&id).cloned()) else {
                report_error(&app2, "", "Download", format!("Download {id} ist nicht mehr aktiv"));
                return;
            };
            let r = unsafe { match action.as_str() { "pause" => op.Pause(), "resume" => op.Resume(), _ => op.Cancel() } };
            match r {
                Ok(()) => {
                    if let Some(d) = lock(&DOWNLOADS).iter_mut().find(|d| d.id == id) { d.paused = action == "pause"; }
                    tracing::info!("Download #{id}: {action}");
                    unsafe { refresh_download(&app2, id, &op, true) };
                    // refresh setzt paused bei "interrupted" nicht zurueck; bei pause erneut melden
                    if action == "pause" { if let Some(d) = lock(&DOWNLOADS).iter().find(|d| d.id == id).cloned() { emit_download(&app2, &d); } }
                }
                Err(e) => report_error(&app2, "", &format!("Download {action}"), e),
            }
        }).map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    { let _ = app; Err("Downloads nur unter Windows/WebView2".into()) }
}

/// Pfad muss existieren und (kanonisch) im Download-Ordner liegen.
fn validated_download_path(app: &AppHandle, raw: &str) -> Result<PathBuf, String> {
    let dir = app.path().download_dir().map_err(|e| format!("Download-Ordner: {e}"))?;
    let dir = std::fs::canonicalize(&dir).map_err(|e| format!("Download-Ordner: {e}"))?;
    let p = std::fs::canonicalize(raw).map_err(|e| format!("Datei nicht gefunden: {e}"))?;
    if !p.starts_with(&dir) { return Err("Datei liegt nicht im Download-Ordner".into()); }
    Ok(p)
}

fn display_path(p: &Path) -> String {
    let s = p.to_string_lossy().to_string();
    s.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(s)
}

/// Dateitypen, die nicht per Klick gestartet werden (nur "Im Ordner zeigen").
pub fn is_risky_extension(path: &str) -> bool {
    const RISKY: &[&str] = &["exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "lnk", "reg", "jar", "cpl", "msc", "pif", "appx", "msix"];
    Path::new(path).extension().and_then(|e| e.to_str()).map(|e| RISKY.contains(&e.to_ascii_lowercase().as_str())).unwrap_or(false)
}

/// reveal = true: Explorer mit markierter Datei; sonst Datei mit Standardprogramm oeffnen.
#[tauri::command]
fn open_download(app: AppHandle, id: u64, reveal: bool) -> Result<(), String> {
    let (path, state) = lock(&DOWNLOADS).iter().find(|d| d.id == id).map(|d| (d.path.clone(), d.state.clone())).ok_or_else(|| format!("Download {id} unbekannt"))?;
    if !reveal && state != "completed" { return Err("Download ist noch nicht fertig".into()); }
    let p = validated_download_path(&app, &path)?;
    let shown = display_path(&p);
    if reveal {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("explorer").raw_arg(format!("/select,\"{shown}\"")).spawn().map_err(|e| format!("explorer: {e}"))?;
            return Ok(());
        }
        #[cfg(not(windows))]
        { return Err(format!("Ordner anzeigen nur unter Windows ({shown})")); }
    }
    if is_risky_extension(&shown) { return Err("Programme/Skripte werden nicht direkt gestartet – bitte „Im Ordner zeigen“ verwenden".into()); }
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_path(shown, None::<&str>).map_err(|e| format!("oeffnen: {e}"))
}

#[tauri::command]
fn set_adblock_enabled(enabled: bool) { ADBLOCK_ENABLED.store(enabled, Ordering::Relaxed); tracing::info!("Adblock aktiv: {enabled}"); }

/// React meldet seine echte Layout-Hoehe (Toolbar) und Sidebar-Breite in CSS-/logischen Pixeln.
#[tauri::command]
fn set_layout(app: AppHandle, top_height: f64, sidebar_width: Option<f64>) -> Result<(), String> {
    if !top_height.is_finite() || top_height < 0.0 { return Err(format!("ungueltige Hoehe {top_height}")); }
    let changed = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        let th = top_height.clamp(24.0, 600.0).ceil();
        let sw = sidebar_width.filter(|v| v.is_finite()).map(|v| v.clamp(0.0, 800.0)).unwrap_or(m.sidebar_width);
        let changed = th != m.top_height || sw != m.sidebar_width;
        m.top_height = th;
        m.sidebar_width = sw;
        changed
    };
    if changed { apply_layout(&app); }
    Ok(())
}

/// Runde 4: Kosmetische Filter – Script ausfuehren (optional mit Ergebnis-Callback).
#[cfg(windows)]
fn exec_script(core: &webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2, js: &str, cb: Option<Box<dyn FnOnce(String) + 'static>>) {
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    use windows::core::{Interface, PCWSTR};
    let wide: Vec<u16> = js.encode_utf16().chain(std::iter::once(0)).collect();
    let h = webview2_com::ExecuteScriptCompletedHandler::create(Box::new(move |_res, json| {
        if let Some(cb) = cb { cb(json); }
        Ok(())
    }));
    let r = h.cast::<SYS::ICoreWebView2ExecuteScriptCompletedHandler>().and_then(|h| unsafe { core.ExecuteScript(PCWSTR(wide.as_ptr()), &h) });
    if let Err(e) = r { tracing::warn!("ExecuteScript (kosmetisch): {e}"); }
}

/// Runde 4: Element-Hiding per eingefuegtem Stylesheet (adblock url_cosmetic_resources +
/// hidden_class_id_selectors, ein Durchlauf bei DOMContentLoaded – kein MutationObserver, keine Scriptlets).
#[cfg(windows)]
fn inject_cosmetic(core: &webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2, url: &str) {
    let Some(c) = filters::cosmetic_for(url) else { return };
    if !c.css.is_empty() { exec_script(core, &filters::style_script(&c.css, "jtech-cosmetic"), None); }
    if c.generichide { return; }
    let core2 = core.clone();
    let exceptions = c.exceptions;
    exec_script(core, filters::COLLECT_CLASS_ID_JS, Some(Box::new(move |json| {
        let v: serde_json::Value = serde_json::from_str(&json).unwrap_or(serde_json::Value::Null);
        let take = |k: &str| -> Vec<String> {
            v.get(k).and_then(|a| a.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).take(3000).collect()).unwrap_or_default()
        };
        let css = filters::class_id_css(&take("c"), &take("i"), &exceptions);
        if !css.is_empty() { exec_script(&core2, &filters::style_script(&css, "jtech-cosmetic-generic"), None); }
    })));
}

// ---------- WebView2 COM ----------

#[cfg(windows)]
unsafe fn attach_handlers(pwv: &tauri::webview::PlatformWebview, app: &AppHandle, tab_id: &str, tab: &Tab) -> Result<(), String> {
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    use windows::core::{Interface, PCWSTR, PWSTR};
    use webview2_com::take_pwstr;

    let controller = pwv.controller();
    let mut rect = windows::Win32::Foundation::RECT::default();
    match unsafe { controller.Bounds(&mut rect) } {
        Ok(()) => tracing::info!(tab = tab_id, "Controller da, Bounds physisch l={} t={} r={} b={}", rect.left, rect.top, rect.right, rect.bottom),
        Err(e) => tracing::warn!(tab = tab_id, "Controller.Bounds: {e}"),
    }
    emit_tab(app, TabEvent { tab_id: tab_id.into(), kind: "controller-ready".into(), detail: Some(format!("physisch {}x{}", rect.right - rect.left, rect.bottom - rect.top)), ..Default::default() });

    let hl_core = unsafe { controller.CoreWebView2() }.map_err(|e| format!("CoreWebView2: {e}"))?;
    let core: SYS::ICoreWebView2 = hl_core.cast().map_err(|e| format!("cast ICoreWebView2: {e}"))?;
    let tokens = tab.tokens.clone();
    let push = |name: &'static str, tok: i64| lock(&tokens).push((name, tok));

    // NavigationStarting: Top-Level-URL merken (Quelle fuer Adblock + Adressleiste)
    {
        let (app, id, url, latest, stopped) = (app.clone(), tab_id.to_string(), tab.url.clone(), tab.nav_id.clone(), tab.user_stopped.clone());
        let h = webview2_com::NavigationStartingEventHandler::create(Box::new(move |_s, args| {
            let Some(args) = args else { return Ok(()) };
            let mut p = PWSTR::null();
            unsafe { args.Uri(&mut p)? };
            let uri = take_pwstr(p);
            let mut nav_id = 0u64;
            let _ = unsafe { args.NavigationId(&mut nav_id) };
            *lock(&url) = uri.clone();
            latest.store(nav_id, Ordering::SeqCst);
            stopped.store(false, Ordering::SeqCst);
            tracing::info!(tab = id.as_str(), "NavigationStarting #{nav_id} {uri}");
            emit_tab(&app, TabEvent { tab_id: id.clone(), kind: "navigation-starting".into(), url: Some(uri), navigation_id: Some(nav_id), ..Default::default() });
            Ok(())
        }));
        let h: SYS::ICoreWebView2NavigationStartingEventHandler = h.cast().map_err(|e| format!("cast NavigationStarting: {e}"))?;
        let mut tok = 0i64;
        unsafe { core.add_NavigationStarting(&h, &mut tok) }.map_err(|e| format!("add_NavigationStarting: {e}"))?;
        push("NavigationStarting", tok);
    }

    // NavigationCompleted: IsSuccess + WebErrorStatus
    {
        let (app, id, url, latest, stopped) = (app.clone(), tab_id.to_string(), tab.url.clone(), tab.nav_id.clone(), tab.user_stopped.clone());
        let h = webview2_com::NavigationCompletedEventHandler::create(Box::new(move |_s, args| {
            let Some(args) = args else { return Ok(()) };
            let mut ok = Default::default();
            unsafe { args.IsSuccess(&mut ok)? };
            let ok: bool = ok.as_bool();
            let mut status = SYS::COREWEBVIEW2_WEB_ERROR_STATUS::default();
            let _ = unsafe { args.WebErrorStatus(&mut status) };
            let mut nav_id = 0u64;
            let _ = unsafe { args.NavigationId(&mut nav_id) };
            let stale = nav_id != 0 && nav_id != latest.load(Ordering::SeqCst);
            let benign = !ok && is_benign_abort(status.0, stale, stopped.load(Ordering::SeqCst));
            let current = lock(&url).clone();
            let name = web_error_name(status.0);
            if ok { tracing::info!(tab = id.as_str(), "NavigationCompleted #{nav_id} ok {current}"); }
            else if benign { tracing::info!(tab = id.as_str(), "NavigationCompleted #{nav_id} abgebrochen {name} ({}) stale={stale} – ignoriert", status.0); }
            else { tracing::error!(tab = id.as_str(), "NavigationCompleted #{nav_id} FEHLER {name} ({}) {current}", status.0); }
            emit_tab(&app, TabEvent {
                tab_id: id.clone(), kind: "navigation-completed".into(), url: Some(current),
                is_success: Some(ok), web_error_status: Some(status.0),
                error_name: if ok { None } else { Some(name.into()) },
                navigation_id: Some(nav_id), stale: Some(stale), benign: Some(benign), ..Default::default()
            });
            Ok(())
        }));
        let h: SYS::ICoreWebView2NavigationCompletedEventHandler = h.cast().map_err(|e| format!("cast NavigationCompleted: {e}"))?;
        let mut tok = 0i64;
        unsafe { core.add_NavigationCompleted(&h, &mut tok) }.map_err(|e| format!("add_NavigationCompleted: {e}"))?;
        push("NavigationCompleted", tok);
    }

    // SourceChanged: echte aktuelle URL (auch bei pushState / Fragment)
    {
        let (app, id, url) = (app.clone(), tab_id.to_string(), tab.url.clone());
        let h = webview2_com::SourceChangedEventHandler::create(Box::new(move |sender, _args| {
            let Some(sender) = sender else { return Ok(()) };
            let mut p = PWSTR::null();
            unsafe { sender.Source(&mut p)? };
            let src = take_pwstr(p);
            *lock(&url) = src.clone();
            tracing::info!(tab = id.as_str(), "SourceChanged {src}");
            emit_tab(&app, TabEvent { tab_id: id.clone(), kind: "source-changed".into(), url: Some(src), ..Default::default() });
            Ok(())
        }));
        let h: SYS::ICoreWebView2SourceChangedEventHandler = h.cast().map_err(|e| format!("cast SourceChanged: {e}"))?;
        let mut tok = 0i64;
        unsafe { core.add_SourceChanged(&h, &mut tok) }.map_err(|e| format!("add_SourceChanged: {e}"))?;
        push("SourceChanged", tok);
    }

    // DocumentTitleChanged
    {
        let (app, id, title) = (app.clone(), tab_id.to_string(), tab.title.clone());
        let h = webview2_com::DocumentTitleChangedEventHandler::create(Box::new(move |sender, _args| {
            let Some(sender) = sender else { return Ok(()) };
            let mut p = PWSTR::null();
            unsafe { sender.DocumentTitle(&mut p)? };
            let t = take_pwstr(p);
            *lock(&title) = t.clone();
            emit_tab(&app, TabEvent { tab_id: id.clone(), kind: "title-changed".into(), title: Some(t), ..Default::default() });
            Ok(())
        }));
        let h: SYS::ICoreWebView2DocumentTitleChangedEventHandler = h.cast().map_err(|e| format!("cast DocumentTitleChanged: {e}"))?;
        let mut tok = 0i64;
        unsafe { core.add_DocumentTitleChanged(&h, &mut tok) }.map_err(|e| format!("add_DocumentTitleChanged: {e}"))?;
        push("DocumentTitleChanged", tok);
    }

    // ProcessFailed
    {
        let (app, id) = (app.clone(), tab_id.to_string());
        let h = webview2_com::ProcessFailedEventHandler::create(Box::new(move |_s, args| {
            let mut kind = SYS::COREWEBVIEW2_PROCESS_FAILED_KIND::default();
            if let Some(args) = args { let _ = unsafe { args.ProcessFailedKind(&mut kind) }; }
            tracing::error!(tab = id.as_str(), "ProcessFailed kind={}", kind.0);
            emit_tab(&app, TabEvent { tab_id: id.clone(), kind: "process-failed".into(), is_success: Some(false), detail: Some(format!("ProcessFailedKind={}", kind.0)), ..Default::default() });
            Ok(())
        }));
        let h: SYS::ICoreWebView2ProcessFailedEventHandler = h.cast().map_err(|e| format!("cast ProcessFailed: {e}"))?;
        let mut tok = 0i64;
        unsafe { core.add_ProcessFailed(&h, &mut tok) }.map_err(|e| format!("add_ProcessFailed: {e}"))?;
        push("ProcessFailed", tok);
    }

    // Port/Spinner-Fix: DOMContentLoaded (ICoreWebView2_2) als Rueckfall fuer das Ladeende.
    match core.cast::<SYS::ICoreWebView2_2>() {
        Ok(core2) => {
            let (app, id, page_url) = (app.clone(), tab_id.to_string(), tab.url.clone());
            let h = webview2_com::DOMContentLoadedEventHandler::create(Box::new(move |sender, args| {
                let mut nav_id = 0u64;
                if let Some(args) = args { let _ = unsafe { args.NavigationId(&mut nav_id) }; }
                tracing::info!(tab = id.as_str(), "DOMContentLoaded #{nav_id}");
                emit_tab(&app, TabEvent { tab_id: id.clone(), kind: "dom-content-loaded".into(), navigation_id: Some(nav_id), ..Default::default() });
                // Runde 4: kosmetische Filter
                if let Some(s) = sender {
                    let u = lock(&page_url).clone();
                    inject_cosmetic(&s, &u);
                    // Runde 5: optional Cursor/Spur in Webseiten (Standard aus)
                    if u.starts_with("http") { if let Some(js) = uifx::page_fx() { exec_script(&s, &js, None); } }
                }
                Ok(())
            }));
            let h: SYS::ICoreWebView2DOMContentLoadedEventHandler = h.cast().map_err(|e| format!("cast DOMContentLoaded: {e}"))?;
            let mut tok = 0i64;
            unsafe { core2.add_DOMContentLoaded(&h, &mut tok) }.map_err(|e| format!("add_DOMContentLoaded: {e}"))?;
            push("DOMContentLoaded", tok);
        }
        Err(e) => tracing::warn!(tab = tab_id, "ICoreWebView2_2 fehlt (kein DOMContentLoaded): {e}"),
    }

    // Port (Audio-Hub): IsDocumentPlayingAudioChanged / IsMutedChanged (ICoreWebView2_8).
    match core.cast::<SYS::ICoreWebView2_8>() {
        Ok(core8) => {
            let emit_audio = {
                let (app, id, playing, muted) = (app.clone(), tab_id.to_string(), tab.playing_audio.clone(), tab.muted.clone());
                move |c8: &SYS::ICoreWebView2_8| -> windows::core::Result<()> {
                    let (mut p, mut m) = (Default::default(), Default::default());
                    unsafe { c8.IsDocumentPlayingAudio(&mut p)?; c8.IsMuted(&mut m)?; }
                    let (p, m): (bool, bool) = (p.as_bool(), m.as_bool());
                    playing.store(p, Ordering::Relaxed);
                    muted.store(m, Ordering::Relaxed);
                    emit_tab(&app, TabEvent { tab_id: id.clone(), kind: "audio-changed".into(), playing_audio: Some(p), muted: Some(m), ..Default::default() });
                    Ok(())
                }
            };
            let _ = emit_audio(&core8);
            let f1 = emit_audio.clone();
            let h = webview2_com::IsDocumentPlayingAudioChangedEventHandler::create(Box::new(move |sender, _args| {
                if let Some(s) = sender { if let Ok(c8) = s.cast::<SYS::ICoreWebView2_8>() { f1(&c8)?; } }
                Ok(())
            }));
            let h: SYS::ICoreWebView2IsDocumentPlayingAudioChangedEventHandler = h.cast().map_err(|e| format!("cast IsDocumentPlayingAudioChanged: {e}"))?;
            let mut tok = 0i64;
            unsafe { core8.add_IsDocumentPlayingAudioChanged(&h, &mut tok) }.map_err(|e| format!("add_IsDocumentPlayingAudioChanged: {e}"))?;
            push("IsDocumentPlayingAudioChanged", tok);
            let f2 = emit_audio;
            let h = webview2_com::IsMutedChangedEventHandler::create(Box::new(move |sender, _args| {
                if let Some(s) = sender { if let Ok(c8) = s.cast::<SYS::ICoreWebView2_8>() { f2(&c8)?; } }
                Ok(())
            }));
            let h: SYS::ICoreWebView2IsMutedChangedEventHandler = h.cast().map_err(|e| format!("cast IsMutedChanged: {e}"))?;
            let mut tok = 0i64;
            unsafe { core8.add_IsMutedChanged(&h, &mut tok) }.map_err(|e| format!("add_IsMutedChanged: {e}"))?;
            push("IsMutedChanged", tok);
        }
        Err(e) => tracing::warn!(tab = tab_id, "ICoreWebView2_8 fehlt (kein Audio-Hub): {e}"),
    }

    // Etappe CD: HistoryChanged -> CanGoBack/CanGoForward an die UI
    {
        let (app, id) = (app.clone(), tab_id.to_string());
        let h = webview2_com::HistoryChangedEventHandler::create(Box::new(move |sender, _args| {
            let Some(sender) = sender else { return Ok(()) };
            let (mut b, mut f) = (Default::default(), Default::default());
            unsafe { sender.CanGoBack(&mut b)?; sender.CanGoForward(&mut f)?; }
            let (b, f): (bool, bool) = (b.as_bool(), f.as_bool());
            emit_tab(&app, TabEvent { tab_id: id.clone(), kind: "history-changed".into(), can_go_back: Some(b), can_go_forward: Some(f), ..Default::default() });
            Ok(())
        }));
        let h: SYS::ICoreWebView2HistoryChangedEventHandler = h.cast().map_err(|e| format!("cast HistoryChanged: {e}"))?;
        let mut tok = 0i64;
        unsafe { core.add_HistoryChanged(&h, &mut tok) }.map_err(|e| format!("add_HistoryChanged: {e}"))?;
        push("HistoryChanged", tok);
    }

    // Etappe CD: NewWindowRequested -> neuer JTech-Tab statt Popup-Fenster. Nicht vom Nutzer
    // ausgeloeste Popups werden verworfen (Popup-Schutz).
    {
        let (app, id) = (app.clone(), tab_id.to_string());
        let h = webview2_com::NewWindowRequestedEventHandler::create(Box::new(move |_s, args| {
            let Some(args) = args else { return Ok(()) };
            let mut p = PWSTR::null();
            unsafe { args.Uri(&mut p)? };
            let uri = take_pwstr(p);
            let mut user = Default::default();
            let _ = unsafe { args.IsUserInitiated(&mut user) };
            let user: bool = user.as_bool();
            unsafe { args.SetHandled(true.into())? };
            if user && (uri.starts_with("http://") || uri.starts_with("https://")) {
                tracing::info!(tab = id.as_str(), "NewWindowRequested -> neuer Tab {uri}");
                let app2 = app.clone();
                // nicht im COM-Callback erzeugen (Reentranz/Deadlock) -> asynchron
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = create_tab(&app2, &uri) { report_error(&app2, "", "Popup-Tab", e); }
                });
            } else {
                tracing::info!(tab = id.as_str(), "Popup blockiert (user={user}) {uri}");
                emit_tab(&app, TabEvent { tab_id: id.clone(), kind: "popup-blocked".into(), url: Some(uri), ..Default::default() });
            }
            Ok(())
        }));
        let h: SYS::ICoreWebView2NewWindowRequestedEventHandler = h.cast().map_err(|e| format!("cast NewWindowRequested: {e}"))?;
        let mut tok = 0i64;
        unsafe { core.add_NewWindowRequested(&h, &mut tok) }.map_err(|e| format!("add_NewWindowRequested: {e}"))?;
        push("NewWindowRequested", tok);
    }

    // Runde 3: Downloads (ICoreWebView2_4::DownloadStarting). Eigene UI statt WebView2-Dialog.
    match core.cast::<SYS::ICoreWebView2_4>() {
        Ok(core4) => {
            let (app, id) = (app.clone(), tab_id.to_string());
            let h = webview2_com::DownloadStartingEventHandler::create(Box::new(move |_s, args| {
                let Some(args) = args else { return Ok(()) };
                let op = unsafe { args.DownloadOperation()? };
                unsafe { args.SetHandled(true.into())? };
                let dl_id = DL_COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
                let mut p = PWSTR::null();
                let _ = unsafe { op.Uri(&mut p) };
                let uri = take_pwstr(p);
                let mut p = PWSTR::null();
                let _ = unsafe { args.ResultFilePath(&mut p) };
                let path = take_pwstr(p);
                let file_name = Path::new(&path).file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_else(|| path.clone());
                tracing::info!(tab = id.as_str(), "DownloadStarting #{dl_id} {uri} -> {path}");
                {
                    let mut list = lock(&DOWNLOADS);
                    list.push(DownloadInfo { id: dl_id, tab_id: id.clone(), url: uri, path, file_name, total: -1, state: "progressing".into(), started_at: now_ms(), ..Default::default() });
                    if list.len() > DL_KEEP { if let Some(i) = list.iter().position(|d| d.state != "progressing") { list.remove(i); } }
                }
                let app_b = app.clone();
                let hb = webview2_com::BytesReceivedChangedEventHandler::create(Box::new(move |sender, _args| {
                    if let Some(op) = sender { unsafe { refresh_download(&app_b, dl_id, &op, false) }; }
                    Ok(())
                }));
                let hb: SYS::ICoreWebView2BytesReceivedChangedEventHandler = hb.cast()?;
                let mut t = 0i64;
                unsafe { op.add_BytesReceivedChanged(&hb, &mut t)? };
                let app_s = app.clone();
                let hs = webview2_com::StateChangedEventHandler::create(Box::new(move |sender, _args| {
                    if let Some(op) = sender { unsafe { refresh_download(&app_s, dl_id, &op, true) }; }
                    Ok(())
                }));
                let hs: SYS::ICoreWebView2StateChangedEventHandler = hs.cast()?;
                let mut t = 0i64;
                unsafe { op.add_StateChanged(&hs, &mut t)? };
                DL_OPS.with(|m| { m.borrow_mut().insert(dl_id, op.clone()); });
                unsafe { refresh_download(&app, dl_id, &op, true) };
                Ok(())
            }));
            let h: SYS::ICoreWebView2DownloadStartingEventHandler = h.cast().map_err(|e| format!("cast DownloadStarting: {e}"))?;
            let mut tok = 0i64;
            unsafe { core4.add_DownloadStarting(&h, &mut tok) }.map_err(|e| format!("add_DownloadStarting: {e}"))?;
            push("DownloadStarting", tok);
        }
        Err(e) => tracing::warn!(tab = tab_id, "ICoreWebView2_4 fehlt (keine Download-Verwaltung): {e}"),
    }

    // Runde 3: ZoomFactorChanged (Strg+Mausrad, eigene set_zoom-Aufrufe) -> UI speichert pro Seite.
    {
        let (app, id) = (app.clone(), tab_id.to_string());
        let ctl: SYS::ICoreWebView2Controller = controller.cast().map_err(|e| format!("cast Controller: {e}"))?;
        let h = webview2_com::ZoomFactorChangedEventHandler::create(Box::new(move |sender, _args| {
            let Some(sender) = sender else { return Ok(()) };
            let mut f = 1.0f64;
            unsafe { sender.ZoomFactor(&mut f)? };
            emit_tab(&app, TabEvent { tab_id: id.clone(), kind: "zoom-changed".into(), zoom: Some(f), ..Default::default() });
            Ok(())
        }));
        let h: SYS::ICoreWebView2ZoomFactorChangedEventHandler = h.cast().map_err(|e| format!("cast ZoomFactorChanged: {e}"))?;
        let mut tok = 0i64;
        unsafe { ctl.add_ZoomFactorChanged(&h, &mut tok) }.map_err(|e| format!("add_ZoomFactorChanged: {e}"))?;
        push("ZoomFactorChanged", tok);
    }

    // Etappe CD: Tastenkuerzel, waehrend die Webseite den Fokus hat.
    {
        let (app, id) = (app.clone(), tab_id.to_string());
        let ctl: SYS::ICoreWebView2Controller = controller.cast().map_err(|e| format!("cast Controller: {e}"))?;
        let h = webview2_com::AcceleratorKeyPressedEventHandler::create(Box::new(move |_s, args| {
            let Some(args) = args else { return Ok(()) };
            let mut kind = SYS::COREWEBVIEW2_KEY_EVENT_KIND::default();
            unsafe { args.KeyEventKind(&mut kind)? };
            if kind != SYS::COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN && kind != SYS::COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN { return Ok(()); }
            let mut vk = 0u32;
            unsafe { args.VirtualKey(&mut vk)? };
            let down = |k: i32| unsafe { windows::Win32::UI::Input::KeyboardAndMouse::GetKeyState(k) } < 0;
            let (ctrl, shift, alt) = (down(0x11), down(0x10), down(0x12));
            // Runde 5: nur Kombinationen, die die UI belegt hat (set_shortcuts), sonst bleibt die Taste bei der Seite.
            if let Some(key) = uifx::forward_key(vk, ctrl, shift, alt) {
                unsafe { args.SetHandled(true.into())? };
                emit_tab(&app, TabEvent { tab_id: id.clone(), kind: "shortcut".into(), key: Some(key), ..Default::default() });
            }
            Ok(())
        }));
        let h: SYS::ICoreWebView2AcceleratorKeyPressedEventHandler = h.cast().map_err(|e| format!("cast AcceleratorKeyPressed: {e}"))?;
        let mut tok = 0i64;
        unsafe { ctl.add_AcceleratorKeyPressed(&h, &mut tok) }.map_err(|e| format!("add_AcceleratorKeyPressed: {e}"))?;
        push("AcceleratorKeyPressed", tok);
    }

    // Runde 4: Website-Berechtigungen (eigene Abfrage-Leiste) + vorgemerktes Loeschen beim Start.
    match unsafe { privacy::attach_permissions(&core, app, tab_id) } {
        Ok(tok) => push("PermissionRequested", tok),
        Err(e) => tracing::warn!(tab = tab_id, "PermissionRequested: {e}"),
    }
    privacy::on_core_ready(&core);
    // Erweiterungen: Content-Scripts (AddScriptToExecuteOnDocumentCreated) fuer diesen Tab.
    extensions::attach(&core, tab.webview.label());

    // Adblock-Filter. Abschaltbar fuer Diagnose: JTECH_NO_ADBLOCK=1
    if std::env::var("JTECH_NO_ADBLOCK").map(|v| v == "1").unwrap_or(false) {
        tracing::warn!(tab = tab_id, "Adblock deaktiviert (JTECH_NO_ADBLOCK=1)");
        return Ok(());
    }
    let sys_env: SYS::ICoreWebView2Environment = pwv.environment().cast().map_err(|e| format!("cast Environment: {e}"))?;
    let wide: Vec<u16> = "*".encode_utf16().chain(std::iter::once(0)).collect();
    unsafe { core.AddWebResourceRequestedFilter(PCWSTR(wide.as_ptr()), SYS::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL) }
        .map_err(|e| format!("AddWebResourceRequestedFilter: {e}"))?;
    let top_url = tab.url.clone();
    let tab_blocked = tab.blocked.clone();
    let handler_hl = webview2_com::WebResourceRequestedEventHandler::create(Box::new(move |_sender, args| {
        let Some(args) = args else { return Ok(()); };
        let request = unsafe { args.Request()? };
        let mut uri_p = PWSTR::null();
        unsafe { request.Uri(&mut uri_p)? };
        let uri = take_pwstr(uri_p);
        if uri.is_empty() { return Ok(()); }
        let mut method_p = PWSTR::null();
        let method = if unsafe { request.Method(&mut method_p) }.is_ok() { take_pwstr(method_p) } else { "GET".to_string() };
        let method = if method.is_empty() { "GET".to_string() } else { method };
        let mut ctx = SYS::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL;
        let _ = unsafe { args.ResourceContext(&mut ctx) };
        let source = lock(&top_url).clone();
        let rtype = match ctx {
            SYS::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT => if is_main_document("document", &uri, &source) { "document" } else { "subdocument" },
            SYS::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET => "stylesheet",
            SYS::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE => "image",
            SYS::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA => "media",
            SYS::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT => "font",
            SYS::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT => "script",
            SYS::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST => "xmlhttprequest",
            SYS::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH => "xmlhttprequest",
            SYS::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_WEBSOCKET => "websocket",
            _ => "other",
        };
        // Hauptdokument nie blockieren.
        if rtype == "document" { return Ok(()); }
        // Runde 4: Seite auf der Allowlist -> Haupt-Engine blockiert nichts
        let main_on = ADBLOCK_ENABLED.load(Ordering::Relaxed) && !(!source.is_empty() && filters::site_allowlisted(&source));
        let source = if source.is_empty() { uri.clone() } else { source };
        let block = main_on && ENGINE.with(|e| {
            e.borrow().as_ref().and_then(|engine| {
                adblock::request::Request::new(&uri, &source, rtype, &method).ok().map(|req| engine.check_network_request(&req).should_block())
            }).unwrap_or(false)
        });
        // Erweiterungen: eigene Regeln (nur auf passenden Seiten, pro Seite abschaltbar).
        let ext_block = if block { None } else { extensions::check_request(&source, &uri, rtype, &method) };
        if let Some(ext_id) = &ext_block { extensions::record_block(ext_id); }
        if block || ext_block.is_some() {
            BLOCKED.fetch_add(1, Ordering::Relaxed);
            tab_blocked.fetch_add(1, Ordering::Relaxed);
            privacy::record_block(&source, &uri);
            let empty: Vec<u16> = vec![0];
            match unsafe { sys_env.CreateWebResourceResponse(None, 204, PCWSTR(empty.as_ptr()), PCWSTR(empty.as_ptr())) } {
                Ok(resp) => { if let Err(e) = unsafe { args.SetResponse(&resp) } { tracing::warn!("SetResponse: {e}"); } }
                Err(e) => tracing::warn!("CreateWebResourceResponse: {e}"),
            }
        }
        Ok(())
    }));
    let handler_sys: SYS::ICoreWebView2WebResourceRequestedEventHandler = handler_hl.cast().map_err(|e| format!("cast WebResourceRequested: {e}"))?;
    let mut tok = 0i64;
    unsafe { core.add_WebResourceRequested(&handler_sys, &mut tok) }.map_err(|e| format!("add_WebResourceRequested: {e}"))?;
    push("WebResourceRequested", tok);
    tracing::info!(tab = tab_id, "WebView2-Handler registriert ({} Tokens)", lock(&tab.tokens).len());
    Ok(())
}

#[cfg(windows)]
unsafe fn detach_handlers(pwv: &tauri::webview::PlatformWebview, tab_id: &str, tokens: &[(&'static str, i64)]) {
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    use windows::core::Interface;
    let core: SYS::ICoreWebView2 = match unsafe { pwv.controller().CoreWebView2() }.and_then(|c| c.cast()) {
        Ok(c) => c,
        Err(e) => { tracing::warn!(tab = tab_id, "detach: CoreWebView2: {e}"); return; }
    };
    for &(name, tok) in tokens {
        let r = unsafe {
            match name {
                "NavigationStarting" => core.remove_NavigationStarting(tok),
                "NavigationCompleted" => core.remove_NavigationCompleted(tok),
                "SourceChanged" => core.remove_SourceChanged(tok),
                "DocumentTitleChanged" => core.remove_DocumentTitleChanged(tok),
                "ProcessFailed" => core.remove_ProcessFailed(tok),
                "WebResourceRequested" => core.remove_WebResourceRequested(tok),
                "HistoryChanged" => core.remove_HistoryChanged(tok),
                "NewWindowRequested" => core.remove_NewWindowRequested(tok),
                "DOMContentLoaded" => core.cast::<SYS::ICoreWebView2_2>().and_then(|c| c.remove_DOMContentLoaded(tok)),
                "IsDocumentPlayingAudioChanged" => core.cast::<SYS::ICoreWebView2_8>().and_then(|c| c.remove_IsDocumentPlayingAudioChanged(tok)),
                "IsMutedChanged" => core.cast::<SYS::ICoreWebView2_8>().and_then(|c| c.remove_IsMutedChanged(tok)),
                "AcceleratorKeyPressed" => match pwv.controller().cast::<SYS::ICoreWebView2Controller>() {
                    Ok(c) => c.remove_AcceleratorKeyPressed(tok),
                    Err(e) => Err(e),
                },
                "ZoomFactorChanged" => match pwv.controller().cast::<SYS::ICoreWebView2Controller>() {
                    Ok(c) => c.remove_ZoomFactorChanged(tok),
                    Err(e) => Err(e),
                },
                "DownloadStarting" => core.cast::<SYS::ICoreWebView2_4>().and_then(|c| c.remove_DownloadStarting(tok)),
                "PermissionRequested" => core.remove_PermissionRequested(tok),
                _ => Ok(()),
            }
        };
        match r {
            Ok(()) => tracing::info!(tab = tab_id, "Handler {name} entfernt"),
            Err(e) => tracing::warn!(tab = tab_id, "remove {name}: {e}"),
        }
    }
}

/// Auto-update: called right before installing. On Windows the updater exits the app via
/// process::exit, so RunEvent::Exit never fires – flush stats / clear-on-exit marker here.
#[tauri::command]
async fn prepare_update_exit() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| { privacy::on_exit(); extensions::flush(); }).await.map_err(|e| e.to_string())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessStat { pid: u32, name: String, memory_bytes: u64, cpu_time_100ns: u64, command_line: String }

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PerformanceStats { total_memory_bytes: u64, processes: Vec<ProcessStat>, tab_count: usize }

#[cfg(windows)]
#[tauri::command]
fn get_performance_stats(app: AppHandle) -> PerformanceStats {
    use windows::Win32::System::Diagnostics::ToolHelp::*;
    use windows::Win32::System::Threading::*;
    use windows::Win32::System::ProcessStatus::*;
    use windows::Win32::Foundation::CloseHandle;

    let tab_count = {
        let state = app.state::<Mutex<TabManager>>();
        let m = lock(&state);
        m.order.len()
    };
    let current_pid = std::process::id();

    // Snapshot aller Prozesse
    let mut parent: std::collections::HashMap<u32, u32> = std::collections::HashMap::new();
    let mut names: std::collections::HashMap<u32, String> = std::collections::HashMap::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).unwrap_or_default();
        let mut pe = PROCESSENTRY32W::default();
        pe.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snap, &mut pe).is_ok() {
            loop {
                let pid = pe.th32ProcessID;
                parent.insert(pid, pe.th32ParentProcessID);
                let name = String::from_utf16_lossy(&pe.szExeFile).trim_end_matches('\0').to_string();
                names.insert(pid, name);
                if Process32NextW(snap, &mut pe).is_err() { break; }
            }
        }
        let _ = CloseHandle(snap);
    }

    // Nachkommen des aktuellen Prozesses sammeln (rekursiv)
    let mut descendants: Vec<u32> = Vec::new();
    let mut stack = vec![current_pid];
    while let Some(p) = stack.pop() {
        for (pid, ppid) in &parent {
            if *ppid == p && *pid != current_pid {
                if !descendants.contains(pid) {
                    descendants.push(*pid);
                    stack.push(*pid);
                }
            }
        }
    }
    // aktuellen Prozess selbst mit aufnehmen
    descendants.insert(0, current_pid);

    let mut processes = Vec::new();
    let mut total = 0u64;
    for pid in &descendants {
        let h = unsafe { OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, *pid) };
        let (mem, cpu) = match h {
            Ok(handle) => {
                let mut pmc = PROCESS_MEMORY_COUNTERS::default();
                pmc.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
                let r = unsafe { GetProcessMemoryInfo(handle, &mut pmc, pmc.cb) };
                let m = if r.is_ok() { pmc.WorkingSetSize as u64 } else { 0 };
                let mut creation = windows::Win32::Foundation::FILETIME::default();
                let mut exit = windows::Win32::Foundation::FILETIME::default();
                let mut kernel = windows::Win32::Foundation::FILETIME::default();
                let mut user = windows::Win32::Foundation::FILETIME::default();
                let c = unsafe { GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) };
                let cpu = if c.is_ok() {
                    let k = ((kernel.dwHighDateTime as u64) << 32) | kernel.dwLowDateTime as u64;
                    let u = ((user.dwHighDateTime as u64) << 32) | user.dwLowDateTime as u64;
                    k + u
                } else { 0 };
                unsafe { let _ = CloseHandle(handle); }
                (m, cpu)
            }
            Err(_) => (0, 0),
        };
        total += mem;
        let name = names.get(pid).cloned().unwrap_or_else(|| "unknown".into());
        let label = if *pid == current_pid { format!("{} (Hauptprozess)", name) } else { name };
        processes.push(ProcessStat {
            pid: *pid,
            name: label,
            memory_bytes: mem,
            cpu_time_100ns: cpu,
            command_line: String::new(),
        });
    }
    processes.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));

    PerformanceStats { total_memory_bytes: total, processes, tab_count }
}

#[cfg(not(windows))]
#[tauri::command]
fn get_performance_stats(app: AppHandle) -> PerformanceStats {
    let tab_count = { let state = app.state::<Mutex<TabManager>>(); let m = lock(&state); m.order.len() };
    PerformanceStats { total_memory_bytes: 0, processes: vec![], tab_count }
}

#[tauri::command]
fn pip_active(app: AppHandle) -> Result<(), String> {
    let Some((_id, tab)) = active_tab(&app) else { return Err("kein aktiver Tab".into()); };
    let js = "(function(){try{var v=document.querySelector('video'); if(!v) return 'no-video'; if(document.pictureInPictureElement){document.exitPictureInPicture(); return 'exit';} v.requestPictureInPicture().catch(function(e){console.error('PiP',e);}); return 'ok';}catch(e){return 'err:'+e;}})()";
    tab.webview.eval(js).map_err(|e| e.to_string())
}

pub fn run() {
    tracing_subscriber::fmt().init();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(TabManager::new()))
        .invoke_handler(tauri::generate_handler![get_blocked_count, list_tabs, new_tab, close_tab, switch_tab, navigate_active, reload_active, set_layout, go_back, go_forward, stop_active, set_content_visible, reorder_tabs, set_adblock_enabled, set_tab_muted, sleep_tab, set_tab_zoom, find_in_page, print_active, list_downloads, download_action, open_download,
            storage::storage_load, storage::storage_set, storage::storage_remove, storage::storage_import,
            filters::filter_status, filters::filter_set_list, filters::filter_set_options, filters::filter_update_now, filters::allowlist_set, filters::allowlist_check,
            privacy::privacy_stats, privacy::privacy_reset_stats, privacy::privacy_get_options, privacy::privacy_set_options,
            privacy::list_cookies, privacy::delete_cookies, privacy::clear_browsing_data,
            privacy::resolve_permission, privacy::list_permissions, privacy::set_permission,
            uifx::set_shortcuts, uifx::set_page_fx,
            extensions::ext_list, extensions::ext_toggle, extensions::ext_site_toggle, extensions::market_fetch, prepare_update_exit, get_performance_stats, pip_active])
        .setup(|app| {
            // Runde 4: SQLite-Persistenz, Statistik, Filterlisten (Cache + Hintergrund-Update).
            let data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("jtech-browser"));
            if let Err(e) = storage::init(&data_dir) { tracing::error!("{e} – UI faellt auf localStorage zurueck"); }
            privacy::start_stats();
            filters::start(app.handle());
            extensions::start(app.handle());

            // Auto-update: signed releases (latest.json on GitHub), relaunch via plugin-process.
            // Permissions are granted to the UI webview only (capabilities/updater.json).
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }

            let window = WindowBuilder::new(app, "main")
                .title("JTech Browser")
                .inner_size(1280.0, 820.0)
                .min_inner_size(640.0, 420.0)
                // Frameless: the UI webview draws its own title area and window controls.
                // On Windows the resize borders and the drop shadow stay available.
                .decorations(false)
                .shadow(true)
                .build()
                .map_err(|e| format!("Fenster: {e}"))?;
            let (w, h) = logical_window_size(&window)?;
            tracing::info!("Fenster logisch {w}x{h}, scale {:?}", window.scale_factor());

            // Etappe G: eine UI-Webview ueber das ganze Fenster. Sie wird zuerst erzeugt,
            // die Content-Webviews liegen danach (z-order) darueber im Content-Rechteck.
            let ui = window.add_child(
                tauri::webview::WebviewBuilder::new("ui", tauri::WebviewUrl::App("index.html".into())),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(w, h),
            ).map_err(|e| format!("ui webview: {e}"))?;

            {
                let state = app.state::<Mutex<TabManager>>();
                let mut m = lock(&state);
                m.window = Some(window.clone());
                m.ui = Some(ui);
            }

            let handle = app.handle().clone();
            window.on_window_event(move |event| match event {
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => apply_layout(&handle),
                _ => {}
            });

            // Erster Tab ausserhalb von setup (Event-Loop laeuft dann schon), Fehler werden gemeldet.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match create_tab(&handle, START_URL) {
                    Ok(id) => tracing::info!("Start-Tab {id} erzeugt"),
                    Err(e) => report_error(&handle, "", "Start-Tab", e),
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Runde 4: Statistik schreiben, Loeschen-beim-Beenden vormerken
            if let tauri::RunEvent::Exit = event { privacy::on_exit(); extensions::flush(); }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounds_subtract_toolbar_and_sidebar() {
        assert_eq!(content_bounds(1200.0, 800.0, 72.0, 220.0), Bounds { x: 220.0, y: 72.0, w: 980.0, h: 728.0 });
        assert_eq!(content_bounds(100.0, 50.0, 72.0, 220.0).w, 1.0);
    }

    #[test]
    fn normalize() {
        assert_eq!(normalize_url("example.com").unwrap().as_str(), "https://example.com/");
        assert_eq!(normalize_url(" https://www.wikipedia.org ").unwrap().as_str(), "https://www.wikipedia.org/");
        assert!(normalize_url("hallo welt").unwrap().as_str().starts_with("https://duckduckgo.com/?q=hallo"));
        assert!(normalize_url("").is_err());
    }

    #[test]
    fn benign_aborts() {
        assert!(is_benign_abort(9, true, false));
        assert!(is_benign_abort(14, false, false));
        assert!(is_benign_abort(9, false, true));
        assert!(!is_benign_abort(9, false, false));
        assert!(!is_benign_abort(13, false, false));
    }

    #[test]
    fn tab_id_validation() {
        assert!(valid_tab_id("content-1"));
        assert!(valid_tab_id("content-42"));
        assert!(!valid_tab_id("content-"));
        assert!(!valid_tab_id("ui"));
        assert!(!valid_tab_id("content-1; drop"));
    }

    #[test]
    fn round3_validation() {
        assert!(valid_zoom(1.0) && valid_zoom(0.25) && valid_zoom(5.0));
        assert!(!valid_zoom(0.1) && !valid_zoom(f64::NAN) && !valid_zoom(f64::INFINITY));
        assert!(is_risky_extension("C:\\x\\setup.EXE"));
        assert!(!is_risky_extension("C:\\x\\bericht.pdf"));
        let js = find_script("a\"); alert(1); //", false, false);
        assert!(js.contains(r#""a\"); alert(1); //""#));
        assert_eq!(shortcut_name(0x46, true, false, false), Some("ctrl+f"));
        assert_eq!(shortcut_name(0xBB, true, true, false), Some("ctrl+plus"));
    }

    #[test]
    fn shortcuts() {
        assert_eq!(shortcut_name(0x54, true, false, false), Some("ctrl+t"));
        assert_eq!(shortcut_name(0x09, true, true, false), Some("ctrl+shift+tab"));
        assert_eq!(shortcut_name(0x54, false, false, false), None);
    }

    #[test]
    fn main_document_never_checked() {
        assert!(is_main_document("document", "https://example.com/", "https://example.com/"));
        assert!(is_main_document("document", "https://example.com/", ""));
        assert!(!is_main_document("document", "https://ads.example.net/frame", "https://example.com/"));
        assert!(!is_main_document("script", "https://example.com/", "https://example.com/"));
    }
}
