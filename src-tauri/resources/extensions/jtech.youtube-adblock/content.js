// JTech YouTube Ad Blocker - content script (main world, document_start).
// Own implementation. Layers:
//  1. Data level: strip ad fields from player/browse/next/search responses (fetch, XHR,
//     JSON.parse) and from the initial ytInitialPlayerResponse / ytInitialData.
//  2. Player fallback: if an ad still plays, mute it, fast-forward it and click "skip".
//  3. Cosmetic CSS for ad slots, masthead ads, overlays and merch shelves.
//  4. Removes the "ad blockers are not allowed" enforcement dialog and resumes playback.
// No third-party servers are contacted.
(function () {
  'use strict';
  if (window.__jtechYtAb) return;

  var AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adEngagementPanels'];
  var AD_RENDERERS = {
    promotedVideoRenderer: 1, adSlotRenderer: 1, inFeedAdLayoutRenderer: 1, promotedSparklesWebRenderer: 1,
    promotedSparklesTextSearchRenderer: 1, displayAdRenderer: 1, compactPromotedVideoRenderer: 1,
    statementBannerRenderer: 1, brandVideoSingletonRenderer: 1, brandVideoShelfRenderer: 1,
    bannerPromoRenderer: 1, merchandiseShelfRenderer: 1, searchPyvRenderer: 1, adActionInterstitialRenderer: 1,
    playerLegacyDesktopWatchAdsRenderer: 1, actionCompanionAdRenderer: 1, mealbarPromoRenderer: 1
  };
  var MAX_DEPTH = 40;

  function isAdItem(it) {
    if (!it || typeof it !== 'object') return false;
    for (var k in it) {
      if (AD_RENDERERS[k]) return true;
      var v = it[k];
      if (k === 'richItemRenderer' || k === 'richSectionRenderer') {
        var c = v && v.content;
        if (c) for (var ck in c) if (AD_RENDERERS[ck]) return true;
      }
    }
    // Shorts: ad entries in the reel sequence
    var rwe = it.command && it.command.reelWatchEndpoint;
    if (rwe && rwe.adClientParams && rwe.adClientParams.isAd) return true;
    return false;
  }

  function walk(o, depth) {
    if (depth > MAX_DEPTH || !o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      for (var i = o.length - 1; i >= 0; i--) {
        if (isAdItem(o[i])) o.splice(i, 1); else walk(o[i], depth + 1);
      }
      return;
    }
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (AD_KEYS.indexOf(k) !== -1 || AD_RENDERERS[k]) { delete o[k]; continue; }
      if (k === 'masthead' && o[k] && typeof o[k] === 'object' && (o[k].adSlotRenderer || o[k].bannerPromoRenderer)) { delete o[k]; continue; }
      walk(o[k], depth + 1);
    }
  }

  function looksLikeYt(o) {
    return !!(o && typeof o === 'object' && !Array.isArray(o) &&
      (o.responseContext || o.playerResponse || o.videoDetails || o.adPlacements || o.playerAds || o.contents || o.onResponseReceivedActions));
  }

  function strip(o) {
    try { if (looksLikeYt(o)) walk(o, 0); } catch (e) {}
    return o;
  }

  try { Object.defineProperty(window, '__jtechYtAb', { value: { strip: strip } }); } catch (e) { return; }

  var API_RE = /\/youtubei\/v1\/(player|next|browse|search|reel\/reel_watch_sequence|reel\/reel_item_watch)/;
  function isApi(u) { try { return API_RE.test(String(u)); } catch (e) { return false; } }

  // --- JSON.parse ---
  var realParse = JSON.parse;
  try {
    JSON.parse = function (text, reviver) {
      var r = realParse.apply(this, arguments);
      if (r && typeof r === 'object' && typeof text === 'string' && text.length > 200 &&
          (text.indexOf('adPlacements') !== -1 || text.indexOf('playerAds') !== -1 || text.indexOf('adSlot') !== -1 ||
           text.indexOf('Promoted') !== -1 || text.indexOf('promoted') !== -1 || text.indexOf('AdRenderer') !== -1)) strip(r);
      return r;
    };
  } catch (e) {}

  // --- fetch ---
  var realFetch = window.fetch;
  if (typeof realFetch === 'function') {
    window.fetch = function (input) {
      var url = input && typeof input === 'object' && 'url' in input ? input.url : input;
      var p = realFetch.apply(this, arguments);
      if (!isApi(url)) return p;
      return p.then(function (res) {
        try {
          if (!res || !res.ok) return res;
          var text = res.text.bind(res);
          var body = null;
          var get = function () { if (!body) body = text().then(function (t) { try { return JSON.stringify(strip(realParse(t))); } catch (e) { return t; } }); return body; };
          Object.defineProperty(res, 'text', { configurable: true, value: function () { return get(); } });
          Object.defineProperty(res, 'json', { configurable: true, value: function () { return get().then(function (t) { return realParse(t); }); } });
        } catch (e) {}
        return res;
      });
    };
  }

  // --- XMLHttpRequest ---
  try {
    var XP = XMLHttpRequest.prototype, realOpen = XP.open;
    var rtDesc = Object.getOwnPropertyDescriptor(XP, 'responseText');
    var rDesc = Object.getOwnPropertyDescriptor(XP, 'response');
    XP.open = function (m, u) { try { this.__jtYt = isApi(u); } catch (e) {} return realOpen.apply(this, arguments); };
    var cooked = function (xhr, raw) {
      if (!xhr.__jtYt || xhr.readyState !== 4 || typeof raw !== 'string') return raw;
      if (xhr.__jtYtRaw === raw) return xhr.__jtYtOut;
      var out = raw; try { out = JSON.stringify(strip(realParse(raw))); } catch (e) {}
      xhr.__jtYtRaw = raw; xhr.__jtYtOut = out; return out;
    };
    if (rtDesc && rtDesc.get) Object.defineProperty(XP, 'responseText', { configurable: true, enumerable: rtDesc.enumerable,
      get: function () { return cooked(this, rtDesc.get.call(this)); } });
    if (rDesc && rDesc.get) Object.defineProperty(XP, 'response', { configurable: true, enumerable: rDesc.enumerable,
      get: function () {
        var r = rDesc.get.call(this);
        if (!this.__jtYt || this.readyState !== 4) return r;
        if (typeof r === 'string') return cooked(this, r);
        if (r && typeof r === 'object' && !(r instanceof ArrayBuffer) && !(typeof Blob !== 'undefined' && r instanceof Blob)) strip(r);
        return r;
      } });
  } catch (e) {}

  // --- initial data on window ---
  function trap(name) {
    try {
      var val = window[name];
      if (val) strip(val);
      Object.defineProperty(window, name, { configurable: true, enumerable: true,
        get: function () { return val; }, set: function (v) { val = strip(v); } });
    } catch (e) {}
  }
  trap('ytInitialPlayerResponse');
  trap('ytInitialData');
  trap('ytInitialReelWatchSequenceResponse');

  // --- cosmetic CSS ---
  var CSS = [
    '#masthead-ad', '#player-ads', '#panels > ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    'ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer', 'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-sparkles-text-search-renderer', 'ytd-promoted-video-renderer', 'ytd-compact-promoted-video-renderer',
    'ytd-display-ad-renderer', 'ytd-banner-promo-renderer', 'ytd-statement-banner-renderer', 'ytd-brand-video-singleton-renderer',
    'ytd-merch-shelf-renderer', 'ytd-search-pyv-renderer', 'ytd-action-companion-ad-renderer', 'ytd-companion-slot-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer', 'ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer)',
    'ytd-rich-section-renderer:has(ytd-statement-banner-renderer)', 'ytd-reel-video-renderer:has(.ytd-ad-slot-renderer)',
    'ytd-mealbar-promo-renderer', 'yt-mealbar-promo-renderer',
    '.ytp-ad-overlay-container', '.ytp-ad-overlay-slot', '.ytp-ad-image-overlay', '.ytp-featured-product', '.ytp-suggested-action',
    'ytm-promoted-sparkles-web-renderer', 'ytm-companion-ad-renderer', 'ad-slot-renderer', 'ytm-ad-slot-renderer'
  ].join(',\n') + '{display:none !important}';
  function addCss() {
    var root = document.head || document.documentElement;
    if (!root) return false;
    var s = document.createElement('style');
    s.setAttribute('data-jtech-ext', 'jtech.youtube-adblock');
    s.textContent = CSS;
    root.appendChild(s);
    return true;
  }
  if (!addCss()) document.addEventListener('DOMContentLoaded', addCss, { once: true });

  // --- player fallback + enforcement dialog ---
  var SKIP = '.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-container button';
  var saved = null; // { muted, volume, rate }
  var observed = null, obs = null;

  function video(p) { return (p || document).querySelector('video'); }

  function handleAd(p) {
    var ad = p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting');
    var v = video(p);
    if (!v) return;
    if (ad) {
      if (!saved) saved = { muted: v.muted, volume: v.volume, rate: v.playbackRate || 1 };
      try { v.muted = true; } catch (e) {}
      try { v.playbackRate = 16; } catch (e) {}
      try { if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.2) v.currentTime = v.duration - 0.1; } catch (e) {}
      // YouTube can insert or replace the skip control after the ad state changes. Check all
      // known controls on each ad tick instead of relying on one click at ad-start only.
      var buttons = p.querySelectorAll(SKIP);
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        if (!b.disabled && b.getAttribute('aria-hidden') !== 'true') try { b.click(); } catch (e) {}
      }
    } else if (saved) {
      try { v.muted = saved.muted; v.volume = saved.volume; v.playbackRate = saved.rate; } catch (e) {}
      saved = null;
    }
  }

  function handleEnforcement() {
    var m = document.querySelector('ytd-enforcement-message-view-model');
    if (!m) return;
    var dlg = m.closest('tp-yt-paper-dialog') || m.closest('ytd-popup-container > *') || m;
    try { dlg.remove(); } catch (e) {}
    var bd = document.querySelectorAll('tp-yt-iron-overlay-backdrop');
    for (var i = 0; i < bd.length; i++) try { bd[i].remove(); } catch (e) {}
    try { document.body.style.removeProperty('overflow'); } catch (e) {}
    var v = video(document.querySelector('.html5-video-player'));
    if (v && v.paused) try { v.play(); } catch (e) {}
  }

  function tick() {
    var p = document.querySelector('.html5-video-player') || document.querySelector('#movie_player');
    if (p && p !== observed) {
      if (obs) obs.disconnect();
      observed = p;
      obs = new MutationObserver(function (changes) {
        // Class changes identify ad transitions; subtree changes catch skip buttons inserted later.
        if (changes.some(function (change) { return change.type === 'attributes' || change.addedNodes.length > 0; })) handleAd(p);
      });
      obs.observe(p, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    }
    if (p) handleAd(p);
    handleEnforcement();
  }
  (function scheduleTick() {
    if (!document.hidden || saved) tick();
    // Check more frequently only during an ad, when fast-forward and skip controls matter.
    setTimeout(scheduleTick, saved ? 250 : 1000);
  })();
})();
