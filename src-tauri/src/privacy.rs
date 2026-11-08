// Runde 4: Datenschutz – Statistik (persistiert), Cookies, Browserdaten loeschen, Website-Berechtigungen.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

use crate::{filters, lock, storage, TabManager};

// ---------- Statistik ----------

#[derive(Default)]
struct Pending { sites: HashMap<String, u64>, domains: HashMap<String, u64>, total: u64 }

static PENDING: Mutex<Option<Pending>> = Mutex::new(None);
/// Gesamtzahl aus der Datenbank (bereits geschrieben).
static TOTAL_FLUSHED: AtomicU64 = AtomicU64::new(0);
/// Sitzungs-Zaehler je Seite / Domain (fuer "seit Start").
static SESSION: Mutex<Option<Pending>> = Mutex::new(None);

fn strip_www(h: String) -> String { h.strip_prefix("www.").map(str::to_string).unwrap_or(h) }

/// Aus dem WebResourceRequested-Handler (UI-Thread): nur In-Memory, kein SQLite.
pub fn record_block(top_url: &str, request_uri: &str) {
    let site = filters::host_of(top_url).map(strip_www).unwrap_or_else(|| "(unbekannt)".into());
    let dom = filters::host_of(request_uri).map(strip_www).unwrap_or_else(|| "(unbekannt)".into());
    for m in [&PENDING, &SESSION] {
        let mut g = lock(m);
        let p = g.get_or_insert_with(Pending::default);
        if p.sites.len() < 50_000 || p.sites.contains_key(&site) { *p.sites.entry(site.clone()).or_insert(0) += 1; }
        if p.domains.len() < 50_000 || p.domains.contains_key(&dom) { *p.domains.entry(dom.clone()).or_insert(0) += 1; }
        p.total += 1;
    }
}

/// Zaehler in SQLite schreiben (Hintergrund-Thread oder beim Beenden).
pub fn flush_stats() {
    let Some(p) = lock(&PENDING).take() else { return };
    if p.total == 0 { return; }
    if let Err(e) = storage::stats_add(&p.sites, &p.domains) {
        tracing::warn!("Statistik schreiben: {e}");
        // zurueck in den Puffer
        let mut g = lock(&PENDING);
        let q = g.get_or_insert_with(Pending::default);
        for (k, v) in p.sites { *q.sites.entry(k).or_insert(0) += v; }
        for (k, v) in p.domains { *q.domains.entry(k).or_insert(0) += v; }
        q.total += p.total;
        return;
    }
    let t = TOTAL_FLUSHED.fetch_add(p.total, Ordering::SeqCst) + p.total;
    if let Err(e) = storage::meta_set("stats.total", &t.to_string()) { tracing::warn!("Gesamtzaehler: {e}"); }
}

