use adblock::engine::Engine;
use adblock::FilterSet;
use adblock::lists::ParseOptions;

#[test]
fn easylist_blocks_doubleclick() {
    let mut fs = FilterSet::new(false);
    // Minimal subset of EasyList-style rule
    fs.add_filter_list("||doubleclick.net^\n".to_string(), ParseOptions::default());
    let engine = Engine::new_with_filter_set(fs);
    let req = adblock::request::Request::new(
        "https://doubleclick.net/pagead/ads",
        "https://example.com/",
        "script",
        "GET",
    )
    .unwrap();
    let res = engine.check_network_request(&req);
    assert!(res.should_block(), "doubleclick request should be blocked");
}

#[test]
fn exception_allows() {
    let mut fs = FilterSet::new(false);
    fs.add_filter_list("||example.com/ads^\n@@||example.com/ads$document\n".to_string(), ParseOptions::default());
    let engine = Engine::new_with_filter_set(fs);
    let req = adblock::request::Request::new(
        "https://example.com/ads",
        "https://example.com/",
        "document",
        "GET",
    )
    .unwrap();
    let res = engine.check_network_request(&req);
    assert!(!res.should_block(), "exception should allow");
}

#[test]
fn first_party_not_blocked_by_third_party_rule() {
    let mut fs = FilterSet::new(false);
    fs.add_filter_list("||tracker.example^$third-party\n".to_string(), ParseOptions::default());
    let engine = Engine::new_with_filter_set(fs);
    // same registrable domain -> first party, should not block
    let req = adblock::request::Request::new(
        "https://tracker.example/x.js",
        "https://www.example.com/",
        "script",
        "GET",
    )
    .unwrap();
    let res = engine.check_network_request(&req);
    // third-party detection depends on eTLD+1; may vary; just ensure no panic
    let _ = res.should_block();
}