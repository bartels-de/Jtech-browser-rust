//! Own context menu for web pages. The page webview is a native window above the React UI, so a
//! React menu cannot be drawn over it. Instead the native WebView2 menu is customised per request
//! (ICoreWebView2_11::ContextMenuRequested):
//!
//!  - Useful built-in items stay (back/forward/reload, cut/copy/paste/undo/redo/select all, spell
//!    check, save/copy image, copy link address, save as, print); clutter in `DROP` is removed and
//!    "Inspect" only stays while the developer tools are enabled.
//!  - JTech items are created with ICoreWebView2Environment9::CreateContextMenuItem. Selecting one
//!    copies text (Win32 clipboard), runs a fixed script (picture-in-picture) or emits the
//!    "page-menu" event to the UI (new tab, background tab, peek, split view, bookmarks, search,
//!    mute). The UI validates the URL again before acting.
//!  - Every URL from the target goes through `pagebridge::web_url` (absolute http/https, no
//!    credentials); text is stripped of control characters and size-limited. Pages get no new API:
//!    the menu target is read by WebView2, not reported by page scripts.
//!  - Labels come from the UI (`set_context_menu`, fixed key allowlist, validated) so they follow
//!    the UI language; English fallbacks are built in.
//!  - Setting "standard menu": the handler returns early and WebView2 shows its default menu.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static ENABLED: AtomicBool = AtomicBool::new(true);
static LABELS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

pub const LABEL_MAX: usize = 120;
/// Search query taken from the selection.
pub const QUERY_MAX: usize = 1000;
/// Text copied to the clipboard (selection as plain text).
pub const COPY_MAX: usize = 100_000;
/// Selection shown inside the search label.
pub const PREVIEW_MAX: usize = 32;

/// Label keys (allowlist) with English fallbacks. `search` must contain `{text}`.
pub const DEFAULT_LABELS: &[(&str, &str)] = &[
    ("newTab", "Open link in new tab"),
    ("backgroundTab", "Open link in background tab"),
    ("peek", "Open link in Peek"),
    ("split", "Open link in split view"),
    ("copyLink", "Copy link address"),
    ("copyMarkdown", "Copy link as Markdown"),
    ("bookmarkLink", "Add link to bookmarks"),
    ("openImage", "Open image in new tab"),
    ("copyImage", "Copy image address"),
    ("search", "Search for \u{201c}{text}\u{201d}"),
    ("copyPlain", "Copy as plain text"),
    ("pip", "Picture-in-picture"),
    ("mute", "Mute tab"),
    ("unmute", "Unmute tab"),
    ("copyMedia", "Copy media address"),
    ("bookmarkPage", "Add page to bookmarks"),
    ("splitNew", "Split view with new tab"),
    ("more", "JTech"),
];

/// Built-in WebView2 items that are removed (names as reported by ICoreWebView2ContextMenuItem::Name).
/// "openLinkInNewWindow" is replaced by the JTech tab items. Unknown names are simply not present.
pub const DROP: &[&str] = &["createQrCode", "share", "webCapture", "copyLinkToHighlight", "openLinkInNewWindow", "openImageInNewWindow", "writingDirection", "sendTabToSelf"];

/// Validates the label table from the UI. Unknown keys, empty or overlong values and control
/// characters are rejected.
pub fn validate_labels(raw: &HashMap<String, String>) -> Result<HashMap<String, String>, String> {
    if raw.len() > DEFAULT_LABELS.len() { return Err("Kontextmenue: zu viele Texte".into()); }
    let mut out = HashMap::new();
    for (k, v) in raw {
        if !DEFAULT_LABELS.iter().any(|(d, _)| d == k) { return Err(format!("Kontextmenue: unbekannter Text '{k}'")); }
        let v = v.trim();
        if v.is_empty() || v.chars().count() > LABEL_MAX || v.chars().any(|c| c.is_control()) { return Err(format!("Kontextmenue: ungueltiger Text '{k}'")); }
        if k == "search" && !v.contains("{text}") { return Err("Kontextmenue: Suchtext ohne {text}".into()); }
        out.insert(k.clone(), v.to_string());
    }
    Ok(out)
}

