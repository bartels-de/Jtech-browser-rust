// JTech extensions: first-party extensions bundled with every release (resources/extensions/<id>/)
// plus a read-only market index (extensions/index.json in the repository).
//
// Rules:
//  - Extensions are loaded from the app's resource directory, so every signed release updates them.
//  - Content scripts are injected with AddScriptToExecuteOnDocumentCreated into content tabs only.
//    Page scripts never get an IPC bridge; content webviews load remote URLs and the capabilities
//    in src-tauri/capabilities/ only apply to local content / the "ui" webview.
//  - Network rules of an extension are a separate adblock engine (thread_local, UI thread), checked
//    in the WebResourceRequested handler after the main engine, only on pages the extension matches.
//  - Hotfix installation from the market index is disabled (HOTFIX_INSTALL_ENABLED) until the index
//    is signed. The sha256 file check is implemented and tested already.

use adblock::engine::Engine;
use adblock::lists::ParseOptions;
use adblock::FilterSet;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::cmp::Ordering as CmpOrdering;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock, RwLock};
use tauri::{AppHandle, Manager};

use crate::{filters, lock, now_ms, storage};

pub const MARKET_INDEX_URL: &str = "https://raw.githubusercontent.com/bartels-de/Jtech-browser-rust/main/extensions/index.json";
/// Installing newer extension versions from the market index (outside a release).
/// Stays false until the index carries a verified signature (see docs/EXTENSIONS.md).
pub const HOTFIX_INSTALL_ENABLED: bool = false;
pub const BROWSER_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const KNOWN_PERMISSIONS: &[&str] = &["scripts:main-world", "network", "styles"];
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_INDEX_BYTES: usize = 1024 * 1024;
const MAX_SITE_OFF: usize = 500;

// ---------- Manifest ----------

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
pub struct ContentScript {
    #[serde(default)]
    pub js: Vec<String>,
    #[serde(default)]
    pub css: Vec<String>,
    #[serde(default = "default_run_at")]
    pub run_at: String,
    #[serde(default = "default_world")]
    pub world: String,
}
fn default_run_at() -> String { "document_end".into() }
fn default_world() -> String { "main".into() }

#[derive(Deserialize, Clone, Debug)]
pub struct Manifest {
    pub id: String,
    pub version: String,
    #[serde(rename = "minBrowser", default)]
    pub min_browser: Option<String>,
    pub name: HashMap<String, String>,
    #[serde(default)]
    pub description: HashMap<String, String>,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub license: String,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub matches: Vec<String>,
    #[serde(default)]
    pub content_scripts: Vec<ContentScript>,
    #[serde(default)]
    pub filters: Vec<String>,
    #[serde(rename = "defaultEnabled", default)]
    pub default_enabled: bool,
}

pub fn valid_ext_id(id: &str) -> bool {
    let b = id.as_bytes();
    (2..=64).contains(&b.len())
        && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit())
        && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, b'.' | b'-' | b'_'))
        && !id.contains("..")
}

/// Relative file name inside the extension folder (no "..", no absolute path, no backslash).
pub fn safe_rel_path(p: &str) -> bool {
    !p.is_empty() && p.len() <= 128 && !p.starts_with('/') && !p.contains('\\') && !p.contains(':')
        && p.split('/').all(|s| !s.is_empty() && s != "." && s != "..")
}

/// "1.2.3" (optional "-suffix"/"+build" is ignored) -> [1,2,3]. Max. 4 numeric parts.
pub fn parse_version(s: &str) -> Option<Vec<u64>> {
    let core = s.trim().split(['-', '+']).next()?;
    let parts: Vec<&str> = core.split('.').collect();
    if parts.is_empty() || parts.len() > 4 { return None; }
    parts.iter().map(|p| if !p.is_empty() && p.len() <= 9 && p.bytes().all(|c| c.is_ascii_digit()) { p.parse().ok() } else { None }).collect()
}

pub fn cmp_versions(a: &str, b: &str) -> Option<CmpOrdering> {
    let (mut x, mut y) = (parse_version(a)?, parse_version(b)?);
    let n = x.len().max(y.len());
    x.resize(n, 0);
    y.resize(n, 0);
    Some(x.cmp(&y))
}

/// minBrowser gate: true if `current` >= `min` (no minimum = ok, unparsable minimum = not ok).
pub fn browser_ok(min: Option<&str>, current: &str) -> bool {
    match min {
        None => true,
        Some(m) => matches!(cmp_versions(current, m), Some(CmpOrdering::Greater | CmpOrdering::Equal)),
    }
}

impl Manifest {
    pub fn parse(json: &str) -> Result<Manifest, String> {
        let m: Manifest = serde_json::from_str(json).map_err(|e| format!("manifest.json: {e}"))?;
        m.validate()?;
        Ok(m)
    }

