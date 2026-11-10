// JTech X / Twitter Cleanup - content script (main world, document_start).
// Hides promoted tweets, ads and sidebar clutter on x.com / twitter.com.
(function () {
  'use strict';
  if (window.__jtechTwitterCleanup) return;
  try { Object.defineProperty(window, '__jtechTwitterCleanup', { value: true }); } catch (e) { return; }

  document.documentElement.classList.add('jtech-twitter-cleanup');

  var PROMOTED_RE = /promoted|gesponsert|sponsored|ad\s*$/i;

  function isPromotedArticle(article) {
    // X marks promoted tweets with a placementTracking element.
    if (article.querySelector('[data-testid="placementTracking"]')) return true;
    // Fallback: look for the "Promoted" label text anywhere in the article.
    var spans = article.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) {
      if (PROMOTED_RE.test((spans[i].textContent || '').trim())) return true;
    }
    return false;
  }

  function hidePromoted() {
    var articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (var i = 0; i < articles.length; i++) {
      var a = articles[i];
      if (a.__jtechHidden) continue;
      if (isPromotedArticle(a)) {
        a.__jtechHidden = true;
        a.style.display = 'none';
      }
    }
  }

  function hideSidebarClutter() {
    // Hide "Who to follow" and "Trends" sidebars by aria-label.
    var labels = ['Who to follow', 'Wem folgen', 'Relevant people', 'Trends für dich', 'Trends for you'];
    for (var i = 0; i < labels.length; i++) {
      var els = document.querySelectorAll('[aria-label="' + labels[i] + '"]');
      for (var j = 0; j < els.length; j++) {
        try { els[j].closest('section, div[role="region"]')?.style.setProperty('display', 'none', 'important'); } catch (e) {}
      }
    }
  }

  function clean() {
    hidePromoted();
    hideSidebarClutter();
  }

  clean();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', clean);
  }

  var obs = new MutationObserver(function (muts) {
    var need = false;
    for (var m = 0; m < muts.length; m++) {
      var rec = muts[m];
      if (rec.type === 'childList') {
        for (var n = 0; n < rec.addedNodes.length; n++) {
          var node = rec.addedNodes[n];
          if (node.nodeType === 1 && (node.tagName === 'ARTICLE' || (node.querySelectorAll && node.querySelectorAll('article').length))) {
            need = true; break;
          }
        }
      }
      if (need) break;
    }
    if (need) clean();
  });
  var root = document.documentElement || document.body;
  if (root) obs.observe(root, { childList: true, subtree: true });

  // WebView2 blocks GSI popups, so force Google Identity Services into redirect mode.
  // X keeps working because the callback is processed in the same tab.
  (function forceGsiRedirect() {
    var done = false;
    function patchObject(obj, name) {
      if (!obj || typeof obj[name] !== 'function' || obj[name].__jtechPatched) return false;
      var real = obj[name];
      obj[name] = function (options) {
        if (options && options.ux_mode === 'popup') {
          try { console.log('[JTech X Cleanup] GSI ' + name + ' popup -> redirect'); } catch (e) {}
          options.ux_mode = 'redirect';
        }
        return real.apply(this, arguments);
      };
      obj[name].__jtechPatched = true;
      return true;
    }
    function tryPatch() {
      if (done) return true;
      var g = window.google;
      if (g && g.accounts) {
        if (g.accounts.id && patchObject(g.accounts.id, 'initialize')) done = true;
        if (g.accounts.oauth2) {
          patchObject(g.accounts.oauth2, 'initCodeClient');
          patchObject(g.accounts.oauth2, 'initTokenClient');
        }
      }
      return false;
    }
    var tries = 0;
    var id = setInterval(function () {
      if (tryPatch() || ++tries > 100) clearInterval(id);
    }, 100);
  })();
})();