/// Settings: JTech menu on/off (off = WebView2 standard menu) and the localized labels.
#[tauri::command]
pub fn set_context_menu(enabled: bool, labels: Option<HashMap<String, String>>) -> Result<(), String> {
    if let Some(l) = labels {
        let v = validate_labels(&l)?;
        *crate::lock(&LABELS) = Some(v);
    }
    ENABLED.store(enabled, Ordering::Relaxed);
    Ok(())
}

pub fn label(key: &str) -> String {
    if let Some(v) = crate::lock(&LABELS).as_ref().and_then(|m| m.get(key)) { return v.clone(); }
    DEFAULT_LABELS.iter().find(|(k, _)| *k == key).map(|(_, v)| v.to_string()).unwrap_or_else(|| key.to_string())
}

/// WebView2 menu labels use `&` for access keys; a literal ampersand is written as `&&`.
pub fn escape_label(s: &str) -> String { s.replace('&', "&&") }

/// Single line, no control characters, at most `max` characters.
pub fn one_line(s: &str, max: usize) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").chars().filter(|c| !c.is_control()).take(max).collect()
}

/// Text for the clipboard: control characters except newline/tab removed, size-limited.
pub fn clean_copy(s: &str) -> String {
    s.chars().filter(|c| !c.is_control() || matches!(c, '\n' | '\r' | '\t')).take(COPY_MAX).collect()
}

/// "Search with <engine> for “…”" with the selection shortened.
pub fn search_label(selection: &str) -> String {
    let q = one_line(selection, QUERY_MAX);
    let mut p: String = q.chars().take(PREVIEW_MAX).collect();
    if q.chars().count() > PREVIEW_MAX { p = format!("{}\u{2026}", p.trim_end()); }
    label("search").replace("{text}", &p)
}