    pub fn validate(&self) -> Result<(), String> {
        if !valid_ext_id(&self.id) { return Err(format!("invalid id '{}'", self.id)); }
        if parse_version(&self.version).is_none() { return Err(format!("invalid version '{}'", self.version)); }
        if let Some(m) = &self.min_browser { if parse_version(m).is_none() { return Err(format!("invalid minBrowser '{m}'")); } }
        if self.name.get("en").is_none_or(|n| n.trim().is_empty()) { return Err("name.en missing".into()); }
        for p in &self.permissions { if !KNOWN_PERMISSIONS.contains(&p.as_str()) { return Err(format!("unknown permission '{p}'")); } }
        if self.matches.is_empty() || self.matches.len() > 32 { return Err("matches: 1-32 patterns required".into()); }
        for m in &self.matches { MatchPattern::parse(m)?; }
        if let Some(i) = &self.icon { if !safe_rel_path(i) { return Err(format!("invalid icon path '{i}'")); } }
        let has = |p: &str| self.permissions.iter().any(|x| x == p);
        for cs in &self.content_scripts {
            if !matches!(cs.run_at.as_str(), "document_start" | "document_end") { return Err(format!("invalid run_at '{}'", cs.run_at)); }
            if cs.world != "main" { return Err(format!("unsupported world '{}'", cs.world)); }
            if !cs.js.is_empty() && !has("scripts:main-world") { return Err("content script js needs permission scripts:main-world".into()); }
            if !cs.css.is_empty() && !has("styles") && !has("scripts:main-world") { return Err("content script css needs permission styles".into()); }
            for f in cs.js.iter().chain(cs.css.iter()) { if !safe_rel_path(f) { return Err(format!("invalid file path '{f}'")); } }
        }
        if !self.filters.is_empty() && !has("network") { return Err("filters need permission network".into()); }
        for f in &self.filters { if !safe_rel_path(f) { return Err(format!("invalid filter path '{f}'")); } }
        Ok(())
    }

    /// Localized string with fallback to "en".
    pub fn localized<'a>(map: &'a HashMap<String, String>, lang: &str) -> &'a str {
        let short = lang.split(['-', '_']).next().unwrap_or("en").to_ascii_lowercase();
        map.get(&short).or_else(|| map.get("en")).map(String::as_str).unwrap_or("")
    }
}

// ---------- Match patterns (subset of Chrome's syntax) ----------

#[derive(Clone, Debug, PartialEq)]
pub enum HostPat { Any, Exact(String), WithSubdomains(String) }

#[derive(Clone, Debug, PartialEq)]
pub struct MatchPattern { pub scheme: String, pub host: HostPat, pub path: String }

fn glob_match(pat: &str, text: &str) -> bool {
    // '*' = any sequence; iterative with backtracking.
    let (p, t) = (pat.as_bytes(), text.as_bytes());
    let (mut pi, mut ti, mut star, mut mark) = (0usize, 0usize, usize::MAX, 0usize);
    while ti < t.len() {
        if pi < p.len() && p[pi] != b'*' && p[pi] == t[ti] { pi += 1; ti += 1; }
        else if pi < p.len() && p[pi] == b'*' { star = pi; mark = ti; pi += 1; }
        else if star != usize::MAX { pi = star + 1; mark += 1; ti = mark; }
        else { return false; }
    }
    while pi < p.len() && p[pi] == b'*' { pi += 1; }
    pi == p.len()
}

fn re_escape(s: &str) -> String {
    let mut o = String::with_capacity(s.len() * 2);
    for c in s.chars() {
        if "\\^$.|?*+()[]{}/".contains(c) { o.push('\\'); }
        o.push(c);
    }
    o
}

impl MatchPattern {
    /// "<all_urls>" | "<scheme>://<host><path>", scheme = * | http | https,
    /// host = * | *.example.com | example.com, path starts with '/', '*' = wildcard.
    pub fn parse(s: &str) -> Result<MatchPattern, String> {
        if s == "<all_urls>" { return Ok(MatchPattern { scheme: "*".into(), host: HostPat::Any, path: "/*".into() }); }
        let err = || format!("invalid match pattern '{s}'");
        let (scheme, rest) = s.split_once("://").ok_or_else(err)?;
        if !matches!(scheme, "*" | "http" | "https") { return Err(err()); }
        let slash = rest.find('/').ok_or_else(err)?;
        let (host, path) = rest.split_at(slash);
        let host = host.to_ascii_lowercase();
        let ok_host = |h: &str| !h.is_empty() && h.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'.' || c == b'-');
        let host = if host == "*" { HostPat::Any }
            else if let Some(h) = host.strip_prefix("*.") { if !ok_host(h) { return Err(err()); } HostPat::WithSubdomains(h.to_string()) }
            else { if !ok_host(&host) { return Err(err()); } HostPat::Exact(host) };
        Ok(MatchPattern { scheme: scheme.into(), host, path: path.into() })
    }

    pub fn matches(&self, url: &str) -> bool {
        let Ok(u) = url::Url::parse(url) else { return false };
        let sch = u.scheme();
        let scheme_ok = match self.scheme.as_str() { "*" => sch == "http" || sch == "https", s => s == sch };
        if !scheme_ok { return false; }
        let host = u.host_str().unwrap_or("").to_ascii_lowercase();
        let host_ok = match &self.host {
            HostPat::Any => true,
            HostPat::Exact(h) => &host == h,
            HostPat::WithSubdomains(h) => &host == h || host.ends_with(&format!(".{h}")),
        };
        if !host_ok { return false; }
        let mut p = u.path().to_string();
        if let Some(q) = u.query() { p.push('?'); p.push_str(q); }
        glob_match(&self.path, &p)
    }

    /// Equivalent JavaScript RegExp source, tested against location.href.
    pub fn to_js_regex(&self) -> String {
        let scheme = match self.scheme.as_str() { "*" => "https?".to_string(), s => s.to_string() };
        let host = match &self.host {
            HostPat::Any => "[^/:?#]+".to_string(),
            HostPat::Exact(h) => re_escape(h),
            HostPat::WithSubdomains(h) => format!("(?:[^/:?#]+\\.)?{}", re_escape(h)),
        };
        let path = self.path.split('*').map(re_escape).collect::<Vec<_>>().join(".*");
        format!("^{scheme}://{host}(?::\\d+)?{path}(?:#.*)?$")
    }
}

