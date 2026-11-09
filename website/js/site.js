/* JTech Browser website: language switch, latest-release download link, active section in the rail.
   The page works fully without this script. */
(function () {
  "use strict";

  var REPO = "bartels-de/Jtech-browser-rust";
  var STORE_KEY = "jtech-site-lang";

  var de = {
    "meta.title": "JTech Browser – Open-Source-Browser für Windows",
    "meta.description": "JTech Browser ist ein kostenloser Open-Source-Browser für Windows 10 und 11 mit vertikaler Tab-Leiste, geteilter Ansicht, eingebautem Werbe- und Trackerblocker und einem Design Studio für Themes.",
    "skip": "Zum Inhalt springen",
    "navLabel": "Abschnitte",
    "nav.overview": "Überblick",
    "nav.features": "Funktionen",
    "nav.blocking": "Blocker und Erweiterungen",
    "nav.design": "Design Studio",
    "nav.open": "Open Source und Datenschutz",
    "nav.download": "Download",
    "railGetLabel": "Zum Download",
    "rail.get": "Für Windows holen",
    "rail.free": "Kostenlos und Open Source",
    "langLabel": "Sprache",
    "logoAlt": "JTech-Browser-Logo",
    "hero.badge": "Frühe Version",
    "hero.title": "Ein aufgeräumter Browser für Windows, mit Tabs in der Seitenleiste und eingebautem Werbeblocker.",
    "hero.lead": "JTech Browser ist kostenlos und Open Source. Er ist in Rust auf Basis von Microsoft Edge WebView2 gebaut, Webseiten werden also mit derselben Engine wie in Edge dargestellt, und er hält sich selbst aktuell.",
    "cta.download": "Für Windows herunterladen",
    "cta.sub": "Windows 10 und 11, 64-Bit",
    "cta.github": "Auf GitHub ansehen",
    "hero.note": "Version 0.x: neu und noch in Bewegung. Oberfläche auf Deutsch und Englisch.",
    "heroAlt": "Startseite von JTech Browser: links die Tabs in einer Seitenleiste, oben eine mittige Adressleiste, darunter eine große Uhr, ein Suchfeld und Schnelllinks.",
    "hero.cap": "Die Startseite mit der Tab-Leiste. Vorschau der aktuellen Oberfläche mit Beispielinhalten.",
    "feat.title": "Gemacht für lange Sitzungen mit vielen Tabs",
    "feat.lead": "Die Oberfläche hält sich zurück, bis du sie brauchst, und das meiste erreichst du, ohne die Tastatur loszulassen.",
    "g1.t": "Tabs, die Ordnung halten",
    "g1.p": "Die Tabs stehen untereinander in einer Seitenleiste, deren Breite du anpassen kannst, statt quer oben. Hefte an, was du immer brauchst, fasse Zusammengehöriges in Gruppen zusammen und ziehe Tabs, wohin du willst. Ungenutzte Tabs können schlafen, um Speicher freizugeben, und nach einem Neustart ist deine Sitzung wieder da.",
    "g2.t": "Zwei Seiten gleichzeitig",
    "g2.p": "Die geteilte Ansicht zeigt zwei Tabs nebeneinander oder übereinander, mit verschiebbarem Trenner. Mit <kbd>Umschalt</kbd> + Klick öffnest du einen Link im Peek-Fenster über der aktuellen Seite und schließt es wieder, wenn du fertig bist.",
    "g3.t": "Schnell mit Tastatur und Maus",
    "g3.p": "<kbd>Strg</kbd> + <kbd>K</kbd> öffnet die Befehlspalette für Tabs, Seiten und Aktionen, und jedes Tastenkürzel lässt sich neu belegen. Halte die mittlere Maustaste oder drücke <kbd>Alt</kbd> + <kbd>Q</kbd> für ein Radialmenü mit vier bis acht Befehlen deiner Wahl.",
    "g4.t": "Ton und Ressourcen im Griff",
    "g4.p": "Der Audio Hub zeigt jeden Tab, der Ton abspielt, mit Wiedergabe und Pause, Lautstärke pro Tab und Seiten, die immer stumm starten. Ressourcenlimits halten Hintergrund-Tabs schlank, auf Wunsch mit Obergrenzen für Arbeitsspeicher und CPU.",
    "pair.t": "Ein Mini-Player in der Seitenleiste",
    "pair.p": "Musik aus einem Hintergrund-Tab erscheint unten in der Seitenleiste mit Titel und Steuerung. So pausierst oder stummschaltest du sie, ohne den Tab zu suchen.",
    "audioAlt": "Die Seite Audio Hub mit einem Tab, der Musik abspielt, samt Wiedergabe, Lautstärkeregler, Stummschalten und Immer stumm, und dem Mini-Player unten in der Seitenleiste.",
    "blk.title": "Werbe- und Trackerblocker, mit offen benannten Grenzen",
    "blk.lead": "Der Blocker ist Teil des Browsers, kein Zusatz. Er entfernt viel Werbung und Tracking, aber nicht alles, und das sagen wir lieber gleich.",
    "blk.t": "Eingebauter Blocker",
    "blk.p1": "Jede Anfrage einer Seite wird in Rust mit der Open-Source-Engine adblock-rust von Brave geprüft. EasyList und EasyPrivacy sind standardmäßig aktiv; die uBlock-Filter, Peter Lowe's List und Fanboy's Annoyance List lassen sich dazuschalten. Die Listen aktualisieren sich automatisch, und jede Seite, die du unterstützen möchtest, kannst du freigeben.",
    "blk.limitsT": "Was er nicht kann",
    "blk.l1": "Er blockiert nicht jede Werbung und erreicht nicht die Abdeckung ausgereifter Blocker-Erweiterungen.",
    "blk.l2": "Scriptlets und prozedurale kosmetische Filter werden nicht ausgeführt, ein Teil der Listenregeln wirkt daher nicht.",
    "blk.l3": "Elemente, die erst nach dem Laden erscheinen, werden nicht erneut geprüft; Werbung kann kurz aufblitzen.",
    "blk.l4": "WebSocket-Verkehr und manche Service-Worker-Anfragen lassen sich nicht filtern.",
    "blk.more": "So funktioniert der Blocker",
    "ext.t": "JTech Market",
    "ext.p": "Erweiterungen werden geprüft, mit dem Browser ausgeliefert und mit ihm zusammen aktualisiert. Du schaltest sie im JTech Market ein oder pausierst sie für einzelne Webseiten. Es wird kein Erweiterungscode aus dem Internet geladen.",
    "ext.tw": "Twitch-Werbeblocker",
    "ext.best": "ohne Garantie",
    "ext.twp": "Versucht, Werbung aus Twitch-Streams herauszuhalten, ohne deinen Verkehr über einen fremden Proxy zu leiten. Twitch ändert seinen Player oft, daher kann er zeitweise nicht funktionieren, bis ein Update kommt.",
    "ext.yt": "YouTube-Werbeblocker",
    "ext.best2": "ohne Garantie",
    "ext.ytp": "Entfernt Werbung aus YouTube-Seiten und dem Videoplayer. Auch YouTube ändert sich häufig, Teile davon können also hinterherhinken, bis die Erweiterung aktualisiert ist.",
    "designAlt": "Das Design Studio mit einer Galerie von Theme-Vorlagen wie JTech, Nova, Synthwave, Toxic, Inferno, Hyperdrive, Abyss und Sakura, filterbar nach dunkel, hell, kräftig, ruhig und klassisch.",
    "des.title": "Mach ihn zu deinem",
    "des.lead": "Das Design Studio ändert den ganzen Look mit einer Vorlage auf einen Klick oder Schritt für Schritt. Jede Änderung wirkt sofort.",
    "des.l1": "Eine Theme-Galerie mit dunklen, hellen, kräftigen und ruhigen Vorlagen",
    "des.l2": "Eigene Farben und Formen oder eigenes CSS",
    "des.l3": "Animierte Hintergründe, eigene Mauszeiger und Zeigerspuren",
    "des.l4": "Themes duplizieren, importieren und exportieren, um sie zu teilen",
    "des.l5": "Eine Startseite mit anpassbarem Hintergrund, Uhr, Begrüßung und Schnelllinks",
    "open.title": "Open Source, ohne eigenes Tracking",
    "open.lead": "Jede Zeile von JTech Browser ist einsehbar. Hier steht, was er für sich behält und womit er sich verbindet.",
    "f1.t": "MIT-Lizenz",
    "f1.p": "Der vollständige Quellcode liegt auf GitHub. Lies ihn, baue ihn selbst, ändere ihn oder melde ein Problem.",
    "f2.t": "Keine Telemetrie, kein Konto",
    "f2.p": "Der Browser sendet keine Nutzungsstatistiken. Verlauf, Lesezeichen und Einstellungen liegen in einer lokalen Datenbank auf deinem PC.",
    "f3.t": "Datenschutz-Werkzeuge an Bord",
    "f3.p": "Blockstatistiken, Cookies pro Seite, Browserdaten löschen, Cookies und Cache beim Beenden löschen sowie Seitenberechtigungen für Kamera, Mikrofon, Standort und Benachrichtigungen.",
    "con.t": "Was trotzdem nach außen geht",
    "con.p": "Neben den Webseiten, die du öffnest, stellt der Browser diese Anfragen:",
    "con.s.t": "Suchvorschläge",
    "con.s.d": "Während du in die Adressleiste tippst, wird der Text an deine gewählte Suchmaschine geschickt, um Vorschläge zu holen. Webadressen werden nie gesendet. Du kannst das in den Einstellungen abschalten.",
    "con.u.t": "Update-Prüfung",
    "con.u.d": "Der Browser fragt bei GitHub nach der neuesten Version und prüft die Signatur eines Updates, bevor er es installiert. Die Prüfung lässt sich abschalten.",
    "con.f.t": "Filterlisten",
    "con.f.d": "Blocklisten werden alle paar Tage von ihren Herausgebern geladen, zum Beispiel von easylist.to.",
    "con.m.t": "JTech Market",
    "con.m.d": "Der Market liest seine Liste der Erweiterungen aus dem GitHub-Repository des Projekts.",
    "dl.title": "JTech Browser herunterladen",
    "dl.lead": "Ein Installer für 64-Bit-Windows. Danach aktualisiert sich der Browser selbst.",
    "cta.download2": "Für Windows herunterladen",
    "cta.sub2": "Neueste Version auf GitHub",
    "dl.all": "Alle Versionen",
    "dl.changelog": "Änderungsprotokoll",
    "dl.build": "Selbst kompilieren",
    "req.t": "Systemvoraussetzungen",
    "req.os": "<strong>Windows 10 oder 11</strong>, 64-Bit (x64)",
    "req.wv": "<strong>Microsoft Edge WebView2 Runtime.</strong> Windows 11 bringt sie mit; unter Windows 10 ist sie meist vorhanden und wird sonst vom Installer eingerichtet.",
    "warn.t": "Eine Warnung beim ersten Start ist normal",
    "warn.p": "Der Installer ist noch nicht mit einem Windows-Herausgeberzertifikat signiert, deshalb kann Microsoft SmartScreen warnen. Wähle „Weitere Informationen“ und dann „Trotzdem ausführen“. Das ist unabhängig von der Update-Signatur, die der Browser vor der Installation seiner eigenen Updates prüft.",
    "early.t": "Frühe Software",
    "early.p": "JTech Browser steht bei Version 0.x. Rechne mit Ecken und Kanten und mit Änderungen zwischen den Versionen. Wenn etwas nicht funktioniert, <a href=\"https://github.com/bartels-de/Jtech-browser-rust/issues\">eröffne bitte ein Issue</a>.",
    "footNav": "Projektlinks",
    "ft.src": "Quellcode auf GitHub",
    "ft.lic": "MIT-Lizenz",
    "ft.issues": "Problem melden",
    "ft.rel": "Versionen",
    "ft.note": "Diese Seite setzt keine Cookies und nutzt keine Tracker. Sie fragt nur bei GitHub die neueste Versionsnummer ab.",
    "ver.label": "Version {v}, 64-Bit-Installer"
  };

  var en = { "ver.label": "Version {v}, 64-bit installer" };
  var current = "en";
  var release = null;

  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  // Remember the English text that is written in the HTML.
  $all("[data-i18n]").forEach(function (el) { en[el.getAttribute("data-i18n")] = el.textContent; });
  $all("[data-i18n-html]").forEach(function (el) { en[el.getAttribute("data-i18n-html")] = el.innerHTML; });
  $all("[data-i18n-attr]").forEach(function (el) {
    el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
      var p = pair.split(":");
      en[p[1]] = el.getAttribute(p[0]);
    });
  });
  var metaDesc = document.querySelector('meta[name="description"]');
  en["meta.title"] = document.title;
  en["meta.description"] = metaDesc ? metaDesc.getAttribute("content") : "";

  function t(key) {
    var dict = current === "de" ? de : en;
    return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : en[key];
  }

  function apply(lang) {
    current = lang === "de" ? "de" : "en";
    document.documentElement.lang = current;
    $all("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    $all("[data-i18n-html]").forEach(function (el) { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
    $all("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":");
        el.setAttribute(p[0], t(p[1]));
      });
    });
    document.title = t("meta.title");
    if (metaDesc) metaDesc.setAttribute("content", t("meta.description"));
    $all(".lang button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === current));
    });
    showRelease();
  }

  function initialLang() {
    try {
      var saved = window.localStorage.getItem(STORE_KEY);
      if (saved === "de" || saved === "en") return saved;
    } catch (e) { /* storage unavailable */ }
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return /^de\b/i.test(nav) ? "de" : "en";
  }

  $all(".lang button").forEach(function (b) {
    b.addEventListener("click", function () {
      var lang = b.getAttribute("data-lang");
      try { window.localStorage.setItem(STORE_KEY, lang); } catch (e) { /* ignore */ }
      apply(lang);
    });
  });

  // ---------- Latest release: point the buttons straight at the installer ----------

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
      .catch(function () { /* keep the releases/latest fallback */ })
      .then(function () { clearTimeout(timer); });
  }

  // ---------- Highlight the section in view, like the active tab ----------

  function trackSections() {
    if (!("IntersectionObserver" in window)) return;
    var links = $all(".tabs a");
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute("aria-current"); });
        var a = byId[e.target.id];
        if (a) a.setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(byId).forEach(function (id) {
      var s = document.getElementById(id);
      if (s) obs.observe(s);
    });
  }

  apply(initialLang());
  loadRelease();
  trackSections();
})();
