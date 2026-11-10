// JTech SponsorBlock - content script (main world, document_start).
// Fetches skip segments from sponsor.ajay.app and skips them in the active YouTube video.
(function () {
  'use strict';
  if (window.__jtechSponsorBlock) return;
  try { Object.defineProperty(window, '__jtechSponsorBlock', { value: true }); } catch (e) { return; }

  var API = 'https://sponsor.ajay.app/api/skipSegments';
  var CATEGORIES = ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'music_offtopic', 'preview', 'filler'];
  var TOLERANCE = 0.3; // do not skip if the user manually seeks into a segment
  var SKIP_AHEAD = 0.05; // land just past the segment end

  var videoId = null;
  var segments = [];
  var seenVideos = new WeakSet();

  function getVideoId() {
    try {
      var ytp = window.ytInitialPlayerResponse;
      if (ytp && ytp.videoDetails && ytp.videoDetails.videoId) return ytp.videoDetails.videoId;
    } catch (e) {}
    try {
      var player = document.querySelector('#movie_player');
      if (player && player.getVideoData) {
        var d = player.getVideoData();
        if (d && d.video_id) return d.video_id;
      }
    } catch (e) {}
    var m = location.href.match(/[?&]v=([^&]+)/);
    if (m) return m[1];
    if (/^\/shorts\//.test(location.pathname)) return location.pathname.split('/')[2];
    if (location.pathname.startsWith('/watch/')) return location.pathname.split('/')[2];
    return null;
  }

  function fetchSegments(id) {
    var url = API + '?videoID=' + encodeURIComponent(id) + '&categories=' + encodeURIComponent(JSON.stringify(CATEGORIES));
    return fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
      .then(function (data) {
        var list = (data || []).map(function (s) { return { start: s.segment[0], end: s.segment[1], category: s.category, uuid: s.UUID }; });
        list.sort(function (a, b) { return a.start - b.start; });
        return list;
      });
  }

  function onSkip(seg) {
    try {
      console.log('[SponsorBlock] skipped ' + seg.category + ' ' + seg.start.toFixed(2) + '-' + seg.end.toFixed(2));
    } catch (e) {}
  }

  function bindVideo(v) {
    if (!v || seenVideos.has(v)) return;
    seenVideos.add(v);
    var lastTime = -1;
    function onTime() {
      if (!segments.length || v.paused) return;
      var t = v.currentTime;
      // t jumped? We still skip if we landed inside a segment (unless user dragged there).
      for (var i = 0; i < segments.length; i++) {
        var s = segments[i];
        if (t >= s.start && t < s.end && (lastTime < 0 || t - lastTime < 3 || t > s.start + TOLERANCE)) {
          v.currentTime = s.end + SKIP_AHEAD;
          onSkip(s);
          break;
        }
      }
      lastTime = v.currentTime;
    }
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onTime);
    v.addEventListener('seeked', onTime);
  }

  function findVideo() {
    var v = document.querySelector('video');
    if (v) bindVideo(v);
  }

  function onNav() {
    var id = getVideoId();
    if (!id || id === videoId) return;
    videoId = id;
    segments = [];
    fetchSegments(id).then(function (list) {
      if (videoId !== id) return; // navigated away while loading
      segments = list;
      if (list.length) console.log('[SponsorBlock] loaded ' + list.length + ' segments for ' + id);
    }).catch(function (e) {
      console.log('[SponsorBlock] ' + (e && e.message));
    });
    findVideo();
  }

  onNav();
  findVideo();

  // SPA navigation events used by YouTube.
  window.addEventListener('yt-navigate-finish', onNav);
  window.addEventListener('yt-page-data-updated', onNav);

  // Poll for video element (YouTube creates it lazily/after ads).
  setInterval(findVideo, 1500);

  // Observe DOM changes for new players (e.g. navigation without yt events).
  var root = document.documentElement || document.body;
  if (root) {
    var obs = new MutationObserver(function () { onNav(); findVideo(); });
    obs.observe(root, { childList: true, subtree: true });
  }
})();
