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
})();
