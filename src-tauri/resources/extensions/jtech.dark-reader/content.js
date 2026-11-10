// JTech Dark Reader - content script (main world, document_start).
// Applies a global invert filter to sites that look light, then re-inverts images/videos.
(function () {
  'use strict';
  if (window.__jtechDarkReader) return;
  try { Object.defineProperty(window, '__jtechDarkReader', { value: true }); } catch (e) { return; }

  var CLASS = 'jtech-dark-reader';

  // Sites that already ship a usable dark mode or look broken when inverted.
  var EXCLUDE_HOSTS = [
    'youtube.com', 'music.youtube.com',
    'twitter.com', 'x.com',
    'twitch.tv',
    'github.com',
    'reddit.com', 'old.reddit.com',
    'spotify.com',
    'netflix.com',
    'discord.com',
    'duckduckgo.com'
  ];

  function host() {
    var h = (location.hostname || '').toLowerCase();
    if (h.indexOf('www.') === 0) h = h.slice(4);
    return h;
  }

  function isExcluded(h) {
    for (var i = 0; i < EXCLUDE_HOSTS.length; i++) {
      var e = EXCLUDE_HOSTS[i];
      if (h === e || h.slice(-e.length - 1) === '.' + e) return true;
    }
    return false;
  }

  function luminance(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function parseColor(s) {
    var m = /rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)/.exec(s);
    if (m) return [+m[1], +m[2], +m[3]];
    m = /#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/.exec(s);
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    return null;
  }

  function looksDark() {
    try {
      var styles = getComputedStyle(document.documentElement);
      var bg = parseColor(styles.backgroundColor);
      var fg = parseColor(styles.color);
      if (bg && luminance(bg) < 0.25) return true;
      if (fg && luminance(fg) > 0.75 && bg && luminance(bg) < 0.3) return true;
      // Respect sites that honor prefers-color-scheme via CSS variables/classes.
      var html = document.documentElement;
      var cls = html.className + ' ' + (html.getAttribute('data-theme') || '') + ' ' + (html.getAttribute('data-color-mode') || '');
      if (/\bdark\b|\bdark-mode\b|\btheme-dark\b/.test(cls)) return true;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && /\blight\b/.test(cls)) return false;
    } catch (e) {}
    return false;
  }

  function apply() {
    if (!document.documentElement) return;
    document.documentElement.classList.add(CLASS);
  }

  function init() {
    if (isExcluded(host())) return;
    if (looksDark()) return;
    apply();
  }

  init();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
