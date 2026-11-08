// JTech Twitch Ad Blocker - content script (main world, document_start).
// Own implementation. Technique: hook fetch() in the page and in the video player worker,
// detect stitched ads (pre- and mid-rolls) in Twitch HLS media playlists and replace them with
// an ad-free backup playlist (PlaybackAccessToken with another playerType/platform). If no
// backup is ad-free, the ad segments are removed while the playlist stays valid.
// Debug: localStorage.setItem('jtech-twitch-debug','1') + reload -> console "[JTech TwitchAB]".
// Counter: window.__jtechTwitchStats (ads detected / backup swaps / segments stripped).
(function () {
  'use strict';
  if (window.__jtechTwitchAb) return;
  try { Object.defineProperty(window, '__jtechTwitchAb', { value: true }); } catch (e) { return; }

  var DEBUG = false;
  try { DEBUG = window.localStorage.getItem('jtech-twitch-debug') === '1'; } catch (e) {}

  // Self-contained: serialised with toString() and injected into the player worker.
  function hook(G, DEBUG) {
    if (G.__jtechTwitchHook) return;
    G.__jtechTwitchHook = true;
    var CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
    // Tried in order while an ad runs; first one whose media playlist is ad-free wins.
    var BACKUPS = [
      { type: 'embed', platform: 'web' }, { type: 'site', platform: 'ios' },
      { type: 'popout', platform: 'web' }, { type: 'autoplay', platform: 'android' },
      { type: 'picture-by-picture', platform: 'web' }, { type: 'autoplay', platform: 'web' }
    ];
    var BACKUP_TTL = 8 * 60 * 1000; // tokens expire; renew backups regularly
    var masters = {};  // channel -> original usher URL
    var variants = {}; // media playlist URL (without query) -> { channel, res, h }
    var backups = {};  // channel|res -> { url, idx, t }
    var deviceId = '';
    var adState = {};  // channel -> in ad break
    var stats = { ads: 0, swaps: 0, stripped: 0 };
    var bc = null;
    try { bc = new BroadcastChannel('jtech-twitch-ab'); } catch (e) {}
    function log() { if (!DEBUG) return; try { console.log.apply(console, ['[JTech TwitchAB]' + (G.document ? '' : '[worker]')].concat([].slice.call(arguments))); } catch (e) {} }
    function bump(k, n) { stats[k] += n || 1; if (bc) try { bc.postMessage({ k: k, n: n || 1 }); } catch (e) {} else if (G.__jtechTwitchStats) G.__jtechTwitchStats[k] += n || 1; }

    var AD_RE = /stitched-ad|X-TV-TWITCH-AD|twitch-stitched-ad|twitch-ads|twitch-ad-quartile|SCTE35-OUT|#EXTINF:[0-9.]+,[^\n]*Amazon|\/v1\/segment\//i;
    function hasAds(text) { return AD_RE.test(text); }
    function stripQuery(u) { var i = u.indexOf('?'); return i === -1 ? u : u.slice(0, i); }

    function parseMaster(text, base) {
      var out = [], lines = text.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (l.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
        var m = /RESOLUTION=(\d+)x(\d+)/.exec(l), b = /BANDWIDTH=(\d+)/.exec(l), f = /FRAME-RATE=([0-9.]+)/.exec(l);
        var next = (lines[i + 1] || '').trim();
        if (!next || next[0] === '#') continue;
        var abs; try { abs = new URL(next, base).href; } catch (e) { continue; }
        out.push({ url: abs, res: m ? m[1] + 'x' + m[2] : '', h: m ? +m[2] : 0, bw: b ? +b[1] : 0, fps: f ? +f[1] : 0 });
      }
      return out;
    }

    function pickVariant(list, res) {
      if (!list.length) return null;
      for (var i = 0; i < list.length; i++) if (list[i].res && list[i].res === res) return list[i];
      var want = +((res || '').split('x')[1] || 0), best = list[0], diff = Infinity;
      for (var j = 0; j < list.length; j++) {
        var d = Math.abs(list[j].h - want);
        if (d < diff) { diff = d; best = list[j]; }
      }
      return best;
    }

    // Removes ad segments; keeps sequence numbering consistent (MEDIA-SEQUENCE is advanced by
    // the ad segments removed before the first kept segment) and marks the cut with a
    // DISCONTINUITY. Never returns a playlist without segments if the input had live ones.
    function stripAds(text) {
      var lines = text.split('\n'), head = [], segs = [], cur = [], seq = 0, seqIdx = -1, inHead = true;
      var adRange = /#EXT-X-DATERANGE[^\n]*(stitched-ad|twitch-ad|SCTE35)/i;
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].replace(/\r$/, '');
        if (l.indexOf('#EXT-X-MEDIA-SEQUENCE:') === 0) { seq = +l.slice(22) || 0; seqIdx = head.length; head.push(l); continue; }
        if (inHead && (l.indexOf('#EXTINF:') === 0 || l.indexOf('#EXT-X-PROGRAM-DATE-TIME') === 0 || l.indexOf('#EXT-X-DISCONTINUITY') === 0)) inHead = false;
        if (inHead) { if (!adRange.test(l)) head.push(l); continue; }
        if (adRange.test(l) || l.indexOf('#EXT-X-SCTE35') === 0 || l.indexOf('#EXT-X-CUE') === 0) continue;
        if (l.indexOf('#EXT-X-TWITCH-PREFETCH:') === 0) { segs.push({ prefetch: l, ad: /\/v1\/segment\/|stitched/i.test(l) }); continue; }
        cur.push(l);
        if (l && l[0] !== '#') {
          var inf = ''; for (var c = 0; c < cur.length; c++) if (cur[c].indexOf('#EXTINF:') === 0) inf = cur[c];
          var title = inf.slice(inf.indexOf(',') + 1).trim();
          var ad = (title !== '' && title !== 'live') || /\/v1\/segment\/|stitched/i.test(l);
          segs.push({ lines: cur, ad: ad }); cur = [];
        }
      }
      var kept = [], lead = 0, removed = 0, seen = false, cut = false;
      for (var s = 0; s < segs.length; s++) {
        var g = segs[s];
        if (g.prefetch) { if (!g.ad && !removed) kept.push(g.prefetch); continue; }
        if (g.ad) { removed++; if (!seen) lead++; cut = true; continue; }
        var ls = g.lines.filter(function (x) { return x !== '#EXT-X-DISCONTINUITY'; });
        if (cut && seen) ls.unshift('#EXT-X-DISCONTINUITY');
        cut = false; seen = true;
        kept = kept.concat(ls);
      }
      if (!removed) return text;
      if (!seen) return null; // only ads: caller keeps previous clean playlist
      if (seqIdx >= 0) head[seqIdx] = '#EXT-X-MEDIA-SEQUENCE:' + (seq + lead);
      bump('stripped', removed);
      log('stripped ad segments:', removed);
      return head.concat(kept).join('\n') + (cur.length ? '\n' + cur.join('\n') : '');
    }

    function getToken(channel, b) {
      var body = {
        operationName: 'PlaybackAccessToken_Template',
        query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!, $platform: String!) { streamPlaybackAccessToken(channelName: $login, params: {platform: $platform, playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature __typename } videoPlaybackAccessToken(id: $vodID, params: {platform: $platform, playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature __typename } }',
        variables: { isLive: true, login: channel, isVod: false, vodID: '', playerType: b.type, platform: b.platform }
      };
      var headers = { 'Client-ID': CLIENT_ID, 'Content-Type': 'text/plain; charset=UTF-8' };
      if (deviceId) headers['X-Device-Id'] = deviceId;
      return realFetch('https://gql.twitch.tv/gql', { method: 'POST', headers: headers, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); }).then(function (j) {
          var t = j && j.data && j.data.streamPlaybackAccessToken;
          if (!t || !t.value || !t.signature) throw new Error('no token');
          return t;
        });
    }

    function newBackup(info, b) {
      return getToken(info.channel, b).then(function (tok) {
        var u = new URL(masters[info.channel] || ('https://usher.ttvnw.net/api/channel/hls/' + info.channel + '.m3u8'));
        u.searchParams.set('sig', tok.signature);
        u.searchParams.set('token', tok.value);
        u.searchParams.set('platform', b.platform);
        u.searchParams.set('p', String(Math.floor(Math.random() * 9999999)));
        if (!u.searchParams.has('allow_source')) u.searchParams.set('allow_source', 'true');
        return realFetch(u.href).then(function (r) { if (!r.ok) throw new Error('usher ' + r.status); return r.text(); })
          .then(function (master) {
            var v = pickVariant(parseMaster(master, u.href), info.res);
            if (!v) throw new Error('no variant');
            return v.url;
          });
      });
    }

    function fetchText(url) {
      return realFetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
    }

    function backupPlaylist(info) {
      var key = info.channel + '|' + info.res;
      var c = backups[key];
      if (c && Date.now() - c.t > BACKUP_TTL) { delete backups[key]; c = null; }
      var start = c ? c.idx : 0, i = 0;
      function attempt() {
        if (i >= BACKUPS.length) return Promise.resolve(null);
        var idx = (start + i++) % BACKUPS.length, b = BACKUPS[idx];
        var cached = backups[key] && backups[key].idx === idx ? backups[key].url : null;
        var urlP = cached ? Promise.resolve(cached) : newBackup(info, b);
        return urlP.then(function (url) {
          return fetchText(url).then(function (text) {
            if (hasAds(text)) { log('backup', b.type + '/' + b.platform, 'has ads too'); if (cached) delete backups[key]; return attempt(); }
            if (!cached) backups[key] = { url: url, idx: idx, t: Date.now() };
            return { text: text, name: b.type + '/' + b.platform };
          });
        }).catch(function (e) { log('backup', b.type + '/' + b.platform, 'failed:', e && e.message); if (cached) delete backups[key]; return attempt(); });
      }
      return attempt();
    }

    function respond(text, r) {
      var h = new Headers(r.headers); h.delete('content-length');
      return new Response(text, { status: 200, statusText: 'OK', headers: h });
    }

    var lastClean = {}; // media URL -> last ad-free playlist text

    function processMedia(info, key, text, r) {
      if (!hasAds(text)) {
        if (adState[info.channel]) { adState[info.channel] = false; log('ad break over on', info.channel); }
        lastClean[key] = text;
        return r;
      }
      if (!adState[info.channel]) { adState[info.channel] = true; bump('ads'); log('ad detected on', info.channel, info.res); }
      return backupPlaylist(info).then(function (b) {
        if (b) { bump('swaps'); log('using ad-free backup', b.name); return respond(b.text, r); }
        var s = stripAds(text);
        if (s === null) { log('only ad segments, holding last clean playlist'); s = lastClean[key] || text; }
        return respond(s, r);
      });
    }

    var test = { hasAds: hasAds, stripAds: stripAds, parseMaster: parseMaster, pickVariant: pickVariant, stats: stats };
    if (G.__jtechTwitchExpose) { G.__jtechTwitchExpose(test); }
    var realFetch = G.fetch;
    if (typeof realFetch !== 'function') return;
    realFetch = realFetch.bind(G);

    G.fetch = function (input, init) {
      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || String(input); } catch (e) {}
      try {
        var hd = init && init.headers;
        var d = hd && (typeof hd.get === 'function' ? hd.get('X-Device-Id') || hd.get('Device-ID') : hd['X-Device-Id'] || hd['Device-ID']);
        if (d) deviceId = d;
      } catch (e) {}
      if (url.indexOf('usher.ttvnw.net/api/') !== -1 && /\/hls\/[^/?]+\.m3u8/.test(url)) {
        var ch = /\/api\/channel\/hls\/([^/.?]+)\.m3u8/.exec(url);
        return realFetch(input, init).then(function (r) {
          if (!r.ok || !ch) return r;
          var channel = ch[1].toLowerCase();
          masters[channel] = url;
          for (var bk in backups) if (bk.indexOf(channel + '|') === 0) delete backups[bk]; // new session
          return r.clone().text().then(function (text) {
            var list = parseMaster(text, url);
            for (var k = 0; k < list.length; k++) variants[stripQuery(list[k].url)] = { channel: channel, res: list[k].res, h: list[k].h };
            log('master playlist', channel, list.length + ' variants');
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
  var stats = { ads: 0, swaps: 0, stripped: 0 };
  try { Object.defineProperty(window, '__jtechTwitchStats', { value: stats }); } catch (e) {}
  try {
    var bc = new BroadcastChannel('jtech-twitch-ab');
    bc.onmessage = function (ev) { var m = ev.data; if (m && stats.hasOwnProperty(m.k)) stats[m.k] += +m.n || 0; };
  } catch (e) {}

  var HOOK_SRC = '(' + hook.toString() + ')(self,' + (DEBUG ? 'true' : 'false') + ');';
  hook(window, DEBUG);
  if (DEBUG) console.log('[JTech TwitchAB] active on', location.href);

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
      x.open('GET', abs, false); x.send();
      if (x.status === 200 || (x.status === 0 && x.responseText)) return x.responseText;
    } catch (e) {}
    return null;
  }
  if (typeof OrigWorker === 'function') {
    var Wrapped = function (url, opts) {
      try {
        var abs = new URL(String(url), location.href).href;
        var src = (opts && opts.type === 'module') ? null : workerSource(abs);
        var code = src !== null
          ? HOOK_SRC + '\n' + src
          : HOOK_SRC + '\nimportScripts(' + JSON.stringify(abs) + ');';
        if (!(opts && opts.type === 'module')) {
          var w = new OrigWorker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), opts);
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
    // Keep our wrapper even if page code tries to restore the native Worker.
    try { Object.defineProperty(window, 'Worker', { configurable: false, get: function () { return Wrapped; }, set: function () {} }); }
    catch (e) { window.Worker = Wrapped; }
  }
})();
