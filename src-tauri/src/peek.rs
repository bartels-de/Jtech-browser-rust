//! Peek panel: a second native WebView2 floating over the content area (Shift+click on a link,
//! context menu "Open in peek"). The UI draws the frame (title, "open in new tab", close) outside
//! the webview's rectangle and passes the rectangle in logical pixels.
//!
//! The peek webview is a plain website view: no Tauri IPC (remote URL, no capability), no page
//! bridge, no extension scripts and no ad blocking. Esc (AcceleratorKeyPressed) closes it,
//! popups open as normal tabs.

use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize};

static PEEK: Mutex<Option<tauri::Webview>> = Mutex::new(None);
static COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct PeekEvent { kind: String, value: Option<String> }

fn emit(app: &AppHandle, kind: &str, value: Option<String>) {
    if let Err(e) = app.emit("peek-event", PeekEvent { kind: kind.into(), value }) { tracing::error!("emit peek-event: {e}"); }
}

fn rect(x: f64, y: f64, w: f64, h: f64) -> Result<(f64, f64, f64, f64), String> {
    if ![x, y, w, h].iter().all(|v| v.is_finite()) { return Err("Peek: ungueltige Masse".into()); }
    Ok((x.clamp(0.0, 20000.0), y.clamp(0.0, 20000.0), w.clamp(80.0, 20000.0), h.clamp(60.0, 20000.0)))
}

fn current() -> Option<tauri::Webview> { crate::lock(&PEEK).clone() }

/// Opens (or re-targets) the peek panel. async: creating a webview in a sync command can deadlock.
#[tauri::command]
pub async fn peek_open(app: AppHandle, url: String, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    let url = crate::pagebridge::web_url(url.trim()).ok_or("Peek: nur http(s)-Adressen")?;
    let parsed: tauri::Url = url.parse().map_err(|e| format!("Peek: {e}"))?;
    let (x, y, w, h) = rect(x, y, w, h)?;
    if let Some(wv) = current() {
        wv.navigate(parsed).map_err(|e| e.to_string())?;
        let _ = wv.set_position(LogicalPosition::new(x, y));
        let _ = wv.set_size(LogicalSize::new(w, h));
        let _ = wv.show();
        return Ok(());
    }
    let window = crate::main_window(&app).ok_or("kein Hauptfenster")?;
    let label = format!("peek-{}", COUNTER.fetch_add(1, Ordering::Relaxed) + 1);
    let wv = window.add_child(
        tauri::webview::WebviewBuilder::new(&label, tauri::WebviewUrl::External(parsed)),
        LogicalPosition::new(x, y),
        LogicalSize::new(w, h),
    ).map_err(|e| format!("peek add_child: {e}"))?;
    *crate::lock(&PEEK) = Some(wv.clone());
    #[cfg(windows)]
    {
        let app2 = app.clone();
        if let Err(e) = wv.with_webview(move |pwv| unsafe { attach(&pwv, &app2) }) { tracing::warn!("peek with_webview: {e}"); }
    }
    Ok(())
}

/// New rectangle / visibility (window resize, menus over the content).
#[tauri::command]
pub fn peek_bounds(x: f64, y: f64, w: f64, h: f64, visible: bool) -> Result<(), String> {
    let Some(wv) = current() else { return Ok(()) };
    let (x, y, w, h) = rect(x, y, w, h)?;
    wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    wv.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
    let r = if visible { wv.show() } else { wv.hide() };
    r.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn peek_close() -> Result<(), String> {
    let wv = crate::lock(&PEEK).take();
    if let Some(wv) = wv { wv.close().map_err(|e| e.to_string())?; }
    Ok(())
}

#[cfg(windows)]
unsafe fn attach(pwv: &tauri::webview::PlatformWebview, app: &AppHandle) {
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    use windows::core::{Interface, PWSTR};
    use webview2_com::take_pwstr;
    let Ok(core) = (unsafe { pwv.controller().CoreWebView2() }).and_then(|c| c.cast::<SYS::ICoreWebView2>()) else { return };
    let Ok(ctl) = pwv.controller().cast::<SYS::ICoreWebView2Controller>() else { return };
    let mut tok = 0i64;
    {
        let app = app.clone();
        let h = webview2_com::DocumentTitleChangedEventHandler::create(Box::new(move |sender, _a| {
            if let Some(s) = sender { let mut p = PWSTR::null(); unsafe { s.DocumentTitle(&mut p)? }; emit(&app, "title", Some(take_pwstr(p))); }
            Ok(())
        }));
        if let Ok(h) = h.cast::<SYS::ICoreWebView2DocumentTitleChangedEventHandler>() { let _ = unsafe { core.add_DocumentTitleChanged(&h, &mut tok) }; }
    }
    {
        let app = app.clone();
        let h = webview2_com::SourceChangedEventHandler::create(Box::new(move |sender, _a| {
            if let Some(s) = sender { let mut p = PWSTR::null(); unsafe { s.Source(&mut p)? }; emit(&app, "url", Some(take_pwstr(p))); }
            Ok(())
        }));
        if let Ok(h) = h.cast::<SYS::ICoreWebView2SourceChangedEventHandler>() { let _ = unsafe { core.add_SourceChanged(&h, &mut tok) }; }
    }
    {
        let app = app.clone();
        let h = webview2_com::NewWindowRequestedEventHandler::create(Box::new(move |_s, args| {
            let Some(args) = args else { return Ok(()) };
            let mut p = PWSTR::null();
            unsafe { args.Uri(&mut p)? };
            let uri = take_pwstr(p);
            let mut user = Default::default();
            let _ = unsafe { args.IsUserInitiated(&mut user) };
            let user: bool = user.as_bool();
            unsafe { args.SetHandled(true.into())? };
            if user && crate::pagebridge::web_url(&uri).is_some() { emit(&app, "open-tab", Some(uri)); }
            Ok(())
        }));
        if let Ok(h) = h.cast::<SYS::ICoreWebView2NewWindowRequestedEventHandler>() { let _ = unsafe { core.add_NewWindowRequested(&h, &mut tok) }; }
    }
    {
        let app = app.clone();
        let h = webview2_com::AcceleratorKeyPressedEventHandler::create(Box::new(move |_s, args| {
            let Some(args) = args else { return Ok(()) };
            let mut kind = SYS::COREWEBVIEW2_KEY_EVENT_KIND::default();
            unsafe { args.KeyEventKind(&mut kind)? };
            if kind != SYS::COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN { return Ok(()); }
            let mut vk = 0u32;
            unsafe { args.VirtualKey(&mut vk)? };
            if vk == 0x1B { unsafe { args.SetHandled(true.into())? }; emit(&app, "escape", None); }
            Ok(())
        }));
        if let Ok(h) = h.cast::<SYS::ICoreWebView2AcceleratorKeyPressedEventHandler>() { let _ = unsafe { ctl.add_AcceleratorKeyPressed(&h, &mut tok) }; }
    }
    crate::apply_devtools(&core, crate::DEVTOOLS.load(Ordering::Relaxed));
}
