(function () {
  "use strict";

  var REPO = "bartels-de/Jtech-browser-rust";
  var STORE_KEY = "jtech-site-lang";

  var de = {
    "nav.overview": "Überblick",
    "nav.features": "Funktionen",
    "nav.privacy": "Datenschutz",
    "nav.technology": "Technik",
    "nav.faq": "FAQ",
    "nav.download": "Download",
    "hero.badge": "Frühe Version",
    "hero.title": "Ein fokussierter Browser für Windows, mit Tabs in der Seitenleiste und eingebautem Werbeblocker.",
    "hero.lead": "JTech Browser ist kostenlos und Open Source. Er kombiniert eine schnelle Rust-Shell, Microsoft Edge WebView2 und eine React-Oberfläche zu einem Browser, der dir wieder Kontrolle über Tabs, Tracking und das Erscheinungsbild gibt.",
    "cta.download": "Für Windows herunterladen",
    "cta.sub": "Windows 10 und 11, 64-Bit",
    "cta.github": "Auf GitHub ansehen",
    "hero.note": "Version 0.x: neu und noch in Bewegung. Oberfläche auf Deutsch und Englisch.",
    "home.stats.tabs": "Tabs in der Seitenleiste",
    "home.stats.block": "Werbe- und Tracker-Requests blockierbar",
    "home.stats.theme": "Themes im Design Studio",
    "home.feat.title": "Auf einen Blick",
    "home.feat.lead": "Alles, was JTech Browser ausmacht – kompakt zusammengefasst.",
    "feat.tabs.t": "Tabs, die Ordnung halten",
    "feat.tabs.p": "Vertikale, anpassbare Seitenleiste mit Anheften, Gruppen, Drag & Drop, Schlaf-Modus und Sitzungswiederherstellung.",
    "feat.split.t": "Zwei Seiten gleichzeitig",
    "feat.split.p": "Split View, Peek-Fenster und Bild-in-Bild helfen dir, mehrere Inhalte im Blick zu behalten.",
    "feat.block.t": "Eingebauter Blocker",
    "feat.block.p": "adblock-rust prüft Anfragen auf Netzwerk-Ebene. EasyList, EasyPrivacy und weitere Listen inklusive.",
    "feat.design.t": "Design Studio",
    "feat.design.p": "Themes, Farben, animierte Hintergründe, Cursor-Effekte und eine anpassbare Startseite.",
    "feat.privacy.t": "Privatsphäre",
    "feat.privacy.p": "Keine Telemetrie, lokale SQLite-Datenbank, Berechtigungen pro Seite, Cookies und Cache automatisch löschen.",
    "feat.speed.t": "Schnell und schlank",
    "feat.speed.p": "Rust-Backend, Tauri 2 und WebView2 sorgen für geringen Speicherverbrauch und schnellen Start.",
    "home.cta.t": "Bereit, JTech auszuprobieren?",
    "home.cta.p": "Lade die neueste Version für Windows herunter oder schau dir den Quellcode an.",
    "features.title": "Funktionen im Detail",
    "features.lead": "JTech Browser ist für lange Sitzungen mit vielen Tabs gemacht. Hier ist alles, was er kann.",
    "tech.title": "Womit er gebaut ist",
    "tech.lead": "JTech Browser kombiniert eine schnelle native Shell mit einer modernen Web-Oberfläche und einem Rust-Backend.",
    "tech.archT": "Wie die Teile zusammenspielen",
    "privacy.title": "Privatsphäre und Blocker",
    "privacy.lead": "JTech Browser blockt Werbung und Tracker, respektiert deine Daten und sagt dir offen, wohin er verbindet.",
    "download.title": "JTech Browser herunterladen",
    "download.lead": "Ein Installer für 64-Bit-Windows. Danach aktualisiert sich der Browser selbst.",
    "faq.title": "Fragen und Antworten",
    "faq.q1": "Ist JTech Browser ein Ersatz für Chrome oder Edge?",
    "faq.a1": "Noch nicht. Er ist ein fokussierter Browser für alle, die vertikale Tabs, eingebautes Blocken und eine anpassbare Oberfläche möchten. Einige fortgeschrittene Funktionen wie ein vollständiger Erweiterungs-Store, Profile oder mobiles Synchronisieren fehlen noch.",
    "faq.q2": "Warum warnt SmartScreen beim Installer?",
    "faq.a2": "Der Installer ist noch nicht mit einem teuren Windows-Herausgeberzertifikat signiert. Die Datei ist sicher, der Quellcode ist öffentlich und der Browser prüft Update-Signaturen separat.",
    "faq.q3": "Gibt es ihn für macOS oder Linux?",
    "faq.a3": "Derzeit nur Windows 10 und 11, weil WebView2 die Rendering-Engine ist und der Fenster-Code momentan Windows-spezifisch ist.",
    "faq.q4": "Wo werden meine Daten gespeichert?",
    "faq.a4": "Lesezeichen, Verlauf, Einstellungen und Berechtigungen liegen in einer lokalen SQLite-Datei in deinem AppData-Ordner. Kein Konto, keine Cloud.",
    "faq.q5": "Kann ich Lesezeichen aus einem anderen Browser importieren?",
    "faq.a5": "Ja. Der Importer liest Lesezeichen und Verlauf aus Chrome-, Edge-, Brave- und Firefox-Profilen und fügt sie in JTech zusammen."
  };

  var en = { "ver.label": "Version {v}, 64-bit installer" };
  var current = "en";
  var release = null;

  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  $all("[data-i18n]").forEach(function (el) { en[el.getAttribute("data-i18n")] = el.textContent; });
  $all("[data-i18n-html]").forEach(function (el) { en[el.getAttribute("data-i18n-html")] = el.innerHTML; });

  function t(key) {
    var dict = current === "de" ? de : en;
    return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : en[key] || key;
  }

  function apply(lang) {
    current = lang === "de" ? "de" : "en";
    document.documentElement.lang = current;
    $all("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    $all("[data-i18n-html]").forEach(function (el) { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
    $all(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === current)); });
    showRelease();
  }

  function initialLang() {
    try {
      var saved = window.localStorage.getItem(STORE_KEY);
      if (saved === "de" || saved === "en") return saved;
    } catch (e) {}
    var url = new URL(window.location.href);
    if (url.searchParams.has("lang")) return url.searchParams.get("lang") === "de" ? "de" : "en";
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return /^de\b/i.test(nav) ? "de" : "en";
  }

  // ---------- Latest release ----------

  function showRelease() {
    if (!release) return;
    var label = t("ver.label").replace("{v}", release.version);
    $all(".js-download").forEach(function (a) { a.href = release.url; });
    $all(".js-version").forEach(function (s) { s.textContent = label; });
  }

  function loadRelease() {
    if (!window.fetch) return;
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
    fetch("https://api.github.com/repos/" + REPO + "/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        var assets = (data && data.assets) || [];
        var exe = null;
        for (var i = 0; i < assets.length; i++) {
          if (/_x64-setup\.exe$/i.test(assets[i].name || "")) { exe = assets[i]; break; }
        }
        if (!exe || !/^https:\/\/github\.com\//.test(exe.browser_download_url || "")) return;
        var version = String(data.tag_name || "").replace(/^v/i, "");
        if (!/^[0-9][0-9A-Za-z.+-]{0,30}$/.test(version)) return;
        release = { url: exe.browser_download_url, version: version };
        showRelease();
      })
      .catch(function () {})
      .then(function () { clearTimeout(timer); });
  }

  // ---------- Animations ----------

  function initReveal() {
    if (!("IntersectionObserver" in window)) {
      $all(".reveal").forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add("is-visible"); });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    $all(".reveal").forEach(function (el) { obs.observe(el); });
  }

  function initTilt() {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    $all(".tilt").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(1000px) rotateY(" + (x * 14) + "deg) rotateX(" + (-y * 14) + "deg) scale3d(1.02, 1.02, 1.02)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "perspective(1000px) rotateY(0deg) rotateX(0deg) scale3d(1, 1, 1)";
      });
    });
  }

  function initTypewriter() {
    var el = document.querySelector(".typewriter");
    if (!el) return;
    var text = t(el.getAttribute("data-i18n"));
    el.textContent = "";
    var i = 0;
    function step() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(step, 28 + Math.random() * 24);
      } else {
        el.classList.remove("typing");
      }
    }
    el.classList.add("typing");
    setTimeout(step, 400);
  }

  function initCounters() {
    $all(".counter").forEach(function (el) {
      var target = parseInt(el.dataset.target, 10);
      if (!target) return;
      var dur = 1500;
      var start = null;
      function step(ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var ease = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.floor(ease * target).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
      }
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { requestAnimationFrame(step); obs.unobserve(el); } });
      }, { threshold: 0.5 });
      obs.observe(el);
    });
  }

  function initParticles() {
    var canvas = document.getElementById("particles");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    var w, h, particles = [];
    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }
    function make() {
      particles = [];
      var count = Math.min(70, Math.floor(w / 16));
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
          r: Math.random() * 2 + 1
        });
      }
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2fc8c4";
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.globalAlpha = 0.35;
        ctx.fill();
      }
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = ctx.fillStyle;
      for (var i = 0; i < particles.length; i++) {
        for (var j = i + 1; j < particles.length; j++) {
          var dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
          if (dx * dx + dy * dy < 10000) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    }
    resize(); make(); draw();
    window.addEventListener("resize", function () { resize(); make(); });
  }

  apply(initialLang());
  loadRelease();
  initReveal();
  initTilt();
  initTypewriter();
  initCounters();
  initParticles();
})();
