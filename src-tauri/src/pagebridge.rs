//! Page bridge: one small, audited script in every content tab (radial menu trigger, Shift+click
//! peek, media session info + controls).
//!
//! Security rules (see docs/ARCHITECTURE.md, "Page bridge"):
//!  - The script is registered with AddScriptToExecuteOnDocumentCreated before a tab's first
//!    navigation and runs in the top frame only.
//!  - Pages talk to Rust only through `window.chrome.webview.postMessage(JSON string)` with the
//!    fixed schema `{jtech: 1, type: "radial" | "peek" | "media", ...}`.
//!  - `parse` validates type and every field (size limits, finite numbers, http(s) URLs only) and
//!    drops everything else. A valid message can only ask the UI to show a menu, open a peek panel
//!    for an http(s) URL or update the audio hub display. No Tauri command, no file or settings
//!    access is reachable from a page.
//!  - Any page script can post the same messages; the effects above are harmless by design, and
//!    peek requests are rate-limited.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// Radial menu via middle-button hold in pages (UI setting).
static RADIAL_MOUSE: AtomicBool = AtomicBool::new(true);
/// Shift+click opens links in the peek panel (UI setting).
static PEEK: AtomicBool = AtomicBool::new(true);
static LAST_PEEK_MS: AtomicU64 = AtomicU64::new(0);
/// Registered script id per webview label (re-registered when the options change).
static SCRIPT_IDS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

pub const MSG_MAX: usize = 8192;
pub const TEXT_MAX: usize = 300;
pub const URL_MAX: usize = 4096;

/// The injected script. `__RADIAL__` / `__PEEK__` are replaced with true/false.
const BRIDGE_TEMPLATE: &str = r#"(function(){'use strict';
try{if(window.top!==window)return;}catch(e){return;}
var wv=window.chrome&&window.chrome.webview;if(!wv||typeof wv.postMessage!=='function')return;
var post=wv.postMessage.bind(wv);
var cfg={radial:__RADIAL__,peek:__PEEK__};
function send(o){o.jtech=1;try{post(JSON.stringify(o));}catch(e){}}
function def(n,v){try{Object.defineProperty(window,n,{value:v,writable:false,configurable:false,enumerable:false});}catch(e){}}
def('__jtechBridgeCfg',function(r,p){cfg.radial=!!r;cfg.peek=!!p;});
var down=null,timer=0,fired=false;
addEventListener('mousedown',function(e){fired=false;if(e.button!==1||!cfg.radial)return;down={x:e.clientX,y:e.clientY};clearTimeout(timer);
timer=setTimeout(function(){if(down){fired=true;send({type:'radial',x:down.x,y:down.y});down=null;}},250);},true);
addEventListener('mousemove',function(e){if(down&&(Math.abs(e.clientX-down.x)>6||Math.abs(e.clientY-down.y)>6)){down=null;clearTimeout(timer);}},true);
addEventListener('mouseup',function(e){if(e.button===1){down=null;clearTimeout(timer);}},true);
addEventListener('auxclick',function(e){if(e.button===1&&fired){fired=false;e.preventDefault();e.stopImmediatePropagation();}},true);
addEventListener('click',function(e){if(!cfg.peek||!e.shiftKey||e.button!==0||e.ctrlKey||e.altKey||e.metaKey)return;
var t=e.target,a=t&&t.closest?t.closest('a[href]'):null;if(!a)return;var u=String(a.href||'');if(!/^https?:/i.test(u))return;
e.preventDefault();e.stopImmediatePropagation();send({type:'peek',url:u.slice(0,4096)});},true);
var ms=navigator.mediaSession,handlers={},vol=-1;
if(ms&&typeof ms.setActionHandler==='function'){var orig=ms.setActionHandler.bind(ms);try{ms.setActionHandler=function(a,h){handlers[a]=h;return orig(a,h);};}catch(e){}}
function media(){return Array.prototype.slice.call(document.querySelectorAll('video,audio'));}
function call(a){var h=handlers[a];if(typeof h==='function'){try{h({action:a});return true;}catch(e){}}return false;}
def('__jtechBridgeCtl',function(a,v){var m=media();
if(a==='play'){if(!call('play')){var p=m.filter(function(x){return x.paused&&x.currentTime>0;})[0]||m[0];if(p)p.play().catch(function(){});}}
else if(a==='pause'){if(!call('pause'))m.forEach(function(x){if(!x.paused)x.pause();});}
else if(a==='next'){call('nexttrack');}else if(a==='prev'){call('previoustrack');}
else if(a==='volume'&&typeof v==='number'&&v>=0&&v<=1){vol=v;m.forEach(function(x){x.volume=v;});}
setTimeout(tick,150);});
document.addEventListener('play',function(e){if(vol>=0&&e.target&&'volume' in e.target)e.target.volume=vol;},true);
var last='';
function s(v){return typeof v==='string'?v.slice(0,300):'';}
function tick(){try{var m=media(),st='none';
for(var i=0;i<m.length;i++){if(!m[i].paused&&!m[i].ended){st='playing';break;}if(m[i].currentTime>0)st='paused';}
var md=ms&&ms.metadata,art='';
if(md&&md.artwork&&md.artwork.length){try{art=new URL(md.artwork[md.artwork.length-1].src,location.href).href;}catch(e){}}
if(!/^https?:/i.test(art))art='';
var o={type:'media',state:st,title:s(md&&md.title),artist:s(md&&md.artist),album:s(md&&md.album),artwork:art.slice(0,2048),
canNext:typeof handlers.nexttrack==='function',canPrev:typeof handlers.previoustrack==='function',volume:vol};
var k=JSON.stringify(o);if(k!==last&&!(st==='none'&&last==='')){last=k;send(o);}}catch(e){}}
setInterval(tick,1500);
})();"#;

