// JTech Clean URLs - content script (main world, document_start).
// Removes tracking parameters from the current URL, links, forms and history API calls.
(function () {
  'use strict';
  if (window.__jtechCleanUrls) return;
  try { Object.defineProperty(window, '__jtechCleanUrls', { value: true }); } catch (e) { return; }

  var PARAMS = [
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','utm_reader','utm_place','utm_userid','utm_cid','utm_source_platform','utm_marketing_tactic','utm_adgroup','utm_ad','utm_device','utm_matchtype','utm_network','utm_expid',
    'fbclid','gclid','dclid','ocid','twclid','li_fat_id','mc_cid','mc_eid','mkt_tok','ml_subscriber','ml_subscriber_hash',
    'ref','referrer','referer','source','campaign_id','ad_id','adset_id','ad_group_id','ad_name','campaign_name',
    'yclid','pk_campaign','pk_kwd','piwik_campaign','piwik_kwd','wickedid','wicked_source','wicked_id',
    'hsa_cam','hsa_grp','hsa_mt','hsa_src','hsa_ad','hsa_acc','hsa_net','hsa_kw','hsa_la','hsa_ol','hsa_ver',
    'ttclid','wbraid','gbraid','s_kwcid','dclid','ef_id','zanpid','affiliate','aff_id','cid','sid','ssid','snid',
    'spm','spm_id_from','pd_rd_r','pd_rd_w','pd_rd_wg','psc','smid','tag','ascsubtag','irgwc','irclickid','epik','igshid',
    'si','pp','embeds_referring_euri','source_ve_path','ab_channel','feature','fr','nr_email_referer','pcampaignid'
  ];
  var EXACT = Object.create(null);
  PARAMS.forEach(function (p) { EXACT[p] = true; });

  var HASH_RE = /^(xtor|xtor\.|xtcmp|xtcr|xts|xtref|pk_|utm_|fbclid|gclid)/i;

  function clean(input) {
    if (!input || typeof input !== 'string') return null;
    try {
      var u = new URL(input, location.href);
      var changed = false;
      u.searchParams.forEach(function (_v, k) {
        if (EXACT[k.toLowerCase()]) { u.searchParams.delete(k); changed = true; }
      });
      if (u.hash.length > 1 && u.hash.indexOf('=') !== -1) {
        var hash = u.hash.slice(1);
        var pairs = hash.split('&'), out = [], hchanged = false;
        for (var i = 0; i < pairs.length; i++) {
          var eq = pairs[i].indexOf('=');
          var k = eq < 0 ? pairs[i] : pairs[i].slice(0, eq);
          if (HASH_RE.test(k)) { hchanged = true; continue; }
          out.push(pairs[i]);
        }
        if (hchanged) { u.hash = out.length ? '#' + out.join('&') : ''; changed = true; }
      }
      if (!changed) return null;
      return u.toString();
    } catch (e) { return null; }
  }

  function cleanLocation() {
    var c = clean(location.href);
    if (c && c !== location.href) {
      try { history.replaceState(history.state, document.title || '', c); } catch (e) {}
    }
  }

  function cleanAnchor(a) {
    if (!a || a.tagName !== 'A') return;
    var href = a.getAttribute('href');
    if (!href || href.indexOf('javascript:') === 0 || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
    var c = clean(href);
    if (c && c !== href) a.setAttribute('href', c);
  }

  function cleanForm(f) {
    if (!f || f.tagName !== 'FORM') return;
    var action = f.getAttribute('action');
    if (action) {
      var c = clean(action);
      if (c && c !== action) f.setAttribute('action', c);
    }
    for (var i = 0; i < f.elements.length; i++) {
      var el = f.elements[i];
      if (el.name && EXACT[el.name.toLowerCase()]) {
        try { el.parentNode.removeChild(el); } catch (e) {}
      }
    }
  }

  function cleanAll() {
    var as = document.querySelectorAll('a[href]');
    for (var i = 0; i < as.length; i++) cleanAnchor(as[i]);
    var fs = document.querySelectorAll('form[action]');
    for (var j = 0; j < fs.length; j++) cleanForm(fs[j]);
  }

  // Patch history API so SPA navigations stay clean.
  var origPush = history.pushState, origReplace = history.replaceState;
  try {
    history.pushState = function (state, title, url) {
      if (url) {
        var c = clean(String(url));
        if (c) arguments[2] = c;
      }
      return origPush.apply(this, arguments);
    };
    history.replaceState = function (state, title, url) {
      if (url) {
        var c = clean(String(url));
        if (c) arguments[2] = c;
      }
      return origReplace.apply(this, arguments);
    };
  } catch (e) {}

  // Patch window.open.
  var origOpen = window.open;
  try {
    window.open = function (url, target, features) {
      if (url && typeof url === 'string') {
        var c = clean(url);
        if (c) arguments[0] = c;
      }
      return origOpen.apply(this, arguments);
    };
  } catch (e) {}

  // Intercept clicks before the browser follows the link.
  document.addEventListener('click', function (e) {
    var a = e.composedPath ? e.composedPath()[0] : e.target;
    if (!a || a.nodeType !== 1) return;
    if (a.tagName !== 'A') a = a.closest ? a.closest('a[href]') : null;
    if (!a) return;
    var c = clean(a.href);
    if (c && c !== a.href) {
      e.preventDefault();
      e.stopImmediatePropagation();
      location.href = c;
    }
  }, true);

  // Clean current URL and existing links/forms.
  cleanLocation();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanAll);
  } else {
    cleanAll();
  }

  // Re-clean on SPA navigation.
  window.addEventListener('popstate', cleanLocation);
  window.addEventListener('hashchange', cleanLocation);

  // Watch for new/updated links and forms.
  var root = document.documentElement || document.body;
  if (root) {
    var obs = new MutationObserver(function (muts) {
      var changed = false;
      for (var m = 0; m < muts.length; m++) {
        var rec = muts[m];
        if (rec.type === 'attributes') {
          if (rec.target.tagName === 'A') cleanAnchor(rec.target);
          else if (rec.target.tagName === 'FORM') cleanForm(rec.target);
        } else if (rec.type === 'childList') {
          for (var n = 0; n < rec.addedNodes.length; n++) {
            var node = rec.addedNodes[n];
            if (node.nodeType !== 1) continue;
            if (node.tagName === 'A') cleanAnchor(node);
            else if (node.tagName === 'FORM') cleanForm(node);
            else if (node.querySelectorAll) {
              var nas = node.querySelectorAll('a[href]');
              for (var i = 0; i < nas.length; i++) cleanAnchor(nas[i]);
              var nfs = node.querySelectorAll('form[action]');
              for (var j = 0; j < nfs.length; j++) cleanForm(nfs[j]);
            }
          }
        }
      }
    });
    obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'action'] });
  }
})();