pub fn any_match(pats: &[MatchPattern], url: &str) -> bool { pats.iter().any(|p| p.matches(url)) }

// ---------- SHA-256 (for the market index file check) ----------

pub fn sha256_hex(data: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let mut h: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    let mut msg = data.to_vec();
    let bit_len = (data.len() as u64).wrapping_mul(8);
    msg.push(0x80);
    while msg.len() % 64 != 56 { msg.push(0); }
    msg.extend_from_slice(&bit_len.to_be_bytes());
    for chunk in msg.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 { w[i] = u32::from_be_bytes([chunk[4 * i], chunk[4 * i + 1], chunk[4 * i + 2], chunk[4 * i + 3]]); }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) = (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ (!e & g);
            let t1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g; g = f; f = e; e = d.wrapping_add(t1); d = c; c = b; b = a; a = t1.wrapping_add(t2);
        }
        for (x, v) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) { *x = x.wrapping_add(v); }
    }
    h.iter().map(|x| format!("{x:08x}")).collect()
}

/// Every file listed in `expected` (rel path -> sha256 hex) must exist in `files` with that hash.
pub fn verify_files(files: &HashMap<String, Vec<u8>>, expected: &HashMap<String, String>) -> Result<(), String> {
    if expected.is_empty() { return Err("no file hashes in index".into()); }
    for (name, want) in expected {
        if !safe_rel_path(name) { return Err(format!("invalid file path '{name}'")); }
        let data = files.get(name).ok_or_else(|| format!("file '{name}' missing"))?;
        let got = sha256_hex(data);
        if !got.eq_ignore_ascii_case(want.trim()) { return Err(format!("sha256 mismatch for '{name}'")); }
    }
    Ok(())
}

// ---------- Registry ----------

#[derive(Clone, Debug)]
pub struct Prepared { pub js: String, pub css: String, pub run_at: String }

#[derive(Clone, Debug)]
pub struct Ext {
    pub manifest: Manifest,
    pub patterns: Vec<MatchPattern>,
    pub scripts: Vec<Prepared>,
    pub rules: String,
    pub icon_svg: Option<String>,
    pub source: String,
    /// Not usable (e.g. needs a newer browser); stays listed so the UI can show why.
    pub error: Option<String>,
}

#[derive(Default)]
struct State {
    exts: Vec<Ext>,
    enabled: HashMap<String, bool>,
    site_off: HashMap<String, Vec<String>>,
    blocked: HashMap<String, u64>,
    market: Option<MarketResult>,
    diag: Diagnostics,
}

/// What the loader saw at startup (shown under "Technische Details" on jtech://extensions).
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub searched_path: String,
    pub path_exists: bool,
    pub legacy_flat_layout: bool,
    pub loaded: Vec<String>,
    pub errors: Vec<LoadError>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoadError { pub path: String, pub error: String }

static REG: OnceLock<RwLock<State>> = OnceLock::new();
static PENDING: Mutex<Option<HashMap<String, u64>>> = Mutex::new(None);
/// Webview label -> registered (extension id, script id).
static INSTALLED: Mutex<Option<HashMap<String, Vec<(String, String)>>>> = Mutex::new(None);

thread_local! {
    /// (extension id, match patterns, hosts switched off, engine) – UI thread only.
    static EXT_ENGINES: RefCell<Vec<(String, Vec<MatchPattern>, HashSet<String>, Engine)>> = const { RefCell::new(Vec::new()) };
}

fn reg() -> &'static RwLock<State> { REG.get_or_init(|| RwLock::new(State::default())) }
fn read() -> std::sync::RwLockReadGuard<'static, State> { reg().read().unwrap_or_else(|p| p.into_inner()) }
fn write() -> std::sync::RwLockWriteGuard<'static, State> { reg().write().unwrap_or_else(|p| p.into_inner()) }

fn read_file(dir: &Path, rel: &str) -> Result<Vec<u8>, String> {
    if !safe_rel_path(rel) { return Err(format!("invalid path '{rel}'")); }
    let p = dir.join(rel);
    let meta = std::fs::metadata(&p).map_err(|e| format!("{rel}: {e}"))?;
    if !meta.is_file() { return Err(format!("{rel}: not a file")); }
    if meta.len() > MAX_FILE_BYTES { return Err(format!("{rel}: file too large")); }
    std::fs::read(&p).map_err(|e| format!("{rel}: {e}"))
}

fn read_text(dir: &Path, rel: &str) -> Result<String, String> {
    String::from_utf8(read_file(dir, rel)?).map_err(|_| format!("{rel}: not UTF-8"))
}

/// Loads one extension folder. Err = folder is skipped (invalid manifest).
pub fn load_one(dir: &Path, source: &str) -> Result<Ext, String> { load_one_with(dir, source, true) }