pub fn bridge_script(radial: bool, peek: bool) -> String {
    BRIDGE_TEMPLATE.replace("__RADIAL__", if radial { "true" } else { "false" }).replace("__PEEK__", if peek { "true" } else { "false" })
}
fn current_script() -> String { bridge_script(RADIAL_MOUSE.load(Ordering::Relaxed), PEEK.load(Ordering::Relaxed)) }

/// A validated page message.
#[derive(Clone, Debug, PartialEq)]
pub enum BridgeMsg {
    Radial { x: f64, y: f64 },
    Peek { url: String },
    Media { state: String, title: String, artist: String, album: String, artwork: String, can_next: bool, can_prev: bool, volume: f64 },
}

fn text(v: &serde_json::Value, k: &str) -> Option<String> {
    match v.get(k) {
        None | Some(serde_json::Value::Null) => Some(String::new()),
        Some(serde_json::Value::String(s)) => Some(s.chars().filter(|c| !c.is_control()).take(TEXT_MAX).collect()),
        _ => None,
    }
}

/// Only absolute http(s) URLs without credentials.
pub fn web_url(s: &str) -> Option<String> {
    if s.is_empty() || s.len() > URL_MAX { return None; }
    let u = url::Url::parse(s).ok()?;
    if !matches!(u.scheme(), "http" | "https") || !u.username().is_empty() || u.password().is_some() || u.host_str().is_none() { return None; }
    Some(u.to_string())
}

/// Strict validation of a page message. Everything that does not match the schema is `None`.
pub fn parse(raw: &str) -> Option<BridgeMsg> {
    if raw.len() > MSG_MAX { return None; }
    let v: serde_json::Value = serde_json::from_str(raw).ok()?;
    let o = v.as_object()?;
    if o.len() > 12 || o.get("jtech").and_then(|j| j.as_i64()) != Some(1) { return None; }
    let num = |k: &str| v.get(k).and_then(|n| n.as_f64()).filter(|n| n.is_finite() && (-20000.0..=20000.0).contains(n));
    match o.get("type")?.as_str()? {
        "radial" => Some(BridgeMsg::Radial { x: num("x")?, y: num("y")? }),
        "peek" => Some(BridgeMsg::Peek { url: web_url(v.get("url")?.as_str()?)? }),
        "media" => {
            let state = v.get("state")?.as_str()?;
            if !matches!(state, "playing" | "paused" | "none") { return None; }
            let art = text(&v, "artwork")?;
            let artwork = if art.is_empty() { String::new() } else { web_url(&art).unwrap_or_default() };
            let volume = v.get("volume").and_then(|n| n.as_f64()).filter(|n| n.is_finite() && (0.0..=1.0).contains(n)).unwrap_or(-1.0);
            Some(BridgeMsg::Media {
                state: state.to_string(), title: text(&v, "title")?, artist: text(&v, "artist")?, album: text(&v, "album")?, artwork,
                can_next: v.get("canNext").and_then(|b| b.as_bool()).unwrap_or(false),
                can_prev: v.get("canPrev").and_then(|b| b.as_bool()).unwrap_or(false),
                volume,
            })
        }
        _ => None,
    }
}