pub fn start_stats() {
    let t = storage::meta_get("stats.total").and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    TOTAL_FLUSHED.store(t, Ordering::SeqCst);
    load_perm_cache();
    std::thread::spawn(|| loop {
        std::thread::sleep(std::time::Duration::from_secs(20));
        flush_stats();
    });
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Count { name: String, count: u64 }

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyStats {
    lifetime_total: u64,
    session_total: u64,
    top_sites: Vec<Count>,
    top_domains: Vec<Count>,
    session_top_domains: Vec<Count>,
}

fn top(map: &HashMap<String, u64>, n: usize) -> Vec<Count> {
    let mut v: Vec<Count> = map.iter().map(|(k, c)| Count { name: k.clone(), count: *c }).collect();
    v.sort_by(|a, b| b.count.cmp(&a.count).then(a.name.cmp(&b.name)));
    v.truncate(n);
    v
}

#[tauri::command]
pub async fn privacy_stats(limit: Option<u32>) -> Result<PrivacyStats, String> {
    let limit = limit.unwrap_or(20).clamp(1, 200);
    tauri::async_runtime::spawn_blocking(move || {
        flush_stats();
        let conv = |v: Vec<(String, u64)>| v.into_iter().map(|(name, count)| Count { name, count }).collect::<Vec<_>>();
        let top_sites = conv(storage::stats_top("site", limit)?);
        let top_domains = conv(storage::stats_top("domain", limit)?);
        let (session_total, session_top_domains) = {
            let g = lock(&SESSION);
            match g.as_ref() { Some(p) => (p.total, top(&p.domains, limit as usize)), None => (0, Vec::new()) }
        };
        Ok(PrivacyStats { lifetime_total: TOTAL_FLUSHED.load(Ordering::SeqCst), session_total, top_sites, top_domains, session_top_domains })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn privacy_reset_stats() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        *lock(&PENDING) = None;
        *lock(&SESSION) = None;
        TOTAL_FLUSHED.store(0, Ordering::SeqCst);
        storage::stats_reset()
    }).await.map_err(|e| e.to_string())?
}

// ---------- Datenschutz-Optionen ----------

#[derive(Serialize, serde::Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PrivacyOptions { pub clear_cookies_on_exit: bool, pub clear_cache_on_exit: bool }

pub fn options() -> PrivacyOptions { storage::meta_get_json("privacy.options").unwrap_or_default() }

#[tauri::command]
pub fn privacy_get_options() -> PrivacyOptions { options() }

#[tauri::command]
pub fn privacy_set_options(opts: PrivacyOptions) -> Result<(), String> { storage::meta_set_json("privacy.options", &opts) }

/// Beim Beenden: Statistik schreiben; ggf. Loeschen fuer den naechsten Start vormerken
/// (asynchrone WebView2-Aufrufe sind beim Beenden nicht verlaesslich).
pub fn on_exit() {
    flush_stats();
    let o = options();
    if o.clear_cookies_on_exit || o.clear_cache_on_exit {
        let _ = storage::meta_set("privacy.pendingClear", "1");
    }
}

// ---------- WebView2: Hilfen ----------

/// Irgendeine lebende Content-Webview (aktive bevorzugt) – Cookies/Profil gelten profilweit.
fn any_webview(app: &AppHandle) -> Result<tauri::Webview, String> {
    let state = app.state::<Mutex<TabManager>>();
    let m = lock(&state);
    if let Some(t) = m.active.as_ref().and_then(|a| m.tabs.get(a)) { return Ok(t.webview.clone()); }
    m.order.iter().find_map(|id| m.tabs.get(id)).map(|t| t.webview.clone()).ok_or_else(|| "kein geoeffneter Web-Tab (Cookies/Profil brauchen eine WebView2-Instanz)".into())
}

/// Wartet (blockierend, im spawn_blocking) auf ein Ergebnis aus einem WebView2-Callback.
async fn wait<T: Send + 'static>(rx: std::sync::mpsc::Receiver<Result<T, String>>) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(std::time::Duration::from_secs(15)).map_err(|_| "Zeitueberschreitung (WebView2 antwortet nicht)".to_string())?)
        .await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CookieInfo { name: String, domain: String, path: String, expires: f64, http_only: bool, secure: bool, session: bool, same_site: i32 }

/// Normalisiert eine Cookie-Domain (".example.com" -> "example.com").
pub fn cookie_site(domain: &str) -> String { domain.trim_start_matches('.').to_ascii_lowercase() }

/// Gehoert Cookie-Domain `cd` zur Seite `site` (gleich oder Subdomain)?
pub fn cookie_matches(cd: &str, site: &str) -> bool {
    let cd = cookie_site(cd);
    cd == site || cd.ends_with(&format!(".{site}"))
}

#[cfg(windows)]
mod win {
    use super::*;
    use webview2_com::take_pwstr;
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    use windows::core::{Interface, PCWSTR, PWSTR};

    pub fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() }

    pub fn core_of(pwv: &tauri::webview::PlatformWebview) -> windows::core::Result<SYS::ICoreWebView2> {
        unsafe { pwv.controller().CoreWebView2() }.and_then(|c| c.cast::<SYS::ICoreWebView2>())
    }

    pub fn cookie_manager(core: &SYS::ICoreWebView2) -> windows::core::Result<SYS::ICoreWebView2CookieManager> {
        let c2: SYS::ICoreWebView2_2 = core.cast()?;
        unsafe { c2.CookieManager() }
    }

    pub unsafe fn read_cookie(c: &SYS::ICoreWebView2Cookie) -> CookieInfo {
        let s = |f: &dyn Fn(&mut PWSTR) -> windows::core::Result<()>| { let mut p = PWSTR::null(); if f(&mut p).is_ok() { take_pwstr(p) } else { String::new() } };
        let name = s(&|p| unsafe { c.Name(p) });
        let domain = s(&|p| unsafe { c.Domain(p) });
        let path = s(&|p| unsafe { c.Path(p) });
        let mut expires = 0f64;
        let _ = unsafe { c.Expires(&mut expires) };
        let (mut h, mut sec, mut ses) = (Default::default(), Default::default(), Default::default());
        let _ = unsafe { c.IsHttpOnly(&mut h) };
        let _ = unsafe { c.IsSecure(&mut sec) };
        let _ = unsafe { c.IsSession(&mut ses) };
        let mut ss = SYS::COREWEBVIEW2_COOKIE_SAME_SITE_KIND::default();
        let _ = unsafe { c.SameSite(&mut ss) };
        CookieInfo { name, domain, path, expires, http_only: h.as_bool(), secure: sec.as_bool(), session: ses.as_bool(), same_site: ss.0 }
    }

    /// GetCookies(uri) – leerer uri = alle Cookies des Profils. `f` bekommt das Ergebnis auf dem UI-Thread.
    /// Err = Aufruf schon synchron gescheitert (dann wird `f` nicht aufgerufen).
    pub fn get_cookies(
        core: &SYS::ICoreWebView2,
        uri: &str,
        f: Box<dyn FnOnce(Result<(SYS::ICoreWebView2CookieManager, Vec<(SYS::ICoreWebView2Cookie, CookieInfo)>), String>) + 'static>,
    ) -> Result<(), String> {
        let cm = cookie_manager(core).map_err(|e| format!("CookieManager (ICoreWebView2_2): {e}"))?;
        let cm2 = cm.clone();
        let h = webview2_com::GetCookiesCompletedHandler::create(Box::new(move |res, list| {
            if let Err(e) = res { f(Err(format!("GetCookies: {e}"))); return Ok(()); }
            let list: Option<SYS::ICoreWebView2CookieList> = list;
            let mut out = Vec::new();
            if let Some(list) = list {
                let mut n = 0u32;
                let _ = unsafe { list.Count(&mut n) };
                for i in 0..n.min(10_000) {
                    if let Ok(c) = unsafe { list.GetValueAtIndex(i) } { let info = unsafe { read_cookie(&c) }; out.push((c, info)); }
                }
            }
            f(Ok((cm2, out)));
            Ok(())
        }));
        let w = wide(uri);
        h.cast::<SYS::ICoreWebView2GetCookiesCompletedHandler>()
            .and_then(|h| unsafe { cm.GetCookies(PCWSTR(w.as_ptr()), &h) })
            .map_err(|e| format!("GetCookies: {e}"))
    }

    pub fn kinds_mask(kinds: &[String]) -> Result<SYS::COREWEBVIEW2_BROWSING_DATA_KINDS, String> {
        let mut m = 0i32;
        for k in kinds {
            m |= match k.as_str() {
                "cache" => SYS::COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE.0 | SYS::COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE.0,
                "cookies" => SYS::COREWEBVIEW2_BROWSING_DATA_KINDS_COOKIES.0,
                "history" => SYS::COREWEBVIEW2_BROWSING_DATA_KINDS_BROWSING_HISTORY.0,
                "storage" => SYS::COREWEBVIEW2_BROWSING_DATA_KINDS_ALL_DOM_STORAGE.0,
                "downloads" => SYS::COREWEBVIEW2_BROWSING_DATA_KINDS_DOWNLOAD_HISTORY.0,
                "autofill" => SYS::COREWEBVIEW2_BROWSING_DATA_KINDS_GENERAL_AUTOFILL.0 | SYS::COREWEBVIEW2_BROWSING_DATA_KINDS_PASSWORD_AUTOSAVE.0,
                other => return Err(format!("unbekannte Datenart '{other}'")),
            };
        }
        if m == 0 { return Err("keine Datenart gewaehlt".into()); }
        Ok(SYS::COREWEBVIEW2_BROWSING_DATA_KINDS(m))
    }

    /// ICoreWebView2_13::Profile -> ICoreWebView2Profile2::ClearBrowsingData.
    /// Err = synchron gescheitert (dann wird `done` nicht aufgerufen).
    pub fn clear_data(core: &SYS::ICoreWebView2, mask: SYS::COREWEBVIEW2_BROWSING_DATA_KINDS, done: Box<dyn FnOnce(Result<(), String>) + 'static>) -> Result<(), String> {
        let p2 = core.cast::<SYS::ICoreWebView2_13>().and_then(|c| unsafe { c.Profile() }).and_then(|p| p.cast::<SYS::ICoreWebView2Profile2>())
            .map_err(|e| format!("ClearBrowsingData nicht verfuegbar (ICoreWebView2Profile2, WebView2 >= 1.0.1245): {e}"))?;
        let h = webview2_com::ClearBrowsingDataCompletedHandler::create(Box::new(move |res| {
            done(res.map_err(|e| format!("ClearBrowsingData: {e}")));
            Ok(())
        }));
        h.cast::<SYS::ICoreWebView2ClearBrowsingDataCompletedHandler>()
            .and_then(|h| unsafe { p2.ClearBrowsingData(mask, &h) })
            .map_err(|e| format!("ClearBrowsingData: {e}"))
    }
}

