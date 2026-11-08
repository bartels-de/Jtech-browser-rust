//! Runde 5: eigene Tastenkuerzel (Allowlist fuer AcceleratorKeyPressed) und optionale
//! Cursor-Effekte in Webseiten (Design-Studio "Auch auf Webseiten", Standard aus).
//!
//! Kuerzel: Die UI schickt die Liste aller belegten Kombinationen (`set_shortcuts`). Nur diese
//! werden der Webseite weggenommen (SetHandled) und als "shortcut"-Event an die UI geschickt; die UI
//! entscheidet, welcher Befehl laeuft. Gueltig sind nur Kombinationen mit Strg/Alt oder F-Tasten –
//! normales Tippen in Webseiten wird dadurch nie abgefangen, auch wenn die UI Unsinn schickt.

use std::collections::HashSet;
use std::sync::Mutex;
use serde::Deserialize;
use tauri::{AppHandle, Manager};

static SHORTCUTS: Mutex<Option<HashSet<String>>> = Mutex::new(None);
static PAGE_FX: Mutex<Option<String>> = Mutex::new(None);

/// Nie belegbar (Kopieren/Einfuegen in Seiten, Fenster schliessen). Muss zu RESERVED in src/lib/keys.ts passen.
const RESERVED: &[&str] = &["ctrl+c", "ctrl+v", "ctrl+x", "ctrl+a", "ctrl+z", "ctrl+y", "alt+f4", "ctrl+alt+delete"];
const NAMED_KEYS: &[&str] = &["tab", "left", "right", "up", "down", "comma", "period", "plus", "minus", "home", "end", "pageup", "pagedown", "insert", "delete", "space", "enter", "backspace"];

/// Virtual-Key -> kanonischer Tastenname (wie comboFromEvent in src/lib/keys.ts).
pub fn key_name(vk: u32) -> Option<String> {
    let s: &str = match vk {
        0x41..=0x5A => return Some(((vk as u8) as char).to_ascii_lowercase().to_string()),
        0x30..=0x39 => return Some(((vk as u8) as char).to_string()),
        0x60..=0x69 => return Some((((vk - 0x60) as u8 + b'0') as char).to_string()),
        0x70..=0x87 => return Some(format!("f{}", vk - 0x6F)),
        0x08 => "backspace", 0x09 => "tab", 0x0D => "enter", 0x20 => "space",
        0x21 => "pageup", 0x22 => "pagedown", 0x23 => "end", 0x24 => "home",
        0x25 => "left", 0x26 => "up", 0x27 => "right", 0x28 => "down", 0x2D => "insert", 0x2E => "delete",
        0xBB | 0x6B => "plus", 0xBD | 0x6D => "minus", 0xBC => "comma", 0xBE => "period",
        _ => return None,
    };
    Some(s.to_string())
}

/// Virtual-Key + Modifier -> "ctrl+alt+shift+<taste>" (Reihenfolge fest).
pub fn combo_name(vk: u32, ctrl: bool, shift: bool, alt: bool) -> Option<String> {
    let k = key_name(vk)?;
    let mut s = String::new();
    if ctrl { s.push_str("ctrl+"); }
    if alt { s.push_str("alt+"); }
    if shift { s.push_str("shift+"); }
    s.push_str(&k);
    Some(s)
}

fn is_fkey(k: &str) -> bool {
    k.len() >= 2 && k.starts_with('f') && k[1..].parse::<u32>().map(|n| (1..=24).contains(&n)).unwrap_or(false) && !k[1..].starts_with('0')
}
fn is_key(k: &str) -> bool {
    (k.len() == 1 && k.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())) || is_fkey(k) || NAMED_KEYS.contains(&k)
}

/// Gleiche Regeln wie validCombo in src/lib/keys.ts.
pub fn valid_combo(s: &str) -> bool {
    if s.is_empty() || s.len() > 40 || RESERVED.contains(&s) { return false; }
    let parts: Vec<&str> = s.split('+').collect();
    let (key, mods) = parts.split_last().expect("split liefert mindestens ein Element");
    if !is_key(key) { return false; }
    let (mut ctrl, mut alt, mut shift) = (false, false, false);
    for m in mods {
        match *m { "ctrl" if !ctrl => ctrl = true, "alt" if !alt => alt = true, "shift" if !shift => shift = true, _ => return false }
    }
    if !(ctrl || alt || is_fkey(key)) { return false; }
    // kanonische Reihenfolge erzwingen
    let mut canon = String::new();
    if ctrl { canon.push_str("ctrl+"); }
    if alt { canon.push_str("alt+"); }
    if shift { canon.push_str("shift+"); }
    canon.push_str(key);
    canon == s
}