/// Payload of the "page-bridge" event to the UI.
#[derive(Clone, Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BridgeEvent {
    pub tab_id: String,
    pub kind: String,
    /// radial: page coordinates (CSS px) and the tab's content rectangle (logical px)
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub rect_x: Option<f64>,
    pub rect_y: Option<f64>,
    pub url: Option<String>,
    pub state: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub artwork: Option<String>,
    pub can_next: Option<bool>,
    pub can_prev: Option<bool>,
    pub volume: Option<f64>,
}

fn emit(app: &AppHandle, ev: BridgeEvent) {
    if let Err(e) = app.emit("page-bridge", ev) { tracing::error!("emit page-bridge: {e}"); }
}

/// Handles a validated message (called from WebMessageReceived on the UI thread).
pub fn dispatch(app: &AppHandle, tab_id: &str, msg: BridgeMsg) {
    match msg {
        BridgeMsg::Radial { x, y } => {
            if !RADIAL_MOUSE.load(Ordering::Relaxed) { return; }
            let (app2, id) = (app.clone(), tab_id.to_string());
            // Window/webview getters outside the COM callback.
            tauri::async_runtime::spawn(async move {
                let Some(r) = crate::tab_rect(&app2, &id) else { return };
                emit(&app2, BridgeEvent { tab_id: id, kind: "radial".into(), x: Some(x), y: Some(y), rect_x: Some(r.x), rect_y: Some(r.y), ..Default::default() });
            });
        }
        BridgeMsg::Peek { url } => {
            if !PEEK.load(Ordering::Relaxed) { return; }
            let now = crate::now_ms();
            let last = LAST_PEEK_MS.swap(now, Ordering::Relaxed);
            if now.saturating_sub(last) < 400 { return; }
            emit(app, BridgeEvent { tab_id: tab_id.into(), kind: "peek".into(), url: Some(url), ..Default::default() });
        }
        BridgeMsg::Media { state, title, artist, album, artwork, can_next, can_prev, volume } => {
            emit(app, BridgeEvent { tab_id: tab_id.into(), kind: "media".into(), state: Some(state), title: Some(title), artist: Some(artist), album: Some(album),
                artwork: Some(artwork), can_next: Some(can_next), can_prev: Some(can_prev), volume: Some(volume), ..Default::default() });
        }
    }
}

/// Registers the bridge script on a content webview, then calls `then` (also on failure).
#[cfg(windows)]
pub fn register_then(core: &webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2, label: &str, then: Box<dyn FnOnce()>) {
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    use windows::core::{Interface, PCWSTR};
    let js = current_script();
    let wide: Vec<u16> = js.encode_utf16().chain(std::iter::once(0)).collect();
    let then = std::rc::Rc::new(std::cell::RefCell::new(Some(then)));
    let then2 = then.clone();
    let label2 = label.to_string();
    let h = webview2_com::AddScriptToExecuteOnDocumentCreatedCompletedHandler::create(Box::new(move |_res, script_id| {
        if !script_id.is_empty() {
            crate::lock(&SCRIPT_IDS).get_or_insert_with(HashMap::new).insert(label2.clone(), script_id);
        } else { tracing::warn!(webview = label2.as_str(), "page bridge: registration returned no id"); }
        if let Some(f) = then.borrow_mut().take() { f(); }
        Ok(())
    }));
    let r = h.cast::<SYS::ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler>()
        .and_then(|h| unsafe { core.AddScriptToExecuteOnDocumentCreated(PCWSTR(wide.as_ptr()), &h) });
    if let Err(e) = r {
        tracing::warn!(webview = label, "page bridge: AddScriptToExecuteOnDocumentCreated: {e}");
        if let Some(f) = then2.borrow_mut().take() { f(); }
    }
}

/// Webview closed: forget its script id.
pub fn forget(label: &str) { if let Some(m) = crate::lock(&SCRIPT_IDS).as_mut() { m.remove(label); } }

