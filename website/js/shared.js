(function () {
  "use strict";

  var REPO = "bartels-de/Jtech-browser-rust";

  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  var pages = [
    { id: "index", href: "index.html", label: "Overview", de: "Überblick" },
    { id: "features", href: "features.html", label: "Features", de: "Funktionen" },
    { id: "privacy", href: "privacy.html", label: "Privacy", de: "Datenschutz" },
    { id: "technology", href: "technology.html", label: "Technology", de: "Technik" },
    { id: "faq", href: "faq.html", label: "FAQ", de: "FAQ" },
    { id: "download", href: "download.html", label: "Download", de: "Download" }
  ];

  var currentPage = document.body.dataset.page || "index";
  var lang = document.documentElement.lang || "en";

  function navItems() {
    return pages.map(function (p) {
      var label = lang === "de" ? p.de : p.label;
      var active = p.id === currentPage ? ' aria-current="page"' : "";
      return '<li><a href="' + p.href + '"' + active + ' data-nav="' + p.id + '"><span class="nav-dot"></span><span>' + label + '</span></a></li>';
    }).join("");
  }

  function headerHTML() {
    var downloadLabel = lang === "de" ? "Für Windows holen" : "Get it for Windows";
    var downloadSub = lang === "de" ? "Kostenlos und Open Source" : "Free and open source";
    var menuLabel = lang === "de" ? "Menü öffnen" : "Open menu";
    var closeLabel = lang === "de" ? "Menü schließen" : "Close menu";
    var brandLabel = "JTech Browser";

    var mobileLinks = pages.map(function (p) {
      var label = lang === "de" ? p.de : p.label;
      return '<li><a href="' + p.href + '" data-nav="' + p.id + '">' + label + '</a></li>';
    }).join("");

    return '<a class="skip" href="#main">' + (lang === "de" ? "Zum Inhalt springen" : "Skip to content") + '</a>' +
      '<header class="site-header">' +
        '<a class="brand" href="index.html" aria-label="' + brandLabel + '">' +
          '<img src="assets/jtech-logo.png" alt="" width="32" height="32">' +
          '<span>JTech Browser</span>' +
        '</a>' +
        '<nav class="main-nav" aria-label="Main">' +
          '<ul>' + navItems() + '</ul>' +
        '</nav>' +
        '<div class="header-actions">' +
          '<a class="btn btn-primary btn-sm" href="download.html">' +
            '<svg width="18" height="18" aria-hidden="true"><use href="#i-download"/></svg>' +
            '<span>' + downloadLabel + '</span>' +
          '</a>' +
          '<button class="menu-toggle" aria-expanded="false" aria-controls="mobile-menu" aria-label="' + menuLabel + '">' +
            '<span></span><span></span><span></span>' +
          '</button>' +
        '</div>' +
      '</header>' +
      '<nav class="mobile-menu" id="mobile-menu" aria-label="Mobile">' +
        '<div class="menu-head">' +
          '<a class="brand" href="index.html"><img src="assets/jtech-logo.png" alt="" width="32" height="32"><span>JTech Browser</span></a>' +
          '<button class="menu-close" aria-label="' + closeLabel + '">×</button>' +
        '</div>' +
        '<ul class="menu-list">' + mobileLinks + '</ul>' +
        '<div class="menu-foot">' +
          '<a class="btn btn-primary" href="download.html">' + downloadLabel + '</a>' +
          '<div class="lang" role="group" aria-label="Language">' +
            '<button type="button" data-lang="en" aria-pressed="' + (lang === "en") + '" lang="en">EN</button>' +
            '<button type="button" data-lang="de" aria-pressed="' + (lang === "de") + '" lang="de">DE</button>' +
          '</div>' +
        '</div>' +
      '</nav>';
  }

  function footerHTML() {
    var links = [
      { href: REPO, label: "Source code on GitHub", de: "Quellcode auf GitHub" },
      { href: REPO + "/blob/main/LICENSE", label: "MIT License", de: "MIT-Lizenz" },
      { href: REPO + "/issues", label: "Report an issue", de: "Problem melden" },
      { href: REPO + "/releases", label: "Releases", de: "Versionen" }
    ];
    var navLinks = links.map(function (l) {
      return '<a href="https://github.com/' + l.href + '">' + (lang === "de" ? l.de : l.label) + '</a>';
    }).join("");
    var note = lang === "de"
      ? "Diese Seite setzt keine Cookies und nutzt keine Tracker. Sie fragt nur bei GitHub die neueste Versionsnummer ab."
      : "This site sets no cookies and uses no trackers. It only asks GitHub for the latest version number.";
    return '<footer class="foot">' +
      '<div class="wrap">' +
        '<a class="brand" href="index.html"><img src="assets/jtech-logo.png" alt="" width="28" height="28"><span>JTech Browser</span></a>' +
        '<nav aria-label="Project links">' + navLinks + '</nav>' +
        '<p>' + note + '</p>' +
      '</div>' +
    '</footer>';
  }

  function inject() {
    var headerTarget = document.getElementById("site-header-target");
    var footerTarget = document.getElementById("site-footer-target");
    if (headerTarget) headerTarget.innerHTML = headerHTML();
    if (footerTarget) footerTarget.innerHTML = footerHTML();
  }

  function initMobileMenu() {
    var menu = document.getElementById("mobile-menu");
    var toggle = document.querySelector(".menu-toggle");
    var close = document.querySelector(".menu-close");
    if (!menu || !toggle) return;
    function set(open) {
      menu.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    }
    toggle.addEventListener("click", function () { set(!menu.classList.contains("is-open")); });
    if (close) close.addEventListener("click", function () { set(false); });
    menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { set(false); }); });
  }

  function initLang() {
    $all(".mobile-menu .lang button").forEach(function (b) {
      b.addEventListener("click", function () {
        var l = b.getAttribute("data-lang");
        try { window.localStorage.setItem("jtech-site-lang", l); } catch (e) {}
        window.location.href = window.location.href.replace(/([?&])lang=[^&]+/, "$1lang=" + l).replace(/\?$/, "");
        if (window.location.search.indexOf("lang=") === -1) {
          window.location.search = (window.location.search ? window.location.search + "&" : "?") + "lang=" + l;
        }
      });
    });
  }

  inject();
  initMobileMenu();
  initLang();
})();
