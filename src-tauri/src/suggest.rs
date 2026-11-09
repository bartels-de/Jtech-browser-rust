//! Live search suggestions for the address bar.
//!
//! The UI calls `search_suggest` (debounced, stale results are dropped in the UI). The request is
//! made here so the UI webview needs no CORS exception. Input is validated: engine from a fixed
//! allowlist, query trimmed and limited to 200 characters, no control characters, nothing that
//! looks like a URL. The response is size-limited and parsed as the OpenSearch suggestion format
//! `["query", ["s1", "s2", ...]]`, which all supported endpoints return.

use std::sync::OnceLock;
use std::time::Duration;

const MAX_QUERY_CHARS: usize = 200;
const MAX_RESPONSE_BYTES: usize = 64 * 1024;
const MAX_RESULTS: usize = 8;
const MAX_SUGGESTION_CHARS: usize = 200;

fn client() -> &'static reqwest::blocking::Client {
    static C: OnceLock<reqwest::blocking::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(4))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) JTechBrowser/0.1")
            .build()
            .unwrap_or_default()
    })
}

/// Suggest endpoint for an engine id (same ids as the UI's `SearchEngineId`).
/// Startpage has no public suggest API; it falls back to DuckDuckGo.
fn endpoint(engine: &str) -> Option<(&'static str, &'static str)> {
    match engine {
        "google" => Some(("https://suggestqueries.google.com/complete/search", "client=firefox&q=")),
        "duckduckgo" | "startpage" => Some(("https://duckduckgo.com/ac/", "type=list&q=")),
        "bing" => Some(("https://api.bing.com/osjson.aspx", "query=")),
        "brave" => Some(("https://search.brave.com/api/suggest", "q=")),
        _ => None,
    }
}

/// Rough URL/IP check: such input is never sent to the search engine.
fn looks_like_url(q: &str) -> bool {
    let l = q.to_ascii_lowercase();
    if l.contains("://") || l.starts_with("www.") || l.starts_with("localhost") || l.starts_with("jtech:") || l.starts_with("about:") { return true; }
    if l.contains(' ') { return false; }
    // host.tld or IPv4, optionally with port/path
    let host = l.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.rsplit_once(':').map(|(h, p)| if p.chars().all(|c| c.is_ascii_digit()) { h } else { host }).unwrap_or(host);
    if host.split('.').count() == 4 && host.split('.').all(|p| !p.is_empty() && p.len() <= 3 && p.chars().all(|c| c.is_ascii_digit())) { return true; }
    if let Some((name, tld)) = host.rsplit_once('.') {
        return !name.is_empty() && tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphabetic());
    }
    false
}

fn validate(engine: &str, query: &str) -> Result<(String, String), String> {
    let (base, param) = endpoint(engine).ok_or("unbekannte Suchmaschine")?;
    let q = query.trim();
    if q.is_empty() { return Err("leer".into()); }
    if q.chars().count() > MAX_QUERY_CHARS { return Err("Suchbegriff zu lang".into()); }
    if q.chars().any(|c| c.is_control()) { return Err("ungueltige Zeichen".into()); }
    if q.starts_with('!') || looks_like_url(q) { return Err("keine Suchanfrage".into()); }
    let enc: String = url::form_urlencoded::byte_serialize(q.as_bytes()).collect();
    Ok((format!("{base}?{param}{enc}"), q.to_string()))
}

fn parse(text: &str) -> Vec<String> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(text) else { return Vec::new(); };
    let Some(list) = v.get(1).and_then(|x| x.as_array()) else { return Vec::new(); };
    let mut out: Vec<String> = Vec::new();
    for s in list.iter().filter_map(|x| x.as_str()) {
        let s: String = s.chars().filter(|c| !c.is_control()).take(MAX_SUGGESTION_CHARS).collect();
        let s = s.trim().to_string();
        if !s.is_empty() && !out.contains(&s) { out.push(s); }
        if out.len() >= MAX_RESULTS { break; }
    }
    out
}

/// Fetches up to 8 suggestions. Errors are short technical strings; the UI ignores them.
#[tauri::command]
pub async fn search_suggest(engine: String, query: String) -> Result<Vec<String>, String> {
    let (url, _q) = validate(&engine, &query)?;
    tauri::async_runtime::spawn_blocking(move || {
        let resp = client().get(&url).send().map_err(|e| format!("Netz: {e}"))?;
        if !resp.status().is_success() { return Err(format!("HTTP {}", resp.status())); }
        if resp.content_length().is_some_and(|l| l as usize > MAX_RESPONSE_BYTES) { return Err("Antwort zu gross".into()); }
        let bytes = resp.bytes().map_err(|e| format!("Lesen: {e}"))?;
        if bytes.len() > MAX_RESPONSE_BYTES { return Err("Antwort zu gross".into()); }
        // Google may answer in ISO-8859-1 for client=firefox; lossy UTF-8 keeps ASCII intact.
        Ok(parse(&String::from_utf8_lossy(&bytes)))
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_detection() {
        assert!(looks_like_url("example.com"));
        assert!(looks_like_url("https://x.y"));
        assert!(looks_like_url("192.168.0.1:8080/a"));
        assert!(looks_like_url("www.test"));
        assert!(!looks_like_url("rust tauri"));
        assert!(!looks_like_url("hello"));
        assert!(!looks_like_url("version 1.2"));
    }

    #[test]
    fn validation() {
        assert!(validate("google", "rust").is_ok());
        assert!(validate("evil", "rust").is_err());
        assert!(validate("google", "").is_err());
        assert!(validate("google", "!yt x").is_err());
        assert!(validate("google", &"a".repeat(201)).is_err());
        let (u, _) = validate("bing", "a b&c").unwrap();
        assert_eq!(u, "https://api.bing.com/osjson.aspx?query=a+b%26c");
    }

    #[test]
    fn parsing() {
        assert_eq!(parse(r#"["ru",["rust","ruby","rust"]]"#), vec!["rust", "ruby"]);
        assert!(parse("<html>").is_empty());
        assert!(parse(r#"{"a":1}"#).is_empty());
    }
}