fn load_one_with(dir: &Path, source: &str, check_folder: bool) -> Result<Ext, String> {
    let manifest = Manifest::parse(&read_text(dir, "manifest.json")?)?;
    let folder = dir.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if check_folder && folder != manifest.id { return Err(format!("folder '{folder}' does not match id '{}'", manifest.id)); }
    let patterns = manifest.matches.iter().map(|m| MatchPattern::parse(m)).collect::<Result<Vec<_>, _>>()?;
    let mut scripts = Vec::new();
    for cs in &manifest.content_scripts {
        let mut js = String::new();
        for f in &cs.js { js.push_str(&read_text(dir, f)?); js.push('\n'); }
        let mut css = String::new();
        for f in &cs.css { css.push_str(&read_text(dir, f)?); css.push('\n'); }
        scripts.push(Prepared { js, css, run_at: cs.run_at.clone() });
    }
    let mut rules = String::new();
    for f in &manifest.filters { rules.push_str(&read_text(dir, f)?); rules.push('\n'); }
    let icon_svg = manifest.icon.as_deref().filter(|i| i.ends_with(".svg")).and_then(|i| read_text(dir, i).ok()).filter(|s| s.len() <= 64 * 1024);
    let error = if browser_ok(manifest.min_browser.as_deref(), BROWSER_VERSION) { None }
        else { Some(format!("requires JTech Browser {} or newer", manifest.min_browser.as_deref().unwrap_or("?"))) };
    Ok(Ext { manifest, patterns, scripts, rules, icon_svg, source: source.into(), error })
}

pub fn load_dir(root: &Path, source: &str) -> Vec<Ext> { load_dir_diag(root, source).0 }

/// Loads every `<root>/<id>/` folder. Also accepts the legacy flat layout
/// (`<root>/manifest.json`, produced by the v0.1.4 installer and left behind on upgrades)
/// as one extension, unless a proper subfolder with the same id exists.
pub fn load_dir_diag(root: &Path, source: &str) -> (Vec<Ext>, Diagnostics) {
    let mut out: Vec<Ext> = Vec::new();
    let mut diag = Diagnostics { searched_path: root.display().to_string(), path_exists: root.is_dir(), ..Default::default() };
    let Ok(rd) = std::fs::read_dir(root) else {
        tracing::warn!("extensions folder missing: {}", root.display());
        diag.errors.push(LoadError { path: root.display().to_string(), error: "folder missing".into() });
        return (out, diag);
    };
    let mut dirs: Vec<PathBuf> = rd.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_dir()).collect();
    dirs.sort();
    for d in dirs {
        match load_one(&d, source) {
            Ok(e) => { tracing::info!("extension {} {} loaded", e.manifest.id, e.manifest.version); out.push(e); }
            Err(e) => {
                tracing::error!("extension {}: {e}", d.display());
                diag.errors.push(LoadError { path: d.display().to_string(), error: e });
            }
        }
    }
    if root.join("manifest.json").is_file() {
        diag.legacy_flat_layout = true;
        match load_one_with(root, source, false) {
            Ok(e) if out.iter().any(|x| x.manifest.id == e.manifest.id) => {}
            Ok(e) => { tracing::warn!("extension {} loaded from legacy flat layout", e.manifest.id); out.push(e); }
            Err(e) => {
                tracing::error!("extension (flat) {}: {e}", root.display());
                diag.errors.push(LoadError { path: root.join("manifest.json").display().to_string(), error: e });
            }
        }
    }
    diag.loaded = out.iter().map(|e| format!("{} {}", e.manifest.id, e.manifest.version)).collect();
    (out, diag)
}

fn resource_root(app: &AppHandle) -> PathBuf {
    let bundled = app.path().resource_dir().map(|d| d.join("extensions")).unwrap_or_default();
    #[cfg(debug_assertions)]
    {
        let empty = std::fs::read_dir(&bundled).map(|mut r| r.next().is_none()).unwrap_or(true);
        if empty {
            return PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("extensions");
        }
    }
    bundled
}

/// From `setup`, after storage::init.
pub fn start(app: &AppHandle) {
    let root = resource_root(app);
    let (exts, diag) = load_dir_diag(&root, "bundled");
    let rows: HashMap<String, storage::ExtRow> = storage::ext_rows().unwrap_or_default().into_iter().map(|r| (r.id.clone(), r)).collect();
    let mut st = State::default();
    for e in &exts {
        let id = e.manifest.id.clone();
        let row = rows.get(&id);
        let enabled = row.map(|r| r.enabled).unwrap_or(e.manifest.default_enabled);
        if row.is_none_or(|r| r.version != e.manifest.version || r.source != e.source) {
            if let Err(err) = storage::ext_upsert(&id, enabled, &e.manifest.version, &e.source) { tracing::warn!("extension {id}: {err}"); }
        }
        let off: Vec<String> = row.and_then(|r| serde_json::from_str(&r.site_off).ok()).unwrap_or_default();
        st.enabled.insert(id.clone(), enabled);
        st.site_off.insert(id.clone(), off);
        st.blocked.insert(id, row.map(|r| r.blocked).unwrap_or(0));
    }
    st.exts = exts;
    st.diag = diag;
    *write() = st;
    install_engines(app);
    std::thread::spawn(|| loop {
        std::thread::sleep(std::time::Duration::from_secs(20));
        flush();
    });
}

fn active(st: &State, e: &Ext) -> bool { e.error.is_none() && st.enabled.get(&e.manifest.id).copied().unwrap_or(false) }

