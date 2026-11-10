//! Download lifecycle and file actions for WebView2 downloads.
//!
//! Keeps transfer state, WebView2 callbacks, IPC commands, and path checks together so the
//! application root only needs to register the subsystem's handler and commands.

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

use crate::{lock, now_ms, report_error};

#[derive(Clone, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DownloadInfo {
    id: u64,
    tab_id: String,
    url: String,
    path: String,
    file_name: String,
    received: i64,
    speed_bytes_per_sec: u64,
    /// -1 = unknown size.
    total: i64,
    /// progressing | interrupted | completed.
    state: String,
    paused: bool,
    can_resume: bool,
    interrupt_reason: i32,
    started_at: u64,
}

static DOWNLOADS: Mutex<Vec<DownloadInfo>> = Mutex::new(Vec::new());
static DL_COUNTER: AtomicU64 = AtomicU64::new(0);
const DL_KEEP: usize = 300;
static DL_RATE: OnceLock<Mutex<HashMap<u64, (i64, std::time::Instant)>>> = OnceLock::new();

fn rates() -> &'static Mutex<HashMap<u64, (i64, std::time::Instant)>> {
    DL_RATE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(windows)]
thread_local! {
    /// COM objects stay on the UI thread where WebView2 callbacks run.
    static DL_OPS: std::cell::RefCell<HashMap<u64, webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2DownloadOperation>> = std::cell::RefCell::new(HashMap::new());
    static DL_LAST_EMIT: std::cell::RefCell<HashMap<u64, std::time::Instant>> = std::cell::RefCell::new(HashMap::new());
}

fn emit_download(app: &AppHandle, download: &DownloadInfo) {
    if let Err(error) = app.emit("download-event", download.clone()) {
        tracing::error!("emit download-event: {error}");
    }
}

/// Refresh a WebView2 operation and notify the UI (progress at most every 250 ms).
#[cfg(windows)]
unsafe fn refresh_download(
    app: &AppHandle,
    id: u64,
    operation: &webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2DownloadOperation,
    force: bool,
) {
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;

    let mut received = 0i64;
    let _ = unsafe { operation.BytesReceived(&mut received) };
    let mut total = 0i64;
    let _ = unsafe { operation.TotalBytesToReceive(&mut total) };
    let mut state_value = SYS::COREWEBVIEW2_DOWNLOAD_STATE::default();
    let _ = unsafe { operation.State(&mut state_value) };
    let mut reason = SYS::COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON::default();
    let _ = unsafe { operation.InterruptReason(&mut reason) };
    let mut can_resume = Default::default();
    let _ = unsafe { operation.CanResume(&mut can_resume) };
    let can_resume: bool = can_resume.as_bool();
    let state = match state_value {
        SYS::COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED => "completed",
        SYS::COREWEBVIEW2_DOWNLOAD_STATE_INTERRUPTED => "interrupted",
        _ => "progressing",
    };

    if !force && state == "progressing" {
        let now = std::time::Instant::now();
        let skip = DL_LAST_EMIT.with(|emits| {
            let mut emits = emits.borrow_mut();
            if emits.get(&id).is_some_and(|last| now.duration_since(*last).as_millis() < 250) {
                return true;
            }
            emits.insert(id, now);
            false
        });
        if skip { return; }
    }

    let snapshot = {
        let now = std::time::Instant::now();
        let speed = {
            let mut rates = lock(rates());
            let speed = rates.get(&id).and_then(|(previous_bytes, previous_time)| {
                let elapsed = now.duration_since(*previous_time).as_secs_f64();
                (elapsed >= 0.25 && received >= *previous_bytes)
                    .then(|| ((received - *previous_bytes) as f64 / elapsed) as u64)
            }).unwrap_or(0);
            rates.insert(id, (received, now));
            speed
        };
        let mut downloads = lock(&DOWNLOADS);
        let Some(download) = downloads.iter_mut().find(|download| download.id == id) else { return };
        download.received = received;
        download.speed_bytes_per_sec = if state == "progressing" { speed } else { 0 };
        download.total = total;
        download.state = state.into();
        download.can_resume = can_resume;
        download.interrupt_reason = reason.0;
        if state != "interrupted" { download.paused = false; }
        // COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON_USER_PAUSED = 28 (WebView2 header).
        if state == "interrupted" && reason.0 == 28 { download.paused = true; }
        download.clone()
    };

    if state == "completed" {
        DL_OPS.with(|ops| { ops.borrow_mut().remove(&id); });
        DL_LAST_EMIT.with(|emits| { emits.borrow_mut().remove(&id); });
        lock(rates()).remove(&id);
        tracing::info!("Download #{id} finished: {}", snapshot.path);
    }
    emit_download(app, &snapshot);
}

