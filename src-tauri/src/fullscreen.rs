use std::sync::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::{apply_layout, emit_tabs_changed, lock, report_error, TabManager};
#[derive(Clone, Debug)]
pub(super) struct FullscreenState {
    /// Tab, dessen Seite ein Element im Vollbild hat (requestFullscreen).
    pub(super) page_tab: Option<String>,
    /// Browser-Vollbild per F11 / Befehl.
    pub(super) browser: bool,
    /// Fensterzustand vor dem Vollbild (Groesse/Position stellt tao beim Verlassen selbst wieder her).
    pub(super) was_maximized: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FullscreenEvent { tab_id: Option<String>, fullscreen: bool, page: bool, browser: bool }

// ---------- Vollbild ----------

fn emit_fullscreen(app: &AppHandle) {
    let ev = {
        let state = app.state::<Mutex<TabManager>>();
        let m = lock(&state);
        match &m.fullscreen {
            Some(f) => FullscreenEvent { tab_id: f.page_tab.clone(), fullscreen: true, page: f.page_tab.is_some(), browser: f.browser },
            None => FullscreenEvent { tab_id: None, fullscreen: false, page: false, browser: false },
        }
    };
    if let Err(e) = app.emit("content-fullscreen", ev) { tracing::error!("emit content-fullscreen: {e}"); }
}

/// Vollbild-Zustand aendern. page: Some(Some(id)) = Seite betritt, Some(None) = Seite verlaesst;
/// browser: Some(b) = F11-Zustand setzen. Fenster geht in Vollbild, solange einer von beiden aktiv ist.
fn update_fullscreen(app: &AppHandle, page: Option<Option<String>>, browser: Option<bool>) {
    let Some(window) = ({ let state = app.state::<Mutex<TabManager>>(); let m = lock(&state); m.window.clone() }) else { return };
    let was_max_now = window.is_maximized().unwrap_or(false);
    let (enter, leave) = {
        let state = app.state::<Mutex<TabManager>>();
        let mut m = lock(&state);
        let before = m.fullscreen.clone();
        let mut f = before.clone().unwrap_or(FullscreenState { page_tab: None, browser: false, was_maximized: was_max_now });
        if let Some(p) = page { f.page_tab = p; }
        if let Some(b) = browser { f.browser = b; }
        let active = f.page_tab.is_some() || f.browser;
        m.fullscreen = if active { Some(f) } else { None };
        (before.is_none() && active, before.as_ref().filter(|_| !active).map(|b| b.was_maximized))
    };
    if enter {
        tracing::info!("Vollbild an (vorher maximiert: {was_max_now})");
        if let Err(e) = window.set_fullscreen(true) { report_error(app, "", "set_fullscreen(true)", e); }
    }
    if let Some(was_max) = leave {
        tracing::info!("Vollbild aus (wieder maximieren: {was_max})");
        if let Err(e) = window.set_fullscreen(false) { report_error(app, "", "set_fullscreen(false)", e); }
        if was_max { if let Err(e) = window.maximize() { report_error(app, "", "maximize", e); } }
    }
    apply_layout(app);
    emit_fullscreen(app);
}

/// Seite meldet ContainsFullScreenElement. Nur der aktive Tab darf das Fenster in Vollbild schalten.
pub(super) fn page_fullscreen_changed(app: &AppHandle, tab_id: &str, on: bool) {
    let (is_active, is_fs_tab) = {
        let state = app.state::<Mutex<TabManager>>();
        let m = lock(&state);
        let in_split = m.split.as_ref().is_some_and(|s| (s.a == tab_id || s.b == tab_id) && m.active.as_deref().is_some_and(|a| a == s.a || a == s.b));
        (m.active.as_deref() == Some(tab_id) || in_split, m.fullscreen.as_ref().and_then(|f| f.page_tab.as_deref()) == Some(tab_id))
    };
    if on && is_active {
        // Geteilte Ansicht: der Bereich, der Vollbild anfordert, wird fokussiert.
        {
            let state = app.state::<Mutex<TabManager>>();
            let mut m = lock(&state);
            if m.active.as_deref() != Some(tab_id) { m.active = Some(tab_id.to_string()); }
        }
        emit_tabs_changed(app); update_fullscreen(app, Some(Some(tab_id.to_string())), None); }
    else if !on && is_fs_tab { update_fullscreen(app, Some(None), None); }
}

/// Nach Tab-Wechsel/-Schliessen: Element-Vollbild eines nicht mehr aktiven Tabs beenden.
pub(super) fn check_fullscreen_tab(app: &AppHandle) {
    let stale = {
        let state = app.state::<Mutex<TabManager>>();
        let m = lock(&state);
        m.fullscreen.as_ref().and_then(|f| f.page_tab.clone()).filter(|t| m.active.as_deref() != Some(t.as_str()))
            .map(|t| (t.clone(), m.tabs.get(&t).map(|x| x.webview.clone())))
    };
    let Some((_id, wv)) = stale else { return };
    if let Some(wv) = wv { let _ = wv.eval("try{document.fullscreenElement&&document.exitFullscreen()}catch(e){}"); }
    update_fullscreen(app, Some(None), None);
}

/// F11: Browser-Vollbild umschalten (beendet auch ein Element-Vollbild der Seite).
#[tauri::command]
pub fn toggle_fullscreen(app: AppHandle) -> Result<bool, String> {
    let (on, page_wv) = {
        let state = app.state::<Mutex<TabManager>>();
        let m = lock(&state);
        let page_wv = m.fullscreen.as_ref().and_then(|f| f.page_tab.as_ref()).and_then(|t| m.tabs.get(t)).map(|t| t.webview.clone());
        (m.fullscreen.is_some(), page_wv)
    };
    if on {
        if let Some(wv) = page_wv { let _ = wv.eval("try{document.fullscreenElement&&document.exitFullscreen()}catch(e){}"); }
        update_fullscreen(&app, Some(None), Some(false));
    } else {
        update_fullscreen(&app, None, Some(true));
    }
    Ok(!on)
}

