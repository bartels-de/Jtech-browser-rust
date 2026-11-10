// JTech Cookie Banner Deny - content script (main world, document_start).
// Tries to click known deny/essential buttons and removes scroll locks left behind.
(function () {
  'use strict';
  if (window.__jtechCookieDeny) return;
  try { Object.defineProperty(window, '__jtechCookieDeny', { value: true }); } catch (e) { return; }

  var CLICKED = new WeakSet();
  var STOP_AT = Date.now() + 12000;

  // Specific buttons first (high confidence, no text guessing).
  var SPECIFIC_SELECTORS = [
    '#onetrust-reject-all-handler',
    'button[id*="reject"][class*="onetrust"]',
    '#onetrust-accept-btn-handler', // fallback: if only accept exists, do nothing; listed so we do not mis-click it as deny
    '#CybotCookiebotDialogBodyButtonDecline',
    '#CybotCookiebotDialogBodyButtonAccept', // known accept -> skip
    'button[data-testid="uc-deny-all-button"]',
    'button[class*="usercentrics-deny"]',
    'button[class*="usercentrics-accept"]',
    '.cmplz-deny',
    '.cmplz-reject',
    '.borlabs-cookie-reject',
    '.borlabs-cookie-accept', // known accept -> skip
    '#didomi-notice-disagree-button',
    '#didomi-notice-agree-button', // known accept -> skip
    '.js-cookie-consent-reject',
    '.js-cookie-consent-accept', // known accept -> skip
    '.cookie-alert-extended-reject',
    '#cookiescript_reject',
    '#cookiescript_accept', // known accept -> skip
    '#tarteaucitronAllDenied2',
    '#tarteaucitronPersonalize2', // accept -> skip
    '.qc-cmp2-summary-buttons button[mode="secondary"]',
    'button[class*="sp-cc-reject"]',
    'button[class*="sp-cc-accept"]', // accept -> skip
    '.evidon-banner-option.evidon-banner-decline',
    '.evidon-banner-option.evidon-banner-accept', // accept -> skip
    '[data-testid="reject-button"]',
    '[data-testid="accept-button"]', // accept -> skip
    '[aria-label*="Reject"]',
    '[aria-label*="Decline"]',
    '[title*="Reject"]',
    '[title*="Decline"]'
  ];

  var DENY_WORDS = [
    'reject all', 'decline all', 'deny all', 'disagree', 'do not agree',
    'necessary only', 'only necessary', 'essential only', 'only essential', 'required only', 'only required',
    'ablehnen', 'alle ablehnen', 'alle ablehnen', 'nicht zustimmen', 'nicht einverstanden',
    'nur notwendig', 'nur notwendige', 'nur essenziell', 'nur erforderlich', 'nur erforderliche',
    'refuser tout', 'tout refuser', 'uniquement nécessaire', 'uniquement essentiel',
    'rechazar todo', 'solo necesario', 'solo esencial',
    'rifiuta tutto', 'solo necessario'
  ];
  var ACCEPT_WORDS = [
    'accept all', 'agree', 'allow all', 'allow cookies', 'yes, i accept', 'i accept',
    'akzeptieren', 'alle akzeptieren', 'zustimmen', 'einverstanden',
    'tout accepter', 'accepter', 'accepter tout',
    'aceptar todo', 'aceptar',
    'accetta tutto', 'accetta'
  ];

  function normalize(t) { return (t || '').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim(); }

  function isAccept(el) {
    var t = normalize(el.textContent) + ' ' + normalize(el.value) + ' ' + normalize(el.getAttribute('aria-label'));
    for (var i = 0; i < ACCEPT_WORDS.length; i++) if (t.indexOf(ACCEPT_WORDS[i]) !== -1) return true;
    return false;
  }

  function scoreDeny(el) {
    var t = normalize(el.textContent) + ' ' + normalize(el.value) + ' ' + normalize(el.getAttribute('aria-label'));
    var score = 0;
    for (var i = 0; i < DENY_WORDS.length; i++) {
      if (t.indexOf(DENY_WORDS[i]) !== -1) { score += 10; break; }
    }
    // A lone "Reject" / "Decline" word is also a candidate, but lower score.
    if (/\breject\b|\bdecline\b|\bdeny\b|\bablehnen\b|\brifiuta\b|\brechazar\b|\brefuser\b/.test(t)) score += 4;
    // Do not click if it smells like accept.
    if (isAccept(el)) score -= 20;
    // Prefer visible, enabled buttons.
    var rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) score += 2;
    return score;
  }

  function click(el) {
    if (!el || CLICKED.has(el)) return false;
    CLICKED.add(el);
    try {
      el.click();
      return true;
    } catch (e) { return false; }
  }

  function trySpecific() {
    for (var i = 0; i < SPECIFIC_SELECTORS.length; i++) {
      var sel = SPECIFIC_SELECTORS[i];
      // Skip selectors that are explicitly known accept buttons.
      if (sel.indexOf('accept') !== -1 || sel.indexOf('Accept') !== -1 || sel.indexOf('zustimmen') !== -1) continue;
      var el = document.querySelector(sel);
      if (el && click(el)) return true;
    }
    return false;
  }

  function tryText() {
    var candidates = [];
    var all = document.querySelectorAll('button, a, input[type="button"], input[type="submit"], span[role="button"]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var s = scoreDeny(el);
      if (s > 6) candidates.push({ el: el, s: s });
    }
    if (!candidates.length) return false;
    candidates.sort(function (a, b) { return b.s - a.s; });
    return click(candidates[0].el);
  }

  function removeScrollLock() {
    var html = document.documentElement;
    var body = document.body;
    if (!html || !body) return;
    var locked = [
      'onetrust-no-scroll', 'usercentrics-no-scroll', 'cookiebot-no-scroll',
      'didomi-popup-open', 'cookieconsent-overflow-hidden', 'cc-window-open',
      'qc-cmp-showing', 'sp-message-open'
    ];
    for (var i = 0; i < locked.length; i++) {
      html.classList.remove(locked[i]);
      body.classList.remove(locked[i]);
    }
    try { body.style.overflow = ''; } catch (e) {}
    try { html.style.overflow = ''; } catch (e) {}
    try { body.style.position = ''; } catch (e) {}
  }

  function hideLeftovers() {
    var sels = [
      '#onetrust-banner-sdk', '#onetrust-pc-sdk', '#onetrust-consent-sdk',
      '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay',
      '#usercentrics-root', '#cmpbox', '#cmpbox2', '#CookieConsent', '#cookieConsent',
      '#gdpr-consent-tool-wrapper', '#klaro', '.cookiefirst-root', '#cc--main',
      '#axeptio_overlay', '#tarteaucitronRoot', '#sd-cmp', '#truste-consent-track',
      '#consent_blackbar', '#cookie-law-info-bar', '#didomi-host', '#moove_gdpr_cookie_info_bar',
      '#BorlabsCookieBox', '#cmplz-cookiebanner-container', '#complianz', '#appconsent',
      '[data-testid="cookie-banner"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      var els = document.querySelectorAll(sels[i]);
      for (var j = 0; j < els.length; j++) {
        try { els[j].style.display = 'none'; } catch (e) {}
      }
    }
    removeScrollLock();
  }

  var runCount = 0;
  function run() {
    if (Date.now() > STOP_AT) return;
    runCount++;
    trySpecific();
    tryText();
    hideLeftovers();
    if (runCount < 8) setTimeout(run, runCount < 4 ? 400 : 1200);
  }

  run();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  }

  // Dynamic banners that appear later.
  var root = document.documentElement || document.body;
  if (root) {
    var obs = new MutationObserver(function () { run(); });
    obs.observe(root, { childList: true, subtree: true });
  }
})();