/// Register WebView2's download event handler on a content webview.
#[cfg(windows)]
pub(super) fn attach_to_webview(
    app: &AppHandle,
    tab_id: &str,
    core: &webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    push_token: impl Fn(&'static str, i64),
) -> Result<(), String> {
    use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;
    use windows::core::Interface;

    let core = match core.cast::<SYS::ICoreWebView2_4>() {
        Ok(core) => core,
        Err(error) => {
            tracing::warn!(tab = tab_id, "ICoreWebView2_4 unavailable (download manager disabled): {error}");
            return Ok(());
        }
    };
    let (app, tab_id) = (app.clone(), tab_id.to_string());
    let handler = webview2_com::DownloadStartingEventHandler::create(Box::new(move |_sender, args| {
        let Some(args) = args else { return Ok(()) };
        let operation = unsafe { args.DownloadOperation()? };
        unsafe { args.SetHandled(true.into())? };

        let id = DL_COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
        let mut value = windows::core::PWSTR::null();
        let _ = unsafe { operation.Uri(&mut value) };
        let url = webview2_com::take_pwstr(value);
        let mut value = windows::core::PWSTR::null();
        let _ = unsafe { args.ResultFilePath(&mut value) };
        let path = webview2_com::take_pwstr(value);
        let file_name = Path::new(&path).file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        tracing::info!(tab = tab_id.as_str(), "DownloadStarting #{id} {url} -> {path}");

        {
            let mut downloads = lock(&DOWNLOADS);
            downloads.push(DownloadInfo {
                id,
                tab_id: tab_id.clone(),
                url,
                path,
                file_name,
                total: -1,
                state: "progressing".into(),
                started_at: now_ms(),
                ..Default::default()
            });
            if downloads.len() > DL_KEEP {
                if let Some(index) = downloads.iter().position(|download| download.state != "progressing") {
                    downloads.remove(index);
                }
            }
        }

        let app_for_bytes = app.clone();
        let bytes_handler = webview2_com::BytesReceivedChangedEventHandler::create(Box::new(move |sender, _args| {
            if let Some(operation) = sender { unsafe { refresh_download(&app_for_bytes, id, &operation, false) }; }
            Ok(())
        }));
        let bytes_handler: SYS::ICoreWebView2BytesReceivedChangedEventHandler = bytes_handler.cast()?;
        let mut bytes_token = 0i64;
        unsafe { operation.add_BytesReceivedChanged(&bytes_handler, &mut bytes_token)? };

        let app_for_state = app.clone();
        let state_handler = webview2_com::StateChangedEventHandler::create(Box::new(move |sender, _args| {
            if let Some(operation) = sender { unsafe { refresh_download(&app_for_state, id, &operation, true) }; }
            Ok(())
        }));
        let state_handler: SYS::ICoreWebView2StateChangedEventHandler = state_handler.cast()?;
        let mut state_token = 0i64;
        unsafe { operation.add_StateChanged(&state_handler, &mut state_token)? };

        DL_OPS.with(|ops| { ops.borrow_mut().insert(id, operation.clone()); });
        unsafe { refresh_download(&app, id, &operation, true) };
        Ok(())
    }));
    let handler: SYS::ICoreWebView2DownloadStartingEventHandler = handler.cast().map_err(|e| format!("cast DownloadStarting: {e}"))?;
    let mut token = 0i64;
    unsafe { core.add_DownloadStarting(&handler, &mut token) }.map_err(|e| format!("add_DownloadStarting: {e}"))?;
    push_token("DownloadStarting", token);
    Ok(())
}

#[tauri::command]
pub fn list_downloads() -> Vec<DownloadInfo> { lock(&DOWNLOADS).clone() }

/// pause | resume | cancel for an active download.
#[tauri::command]
pub fn download_action(app: AppHandle, id: u64, action: String) -> Result<(), String> {
    if !matches!(action.as_str(), "pause" | "resume" | "cancel") {
        return Err(format!("unbekannte Aktion '{action}'"));
    }
    if !lock(&DOWNLOADS).iter().any(|download| download.id == id) {
        return Err(format!("Download {id} unbekannt"));
    }
    #[cfg(windows)]
    {
        let app_for_ui = app.clone();
        app.run_on_main_thread(move || {
            let Some(operation) = DL_OPS.with(|ops| ops.borrow().get(&id).cloned()) else {
                report_error(&app_for_ui, "", "Download", format!("Download {id} ist nicht mehr aktiv"));
                return;
            };
            let result = unsafe { match action.as_str() { "pause" => operation.Pause(), "resume" => operation.Resume(), _ => operation.Cancel() } };
            match result {
                Ok(()) => {
                    if let Some(download) = lock(&DOWNLOADS).iter_mut().find(|download| download.id == id) {
                        download.paused = action == "pause";
                    }
                    tracing::info!("Download #{id}: {action}");
                    unsafe { refresh_download(&app_for_ui, id, &operation, true) };
                    if action == "pause" {
                        if let Some(download) = lock(&DOWNLOADS).iter().find(|download| download.id == id).cloned() {
                            emit_download(&app_for_ui, &download);
                        }
                    }
                }
                Err(error) => report_error(&app_for_ui, "", &format!("Download {action}"), error),
            }
        }).map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    { let _ = app; Err("Downloads nur unter Windows/WebView2".into()) }
}

/// Ensure a downloaded file still exists inside the user's download folder.
fn validated_download_path(app: &AppHandle, raw: &str) -> Result<PathBuf, String> {
    let dir = app.path().download_dir().map_err(|e| format!("Download-Ordner: {e}"))?;
    let dir = std::fs::canonicalize(&dir).map_err(|e| format!("Download-Ordner: {e}"))?;
    let path = std::fs::canonicalize(raw).map_err(|e| format!("Datei nicht gefunden: {e}"))?;
    if !path.starts_with(&dir) { return Err("Datei liegt nicht im Download-Ordner".into()); }
    Ok(path)
}

fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy().to_string();
    value.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(value)
}

/// Executables and script-like files can only be revealed, not launched from the download list.
pub(crate) fn is_risky_extension(path: &str) -> bool {
    const RISKY: &[&str] = &["exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "lnk", "reg", "jar", "cpl", "msc", "pif", "appx", "msix"];
    Path::new(path).extension().and_then(|extension| extension.to_str())
        .is_some_and(|extension| RISKY.contains(&extension.to_ascii_lowercase().as_str()))
}

#[tauri::command]
pub fn open_download(app: AppHandle, id: u64, reveal: bool) -> Result<(), String> {
    let (path, state) = lock(&DOWNLOADS).iter().find(|download| download.id == id)
        .map(|download| (download.path.clone(), download.state.clone()))
        .ok_or_else(|| format!("Download {id} unbekannt"))?;
    if !reveal && state != "completed" { return Err("Download ist noch nicht fertig".into()); }
    let path = validated_download_path(&app, &path)?;
    let shown = display_path(&path);
    if reveal {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("explorer").raw_arg(format!("/select,\"{shown}\""))
                .spawn().map_err(|e| format!("explorer: {e}"))?;
            return Ok(());
        }
        #[cfg(not(windows))]
        { return Err(format!("Ordner anzeigen nur unter Windows ({shown})")); }
    }
    if is_risky_extension(&shown) {
        return Err("Programme/Skripte werden nicht direkt gestartet – bitte „Im Ordner zeigen“ verwenden".into());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_path(shown, None::<&str>).map_err(|e| format!("oeffnen: {e}"))
}