/// Startpruefung: vorgemerktes Loeschen (Option "beim Beenden") ausfuehren. Einmal je Prozess.
static PENDING_CLEAR_DONE: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
pub fn on_core_ready(core: &webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2) {
    if PENDING_CLEAR_DONE.swap(true, Ordering::SeqCst) { return; }
    if storage::meta_get("privacy.pendingClear").as_deref() != Some("1") { return; }
    let o = options();
    let mut kinds = Vec::new();
    if o.clear_cookies_on_exit { kinds.push("cookies".to_string()); }
    if o.clear_cache_on_exit { kinds.push("cache".to_string()); }
    let _ = storage::meta_set("privacy.pendingClear", "0");
    if kinds.is_empty() { return; }
    tracing::info!("Loesche vorgemerkte Daten beim Start: {kinds:?}");
    match win::kinds_mask(&kinds) {
        Ok(mask) => {
            let r = win::clear_data(core, mask, Box::new(|r| { if let Err(e) = r { tracing::warn!("Loeschen beim Start: {e}"); } }));
            if let Err(e) = r {
                tracing::warn!("{e} – Rueckfall DeleteAllCookies");
                if o.clear_cookies_on_exit { if let Ok(cm) = win::cookie_manager(core) { let _ = unsafe { cm.DeleteAllCookies() }; } }
            }
        }
        Err(e) => tracing::warn!("{e}"),
    }
}

