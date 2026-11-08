# Ad and tracker blocking

JTech Browser blocks ads and trackers at the network level using Brave's
[adblock-rust](https://github.com/brave/adblock-rust) engine (`adblock` 0.13). Basic cosmetic
filtering hides empty ad containers. The blocker covers common cases well but **does not reach
parity with uBlock Origin** or other extension-based blockers; see the limitations below.

## How requests are filtered

1. Every content webview registers a `WebResourceRequested` handler for all resource types.
2. For each request the handler asks the engine with the request URL, the resource type and the
   tab's **top-level URL** as source, so `$third-party` and `$domain` rules work.
3. If a rule matches, the request is answered with an empty `204 No Content` response.
4. The **main document is never blocked**; a matching rule cannot produce a blank page. Iframes
   are checked as `subdocument`.

Blocking can be turned off globally, and per site with the allowlist (shield popover in the
toolbar or the privacy page). Allowlist entries include subdomains.

## Filter lists

| List | Default | Purpose |
|---|---|---|
| EasyList | on | Ads |
| EasyPrivacy | on | Trackers |
| uBlock filters | off | Additional uBlock Origin rules (scriptlets are not executed) |
| uBlock filters – Privacy | off | Additional tracker rules |
| Peter Lowe's List | off | Ad and tracking servers (hosts) |
| Fanboy's Annoyance | off | Cookie banners, popups, social widgets (mostly cosmetic) |

- Lists are downloaded to the app data folder (`filters/<id>.txt`) with a timeout and a size
  limit. Responses that do not look like a filter list are rejected, and the previous copy is
  kept on failure.
- The engine is built on a background thread, serialized to `engine.dat` and loaded from this
  cache on the next start, so blocking is active immediately, also offline.
- Lists are refreshed automatically when they are older than the configured interval (default
  4 days, 1 to 30 days) and can be updated manually.
- The privacy page shows the status, last update, approximate rule count and errors per list.

## Cosmetic filtering

At `DOMContentLoaded` in the main frame the browser injects:

1. a stylesheet with the URL-specific hide selectors, and
2. after one pass over the class names and IDs present in the page, a second stylesheet with the
   matching generic hide selectors.

Cosmetic filtering can be turned off in the settings.

## Statistics

Blocked requests are counted per tab, per site and per blocked domain, plus a total. Counters are
kept in memory and written to SQLite periodically and on exit. They can be reset from the
privacy page.

## Coverage and known limitations

**Covered:** all requests that WebView2 reports through `WebResourceRequested`, including
images, scripts, stylesheets, fonts, XHR/fetch, media, subframes and WebSocket handshakes.

**Not covered or only partially covered:**

- Requests from **service workers** may not be reported, depending on the WebView2 runtime
  version.
- **WebSocket messages** after the handshake cannot be filtered.
- Requests in some cross-origin iframes and popups may be covered only partially.
- `$redirect` and replacement resources, `$csp`, `$removeparam` and `$header` rules are not
  applied.
- Cosmetic filters run once per page load in the main frame only. Elements added later are not
  re-checked (no mutation observer), and a brief flash of hidden content is possible. Iframes do
  not receive cosmetic filters.
- **Procedural cosmetic filters** (`:has-text`, `:upward`, …) and **scriptlets** (`+js(...)`) are
  not executed. Parts of the uBlock and annoyance lists therefore have no effect.
- The displayed rule count is the number of non-comment lines, not the number of rules the
  engine accepted.

For debugging, the request filter can be disabled with the environment variable
`JTECH_NO_ADBLOCK=1`.