/// Builds the extension engines on the UI thread (lists are small).
fn install_engines(app: &AppHandle) {
    let specs: Vec<(String, Vec<MatchPattern>, HashSet<String>, String)> = {
        let st = read();
        st.exts.iter().filter(|e| active(&st, e) && !e.rules.trim().is_empty())
            .map(|e| (e.manifest.id.clone(), e.patterns.clone(), st.site_off.get(&e.manifest.id).cloned().unwrap_or_default().into_iter().collect(), e.rules.clone()))
            .collect()
    };
    let r = app.run_on_main_thread(move || {
        let built: Vec<_> = specs.into_iter().map(|(id, pats, off, rules)| {
            let mut fs = FilterSet::new(false);
            fs.add_filter_list(rules, ParseOptions::default());
            (id, pats, off, Engine::new_with_filter_set(fs))
        }).collect();
        tracing::info!("extension engines: {}", built.len());
        EXT_ENGINES.with(|e| *e.borrow_mut() = built);
    });
    if let Err(e) = r { tracing::error!("run_on_main_thread (extension engines): {e}"); }
}

/// WebResourceRequested (UI thread): id of the extension that blocks this request, if any.
pub fn check_request(source: &str, uri: &str, rtype: &str, method: &str) -> Option<String> {
    EXT_ENGINES.with(|v| {
        let v = v.borrow();
        if v.is_empty() { return None; }
        let host = filters::host_of(source).unwrap_or_default();
        let host = host.trim_start_matches("www.");
        let req = adblock::request::Request::new(uri, source, rtype, method).ok()?;
        for (id, pats, off, engine) in v.iter() {
            if !any_match(pats, source) || filters::host_in(off, host) { continue; }
            if engine.check_network_request(&req).should_block() { return Some(id.clone()); }
        }
        None
    })
}

pub fn record_block(id: &str) {
    let mut p = lock(&PENDING);
    *p.get_or_insert_with(HashMap::new).entry(id.to_string()).or_insert(0) += 1;
}

/// Writes pending counters (background thread / exit).
pub fn flush() {
    let pending = lock(&PENDING).take().unwrap_or_default();
    if pending.is_empty() { return; }
    match storage::ext_add_blocked(&pending) {
        Ok(()) => { let mut st = write(); for (k, n) in pending { *st.blocked.entry(k).or_insert(0) += n; } }
        Err(e) => {
            tracing::warn!("extension stats: {e}");
            let mut p = lock(&PENDING);
            let m = p.get_or_insert_with(HashMap::new);
            for (k, n) in pending { *m.entry(k).or_insert(0) += n; }
        }
    }
}

// ---------- Script injection ----------

/// Final document-created script: protocol + match + per-site-off guard, then the extension code
/// in its own function scope. Exceptions never leak into the page.
pub fn build_injection(ext_id: &str, patterns: &[MatchPattern], site_off: &[String], p: &Prepared) -> String {
    let re: Vec<String> = patterns.iter().map(MatchPattern::to_js_regex).collect();
    let (re, off, id, css) = (to_json(&re), to_json(&site_off), to_json(&ext_id), to_json(&p.css));
    let body = if p.js.trim().is_empty() { String::new() } else { format!("try{{(function(){{\n{}\n}}).call(window);}}catch(e){{console.error('[JTech extension '+I+']',e);}}", p.js) };
    let run = if p.run_at == "document_end" {
        "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',R,{once:true});}else{R();}"
    } else { "R();" };
    format!(
        "(function(){{try{{var P={re},O={off},I={id},C={css};var l=location;\
if(l.protocol!=='https:'&&l.protocol!=='http:')return;\
var h=(l.hostname||'').toLowerCase();if(h.indexOf('www.')===0)h=h.slice(4);\
for(var k=0;k<O.length;k++){{if(h===O[k]||h.slice(-O[k].length-1)==='.'+O[k])return;}}\
var m=false;for(var q=0;q<P.length;q++){{if(new RegExp(P[q]).test(l.href)){{m=true;break;}}}}if(!m)return;\
function S(){{if(!C)return;try{{var r=document.head||document.documentElement;if(!r){{document.addEventListener('DOMContentLoaded',S,{{once:true}});return;}}\
var s=document.createElement('style');s.setAttribute('data-jtech-ext',I);s.textContent=C;r.appendChild(s);}}catch(e){{}}}}\
function R(){{S();{body}}}\
{run}}}catch(e){{}}}})();"
    )
}

fn to_json<T: Serialize + ?Sized>(v: &T) -> String { serde_json::to_string(v).unwrap_or_else(|_| "null".into()) }

/// Scripts for all active extensions (built from the current state).
fn current_injections() -> Vec<(String, String)> {
    let st = read();
    let mut out = Vec::new();
    for e in st.exts.iter().filter(|e| active(&st, e)) {
        let off = st.site_off.get(&e.manifest.id).cloned().unwrap_or_default();
        for p in &e.scripts { out.push((e.manifest.id.clone(), build_injection(&e.manifest.id, &e.patterns, &off, p))); }
    }
    out
}

/// Registers the scripts of all active extensions on a content webview (UI thread, from attach_handlers).
#[cfg(windows)]
pub fn attach(core: &webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2, label: &str) {
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    use windows::core::{Interface, PCWSTR};
    for (ext_id, js) in current_injections() {
        let wide: Vec<u16> = js.encode_utf16().chain(std::iter::once(0)).collect();
        let (label2, ext2) = (label.to_string(), ext_id.clone());
        let h = webview2_com::AddScriptToExecuteOnDocumentCreatedCompletedHandler::create(Box::new(move |_res, script_id| {
            if !script_id.is_empty() {
                lock(&INSTALLED).get_or_insert_with(HashMap::new).entry(label2).or_default().push((ext2, script_id));
            }
            Ok(())
        }));
        let r = h.cast::<SYS::ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler>()
            .and_then(|h| unsafe { core.AddScriptToExecuteOnDocumentCreated(PCWSTR(wide.as_ptr()), &h) });
        match r {
            Ok(()) => tracing::info!(webview = label, "extension {ext_id}: script registered"),
            Err(e) => tracing::warn!(webview = label, "extension {ext_id}: AddScriptToExecuteOnDocumentCreated: {e}"),
        }
    }
}

