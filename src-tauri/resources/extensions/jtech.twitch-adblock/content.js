// JTech Twitch Ad Blocker - content script (main world, document_start).
// Own implementation. Technique: hook fetch() in the page and in the video player worker,
// detect stitched ads in Twitch HLS media playlists and replace them with an ad-free backup
// playlist (PlaybackAccessToken with another playerType). If no backup is ad-free, the ad
// segments are removed from the playlist. No third-party servers are contacted.
(function () {
  'use strict';
  if (window.__jtechTwitchAb) return;
  try { Object.defineProperty(window, '__jtechTwitchAb', { value: true }); } catch (e) { return; }

  // Self-contained: serialised with toString() and injected into the player worker.
  function hook(G) {
    if (G.__jtechTwitchHook) return;
    G.__jtechTwitchHook = true;
    var realFetch = G.fetch;
    if (typeof realFetch !== 'function') return;
    realFetch = realFetch.bind(G);

    var CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
    var PLAYER_TYPES = ['embed', 'popout', 'autoplay'];
    var MARKERS = ['stitched-ad', 'X-TV-TWITCH-AD', 'twitch-stitched-ad', 'twitch-ad-quartile', 'SCTE35-OUT'];
    var masters = {};  // channel -> original usher URL
    var variants = {}; // media playlist URL -> { channel, res }
    var backups = {};  // channel|res -> { url, type }
    var log = function () { try { console.debug.apply(console, ['[JTech Twitch AB]'].concat([].slice.call(arguments))); } catch (e) {} };

    function hasAds(text) {
      for (var i = 0; i < MARKERS.length; i++) if (text.indexOf(MARKERS[i]) !== -1) return true;
      return /#EXTINF:[0-9.]+,[^\n]*Amazon/i.test(text);
    }

    function stripQuery(u) { var i = u.indexOf('?'); return i === -1 ? u : u.slice(0, i); }

    function parseMaster(text, base) {
      var out = [], lines = text.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (l.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
        var m = /RESOLUTION=(\d+)x(\d+)/.exec(l), b = /BANDWIDTH=(\d+)/.exec(l);
        var next = (lines[i + 1] || '').trim();
        if (!next || next[0] === '#') continue;
        var abs; try { abs = new URL(next, base).href; } catch (e) { continue; }
        out.push({ url: abs, res: m ? m[1] + 'x' + m[2] : '', h: m ? +m[2] : 0, bw: b ? +b[1] : 0 });
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

    function stripAds(text) {
      var lines = text.split('\n'), out = [], skipUri = false, removed = 0;
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        if (skipUri) { if (l && l[0] !== '#') { skipUri = false; continue; } }
        if (l.indexOf('#EXTINF:') === 0) {
          var title = l.slice(l.indexOf(',') + 1).trim();
          if (title !== 'live' && title !== '') { skipUri = true; removed++; continue; }
        }
        if (l.indexOf('#EXT-X-DATERANGE') === 0 && /stitched-ad|twitch-ad|SCTE35/i.test(l)) continue;
        if (l.indexOf('#EXT-X-TWITCH-PREFETCH:') === 0 && hasAds(text)) continue;
        out.push(l);
      }
      if (removed) log('removed ad segments:', removed);
      return out.join('\n');
    }

    function getToken(channel, playerType) {
      var body = {
        operationName: 'PlaybackAccessToken_Template',
        query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) { streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature __typename } videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature __typename } }',
        variables: { isLive: true, login: channel, isVod: false, vodID: '', playerType: playerType }
      };
      return realFetch('https://gql.twitch.tv/gql', {
        method: 'POST', headers: { 'Client-ID': CLIENT_ID, 'Content-Type': 'text/plain; charset=UTF-8' }, body: JSON.stringify(body)
      }).then(function (r) { return r.json(); }).then(function (j) {
        var t = j && j.data && j.data.streamPlaybackAccessToken;
        if (!t || !t.value || !t.signature) throw new Error('no token');
        return t;
      });
    }

    function newBackup(info, playerType) {
      return getToken(info.channel, playerType).then(function (tok) {
        var u;
        try { u = new URL(masters[info.channel] || ('https://usher.ttvnw.net/api/channel/hls/' + info.channel + '.m3u8')); } catch (e) { throw e; }
        u.searchParams.set('sig', tok.signature);
        u.searchParams.set('token', tok.value);
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
      var i = 0;
      function attempt() {
        if (i >= PLAYER_TYPES.length) return Promise.resolve(null);
        var type = PLAYER_TYPES[i++];
        var cached = backups[key] && backups[key].type === type ? backups[key].url : null;
        var urlP = cached ? Promise.resolve(cached) : newBackup(info, type);
        return urlP.then(function (url) {
          return fetchText(url).then(function (text) {
            if (hasAds(text)) { if (cached) delete backups[key]; return attempt(); }
            backups[key] = { url: url, type: type };
            return text;
          });
        }).catch(function (e) { log('backup ' + type + ' failed:', e && e.message); if (cached) delete backups[key]; return attempt(); });
      }
      return attempt();
    }

    function respond(text, r) {
      return new Response(text, { status: 200, statusText: 'OK', headers: r.headers });
    }

    G.fetch = function (input, init) {
      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || String(input); } catch (e) {}
      if (url.indexOf('usher.ttvnw.net/api/channel/hls/') !== -1) {
        var ch = /\/api\/channel\/hls\/([^/.?]+)\.m3u8/.exec(url);
        return realFetch(input, init).then(function (r) {
          if (!r.ok || !ch) return r;
          var channel = ch[1].toLowerCase();
          masters[channel] = url;
          return r.clone().text().then(function (text) {
            var list = parseMaster(text, url);
            for (var k = 0; k < list.length; k++) {
              var info = { channel: channel, res: list[k].res };
              variants[list[k].url] = info;
              variants[stripQuery(list[k].url)] = info;
            }
            return r;
          }, function () { return r; });
        });
      }
      var info = variants[url] || variants[stripQuery(url)];
      if (info && /\.m3u8(\?|$)/.test(url)) {
        return realFetch(input, init).then(function (r) {
          if (!r.ok) return r;
          return r.clone().text().then(function (text) {
            if (!hasAds(text)) return r;
            log('ad detected on', info.channel, info.res);
            return backupPlaylist(info).then(function (b) {
              if (b) { log('using ad-free backup playlist'); return respond(b, r); }
              return respond(stripAds(text), r);
            });
          }, function () { return r; });
        });
      }
      return realFetch(input, init);
    };
  }

  var HOOK_SRC = '(' + hook.toString() + ')(self);';
  hook(window);

  // Player worker: run the same hook inside the worker before Twitch's worker code.
  var OrigWorker = window.Worker;
  if (typeof OrigWorker === 'function') {
    var Wrapped = function (url, opts) {
      if (!(opts && opts.type === 'module')) {
        try {
          var abs = new URL(String(url), location.href).href;
          var blob = new Blob([HOOK_SRC + '\nimportScripts(' + JSON.stringify(abs) + ');'], { type: 'text/javascript' });
          return new OrigWorker(URL.createObjectURL(blob), opts);
        } catch (e) { /* fall through */ }
      }
      return new OrigWorker(url, opts);
    };
    Wrapped.prototype = OrigWorker.prototype;
    try { Object.defineProperty(Wrapped, 'name', { value: 'Worker' }); } catch (e) {}
    window.Worker = Wrapped;
  }
})();