#[tauri::command]
pub async fn list_cookies(app: AppHandle, url: Option<String>) -> Result<Vec<CookieInfo>, String> {
    let uri = match url.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(u) => {
            let p = url::Url::parse(u).map_err(|e| format!("ungueltige URL: {e}"))?;
            if p.scheme() != "http" && p.scheme() != "https" { return Err("nur http/https".into()); }
            p.to_string()
        }
        None => String::new(),
    };
    #[cfg(windows)]
    {
        let wv = any_webview(&app)?;
        let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<CookieInfo>, String>>();
        let tx2 = tx.clone();
        wv.with_webview(move |pwv| {
            let core = match win::core_of(&pwv) { Ok(c) => c, Err(e) => { let _ = tx.send(Err(format!("CoreWebView2: {e}"))); return; } };
            let tx_ok = tx.clone();
            let r = win::get_cookies(&core, &uri, Box::new(move |r| {
                let _ = tx_ok.send(r.map(|(_, list)| list.into_iter().map(|(_, i)| i).collect()));
            }));
            if let Err(e) = r { let _ = tx.send(Err(e)); }
        }).map_err(|e| { let _ = tx2.send(Err(e.to_string())); e.to_string() })?;
        wait(rx).await
    }
    #[cfg(not(windows))]
    { let _ = (app, uri); Err("nur unter Windows/WebView2".into()) }
}

/// Cookies loeschen: `site` = Domain (inkl. Subdomains), None = alle. Rueckgabe: Anzahl (alle: -1).
#[tauri::command]
pub async fn delete_cookies(app: AppHandle, site: Option<String>) -> Result<i64, String> {
    let site = match site.as_deref() {
        Some(s) => Some(filters::normalize_host(s).ok_or_else(|| format!("ungueltige Domain '{s}'"))?),
        None => None,
    };
    #[cfg(windows)]
    {
        let wv = any_webview(&app)?;
        let (tx, rx) = std::sync::mpsc::channel::<Result<i64, String>>();
        wv.with_webview(move |pwv| {
            let core = match win::core_of(&pwv) { Ok(c) => c, Err(e) => { let _ = tx.send(Err(format!("CoreWebView2: {e}"))); return; } };
            match site {
                None => {
                    let r = win::cookie_manager(&core).and_then(|cm| unsafe { cm.DeleteAllCookies() });
                    let _ = tx.send(r.map(|_| -1).map_err(|e| format!("DeleteAllCookies: {e}")));
                }
                Some(site) => {
                    let tx_ok = tx.clone();
                    let r = win::get_cookies(&core, "", Box::new(move |r| {
                        let res = r.map(|(cm, list)| {
                            let mut n = 0i64;
                            for (c, info) in list {
                                if cookie_matches(&info.domain, &site) && unsafe { cm.DeleteCookie(&c) }.is_ok() { n += 1; }
                            }
                            tracing::info!("{n} Cookies von {site} geloescht");
                            n
                        });
                        let _ = tx_ok.send(res);
                    }));
                    if let Err(e) = r { let _ = tx.send(Err(e)); }
                }
            }
        }).map_err(|e| e.to_string())?;
        wait(rx).await
    }
    #[cfg(not(windows))]
    { let _ = (app, site); Err("nur unter Windows/WebView2".into()) }
}