/// Belegte Kombinationen aus der UI uebernehmen (ungueltige werden verworfen). Rueckgabe: Anzahl.
#[tauri::command]
pub fn set_shortcuts(keys: Vec<String>) -> Result<usize, String> {
    if keys.len() > 400 { return Err("zu viele Kuerzel".into()); }
    let set: HashSet<String> = keys.into_iter().filter(|k| valid_combo(k)).collect();
    let n = set.len();
    *SHORTCUTS.lock().unwrap_or_else(|p| p.into_inner()) = Some(set);
    tracing::info!("Tastenkuerzel aktiv: {n}");
    Ok(n)
}

/// Entscheidung fuer AcceleratorKeyPressed: Some(name) = an die UI weiterleiten und der Seite wegnehmen.
/// Ohne Liste (vor dem ersten set_shortcuts) gilt die feste Liste aus Etappe CD/Runde 3.
pub fn forward_in(set: Option<&HashSet<String>>, vk: u32, ctrl: bool, shift: bool, alt: bool) -> Option<String> {
    let Some(set) = set else { return crate::shortcut_name(vk, ctrl, shift, alt).map(str::to_string) };
    let name = combo_name(vk, ctrl, shift, alt)?;
    if set.contains(&name) { return Some(name); }
    // "+" braucht auf manchen Layouts Umschalt
    if name.ends_with("+shift+plus") {
        let n2 = name.replace("+shift+plus", "+plus");
        if set.contains(&n2) { return Some(n2); }
    }
    None
}
pub fn forward_key(vk: u32, ctrl: bool, shift: bool, alt: bool) -> Option<String> {
    let g = SHORTCUTS.lock().unwrap_or_else(|p| p.into_inner());
    forward_in(g.as_ref(), vk, ctrl, shift, alt)
}

// ---------- Cursor-Effekte in Webseiten ----------

/// Gleiche Quelle wie in der UI (Port von Standardprojekt/src/shared/cursor-fx.js, reines JS).
const CURSOR_FX_JS: &str = include_str!("../../src/lib/fx/cursorFx.ts");
const EFFECTS: &[&str] = &["none", "trail", "sparks", "comet", "ripple", "laser", "bubbles"];
pub const DISABLE_PAGE_FX_JS: &str = "(function(){try{window.JTechCursorEffects&&window.JTechCursorEffects.apply({effect:'none'});var s=document.getElementById('jtech-page-cursor');if(s)s.remove();}catch(e){}})();";

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PageFx {
    pub effect: String,
    pub color: String,
    pub color_alt: String,
    pub size: f64,
    pub intensity: f64,
    pub length: f64,
    pub cursor: Option<String>,
    pub hot_x: u32,
    pub hot_y: u32,
}

fn valid_hex(s: &str) -> bool { s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit()) }

/// Nur data:-URLs fuer PNG/SVG mit einem Zeichenvorrat ohne Anfuehrungszeichen, Klammern, Backslash,
/// spitze/geschweifte Klammern – damit kann der Wert weder aus url("…") noch aus dem Stylesheet ausbrechen.
pub fn valid_cursor_url(s: &str) -> bool {
    s.len() <= 200_000
        && (s.starts_with("data:image/png;base64,") || s.starts_with("data:image/svg+xml,"))
        && s.chars().all(|c| c.is_ascii_alphanumeric() || "%-_.!~*'+/=:;,".contains(c))
}

pub fn page_fx_script(fx: &PageFx) -> Result<String, String> {
    if !EFFECTS.contains(&fx.effect.as_str()) { return Err("unbekannter Effekt".into()); }
    if !valid_hex(&fx.color) || !valid_hex(&fx.color_alt) { return Err("ungueltige Farbe".into()); }
    let num = |v: f64, lo: f64, hi: f64| if v.is_finite() { v.clamp(lo, hi) } else { lo };
    let cfg = serde_json::json!({
        "effect": fx.effect, "color": fx.color, "colorAlt": fx.color_alt,
        "size": num(fx.size, 2.0, 40.0), "intensity": num(fx.intensity, 0.0, 100.0), "length": num(fx.length, 0.0, 100.0),
    });
    let css = match &fx.cursor {
        Some(u) if !u.is_empty() => {
            if !valid_cursor_url(u) { return Err("ungueltiges Cursorbild".into()); }
            format!("*,*::before,*::after{{cursor:url(\"{u}\") {} {}, auto !important}}", fx.hot_x.min(127), fx.hot_y.min(127))
        }
        _ => String::new(),
    };
    let css_js = serde_json::to_string(&css).map_err(|e| e.to_string())?;
    Ok(format!(
        "(function(){{try{{\n{js}\n;window.JTechCursorEffects&&window.JTechCursorEffects.apply({cfg});\
var c={css_js};var s=document.getElementById('jtech-page-cursor');\
if(!c){{if(s)s.remove();return;}}\
if(!s){{s=document.createElement('style');s.id='jtech-page-cursor';(document.head||document.documentElement).appendChild(s);}}\
s.textContent=c;}}catch(e){{}}}})();",
        js = CURSOR_FX_JS
    ))
}