/// Settings › Radial menu / Peek: which page triggers are active. Re-registers the script in all
/// open tabs (next page load) and updates the running documents right away.
#[tauri::command]
pub fn set_bridge_options(app: AppHandle, radial_mouse: bool, peek: bool) -> Result<(), String> {
    let changed = RADIAL_MOUSE.swap(radial_mouse, Ordering::Relaxed) != radial_mouse;
    let changed = (PEEK.swap(peek, Ordering::Relaxed) != peek) || changed;
    if !changed { return Ok(()); }
    let live = format!("try{{window.__jtechBridgeCfg&&window.__jtechBridgeCfg({radial_mouse},{peek})}}catch(e){{}}");
    for wv in crate::content_webviews(&app) {
        let _ = wv.eval(&live);
        #[cfg(windows)]
        {
            let label = wv.label().to_string();
            let r = wv.with_webview(move |pwv| {
                use windows::core::{Interface, PCWSTR};
                let Ok(core) = unsafe { pwv.controller().CoreWebView2() }.and_then(|c| c.cast::<webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2>()) else { return };
                let old = crate::lock(&SCRIPT_IDS).as_mut().and_then(|m| m.remove(&label));
                if let Some(sid) = old {
                    let wide: Vec<u16> = sid.encode_utf16().chain(std::iter::once(0)).collect();
                    if let Err(e) = unsafe { core.RemoveScriptToExecuteOnDocumentCreated(PCWSTR(wide.as_ptr())) } { tracing::warn!("page bridge remove: {e}"); }
                }
                register_then(&core, &label, Box::new(|| {}));
            });
            if let Err(e) = r { tracing::warn!("set_bridge_options: {e}"); }
        }
    }
    Ok(())
}

pub const MEDIA_ACTIONS: &[&str] = &["play", "pause", "next", "prev", "volume"];

/// Fixed control script (action from the allowlist, volume clamped) – no user text reaches the page.
pub fn media_control_script(action: &str, value: Option<f64>) -> Option<String> {
    if !MEDIA_ACTIONS.contains(&action) { return None; }
    let v = match action {
        "volume" => { let v = value.filter(|v| v.is_finite())?; v.clamp(0.0, 1.0) }
        _ => 0.0,
    };
    Some(format!("try{{window.__jtechBridgeCtl&&window.__jtechBridgeCtl({},{v})}}catch(e){{}}", serde_json::to_string(action).ok()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_is_strict() {
        assert_eq!(parse(r#"{"jtech":1,"type":"radial","x":10,"y":20.5}"#), Some(BridgeMsg::Radial { x: 10.0, y: 20.5 }));
        assert_eq!(parse(r#"{"jtech":2,"type":"radial","x":10,"y":20}"#), None);
        assert_eq!(parse(r#"{"type":"radial","x":10,"y":20}"#), None);
        assert_eq!(parse(r#"{"jtech":1,"type":"radial","x":"10","y":20}"#), None);
        assert_eq!(parse(r#"{"jtech":1,"type":"invoke","cmd":"x"}"#), None);
        assert_eq!(parse(r#"{"jtech":1,"type":"peek","url":"javascript:alert(1)"}"#), None);
        assert_eq!(parse(r#"{"jtech":1,"type":"peek","url":"file:///C:/x"}"#), None);
        assert_eq!(parse(r#"{"jtech":1,"type":"peek","url":"https://u:p@example.com/"}"#), None);
        assert!(matches!(parse(r#"{"jtech":1,"type":"peek","url":"https://example.com/a"}"#), Some(BridgeMsg::Peek { .. })));
        assert_eq!(parse(r#"{"jtech":1,"type":"media","state":"weird"}"#), None);
        let m = parse(r#"{"jtech":1,"type":"media","state":"playing","title":"T","artwork":"javascript:x","volume":3}"#);
        assert!(matches!(m, Some(BridgeMsg::Media { ref artwork, volume, .. }) if artwork.is_empty() && volume < 0.0));
        assert_eq!(parse("not json"), None);
        assert_eq!(parse(&"x".repeat(MSG_MAX + 1)), None);
    }

    #[test]
    fn media_scripts_are_fixed() {
        assert!(media_control_script("eval", None).is_none());
        assert!(media_control_script("volume", None).is_none());
        assert!(media_control_script("volume", Some(7.0)).unwrap().contains(",1)"));
        assert!(media_control_script("play", None).is_some());
        assert!(bridge_script(true, false).contains("radial:true,peek:false"));
    }
}