/// Browserdaten des WebView2-Profils loeschen. kinds: cache | cookies | history | storage | downloads | autofill.
/// Hinweis: JTech-Verlauf/Lesezeichen liegen in SQLite und werden von der UI separat geloescht.
#[tauri::command]
pub async fn clear_browsing_data(app: AppHandle, kinds: Vec<String>) -> Result<(), String> {
    if kinds.is_empty() || kinds.len() > 10 { return Err("ungueltige Auswahl".into()); }
    #[cfg(windows)]
    {
        let mask = win::kinds_mask(&kinds)?;
        let wants_cookies = kinds.iter().any(|k| k == "cookies");
        let wv = any_webview(&app)?;
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        wv.with_webview(move |pwv| {
            let core = match win::core_of(&pwv) { Ok(c) => c, Err(e) => { let _ = tx.send(Err(format!("CoreWebView2: {e}"))); return; } };
            let tx_ok = tx.clone();
            let r = win::clear_data(&core, mask, Box::new(move |r| { let _ = tx_ok.send(r); }));
            if let Err(e) = r {
                // Rueckfall fuer aeltere Runtimes ohne ICoreWebView2Profile2: wenigstens Cookies
                let r = if wants_cookies {
                    match win::cookie_manager(&core).and_then(|cm| unsafe { cm.DeleteAllCookies() }) {
                        Ok(()) => Err(format!("{e} – nur Cookies geloescht")),
                        Err(e2) => Err(format!("{e}; DeleteAllCookies: {e2}")),
                    }
                } else { Err(e) };
                let _ = tx.send(r);
            }
        }).map_err(|e| e.to_string())?;
        wait(rx).await
    }
    #[cfg(not(windows))]
    { let _ = app; Err("nur unter Windows/WebView2".into()) }
}

// ---------- Website-Berechtigungen ----------

pub const PERMISSION_KINDS: &[&str] = &[
    "microphone", "camera", "geolocation", "notifications", "other-sensors", "clipboard-read",
    "multiple-downloads", "file-read-write", "autoplay", "local-fonts", "midi-sysex", "window-management",
];

static PERMS: OnceLock<Mutex<HashMap<(String, String), String>>> = OnceLock::new();
fn perms() -> &'static Mutex<HashMap<(String, String), String>> { PERMS.get_or_init(|| Mutex::new(HashMap::new())) }

fn load_perm_cache() {
    match storage::perm_all() {
        Ok(list) => { let mut m = lock(perms()); for p in list { m.insert((p.origin, p.kind), p.state); } }
        Err(e) => tracing::warn!("Berechtigungen laden: {e}"),
    }
}

/// "https://example.com:8443/pfad" -> "https://example.com:8443". Nur http/https.
pub fn origin_of(uri: &str) -> Option<String> {
    let u = url::Url::parse(uri).ok()?;
    if u.scheme() != "http" && u.scheme() != "https" { return None; }
    u.host_str()?;
    Some(u.origin().ascii_serialization())
}

pub fn stored_permission(origin: &str, kind: &str) -> Option<String> { lock(perms()).get(&(origin.to_string(), kind.to_string())).cloned() }

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequest { id: u64, tab_id: String, origin: String, kind: String, user_initiated: bool }

static PERM_COUNTER: AtomicU64 = AtomicU64::new(0);

#[cfg(windows)]
thread_local! {
    /// Offene Anfragen (UI-Thread): id -> (Args, Deferral, Tab, Origin, Kind)
    static PERM_PENDING: std::cell::RefCell<HashMap<u64, (webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2PermissionRequestedEventArgs, webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2Deferral, String, String, String)>> = std::cell::RefCell::new(HashMap::new());
}