/// Aktuelles Injektions-Script (None = aus).
pub fn page_fx() -> Option<String> { PAGE_FX.lock().unwrap_or_else(|p| p.into_inner()).clone() }

/// UI: Effekte fuer Webseiten setzen (None = aus). Wirkt sofort auf offene Web-Tabs und bei jedem DOMContentLoaded.
#[tauri::command]
pub fn set_page_fx(app: AppHandle, config: Option<PageFx>) -> Result<(), String> {
    let script = match &config { Some(c) => Some(page_fx_script(c)?), None => None };
    let was_on = {
        let mut g = PAGE_FX.lock().unwrap_or_else(|p| p.into_inner());
        let was = g.is_some();
        *g = script.clone();
        was
    };
    if script.is_none() && !was_on { return Ok(()); }
    // Lock nicht ueber Webview-Aufrufe halten (Regel aus Etappe B).
    let views: Vec<tauri::Webview> = {
        let st = app.state::<Mutex<crate::TabManager>>();
        let m = crate::lock(&st);
        m.tabs.values().filter(|t| crate::lock(&t.url).starts_with("http")).map(|t| t.webview.clone()).collect()
    };
    let js = script.as_deref().unwrap_or(DISABLE_PAGE_FX_JS);
    for w in views { if let Err(e) = w.eval(js) { tracing::warn!("set_page_fx eval: {e}"); } }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combos() {
        assert_eq!(combo_name(0x54, true, false, false).as_deref(), Some("ctrl+t"));
        assert_eq!(combo_name(0x09, true, true, false).as_deref(), Some("ctrl+shift+tab"));
        assert_eq!(combo_name(0x74, false, false, false).as_deref(), Some("f5"));
        assert_eq!(combo_name(0x25, false, false, true).as_deref(), Some("alt+left"));
        assert_eq!(combo_name(0xBC, true, false, false).as_deref(), Some("ctrl+comma"));
        assert_eq!(combo_name(0x61, true, false, false).as_deref(), Some("ctrl+1"));
        assert_eq!(combo_name(0x10, true, false, false), None); // Shift selbst
    }

    #[test]
    fn validation() {
        for ok in ["ctrl+t", "ctrl+shift+tab", "f5", "shift+f3", "alt+left", "ctrl+alt+shift+k", "ctrl+f4", "f24"] { assert!(valid_combo(ok), "{ok}"); }
        for bad in ["t", "shift+t", "ctrl+c", "alt+f4", "shift+ctrl+t", "ctrl+ctrl+t", "ctrl+", "ctrl+xx", "f25", "f0", "meta+t", "", "space"] { assert!(!valid_combo(bad), "{bad}"); }
    }

    #[test]
    fn forwarding() {
        // ohne Liste: alte feste Liste
        assert_eq!(forward_in(None, 0x54, true, false, false).as_deref(), Some("ctrl+t"));
        let set: HashSet<String> = ["ctrl+k", "ctrl+plus", "alt+q"].iter().map(|s| s.to_string()).collect();
        assert_eq!(forward_in(Some(&set), 0x4B, true, false, false).as_deref(), Some("ctrl+k"));
        assert_eq!(forward_in(Some(&set), 0x54, true, false, false), None); // ctrl+t nicht belegt -> Seite
        assert_eq!(forward_in(Some(&set), 0xBB, true, true, false).as_deref(), Some("ctrl+plus"));
        assert_eq!(forward_in(Some(&set), 0x41, false, false, false), None);
    }

    #[test]
    fn page_fx_validation() {
        let mut fx = PageFx { effect: "trail".into(), color: "#112233".into(), color_alt: "#abcdef".into(), size: 16.0, intensity: 60.0, length: 50.0, cursor: None, hot_x: 0, hot_y: 0 };
        let js = page_fx_script(&fx).unwrap();
        assert!(js.contains("JTechCursorEffects") && js.contains("\"colorAlt\":\"#abcdef\""));
        fx.cursor = Some("data:image/svg+xml,%3Csvg%3E".into());
        assert!(page_fx_script(&fx).unwrap().contains("jtech-page-cursor"));
        fx.cursor = Some("data:image/png;base64,AAA\")}body{x".into());
        assert!(page_fx_script(&fx).is_err());
        fx.cursor = Some("https://evil.example/c.png".into());
        assert!(page_fx_script(&fx).is_err());
        fx.cursor = None; fx.color = "red".into();
        assert!(page_fx_script(&fx).is_err());
        fx.color = "#112233".into(); fx.effect = "alert(1)".into();
        assert!(page_fx_script(&fx).is_err());
    }
}
