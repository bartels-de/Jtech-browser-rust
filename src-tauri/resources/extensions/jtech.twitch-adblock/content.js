// JTech Twitch Ad Blocker - content script (main world, document_start).
// Technique: hook fetch() in the page and in the video player worker, detect stitched ads
// (pre- and mid-rolls) in Twitch HLS media playlists and replace them with an ad-free backup
// playlist (PlaybackAccessToken for another playerType). If no backup is ad-free, the ad
// segments are removed while the playlist stays valid. After an ad break the player is reloaded.
// 1.3.0: request shape, backup order, header relay, forced popout token, parent_domains removal
// and the reload-after-ad step follow TwitchAdSolutions/vaft (pixeltris, MIT) and
// TTV-AB (GosuDRM, https://github.com/GosuDRM/TTV-AB) - see NOTICE.
// Debug: localStorage.setItem('jtech-twitch-debug','1') + reload -> console "[JTech TwitchAB]".
// Counter: window.__jtechTwitchStats. Disable player reload: localStorage 'jtech-twitch-noreload'='1'.
(function () {
  'use strict';
  if (window.__jtechTwitchAb) return;
  try { Object.defineProperty(window, '__jtechTwitchAb', { value: true }); } catch (e) { return; }

  var VERSION = '1.3.0';
  var DEBUG = false, NORELOAD = false;
  try { DEBUG = window.localStorage.getItem('jtech-twitch-debug') === '1'; } catch (e) {}
  try { NORELOAD = window.localStorage.getItem('jtech-twitch-noreload') === '1'; } catch (e) {}

  // Self-contained: serialised with toString() and injected into the player worker.
  // H = shared request headers (seeded by the page, updated via messages).
  function hook(G, DEBUG, H) {
    if (G.__jtechTwitchHook) return;
    G.__jtechTwitchHook = true;
    var IS_PAGE = !!G.document;
    H = H || {};
    if (!H.clientId) H.clientId = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
    // Persisted query of Twitch's own PlaybackAccessToken operation (as used by vaft / TTV-AB);
    // replaced by the hash the page itself sends, if seen.
    var DEFAULT_HASH = 'ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9';
    // Backup order: embed/popout give source quality, site/mobile_web as further candidates,
    // autoplay (android, 360p) is the last resort. embed is the fallback (stripped if needed).
    var BACKUPS = ['embed', 'popout', 'site', 'mobile_web', 'autoplay'];
    var FALLBACK = 'embed';
    var FORCE_TYPE = 'popout'; // page's own token request is rewritten to this playerType
    var BACKUP_TTL = 8 * 60 * 1000;
    var masters = {};  // channel -> original usher URL
    var variants = {}; // media playlist URL (without query) -> { channel, res, h, fps, codecs }
    var backups = {};  // channel|type -> { master, t }
    var adState = {};  // channel -> { on, midroll, used, t }
    var failStreak = {}; // channel -> consecutive ad playlists without ad-free backup
    var stats = { ads: 0, swaps: 0, stripped: 0, tokenFail: 0, reloads: 0 };
    var bc = null;
    try { bc = new BroadcastChannel('jtech-twitch-ab'); } catch (e) {}
    function log() { if (!DEBUG) return; try { console.log.apply(console, ['[JTech TwitchAB]' + (IS_PAGE ? '' : '[worker]')].concat([].slice.call(arguments))); } catch (e) {} }
    function bump(k, n) { stats[k] = (stats[k] || 0) + (n || 1); if (bc) try { bc.postMessage({ k: k, n: n || 1 }); } catch (e) {} else if (G.__jtechTwitchStats && G.__jtechTwitchStats !== stats) G.__jtechTwitchStats[k] = (G.__jtechTwitchStats[k] || 0) + (n || 1); }

    var AD_RE = /stitched|X-TV-TWITCH-AD|twitch-ads|twitch-ad-quartile|SCTE35-OUT|#EXTINF:[0-9.]+,[^\n]*Amazon|\/v1\/segment\//i;
    function hasAds(text) { return AD_RE.test(text); }
    function isMidroll(text) { return /"MIDROLL"|"midroll"/.test(text); }
    function stripQuery(u) { var i = u.indexOf('?'); return i === -1 ? u : u.slice(0, i); }

    function parseMaster(text, base) {
      var out = [], lines = text.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (l.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
        var m = /RESOLUTION=(\d+)x(\d+)/.exec(l), b = /BANDWIDTH=(\d+)/.exec(l), f = /FRAME-RATE=([0-9.]+)/.exec(l), c = /CODECS="([^"]*)"/.exec(l);
        var next = (lines[i + 1] || '').trim();
        if (!next || next[0] === '#') continue;
        var abs; try { abs = new URL(next, base).href; } catch (e) { continue; }
        out.push({ url: abs, res: m ? m[1] + 'x' + m[2] : '', w: m ? +m[1] : 0, h: m ? +m[2] : 0, bw: b ? +b[1] : 0, fps: f ? +f[1] : 0, codecs: c ? c[1] : '' });
      }
      return out;
    }

    // Same resolution (prefer same frame rate), else closest pixel count.
    function pickVariant(list, res, fps) {
      if (!list.length) return null;
      var same = null;
      for (var i = 0; i < list.length; i++) if (list[i].res && list[i].res === res) {
        if (!same) same = list[i];
        if (fps && list[i].fps === fps) return list[i];
      }
      if (same) return same;
      var p = (res || '').split('x'), want = (+p[0] || 0) * (+p[1] || 0), best = list[0], diff = Infinity;
      for (var j = 0; j < list.length; j++) {
        var d = Math.abs(list[j].w * list[j].h - want);
        if (d < diff) { diff = d; best = list[j]; }
      }
      return best;
    }

    // Removes ad segments; keeps sequence numbering consistent and marks the cut with a
    // DISCONTINUITY. While ads are present all low-latency prefetch hints are dropped (the
    // player could otherwise prefetch ad segments). Returns null if only ad segments remain.
    function stripAds(text) {
      var lines = text.split('\n'), head = [], segs = [], cur = [], seq = 0, seqIdx = -1, inHead = true;
      var adRange = /#EXT-X-DATERANGE[^\n]*(stitched|twitch-ad|SCTE35)/i;
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].replace(/\r$/, '');
        if (l.indexOf('#EXT-X-MEDIA-SEQUENCE:') === 0) { seq = +l.slice(22) || 0; seqIdx = head.length; head.push(l); continue; }
        if (inHead && (l.indexOf('#EXTINF:') === 0 || l.indexOf('#EXT-X-PROGRAM-DATE-TIME') === 0 || l.indexOf('#EXT-X-DISCONTINUITY') === 0)) inHead = false;
        if (inHead) { if (!adRange.test(l)) head.push(l); continue; }
        if (adRange.test(l) || l.indexOf('#EXT-X-SCTE35') === 0 || l.indexOf('#EXT-X-CUE') === 0) continue;
        if (l.indexOf('#EXT-X-TWITCH-PREFETCH:') === 0) { segs.push({ prefetch: l }); continue; }
        cur.push(l);
        if (l && l[0] !== '#') {
          var inf = ''; for (var c = 0; c < cur.length; c++) if (cur[c].indexOf('#EXTINF:') === 0) inf = cur[c];
          var title = inf.slice(inf.indexOf(',') + 1).trim();
          var ad = (inf !== '' && title !== 'live') || /\/v1\/segment\/|stitched/i.test(l);
          segs.push({ lines: cur, ad: ad }); cur = [];
        }
      }
      var kept = [], lead = 0, removed = 0, seen = false, cut = false, prefetch = [];
      for (var s = 0; s < segs.length; s++) {
        var g = segs[s];
        if (g.prefetch) { prefetch.push(g.prefetch); continue; }
        if (g.ad) { removed++; if (!seen) lead++; cut = true; continue; }
        var ls = g.lines.filter(function (x) { return x !== '#EXT-X-DISCONTINUITY'; });
        if (cut && seen) ls.unshift('#EXT-X-DISCONTINUITY');
        cut = false; seen = true;
        kept = kept.concat(ls);
      }
      if (!removed) return hasAds(text) ? head.concat(kept).join('\n') + (cur.length ? '\n' + cur.join('\n') : '') : text;
      if (!seen) return null;
      if (seqIdx >= 0) head[seqIdx] = '#EXT-X-MEDIA-SEQUENCE:' + (seq + lead);
      bump('stripped', removed);
      log('stripped ad segments:', removed, '(prefetch hints dropped:', prefetch.length + ')');
      return head.concat(kept).join('\n') + (cur.length ? '\n' + cur.join('\n') : '');
    }

    // ---- headers seen on the page's own GQL requests ----
    function getHeader(hd, name) {
      if (!hd) return null;
      try {
        if (typeof hd.get === 'function') return hd.get(name);
        if (Array.isArray(hd)) { for (var i = 0; i < hd.length; i++) if (String(hd[i][0]).toLowerCase() === name.toLowerCase()) return hd[i][1]; return null; }
        for (var k in hd) if (k.toLowerCase() === name.toLowerCase()) return hd[k];
      } catch (e) {}
      return null;
    }
    var HDR = { 'Client-ID': 'clientId', 'X-Device-Id': 'deviceId', 'Device-ID': 'deviceId', 'Client-Version': 'clientVersion', 'Client-Session-Id': 'clientSession', 'Client-Integrity': 'integrity', 'Authorization': 'auth' };
    function captureHeaders(hd) {
      var changed = false;
      for (var n in HDR) {
        var v = getHeader(hd, n);
        if (typeof v === 'string' && v && H[HDR[n]] !== v) { H[HDR[n]] = v; changed = true; }
      }
      if (changed) { log('gql headers updated', { deviceId: !!H.deviceId, integrity: !!H.integrity, auth: !!H.auth, version: H.clientVersion || '' }); if (G.__jtechTwitchOnHeaders) G.__jtechTwitchOnHeaders(H); }
    }

    // Page: forces playerType FORCE_TYPE on Twitch's own PlaybackAccessToken request and
    // remembers the persisted-query hash. Returns the new body or null.
    function rewriteTokenBody(body) {
      if (typeof body !== 'string' || body.indexOf('PlaybackAccessToken') === -1) return null;
      try {
        var j = JSON.parse(body), arr = Array.isArray(j) ? j : [j], from = '';
        for (var i = 0; i < arr.length; i++) {
          var op = arr[i]; if (!op || !op.variables) continue;
          var h = op.extensions && op.extensions.persistedQuery && op.extensions.persistedQuery.sha256Hash;
          if (h && /PlaybackAccessToken/.test(op.operationName || '') && H.hash !== h) { H.hash = h; log('token hash from page', h.slice(0, 12)); if (G.__jtechTwitchOnHeaders) G.__jtechTwitchOnHeaders(H); }
          var pt = op.variables.playerType;
          if (pt && pt !== FORCE_TYPE && pt.indexOf('picture-by-picture') === -1 && op.variables.isLive !== false) { from = pt; op.variables.playerType = FORCE_TYPE; }
        }
        if (!from) return null;
        log('page token playerType', from, '->', FORCE_TYPE);
        return JSON.stringify(j);
      } catch (e) { return null; }
    }

    var relay = { n: 0, pending: {} };
    function gql(body) {
      var headers = { 'Client-ID': H.clientId, 'Content-Type': 'text/plain; charset=UTF-8' };
      if (H.deviceId) headers['X-Device-Id'] = H.deviceId;
      if (H.clientVersion) headers['Client-Version'] = H.clientVersion;
      if (H.clientSession) headers['Client-Session-Id'] = H.clientSession;
      if (H.integrity) headers['Client-Integrity'] = H.integrity;
      if (H.auth) headers['Authorization'] = H.auth;
      var opts = { method: 'POST', headers: headers, body: JSON.stringify(body) };
      // Worker: GQL goes through the page (same as vaft/TTV-AB), page answers via postMessage.
      if (!IS_PAGE && typeof G.postMessage === 'function' && G.__jtechTwitchRelay) {
        return new Promise(function (resolve, reject) {
          var id = 'j' + (++relay.n);
          relay.pending[id] = { resolve: resolve, reject: reject };
          setTimeout(function () { if (relay.pending[id]) { delete relay.pending[id]; reject(new Error('relay timeout')); } }, 6000);
          G.postMessage({ jtab: 'fetch', id: id, url: 'https://gql.twitch.tv/gql', opts: opts });
        });
      }
      return realFetch('https://gql.twitch.tv/gql', opts).then(function (r) { return r.text().then(function (t) { return { status: r.status, body: t }; }); });
    }

    function getToken(channel, type) {
      var body = {
        operationName: 'PlaybackAccessToken',
        variables: { isLive: true, login: channel, isVod: false, vodID: '', playerType: type, platform: type === 'autoplay' ? 'android' : 'web' },
        extensions: { persistedQuery: { version: 1, sha256Hash: H.hash || DEFAULT_HASH } }
      };
      return gql(body).then(function (res) {
        var j = null; try { j = JSON.parse(res.body); } catch (e) {}
        var t = j && j.data && j.data.streamPlaybackAccessToken;
        if (res.status !== 200 || !t || !t.value || !t.signature) {
          var err = j && j.errors && j.errors[0] && j.errors[0].message;
          throw new Error('token ' + type + ' status ' + res.status + (err ? ' ' + err : ''));
        }
        log('token ok', type, '(integrity:', !!H.integrity, 'auth:', !!H.auth + ')');
        return t;
      });
    }

    function cleanUsher(url) {
      try { var u = new URL(url); if (!u.searchParams.has('parent_domains')) return url; u.searchParams.delete('parent_domains'); return u.href; } catch (e) { return url; }
    }

    // Backup master: original usher URL (all its params), only sig/token replaced.
    function backupMaster(channel, type) {
      var key = channel + '|' + type, c = backups[key];
      if (c && Date.now() - c.t < BACKUP_TTL && !(c.adAt && Date.now() - c.adAt > 10000)) return Promise.resolve(c.master);
      return getToken(channel, type).then(function (tok) {
        var u = new URL(cleanUsher(masters[channel] || ('https://usher.ttvnw.net/api/v2/channel/hls/' + channel + '.m3u8')));
        u.searchParams.set('sig', tok.signature);
        u.searchParams.set('token', tok.value);
        u.searchParams.set('p', String(Math.floor(Math.random() * 9999999)));
        return realFetch(u.href).then(function (r) {
          if (!r.ok) throw new Error('usher ' + type + ' status ' + r.status);
          return r.text();
        }).then(function (master) {
          backups[key] = { master: { text: master, url: u.href }, t: Date.now() };
          return backups[key].master;
        });
      });
    }

    function fetchText(url) {
      return realFetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
    }

    function backupPlaylist(info) {
      var i = 0, fallback = null;
      function attempt() {
        if (i >= BACKUPS.length) return Promise.resolve(fallback ? { text: fallback, name: FALLBACK, ads: true } : null);
        var type = BACKUPS[i++], key = info.channel + '|' + type;
        return backupMaster(info.channel, type).then(function (m) {
          var v = pickVariant(parseMaster(m.text, m.url), info.res, info.fps);
          if (!v) throw new Error('no variant');
          return fetchText(v.url).then(function (text) {
            if (hasAds(text)) {
              log('backup', type, v.res, 'ad-free: no');
              if (type === FALLBACK) fallback = text;
              if (backups[key] && !backups[key].adAt) backups[key].adAt = Date.now(); // new token after 10 s
              return attempt();
            }
            log('backup', type, v.res, 'ad-free: yes');
            return { text: text, name: type + ' ' + v.res };
          });
        }).catch(function (e) {
          if (/^token/.test(e && e.message)) bump('tokenFail');
          log('backup', type, 'failed:', e && e.message);
          delete backups[key];
          return attempt();
        });
      }
      return attempt();
    }

    function respond(text, r) {
      var h = new Headers(r.headers); h.delete('content-length');
      return new Response(text, { status: 200, statusText: 'OK', headers: h });
    }

    var lastClean = {};
    function requestReload(reason) {
      log('request player reload:', reason);
      if (IS_PAGE) { if (G.__jtechTwitchReload) G.__jtechTwitchReload(reason); }
      else if (typeof G.postMessage === 'function' && G.__jtechTwitchRelay) G.postMessage({ jtab: 'reload', reason: reason });
    }

    function processMedia(info, key, text, r) {
      var st = adState[info.channel];
      if (!hasAds(text)) {
        lastClean[key] = text;
        if (st && st.on) {
          st.on = false;
          log('ad break over on', info.channel, st.midroll ? '(midroll)' : '(preroll)', 'handled by', st.used || 'none');
          requestReload('ad break over');
        }
        failStreak[info.channel] = 0;
        return r;
      }
      if (!st || !st.on) {
        st = adState[info.channel] = { on: true, midroll: isMidroll(text), used: '', t: Date.now() };
        bump('ads');
        log('ad detected on', info.channel, info.res, st.midroll ? 'midroll' : 'preroll');
      }
      return backupPlaylist(info).then(function (b) {
        if (b && !b.ads) {
          bump('swaps'); failStreak[info.channel] = 0;
          if (st.used !== b.name) log('using ad-free backup', b.name);
          st.used = b.name;
          return respond(stripAds(b.text) || b.text, r);
        }
        var n = failStreak[info.channel] = (failStreak[info.channel] || 0) + 1;
        log('no ad-free backup (' + n + 'x), fallback: strip', b ? 'embed playlist' : 'original playlist');
        st.used = 'strip';
        var s = stripAds(b ? b.text : text);
        if (s === null && b) s = stripAds(text);
        if (s === null) { log('only ad segments, holding last clean playlist'); s = lastClean[key] || text; }
        return respond(s, r);
      });
    }

    var realFetch = G.fetch;
    var test = { hasAds: hasAds, stripAds: stripAds, parseMaster: parseMaster, pickVariant: pickVariant, rewriteTokenBody: rewriteTokenBody, cleanUsher: cleanUsher, stats: stats, H: H };
    if (G.__jtechTwitchExpose) { G.__jtechTwitchExpose(test); }
    if (typeof realFetch !== 'function') return;
    realFetch = realFetch.bind(G);

    if (!IS_PAGE && typeof G.addEventListener === 'function') {
      G.addEventListener('message', function (e) {
        var m = e && e.data; if (!m || !m.jtab) return;
        if (m.jtab === 'hdr' && m.h) { for (var k in m.h) H[k] = m.h[k]; }
        else if (m.jtab === 'fetchres') {
          var p = relay.pending[m.id]; if (!p) return; delete relay.pending[m.id];
          if (m.error) p.reject(new Error(m.error)); else p.resolve({ status: m.status, body: m.body });
        }
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      });
    }

    G.fetch = function (input, init) {
      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || String(input); } catch (e) {}
      if (url.indexOf('gql.twitch.tv') !== -1 && init) {
        try { captureHeaders(init.headers); } catch (e) {}
        if (IS_PAGE) { var nb = rewriteTokenBody(init.body); if (nb) init = Object.assign({}, init, { body: nb }); }
      }
      if (url.indexOf('usher.ttvnw.net/api/') !== -1 && /\/hls\/[^/?]+\.m3u8/.test(url) && url.indexOf('picture-by-picture') === -1) {
        var ch = /\/api\/(?:v\d+\/)?channel\/hls\/([^/.?]+)\.m3u8/.exec(url);
        log('usher url seen', ch ? ch[1] : '(not a channel: ' + url.slice(0, 80) + ')', /\/v2\//.test(url) ? 'v2' : 'v1');
        if (ch && typeof input === 'string') { var cu = cleanUsher(url); if (cu !== url) { url = input = cu; log('removed parent_domains from usher url'); } }
        return realFetch(input, init).then(function (r) {
          if (!r.ok || !ch) { if (!r.ok) log('usher status', r.status); return r; }
          var channel = ch[1].toLowerCase();
          masters[channel] = url;
          for (var bk in backups) if (bk.indexOf(channel + '|') === 0) delete backups[bk];
          return r.clone().text().then(function (text) {
            var list = parseMaster(text, url);
            for (var k = 0; k < list.length; k++) variants[stripQuery(list[k].url)] = { channel: channel, res: list[k].res, h: list[k].h, fps: list[k].fps, codecs: list[k].codecs };
            log('master playlist', channel, list.length + ' variants', hasAds(text) ? '(master has ad markers)' : '');
            return r;
          }, function () { return r; });
        });
      }
      var key = stripQuery(url), info = variants[key];
      if (info && /\.m3u8$/.test(key)) {
        return realFetch(input, init).then(function (r) {
          if (!r.ok) return r;
          return r.clone().text().then(function (text) {
            return processMedia(info, key, text, r);
          }).catch(function (e) { log('process error', e && e.message); return r; });
        });
      }
      return realFetch(input, init);
    };
  }

  // Page-global counter (no IPC): page + all player workers via BroadcastChannel.
  var stats = { ads: 0, swaps: 0, stripped: 0, tokenFail: 0, reloads: 0 };
  try { Object.defineProperty(window, '__jtechTwitchStats', { value: stats }); } catch (e) {}
  try {
    var bc = new BroadcastChannel('jtech-twitch-ab');
    bc.onmessage = function (ev) { var m = ev.data; if (m && stats.hasOwnProperty(m.k)) stats[m.k] += +m.n || 0; };
  } catch (e) {}

  var H = {}; // shared headers (page copy)
  var workers = [];
  window.__jtechTwitchOnHeaders = function (h) {
    for (var i = 0; i < workers.length; i++) try { workers[i].postMessage({ jtab: 'hdr', h: h }); } catch (e) {}
  };

  // Reload the Twitch player through its React state (setSrc), as vaft/TTV-AB do after an ad.
  function findPlayer() {
    var root = document.querySelector('#root'); if (!root) return null;
    var node = null;
    try { if (root._reactRootContainer && root._reactRootContainer._internalRoot) node = root._reactRootContainer._internalRoot.current; } catch (e) {}
    if (!node) { var k = Object.keys(root).filter(function (x) { return x.indexOf('__reactContainer') === 0; })[0]; if (k) node = root[k]; }
    if (!node) return null;
    var player = null, state = null, stack = [node], n = 0;
    while (stack.length && n++ < 200000 && !(player && state)) {
      var f = stack.pop(), s = f && f.stateNode;
      if (s && !player && s.setPlayerActive && s.props && s.props.mediaPlayerInstance) player = s.props.mediaPlayerInstance;
      if (s && !state && s.setSrc && s.setInitialPlaybackSettings) state = s;
      if (f && f.sibling) stack.push(f.sibling);
      if (f && f.child) stack.push(f.child);
    }
    if (player && player.playerInstance) player = player.playerInstance;
    return player && state ? { player: player, state: state } : null;
  }
  var lastReload = 0;
  window.__jtechTwitchReload = function (reason) {
    if (NORELOAD) { if (DEBUG) console.log('[JTech TwitchAB] reload disabled (jtech-twitch-noreload)'); return; }
    if (Date.now() - lastReload < 3000) return;
    var p = findPlayer();
    if (!p) { if (DEBUG) console.log('[JTech TwitchAB] reload: player not found'); return; }
    try {
      if (p.player.isPaused && p.player.isPaused()) { if (DEBUG) console.log('[JTech TwitchAB] reload skipped: paused'); return; }
      lastReload = Date.now();
      p.state.setSrc({ isNewMediaPlayerInstance: true, refreshAccessToken: true });
      if (p.player.play) p.player.play();
      stats.reloads++;
      if (DEBUG) console.log('[JTech TwitchAB] player reloaded:', reason);
    } catch (e) { if (DEBUG) console.log('[JTech TwitchAB] reload failed', e && e.message); }
  };

  var pageFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null; // before our hook: relay must not be rewritten
  hook(window, DEBUG, H);
  if (DEBUG) console.log('[JTech TwitchAB] ' + VERSION + ' active on', location.href, '(document_start, readyState=' + document.readyState + ')');

  // Hide "ad in progress" overlays the player may still show.
  function css() {
    try {
      var r = document.head || document.documentElement;
      if (!r) { document.addEventListener('DOMContentLoaded', css, { once: true }); return; }
      var s = document.createElement('style');
      s.textContent = '[data-a-target="video-ad-label"],[data-a-target="video-ad-countdown"],[data-test-selector="sad-overlay"],.video-player__overlay [class*="ad-banner"],[data-a-target="ax-overlay"]{display:none!important}';
      r.appendChild(s);
    } catch (e) {}
  }
  css();

  // Player worker: fetch the worker script synchronously and prepend our hook in a new blob
  // worker (no importScripts: works for blob: URLs and keeps relative URLs resolvable).
  var OrigWorker = window.Worker;
  function workerSource(abs) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', abs, false);
      try { x.overrideMimeType('text/javascript'); } catch (e) {}
      x.send();
      if (x.status === 200 || (x.status === 0 && x.responseText)) return x.responseText;
      if (DEBUG) console.log('[JTech TwitchAB] worker source status', x.status);
    } catch (e) { if (DEBUG) console.log('[JTech TwitchAB] worker source failed', e && e.message); }
    return null;
  }
  function attach(w) {
    workers.push(w);
    w.addEventListener('message', function (e) {
      var m = e.data; if (!m || !m.jtab) return;
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (m.jtab === 'reload') window.__jtechTwitchReload(m.reason);
      else if (m.jtab === 'fetch') {
        if (!pageFetch) { w.postMessage({ jtab: 'fetchres', id: m.id, error: 'no fetch' }); return; }
        pageFetch(m.url, m.opts).then(function (r) {
          return r.text().then(function (t) { w.postMessage({ jtab: 'fetchres', id: m.id, status: r.status, body: t }); });
        }).catch(function (err) { w.postMessage({ jtab: 'fetchres', id: m.id, error: String(err && err.message || err) }); });
      }
    });
  }
  if (typeof OrigWorker === 'function') {
    var Wrapped = function (url, opts) {
      try {
        var abs = new URL(String(url), location.href).href;
        if (!(opts && opts.type === 'module')) {
          var src = workerSource(abs);
          var head = '(' + hook.toString() + ')(self,' + (DEBUG ? 'true' : 'false') + ',' + JSON.stringify(H) + ');self.__jtechTwitchRelay=true;';
          var code = src !== null ? head + '\n' + src : head + '\nimportScripts(' + JSON.stringify(abs) + ');';
          var w = new OrigWorker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), opts);
          attach(w);
          if (DEBUG) console.log('[JTech TwitchAB] worker hooked', src !== null ? '(inline)' : '(importScripts)', abs.slice(0, 80));
          return w;
        }
        if (DEBUG) console.log('[JTech TwitchAB] module worker not hooked', abs.slice(0, 80));
      } catch (e) { if (DEBUG) console.log('[JTech TwitchAB] worker hook failed', e && e.message); }
      return new OrigWorker(url, opts);
    };
    Wrapped.prototype = OrigWorker.prototype;
    try { Object.defineProperty(Wrapped, 'name', { value: 'Worker' }); } catch (e) {}
    try { Wrapped.toString = function () { return OrigWorker.toString(); }; } catch (e) {}
    try { Object.defineProperty(window, 'Worker', { configurable: false, get: function () { return Wrapped; }, set: function () {} }); }
    catch (e) { window.Worker = Wrapped; }
  }
})();