/// Removes all extension scripts registered on this webview.
#[cfg(windows)]
pub fn detach(core: &webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2, label: &str) {
    use windows::core::PCWSTR;
    let ids = lock(&INSTALLED).as_mut().and_then(|m| m.remove(label)).unwrap_or_default();
    for (ext_id, sid) in ids {
        let wide: Vec<u16> = sid.encode_utf16().chain(std::iter::once(0)).collect();
        if let Err(e) = unsafe { core.RemoveScriptToExecuteOnDocumentCreated(PCWSTR(wide.as_ptr())) } {
            tracing::warn!(webview = label, "extension {ext_id}: RemoveScriptToExecuteOnDocumentCreated: {e}");
        }
    }
}

/// Webview closed: forget its script ids.
pub fn forget(label: &str) { if let Some(m) = lock(&INSTALLED).as_mut() { m.remove(label); } }

/// Re-registers scripts on every open content tab (after enable/disable/site toggle).
/// Takes effect with the next page load in each tab.
fn refresh_tabs(app: &AppHandle) {
    #[cfg(windows)]
    for wv in crate::content_webviews(app) {
        let label = wv.label().to_string();
        let r = wv.with_webview(move |pwv| {
            use windows::core::Interface;
            match unsafe { pwv.controller().CoreWebView2() }.and_then(|c| c.cast::<webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2>()) {
                Ok(core) => { detach(&core, &label); attach(&core, &label); }
                Err(e) => tracing::warn!(webview = label.as_str(), "extensions refresh: {e}"),
            }
        });
        if let Err(e) = r { tracing::warn!("extensions refresh (with_webview): {e}"); }
    }
    #[cfg(not(windows))]
    let _ = app;
}