/// `[text](url)`; brackets in the text are escaped, parentheses and spaces in the URL encoded.
pub fn markdown_link(text: &str, url: &str) -> String {
    let t = one_line(text, 500);
    let t = if t.is_empty() { url.to_string() } else { t };
    let mut esc = String::with_capacity(t.len());
    for c in t.chars() {
        if matches!(c, '[' | ']' | '\\') { esc.push('\\'); }
        esc.push(c);
    }
    let u = url.replace('(', "%28").replace(')', "%29").replace(' ', "%20");
    format!("[{esc}]({u})")
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Kind { #[default] Page, Image, Selection, Video, Audio }

/// What was right-clicked (already validated).
#[derive(Clone, Debug, Default)]
pub struct Target {
    pub kind: Kind,
    pub editable: bool,
    /// http(s) link under the cursor
    pub link: Option<String>,
    pub link_text: String,
    /// http(s) image/media source
    pub source: Option<String>,
    /// selected text (clean_copy)
    pub selection: String,
    /// http(s) page URL
    pub page: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action { NewTab, BackgroundTab, Peek, Split, CopyLink, CopyMarkdown, BookmarkLink, OpenImage, CopyImage, Search, CopyPlain, Pip, Mute, CopyMedia, BookmarkPage, SplitNew }

impl Action {
    pub fn label_key(self, muted: bool) -> &'static str {
        match self {
            Action::NewTab => "newTab", Action::BackgroundTab => "backgroundTab", Action::Peek => "peek", Action::Split => "split",
            Action::CopyLink => "copyLink", Action::CopyMarkdown => "copyMarkdown", Action::BookmarkLink => "bookmarkLink",
            Action::OpenImage => "openImage", Action::CopyImage => "copyImage", Action::Search => "search", Action::CopyPlain => "copyPlain",
            Action::Pip => "pip", Action::Mute => if muted { "unmute" } else { "mute" }, Action::CopyMedia => "copyMedia",
            Action::BookmarkPage => "bookmarkPage", Action::SplitNew => "splitNew",
        }
    }
    /// Name of the "page-menu" action for the UI (None = handled in Rust).
    pub fn ui_name(self) -> Option<&'static str> {
        Some(match self {
            Action::NewTab => "new-tab", Action::BackgroundTab => "background-tab", Action::Peek => "peek", Action::Split => "split",
            Action::BookmarkLink => "bookmark-link", Action::OpenImage => "open-image", Action::Search => "search", Action::Mute => "mute",
            Action::BookmarkPage => "bookmark-page", Action::SplitNew => "split-new",
            Action::CopyLink | Action::CopyMarkdown | Action::CopyImage | Action::CopyPlain | Action::CopyMedia | Action::Pip => return None,
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Entry { Item(Action), Sep, Sub(Vec<Entry>) }

/// Where the menu was opened.
pub struct Ctx {
    /// the peek webview ("Open in Peek" and "Mute tab" are left out)
    pub peek: bool,
    /// tab mute state (None = no tab, e.g. peek)
    pub muted: Option<bool>,
    /// names of the built-in items that are still in the menu
    pub builtin: Vec<String>,
}

/// More JTech items than this at the top go into one "JTech" submenu (all but the link openers).
pub const FLAT_MAX: usize = 7;

/// JTech items: (top of the menu, page items before "Inspect"/at the end).
pub fn plan(t: &Target, c: &Ctx) -> (Vec<Entry>, Vec<Entry>) {
    use Action::*;
    let has = |n: &str| c.builtin.iter().any(|b| b == n);
    let mut primary: Vec<Action> = Vec::new();
    let mut extra: Vec<Action> = Vec::new();
    if t.link.is_some() {
        primary.extend([NewTab, BackgroundTab]);
        if !c.peek { primary.push(Peek); }
        primary.push(Split);
        if !has("copyLinkLocation") { extra.push(CopyLink); }
        extra.extend([CopyMarkdown, BookmarkLink]);
    }
    let list = if t.link.is_some() { &mut extra } else { &mut primary };
    if t.kind == Kind::Image && t.source.is_some() {
        list.push(OpenImage);
        if !has("copyImageLocation") { list.push(CopyImage); }
    }
    if matches!(t.kind, Kind::Video | Kind::Audio) {
        if t.kind == Kind::Video && !has("pictureInPicture") { list.push(Pip); }
        if c.muted.is_some() && !c.peek { list.push(Mute); }
        if t.source.is_some() { list.push(CopyMedia); }
    }
    if !one_line(&t.selection, QUERY_MAX).is_empty() {
        list.push(Search);
        list.push(CopyPlain);
    }
    let mut top: Vec<Entry> = primary.iter().map(|a| Entry::Item(*a)).collect();
    if primary.len() + extra.len() > FLAT_MAX && !extra.is_empty() {
        top.push(Entry::Sub(extra.iter().map(|a| Entry::Item(*a)).collect()));
    } else {
        if !primary.is_empty() && !extra.is_empty() { top.push(Entry::Sep); }
        top.extend(extra.iter().map(|a| Entry::Item(*a)));
    }
    if !top.is_empty() { top.push(Entry::Sep); }

    let mut tail = Vec::new();
    let plain_page = t.kind == Kind::Page && !t.editable && t.link.is_none() && one_line(&t.selection, 10).is_empty();
    if plain_page {
        if t.page.is_some() { tail.push(Entry::Item(BookmarkPage)); }
        if !c.peek { tail.push(Entry::Item(SplitNew)); }
        if !tail.is_empty() { tail.insert(0, Entry::Sep); tail.push(Entry::Sep); }
    }
    (top, tail)
}

/// Payload of the "page-menu" event to the UI.
#[derive(Clone, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PageMenuEvent {
    /// content tab id, or "peek"
    pub tab_id: String,
    pub action: String,
    pub url: Option<String>,
    pub text: Option<String>,
}

#[cfg_attr(not(windows), allow(dead_code))]
fn emit(app: &AppHandle, ev: PageMenuEvent) {
    if let Err(e) = app.emit("page-menu", ev) { tracing::error!("emit page-menu: {e}"); }
}

/// The UI event for an action (None = not a UI action or required data missing).
pub fn ui_event(a: Action, tab_id: &str, t: &Target) -> Option<PageMenuEvent> {
    let name = a.ui_name()?;
    let (url, text) = match a {
        Action::NewTab | Action::BackgroundTab | Action::Peek | Action::Split => (Some(t.link.clone()?), None),
        Action::BookmarkLink => (Some(t.link.clone()?), Some(one_line(&t.link_text, 300))),
        Action::OpenImage => (Some(t.source.clone()?), None),
        Action::Search => { let q = one_line(&t.selection, QUERY_MAX); if q.is_empty() { return None; } (None, Some(q)) }
        Action::BookmarkPage => (Some(t.page.clone()?), None),
        _ => (None, None),
    };
    Some(PageMenuEvent { tab_id: tab_id.to_string(), action: name.to_string(), url, text })
}

// ---------- WebView2 ----------

#[cfg(windows)]
use webview2_com_sys::Microsoft::Web::WebView2::Win32 as SYS;

/// Where a webview's menu belongs.
#[cfg(windows)]
#[derive(Clone)]
pub struct Source {
    /// content tab id, or "peek"
    pub tab_id: String,
    pub peek: bool,
    pub muted: Option<std::sync::Arc<AtomicBool>>,
}

#[cfg(windows)]
#[derive(Clone)]
struct ActCtx {
    app: AppHandle,
    tab_id: String,
    hwnd: windows::Win32::Foundation::HWND,
    target: Target,
    core: Option<SYS::ICoreWebView2>,
}

/// Registers ContextMenuRequested (WebView2 Runtime >= 1.0.1185) and returns the event token.
/// The core is taken from the event sender, so the handler keeps no reference to its webview.
#[cfg(windows)]
pub unsafe fn attach(core: &SYS::ICoreWebView2, env: &SYS::ICoreWebView2Environment, hwnd: windows::Win32::Foundation::HWND, app: &AppHandle, src: Source) -> Result<i64, String> {
    use windows::core::Interface;
    let core11: SYS::ICoreWebView2_11 = core.cast().map_err(|e| format!("ICoreWebView2_11 fehlt: {e}"))?;
    let env9: SYS::ICoreWebView2Environment9 = env.cast().map_err(|e| format!("ICoreWebView2Environment9 fehlt: {e}"))?;
    let app = app.clone();
    let h = webview2_com::ContextMenuRequestedEventHandler::create(Box::new(move |sender, args| {
        let Some(args) = args else { return Ok(()) };
        if !ENABLED.load(Ordering::Relaxed) { return Ok(()); }
        if let Err(e) = unsafe { customize(&args, &env9, sender, hwnd, &app, &src) } {
            tracing::warn!(tab = src.tab_id.as_str(), "Kontextmenue: {e}");
        }
        Ok(())
    }));
    let mut tok = 0i64;
    unsafe { core11.add_ContextMenuRequested(&h, &mut tok) }.map_err(|e| format!("add_ContextMenuRequested: {e}"))?;
    Ok(tok)
}

#[cfg(windows)]
pub fn detach(core: &SYS::ICoreWebView2, tok: i64) -> windows::core::Result<()> {
    use windows::core::Interface;
    core.cast::<SYS::ICoreWebView2_11>().and_then(|c| unsafe { c.remove_ContextMenuRequested(tok) })
}

#[cfg(windows)]
unsafe fn read_target(t: &SYS::ICoreWebView2ContextMenuTarget) -> Target {
    use webview2_com::take_pwstr;
    use windows::core::PWSTR;
    macro_rules! flag { ($m:ident) => {{ let mut v = windows::core::BOOL::default(); unsafe { t.$m(&mut v) }.is_ok() && v.as_bool() }}; }
    macro_rules! text { ($m:ident) => {{ let mut p = PWSTR::null(); if unsafe { t.$m(&mut p) }.is_ok() { take_pwstr(p) } else { String::new() } }}; }
    let mut k = SYS::COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND::default();
    let _ = unsafe { t.Kind(&mut k) };
    let kind = match k {
        SYS::COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_IMAGE => Kind::Image,
        SYS::COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_SELECTED_TEXT => Kind::Selection,
        SYS::COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_VIDEO => Kind::Video,
        SYS::COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_AUDIO => Kind::Audio,
        _ => Kind::Page,
    };
    let link = if flag!(HasLinkUri) { crate::pagebridge::web_url(&text!(LinkUri)) } else { None };
    let link_text = if link.is_some() && flag!(HasLinkText) { one_line(&text!(LinkText), 500) } else { String::new() };
    let source = if flag!(HasSourceUri) { crate::pagebridge::web_url(&text!(SourceUri)) } else { None };
    let selection = if flag!(HasSelection) { clean_copy(&text!(SelectionText)) } else { String::new() };
    let page = crate::pagebridge::web_url(&text!(PageUri));
    Target { kind, editable: flag!(IsEditable), link, link_text, source, selection, page }
}

#[cfg(windows)]
unsafe fn item_name(item: &SYS::ICoreWebView2ContextMenuItem) -> String {
    let mut p = windows::core::PWSTR::null();
    if unsafe { item.Name(&mut p) }.is_ok() { webview2_com::take_pwstr(p) } else { String::new() }
}

#[cfg(windows)]
unsafe fn is_separator(item: &SYS::ICoreWebView2ContextMenuItem) -> bool {
    let mut k = SYS::COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND::default();
    unsafe { item.Kind(&mut k) }.is_ok() && k == SYS::COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR
}

#[cfg(windows)]
unsafe fn customize(args: &SYS::ICoreWebView2ContextMenuRequestedEventArgs, env: &SYS::ICoreWebView2Environment9, sender: Option<SYS::ICoreWebView2>, hwnd: windows::Win32::Foundation::HWND, app: &AppHandle, src: &Source) -> windows::core::Result<()> {
    let target = unsafe { read_target(&args.ContextMenuTarget()?) };
    let items = unsafe { args.MenuItems()? };
    let devtools = crate::DEVTOOLS.load(Ordering::Relaxed) || cfg!(debug_assertions);
    // 1. remove clutter, remember what is left
    let mut names = Vec::new();
    let mut n = 0u32;
    unsafe { items.Count(&mut n)? };
    for i in (0..n).rev() {
        let item = unsafe { items.GetValueAtIndex(i)? };
        let name = unsafe { item_name(&item) };
        if DROP.contains(&name.as_str()) || (!devtools && name == "inspectElement") { unsafe { items.RemoveValueAtIndex(i)? }; } else { names.push(name); }
    }
    let ctx = Ctx { peek: src.peek, muted: src.muted.as_ref().map(|m| m.load(Ordering::Relaxed)), builtin: names };
    let (top, tail) = plan(&target, &ctx);
    let act = ActCtx { app: app.clone(), tab_id: src.tab_id.clone(), hwnd, target, core: sender };
    let muted = ctx.muted.unwrap_or(false);
    // 2. JTech items at the top
    for (i, e) in top.iter().enumerate() {
        let it = unsafe { make_entry(env, e, &act, muted)? };
        unsafe { items.InsertValueAtIndex(i as u32, &it)? };
    }
    // 3. page items before "Inspect" (or at the end)
    if !tail.is_empty() {
        let mut n = 0u32;
        unsafe { items.Count(&mut n)? };
        let mut pos = n;
        for i in 0..n {
            if unsafe { item_name(&items.GetValueAtIndex(i)?) } == "inspectElement" { pos = i; break; }
        }
        for e in &tail {
            let it = unsafe { make_entry(env, e, &act, muted)? };
            unsafe { items.InsertValueAtIndex(pos, &it)? };
            pos += 1;
        }
    }
    unsafe { tidy_separators(&items) }
}

/// No separator at the start, at the end or twice in a row.
#[cfg(windows)]
unsafe fn tidy_separators(items: &SYS::ICoreWebView2ContextMenuItemCollection) -> windows::core::Result<()> {
    let mut n = 0u32;
    unsafe { items.Count(&mut n)? };
    let mut seps = Vec::with_capacity(n as usize);
    for i in 0..n { seps.push(unsafe { is_separator(&items.GetValueAtIndex(i)?) }); }
    let mut i = seps.len();
    while i > 0 {
        i -= 1;
        let last = i + 1 == seps.len();
        if seps[i] && (i == 0 || last || seps[i - 1]) {
            unsafe { items.RemoveValueAtIndex(i as u32)? };
            seps.remove(i);
        }
    }
    Ok(())
}

#[cfg(windows)]
unsafe fn create_item(env: &SYS::ICoreWebView2Environment9, text: &str, kind: SYS::COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND) -> windows::core::Result<SYS::ICoreWebView2ContextMenuItem> {
    let wide: Vec<u16> = escape_label(text).encode_utf16().chain(std::iter::once(0)).collect();
    unsafe { env.CreateContextMenuItem(windows::core::PCWSTR(wide.as_ptr()), None, kind) }
}

#[cfg(windows)]
unsafe fn make_entry(env: &SYS::ICoreWebView2Environment9, e: &Entry, act: &ActCtx, muted: bool) -> windows::core::Result<SYS::ICoreWebView2ContextMenuItem> {
    match e {
        Entry::Sep => unsafe { create_item(env, "", SYS::COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR) },
        Entry::Sub(children) => {
            let sub = unsafe { create_item(env, &label("more"), SYS::COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU)? };
            let list = unsafe { sub.Children()? };
            for (i, c) in children.iter().enumerate() {
                let it = unsafe { make_entry(env, c, act, muted)? };
                unsafe { list.InsertValueAtIndex(i as u32, &it)? };
            }
            Ok(sub)
        }
        Entry::Item(a) => {
            let a = *a;
            let text = if a == Action::Search { search_label(&act.target.selection) } else { label(a.label_key(muted)) };
            let item = unsafe { create_item(env, &text, SYS::COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND)? };
            let ctx = act.clone();
            let h = webview2_com::CustomItemSelectedEventHandler::create(Box::new(move |_item, _args| {
                run(a, &ctx);
                Ok(())
            }));
            let mut tok = 0i64;
            unsafe { item.add_CustomItemSelected(&h, &mut tok)? };
            Ok(item)
        }
    }
}

#[cfg(windows)]
fn run(a: Action, c: &ActCtx) {
    let t = &c.target;
    let copy = |s: &str| if let Err(e) = copy_text(c.hwnd, s) { tracing::warn!(tab = c.tab_id.as_str(), "Kontextmenue kopieren: {e}"); };
    match a {
        Action::CopyLink => { if let Some(u) = &t.link { copy(u.as_str()); } }
        Action::CopyMarkdown => { if let Some(u) = &t.link { copy(markdown_link(&t.link_text, u).as_str()); } }
        Action::CopyImage | Action::CopyMedia => { if let Some(u) = &t.source { copy(u.as_str()); } }
        Action::CopyPlain => { if !t.selection.is_empty() { copy(t.selection.as_str()); } }
        Action::Pip => { if let Some(core) = &c.core { crate::exec_script(core, crate::PIP_JS, None); } }
        _ => { if let Some(ev) = ui_event(a, &c.tab_id, t) { emit(&c.app, ev); } }
    }
}

/// Plain text to the Windows clipboard (CF_UNICODETEXT). The owner window is the main window
/// (OpenClipboard(NULL) would make SetClipboardData fail after EmptyClipboard).
#[cfg(windows)]
pub fn copy_text(hwnd: windows::Win32::Foundation::HWND, text: &str) -> Result<(), String> {
    use windows::Win32::Foundation::{GlobalFree, HANDLE};
    use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    const CF_UNICODETEXT: u32 = 13;
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let mem = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2).map_err(|e| format!("GlobalAlloc: {e}"))?;
        let p = GlobalLock(mem) as *mut u16;
        if p.is_null() { let _ = GlobalFree(Some(mem)); return Err("GlobalLock".into()); }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), p, wide.len());
        let _ = GlobalUnlock(mem); // returns an "error" once the lock count is 0
        // Another program may hold the clipboard for a moment.
        let mut opened = OpenClipboard(Some(hwnd));
        for _ in 0..4 {
            if opened.is_ok() { break; }
            std::thread::sleep(std::time::Duration::from_millis(15));
            opened = OpenClipboard(Some(hwnd));
        }
        if let Err(e) = opened { let _ = GlobalFree(Some(mem)); return Err(format!("OpenClipboard: {e}")); }
        let r = EmptyClipboard().and_then(|_| SetClipboardData(CF_UNICODETEXT, Some(HANDLE(mem.0))));
        let _ = CloseClipboard();
        // On success the clipboard owns the memory.
        if let Err(e) = r { let _ = GlobalFree(Some(mem)); return Err(format!("SetClipboardData: {e}")); }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> Ctx { Ctx { peek: false, muted: Some(false), builtin: vec!["copyLinkLocation".into(), "copyImageLocation".into()] } }
    fn items(v: &[Entry]) -> Vec<Action> {
        let mut out = Vec::new();
        for e in v { match e { Entry::Item(a) => out.push(*a), Entry::Sub(c) => out.extend(items(c)), Entry::Sep => {} } }
        out
    }

    #[test]
    fn link_items() {
        let t = Target { link: Some("https://example.com/".into()), ..Default::default() };
        let (top, tail) = plan(&t, &ctx());
        assert_eq!(items(&top), vec![Action::NewTab, Action::BackgroundTab, Action::Peek, Action::Split, Action::CopyMarkdown, Action::BookmarkLink]);
        assert!(tail.is_empty());
        let (top, _) = plan(&t, &Ctx { peek: true, muted: None, builtin: vec![] });
        let a = items(&top);
        assert!(!a.contains(&Action::Peek) && a.contains(&Action::CopyLink));
    }

    #[test]
    fn long_lists_use_a_submenu() {
        let t = Target { kind: Kind::Image, link: Some("https://example.com/".into()), source: Some("https://example.com/a.png".into()), selection: "abc".into(), ..Default::default() };
        let (top, _) = plan(&t, &Ctx { peek: false, muted: Some(false), builtin: vec![] });
        assert!(top.iter().any(|e| matches!(e, Entry::Sub(_))));
        assert_eq!(top[0], Entry::Item(Action::NewTab));
    }

    #[test]
    fn page_and_media() {
        let t = Target { page: Some("https://example.com/".into()), ..Default::default() };
        let (top, tail) = plan(&t, &ctx());
        assert!(top.is_empty());
        assert_eq!(items(&tail), vec![Action::BookmarkPage, Action::SplitNew]);
        let ed = Target { editable: true, ..t.clone() };
        assert!(plan(&ed, &ctx()).1.is_empty());
        let v = Target { kind: Kind::Video, source: Some("https://example.com/v.mp4".into()), ..Default::default() };
        assert_eq!(items(&plan(&v, &ctx()).0), vec![Action::Pip, Action::Mute, Action::CopyMedia]);
        assert!(!items(&plan(&v, &Ctx { peek: false, muted: Some(true), builtin: vec!["pictureInPicture".into()] }).0).contains(&Action::Pip));
    }

    #[test]
    fn labels_and_text() {
        let mut m = HashMap::new();
        m.insert("newTab".to_string(), "Neuer Tab".to_string());
        assert!(validate_labels(&m).is_ok());
        m.insert("eval".to_string(), "x".to_string());
        assert!(validate_labels(&m).is_err());
        let mut s = HashMap::new();
        s.insert("search".to_string(), "Suchen".to_string());
        assert!(validate_labels(&s).is_err());
        assert_eq!(escape_label("A & B"), "A && B");
        assert_eq!(markdown_link("a [b]", "https://e.com/x_(y)"), "[a \\[b\\]](https://e.com/x_%28y%29)");
        assert_eq!(markdown_link("", "https://e.com/"), "[https://e.com/](https://e.com/)");
        assert!(search_label(&"x".repeat(100)).contains('\u{2026}'));
        assert_eq!(one_line("a\n\tb\u{0}", 10), "a b");
    }

    #[test]
    fn ui_events_need_valid_data() {
        let t = Target::default();
        assert!(ui_event(Action::NewTab, "content-1", &t).is_none());
        assert!(ui_event(Action::Search, "content-1", &t).is_none());
        assert!(ui_event(Action::CopyLink, "content-1", &t).is_none());
        let t = Target { link: Some("https://example.com/".into()), ..Default::default() };
        assert_eq!(ui_event(Action::Peek, "content-1", &t).unwrap().url.as_deref(), Some("https://example.com/"));
    }
}