#[cfg(windows)]
pub fn kind_name(k: webview2_com_sys::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PERMISSION_KIND) -> &'static str {
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    match k {
        SYS::COREWEBVIEW2_PERMISSION_KIND_MICROPHONE => "microphone",
        SYS::COREWEBVIEW2_PERMISSION_KIND_CAMERA => "camera",
        SYS::COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION => "geolocation",
        SYS::COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS => "notifications",
        SYS::COREWEBVIEW2_PERMISSION_KIND_OTHER_SENSORS => "other-sensors",
        SYS::COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ => "clipboard-read",
        SYS::COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS => "multiple-downloads",
        SYS::COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE => "file-read-write",
        SYS::COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY => "autoplay",
        SYS::COREWEBVIEW2_PERMISSION_KIND_LOCAL_FONTS => "local-fonts",
        SYS::COREWEBVIEW2_PERMISSION_KIND_MIDI_SYSTEM_EXCLUSIVE_MESSAGES => "midi-sysex",
        SYS::COREWEBVIEW2_PERMISSION_KIND_WINDOW_MANAGEMENT => "window-management",
        _ => "unknown",
    }
}

/// PermissionRequested registrieren. Gespeicherte Entscheidung -> sofort; sonst Deferral + Event
/// "permission-request" an die UI (Leiste im Header, ausserhalb des Content-Rechtecks).
#[cfg(windows)]
pub unsafe fn attach_permissions(core: &webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2, app: &AppHandle, tab_id: &str) -> Result<i64, String> {
    use webview2_com::take_pwstr;
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    use windows::core::{Interface, PWSTR};
    let (app, id) = (app.clone(), tab_id.to_string());
    let h = webview2_com::PermissionRequestedEventHandler::create(Box::new(move |_s, args| {
        let Some(args) = args else { return Ok(()) };
        let mut p = PWSTR::null();
        unsafe { args.Uri(&mut p)? };
        let uri = take_pwstr(p);
        let mut k = SYS::COREWEBVIEW2_PERMISSION_KIND::default();
        unsafe { args.PermissionKind(&mut k)? };
        let kind = kind_name(k);
        let mut user = Default::default();
        let _ = unsafe { args.IsUserInitiated(&mut user) };
        // WebView2 soll die Entscheidung NICHT selbst speichern – JTech verwaltet sie.
        if let Ok(a3) = args.cast::<SYS::ICoreWebView2PermissionRequestedEventArgs3>() { let _ = unsafe { a3.SetSavesInProfile(false.into()) }; }
        let Some(origin) = origin_of(&uri) else {
            tracing::info!(tab = id.as_str(), "Berechtigung {kind} fuer {uri} abgelehnt (kein http/https)");
            unsafe { args.SetState(SYS::COREWEBVIEW2_PERMISSION_STATE_DENY)? };
            return Ok(());
        };
        match stored_permission(&origin, kind).as_deref() {
            Some("allow") => { unsafe { args.SetState(SYS::COREWEBVIEW2_PERMISSION_STATE_ALLOW)? }; return Ok(()); }
            Some("deny") => { unsafe { args.SetState(SYS::COREWEBVIEW2_PERMISSION_STATE_DENY)? }; return Ok(()); }
            _ => {}
        }
        let deferral = unsafe { args.GetDeferral()? };
        let rid = PERM_COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
        PERM_PENDING.with(|m| { m.borrow_mut().insert(rid, (args.clone(), deferral, id.clone(), origin.clone(), kind.to_string())); });
        tracing::info!(tab = id.as_str(), "Berechtigungsanfrage #{rid} {kind} von {origin}");
        let req = PermissionRequest { id: rid, tab_id: id.clone(), origin, kind: kind.into(), user_initiated: user.as_bool() };
        if let Err(e) = app.emit("permission-request", req) { tracing::warn!("emit permission-request: {e}"); }
        Ok(())
    }));
    let h: SYS::ICoreWebView2PermissionRequestedEventHandler = h.cast().map_err(|e| format!("cast PermissionRequested: {e}"))?;
    let mut tok = 0i64;
    unsafe { core.add_PermissionRequested(&h, &mut tok) }.map_err(|e| format!("add_PermissionRequested: {e}"))?;
    Ok(tok)
}