// ---------- Market index ----------

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IndexEntry {
    pub id: String,
    pub version: String,
    #[serde(default)]
    pub min_browser: Option<String>,
    #[serde(default)]
    pub name: HashMap<String, String>,
    #[serde(default)]
    pub description: HashMap<String, String>,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub license: String,
    #[serde(default)]
    pub files: HashMap<String, String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MarketIndex {
    pub schema: u32,
    #[serde(default)]
    pub extensions: Vec<IndexEntry>,
    /// Reserved: detached signature over the index (not verified yet).
    #[serde(default)]
    pub signature: Option<String>,
}

pub fn parse_index(text: &str) -> Result<MarketIndex, String> {
    let idx: MarketIndex = serde_json::from_str(text).map_err(|e| format!("index.json: {e}"))?;
    if idx.schema != 1 { return Err(format!("unsupported index schema {}", idx.schema)); }
    if idx.extensions.len() > 500 { return Err("index too large".into()); }
    for e in &idx.extensions {
        if !valid_ext_id(&e.id) || parse_version(&e.version).is_none() { return Err(format!("invalid index entry '{}'", e.id)); }
    }
    Ok(idx)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MarketEntry {
    id: String,
    version: String,
    installed_version: Option<String>,
    min_browser: Option<String>,
    name: String,
    description: String,
    author: String,
    license: String,
    /// installed | available | update-in-next-release | incompatible | not-bundled
    status: String,
    enabled: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MarketResult { fetched_at: u64, index_url: String, hotfix_install_enabled: bool, entries: Vec<MarketEntry> }

fn market_entries(idx: &MarketIndex, lang: &str) -> Vec<MarketEntry> {
    let st = read();
    idx.extensions.iter().map(|ie| {
        let local = st.exts.iter().find(|e| e.manifest.id == ie.id);
        let enabled = local.is_some_and(|e| active(&st, e));
        let status = if !browser_ok(ie.min_browser.as_deref(), BROWSER_VERSION) { "incompatible" }
            else if let Some(l) = local {
                if l.error.is_some() { "incompatible" }
                else if cmp_versions(&ie.version, &l.manifest.version) == Some(CmpOrdering::Greater) { "update-in-next-release" }
                else if enabled { "installed" } else { "available" }
            } else { "not-bundled" };
        MarketEntry {
            id: ie.id.clone(), version: ie.version.clone(), installed_version: local.map(|l| l.manifest.version.clone()),
            min_browser: ie.min_browser.clone(),
            name: Manifest::localized(&ie.name, lang).to_string(), description: Manifest::localized(&ie.description, lang).to_string(),
            author: ie.author.clone(), license: ie.license.clone(), status: status.into(), enabled,
        }
    }).collect()
}

// ---------- Commands ----------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExtInfo {
    id: String,
    version: String,
    name: String,
    description: String,
    author: String,
    license: String,
    icon_svg: Option<String>,
    permissions: Vec<String>,
    matches: Vec<String>,
    source: String,
    enabled: bool,
    compatible: bool,
    error: Option<String>,
    min_browser: Option<String>,
    site_off: Vec<String>,
    blocked: u64,
    /// Newer version from the last market_fetch (arrives with the next release).
    update_version: Option<String>,
}

fn list(lang: &str) -> Vec<ExtInfo> {
    let pending = lock(&PENDING).clone().unwrap_or_default();
    let st = read();
    st.exts.iter().map(|e| {
        let id = e.manifest.id.clone();
        let update_version = st.market.as_ref().and_then(|m| m.entries.iter().find(|x| x.id == id && x.status == "update-in-next-release").map(|x| x.version.clone()));
        ExtInfo {
            version: e.manifest.version.clone(),
            name: Manifest::localized(&e.manifest.name, lang).to_string(),
            description: Manifest::localized(&e.manifest.description, lang).to_string(),
            author: e.manifest.author.clone(), license: e.manifest.license.clone(), icon_svg: e.icon_svg.clone(),
            permissions: e.manifest.permissions.clone(), matches: e.manifest.matches.clone(), source: e.source.clone(),
            enabled: active(&st, e), compatible: e.error.is_none(), error: e.error.clone(), min_browser: e.manifest.min_browser.clone(),
            site_off: st.site_off.get(&id).cloned().unwrap_or_default(),
            blocked: st.blocked.get(&id).copied().unwrap_or(0) + pending.get(&id).copied().unwrap_or(0),
            update_version, id,
        }
    }).collect()
}

fn lang_or_default(lang: Option<String>) -> String {
    lang.filter(|l| l.len() <= 16 && l.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')).unwrap_or_else(|| "en".into())
}

#[tauri::command]
pub fn ext_list(lang: Option<String>) -> Vec<ExtInfo> { list(&lang_or_default(lang)) }

/// Loader diagnostics: searched path, loaded extensions and per-folder errors.
#[tauri::command]
pub fn ext_diagnostics() -> Diagnostics { read().diag.clone() }

/// Install/uninstall of a bundled extension = enable/disable.
#[tauri::command]
pub fn ext_toggle(app: AppHandle, id: String, enabled: bool, lang: Option<String>) -> Result<Vec<ExtInfo>, String> {
    if !valid_ext_id(&id) { return Err("invalid extension id".into()); }
    {
        let mut st = write();
        let e = st.exts.iter().find(|e| e.manifest.id == id).ok_or("unknown extension")?;
        if enabled { if let Some(err) = &e.error { return Err(err.clone()); } }
        storage::ext_set_enabled(&id, enabled)?;
        st.enabled.insert(id.clone(), enabled);
    }
    tracing::info!("extension {id} enabled={enabled}");
    install_engines(&app);
    refresh_tabs(&app);
    Ok(list(&lang_or_default(lang)))
}

/// Switch an extension off (enabled = false) or back on for one site (host incl. subdomains).
#[tauri::command]
pub fn ext_site_toggle(app: AppHandle, id: String, host: String, enabled: bool, lang: Option<String>) -> Result<Vec<ExtInfo>, String> {
    if !valid_ext_id(&id) { return Err("invalid extension id".into()); }
    let host = filters::normalize_host(&host).ok_or("invalid host")?;
    {
        let mut st = write();
        if !st.exts.iter().any(|e| e.manifest.id == id) { return Err("unknown extension".into()); }
        let off = st.site_off.entry(id.clone()).or_default();
        off.retain(|h| h != &host);
        if !enabled {
            if off.len() >= MAX_SITE_OFF { return Err("too many sites".into()); }
            off.push(host);
        }
        off.sort();
        let json = serde_json::to_string(off).map_err(|e| e.to_string())?;
        storage::ext_set_site_off(&id, &json)?;
    }
    install_engines(&app);
    refresh_tabs(&app);
    Ok(list(&lang_or_default(lang)))
}

/// Fetches the market index and compares it with the bundled extensions.
#[tauri::command]
pub async fn market_fetch(lang: Option<String>) -> Result<MarketResult, String> {
    let lang = lang_or_default(lang);
    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .user_agent(format!("JTechBrowser/{BROWSER_VERSION} (market)"))
            .build().map_err(|e| e.to_string())?;
        let resp = client.get(MARKET_INDEX_URL).send().map_err(|e| format!("network: {e}"))?;
        if !resp.status().is_success() { return Err(format!("HTTP {}", resp.status())); }
        if resp.content_length().is_some_and(|l| l as usize > MAX_INDEX_BYTES) { return Err("index too large".into()); }
        let text = resp.text().map_err(|e| format!("read: {e}"))?;
        if text.len() > MAX_INDEX_BYTES { return Err("index too large".into()); }
        let idx = parse_index(&text)?;
        let res = MarketResult { fetched_at: now_ms(), index_url: MARKET_INDEX_URL.into(), hotfix_install_enabled: HOTFIX_INSTALL_ENABLED, entries: market_entries(&idx, &lang) };
        write().market = Some(res.clone());
        Ok(res)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANIFEST: &str = r#"{"id":"jtech.test","version":"1.2.0","minBrowser":"0.1.0","name":{"en":"Test","de":"Probe"},
        "description":{"en":"D"},"permissions":["scripts:main-world","network"],"matches":["*://*.twitch.tv/*"],
        "content_scripts":[{"js":["a.js"],"run_at":"document_start","world":"main"}],"filters":["rules.txt"]}"#;

    #[test]
    fn manifest_parse() {
        let m = Manifest::parse(MANIFEST).unwrap();
        assert_eq!(m.id, "jtech.test");
        assert_eq!(m.content_scripts[0].run_at, "document_start");
        assert_eq!(Manifest::localized(&m.name, "de-DE"), "Probe");
        assert_eq!(Manifest::localized(&m.name, "fr"), "Test");
        assert!(Manifest::parse(&MANIFEST.replace("jtech.test", "../evil")).is_err());
        assert!(Manifest::parse(&MANIFEST.replace("\"a.js\"", "\"../a.js\"")).is_err());
        assert!(Manifest::parse(&MANIFEST.replace("\"network\"", "\"tauri\"")).is_err());
        assert!(Manifest::parse(&MANIFEST.replace("\"main\"", "\"isolated\"")).is_err());
        assert!(Manifest::parse(&MANIFEST.replace("\"scripts:main-world\",", "")).is_err());
        assert!(Manifest::parse(&MANIFEST.replace("1.2.0", "x")).is_err());
    }

    #[test]
    fn bundled_twitch_manifest_is_valid() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/extensions/jtech.twitch-adblock");
        let e = load_one(&dir, "bundled").unwrap();
        assert!(e.error.is_none());
        assert!(!e.scripts[0].js.is_empty() && !e.rules.is_empty());
        assert!(any_match(&e.patterns, "https://www.twitch.tv/somechannel"));
    }

    #[test]
    fn loads_real_bundled_folder() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/extensions");
        let (exts, diag) = load_dir_diag(&root, "bundled");
        assert!(diag.errors.is_empty(), "{:?}", diag.errors);
        assert!(!diag.legacy_flat_layout);
        let idx = parse_index(include_str!("../../extensions/index.json")).unwrap();
        for ie in &idx.extensions {
            let e = exts.iter().find(|e| e.manifest.id == ie.id).unwrap_or_else(|| panic!("{} listed in index but not bundled", ie.id));
            assert_eq!(e.manifest.version, ie.version);
        }
    }

    #[test]
    fn loads_legacy_flat_layout() {
        let src = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/extensions/jtech.twitch-adblock");
        let tmp = std::env::temp_dir().join(format!("jtech-ext-flat-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        for f in std::fs::read_dir(&src).unwrap().flatten() { std::fs::copy(f.path(), tmp.join(f.file_name())).unwrap(); }
        let (exts, diag) = load_dir_diag(&tmp, "bundled");
        assert!(diag.legacy_flat_layout);
        assert_eq!(exts.len(), 1);
        assert_eq!(exts[0].manifest.id, "jtech.twitch-adblock");
    }

    #[test]
    fn match_patterns() {
        let p = MatchPattern::parse("*://*.twitch.tv/*").unwrap();
        assert!(p.matches("https://www.twitch.tv/x") && p.matches("https://twitch.tv/") && p.matches("http://player.twitch.tv/?a=1"));
        assert!(!p.matches("https://eviltwitch.tv/") && !p.matches("https://twitch.tv.evil.com/") && !p.matches("ftp://twitch.tv/"));
        let q = MatchPattern::parse("https://example.com/a/*/b").unwrap();
        assert!(q.matches("https://example.com/a/x/y/b") && !q.matches("https://example.com/a/b") && !q.matches("http://example.com/a/x/b"));
        assert!(MatchPattern::parse("<all_urls>").unwrap().matches("https://a.b/"));
        for bad in ["twitch.tv", "file:///x", "https://*x.com/", "https://exa mple.com/"] { assert!(MatchPattern::parse(bad).is_err(), "{bad}"); }
        assert_eq!(p.to_js_regex(), "^https?://(?:[^/:?#]+\\.)?twitch\\.tv(?::\\d+)?\\/.*(?:#.*)?$");
    }

    #[test]
    fn min_browser_gate() {
        assert!(browser_ok(None, "0.1.3"));
        assert!(browser_ok(Some("0.1.3"), "0.1.3"));
        assert!(browser_ok(Some("0.1"), "0.1.3"));
        assert!(!browser_ok(Some("0.2.0"), "0.1.3"));
        assert!(!browser_ok(Some("bad"), "0.1.3"));
        assert_eq!(cmp_versions("1.10.0", "1.9.9"), Some(CmpOrdering::Greater));
        assert_eq!(cmp_versions("1.0.0-beta", "1.0"), Some(CmpOrdering::Equal));
    }

    #[test]
    fn sha256_check() {
        assert_eq!(sha256_hex(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(sha256_hex(&[b'a'; 1000]), "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
        let files: HashMap<String, Vec<u8>> = [("a.js".to_string(), b"abc".to_vec())].into();
        let ok: HashMap<String, String> = [("a.js".to_string(), "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD".to_string())].into();
        assert!(verify_files(&files, &ok).is_ok());
        let bad: HashMap<String, String> = [("a.js".to_string(), "00".to_string())].into();
        assert!(verify_files(&files, &bad).is_err());
        let missing: HashMap<String, String> = [("b.js".to_string(), "00".to_string())].into();
        assert!(verify_files(&files, &missing).is_err());
        assert!(verify_files(&files, &HashMap::new()).is_err());
    }

    #[test]
    fn index_and_injection() {
        let idx = parse_index(r#"{"schema":1,"extensions":[{"id":"jtech.x","version":"1.0.0","files":{"a.js":"00"}}]}"#).unwrap();
        assert_eq!(idx.extensions.len(), 1);
        assert!(parse_index(r#"{"schema":2,"extensions":[]}"#).is_err());
        let pats = vec![MatchPattern::parse("*://*.twitch.tv/*").unwrap()];
        let js = build_injection("jtech.x", &pats, &["example.com".into()], &Prepared { js: "var a='}';".into(), css: "a{b:c}".into(), run_at: "document_start".into() });
        assert!(js.contains("var a='}';") && js.contains("\"example.com\"") && js.contains("\"a{b:c}\""));
    }
}
