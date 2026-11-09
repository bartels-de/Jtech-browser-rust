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

1. a stylesheet with the URL-specific hide selectors,
2. a stylesheet for procedural filters that can be expressed as plain CSS,
3. a JavaScript runtime that executes scriptlets (`+js(...)`) and procedural cosmetic filters
   (`:has-text`, `:upward`, `:matches-css`, `:min-text-length`, `:style()`, `:remove-attr()`,
   `:remove-class()`, `:remove()`), and
4. after one pass over the class names and IDs present in the page, a second stylesheet with the
   matching generic hide selectors.

Scriptlets and procedural filters run with a `MutationObserver` so dynamically added content is
re-checked. They can be turned off separately in Settings › Ad blocker; cosmetic CSS hiding has its
own toggle.

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
- Cosmetic filters run in the main frame only. Iframes do not receive cosmetic filters.
- Scriptlets and procedural filters are injected at `DOMContentLoaded`. Very early page scripts may
  already have run, so scriptlets that intercept `fetch`/`XMLHttpRequest` at the first moment may
  not catch the earliest requests. A future update may move the injection to `document_start`.
- Not every procedural operator from uBlock Origin is supported yet; unsupported operators are
  skipped. The currently supported operators are: `:has-text`, `:upward`, `:matches-attr`,
  `:matches-css`, `:matches-css-before`, `:matches-css-after`, `:matches-path`, `:min-text-length`
  and `:xpath`. Unsupported operators in otherwise valid rules are ignored.
- The displayed rule count is the number of non-comment lines, not the number of rules the
  engine accepted.

For debugging, the request filter can be disabled with the environment variable
`JTECH_NO_ADBLOCK=1`.
