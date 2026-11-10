use std::sync::{atomic::Ordering, Mutex};
use tauri::{AppHandle, Manager};

use crate::{fullscreen::check_fullscreen_tab, 
    active_is_page, active_tab, apply_layout, create_tab_with,
    destroy_webview, emit_tabs_changed, lock, needs_webview, normalize_url, report_error,
    schedule_page_webview, schedule_wake, snapshot_tabs, valid_tab_id,
    BLOCKED, SleepInfo, TabInfo, TabManager,
};
#[tauri::command]
pub fn get_blocked_count() -> u64 { BLOCKED.load(Ordering::Relaxed) }

#[tauri::command]
pub fn list_tabs(app: AppHandle) -> Vec<TabInfo> { snapshot_tabs(&app) }

/// async: Webview-Erzeugung in einem synchronen Command kann unter Windows deadlocken.
#[tauri::command]
pub async fn new_tab(app: AppHandle, url: String, background: Option<bool>) -> Result<String, String> {
    create_tab_with(&app, &url, background != Some(true)).inspect_err(|e| report_error(&app, "", "new_tab", e))
}

#[tauri::command]
pub fn close_tab(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_tab_id(&id) { return Err("ungueltige Tab-ID".into()); }
    // Removes the tab (with webview, sleeping or webview-less), ends split view if it was a pane,
    // picks the next active tab and reports a sleeping one to wake.
    let (removed, wake) = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        m.remove_tab(&id)?
    };
    if let Some(tab) = removed { destroy_webview(&app, &id, tab); }
    check_fullscreen_tab(&app);
    apply_layout(&app);
    emit_tabs_changed(&app);
    if let Some(w) = wake { schedule_wake(&app, w); }
    Ok(())
}

/// Runde 3 (Tab-Schlaf): Webview eines inaktiven Tabs zerstoeren; URL/Titel bleiben erhalten.
/// Nie fuer den aktiven oder einen Audio abspielenden Tab (angeheftete filtert die UI).
#[tauri::command]
pub fn sleep_tab(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_tab_id(&id) { return Err(format!("ungueltige Tab-ID '{id}'")); }
    let tab = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        if m.active.as_deref() == Some(id.as_str()) { return Err("aktiver Tab wird nicht schlafen gelegt".into()); }
        if m.split.as_ref().is_some_and(|s| s.a == id || s.b == id) { return Err("Tab in geteilter Ansicht wird nicht schlafen gelegt".into()); }
        if m.pages.contains_key(&id) { return Ok(()); } // no webview, nothing to release
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
pub fn switch_tab(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_tab_id(&id) { return Err("ungueltige Tab-ID".into()); }
    let wake = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        let sleeping = m.sleeping.contains_key(&id);
        if !m.knows(&id) { return Err(format!("Tab {id} nicht gefunden")); }
        m.active = Some(id.clone());
        sleeping
    };
    check_fullscreen_tab(&app);
    apply_layout(&app);
    emit_tabs_changed(&app);
    if wake { schedule_wake(&app, id); }
    Ok(())
}

#[tauri::command]
pub fn navigate_active(app: AppHandle, url: String) -> Result<String, String> {
    let parsed = normalize_url(&url)?;
    // Webview-less tab (internal page): create its webview for the real URL.
    let page = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        m.active.clone().filter(|a| m.pages.contains_key(a)).map(|a| {
            let start = needs_webview(parsed.as_str()) && m.request_page_webview(&a, parsed.as_str());
            (a, start)
        })
    };
    if let Some((id, start)) = page {
        tracing::info!(tab = id.as_str(), "navigate {parsed} (Webview wird erzeugt)");
        if start { schedule_page_webview(&app, id); }
        emit_tabs_changed(&app);
        return Ok(parsed.to_string());
    }
    let Some((id, tab)) = active_tab(&app) else {
        // kein Tab offen -> neuen anlegen ist hier nicht erlaubt (sync command), UI ruft new_tab
        return Err("kein aktiver Tab".into());
    };
    tracing::info!(tab = id.as_str(), "navigate {parsed}");
    tab.webview.navigate(parsed.clone()).map_err(|e| { report_error(&app, &id, "navigate", &e); e.to_string() })?;
    Ok(parsed.to_string())
}

#[tauri::command]
pub fn reload_active(app: AppHandle) -> Result<(), String> {
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
    if active_is_page(app) { return Ok(()); } // internal page: no history of its own
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
pub fn go_back(app: AppHandle) -> Result<(), String> { native_active(&app, "back") }
#[cfg(windows)]
#[tauri::command]
pub fn go_forward(app: AppHandle) -> Result<(), String> { native_active(&app, "forward") }
#[cfg(windows)]
#[tauri::command]
pub fn stop_active(app: AppHandle) -> Result<(), String> { native_active(&app, "stop") }

#[cfg(not(windows))]
#[tauri::command]
pub fn go_back(app: AppHandle) -> Result<(), String> { eval_active(&app, "go_back", "history.back()") }
#[cfg(not(windows))]
#[tauri::command]
pub fn go_forward(app: AppHandle) -> Result<(), String> { eval_active(&app, "go_forward", "history.forward()") }
#[cfg(not(windows))]
#[tauri::command]
pub fn stop_active(app: AppHandle) -> Result<(), String> { eval_active(&app, "stop", "window.stop()") }

/// Aktive Content-Webview zeigen/verstecken (interne Seiten jtech://..., Menues, Dialoge).
#[tauri::command]
pub fn set_content_visible(app: AppHandle, visible: bool) -> Result<(), String> {
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
pub fn reorder_tabs(app: AppHandle, order: Vec<String>) -> Result<(), String> {
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

/// Port (Audio-Hub): Tab stumm/laut schalten (WebView2 ICoreWebView2_8::SetIsMuted).
#[tauri::command]
pub fn set_tab_muted(app: AppHandle, id: String, muted: bool) -> Result<(), String> {
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