/// Offene Anfragen eines Tabs ablehnen (Tab geschlossen / schlafen gelegt). Auf dem UI-Thread aufrufen.
#[cfg(windows)]
pub fn cancel_pending_for(app: &AppHandle, tab_id: &str) {
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    let ids: Vec<u64> = PERM_PENDING.with(|m| m.borrow().iter().filter(|(_, v)| v.2 == tab_id).map(|(k, _)| *k).collect());
    for rid in ids {
        if let Some((args, def, ..)) = PERM_PENDING.with(|m| m.borrow_mut().remove(&rid)) {
            unsafe { let _ = args.SetState(SYS::COREWEBVIEW2_PERMISSION_STATE_DENY); let _ = def.Complete(); }
            let _ = app.emit("permission-cancel", rid);
        }
    }
}

/// Antwort der UI: decision = allow | deny, remember = fuer diese Origin speichern.
#[tauri::command]
pub fn resolve_permission(app: AppHandle, id: u64, decision: String, remember: bool) -> Result<(), String> {
    if decision != "allow" && decision != "deny" { return Err(format!("ungueltige Entscheidung '{decision}'")); }
    #[cfg(windows)]
    {
        let app2 = app.clone();
        app.run_on_main_thread(move || {
            use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
            let Some((args, def, tab, origin, kind)) = PERM_PENDING.with(|m| m.borrow_mut().remove(&id)) else {
                tracing::warn!("Berechtigungsanfrage #{id} unbekannt/erledigt");
                return;
            };
            let st = if decision == "allow" { SYS::COREWEBVIEW2_PERMISSION_STATE_ALLOW } else { SYS::COREWEBVIEW2_PERMISSION_STATE_DENY };
            unsafe {
                if let Err(e) = args.SetState(st) { crate::report_error(&app2, &tab, "Berechtigung SetState", e); }
                if let Err(e) = def.Complete() { crate::report_error(&app2, &tab, "Berechtigung Deferral.Complete", e); }
            }
            tracing::info!(tab = tab.as_str(), "Berechtigung {kind} fuer {origin}: {decision} (merken={remember})");
            if remember {
                lock(perms()).insert((origin.clone(), kind.clone()), decision.clone());
                std::thread::spawn(move || { if let Err(e) = storage::perm_set(&origin, &kind, &decision) { tracing::warn!("Berechtigung speichern: {e}"); } });
            }
        }).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    { let _ = (app, id, remember); Err("nur unter Windows/WebView2".into()) }
}

#[tauri::command]
pub fn list_permissions() -> Result<Vec<storage::PermissionEntry>, String> { storage::perm_all() }

/// Gespeicherte Berechtigung setzen (state = allow|deny) oder entfernen (state = None; kind = None -> alle der Origin).
#[tauri::command]
pub fn set_permission(origin: String, kind: Option<String>, state: Option<String>) -> Result<(), String> {
    let o = origin_of(&origin).ok_or_else(|| format!("ungueltige Origin '{origin}'"))?;
    if o != origin.trim_end_matches('/') { return Err(format!("Origin erwartet (z. B. https://example.com), nicht '{origin}'")); }
    if let Some(k) = &kind { if !PERMISSION_KINDS.contains(&k.as_str()) { return Err(format!("unbekannte Berechtigung '{k}'")); } }
    match (kind, state.as_deref()) {
        (Some(k), Some(s @ ("allow" | "deny"))) => { storage::perm_set(&o, &k, s)?; lock(perms()).insert((o, k), s.to_string()); }
        (Some(k), None) => { storage::perm_delete(&o, Some(&k))?; lock(perms()).remove(&(o, k)); }
        (None, None) => { storage::perm_delete(&o, None)?; lock(perms()).retain(|(oo, _), _| oo != &o); }
        (_, Some(s)) => return Err(format!("ungueltiger Zustand '{s}'")),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn origins_and_cookies() {
        assert_eq!(origin_of("https://Example.com/a?b").as_deref(), Some("https://example.com"));
        assert_eq!(origin_of("https://example.com:8443/x").as_deref(), Some("https://example.com:8443"));
        assert_eq!(origin_of("file:///C:/x"), None);
        assert!(cookie_matches(".example.com", "example.com"));
        assert!(cookie_matches("a.example.com", "example.com"));
        assert!(!cookie_matches("badexample.com", "example.com"));
    }
}
