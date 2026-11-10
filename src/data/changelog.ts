import type { Lang } from "../i18n";

/**
 * Release notes shown on jtech://changelog and in the "What's new" notice after an update.
 * Keep in sync with CHANGELOG.md in the repository root (English). `date` = release day (ISO),
 * null = not released yet.
 */
export interface ChangelogEntry {
  version: string;
  date: string | null;
  notes: Record<Lang, string[]>;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.0", date: "2026-11-10",
    notes: {
      de: [
        "Design Studio: 32 Schriften statt 7 im Theme-Editor, gruppiert nach serifenlos, Serif, Monospace und Auszeichnung.",
        "Neu: Arial, Calibri, Candara, Corbel, Tahoma, Franklin Gothic, Lato, Ebrima, Times New Roman, Cambria, Constantia, Palatino Linotype, Book Antiqua, Garamond, Rockwell, Sitka, Consolas, Courier New, Lucida Console, Cambria Math, Segoe UI Black, Segoe UI Semibold, Gabriola, Comic Sans MS und Impact.",
        "Jede Schrift ist gegen den Windows-Schriftordner geprüft, die Liste enthält also nur wirklich installierte Schriften.",
        "Live-Vorschau unter der Auswahl zeigt das Pangramm in der gewählten Schrift.",
        "Alle Änderungen aus 0.1.14 und älter sind in diesem Release enthalten.",
      ],
      en: [
        "Design Studio: 32 fonts instead of 7 in the theme editor, grouped into sans serif, serif, monospace and display.",
        "New: Arial, Calibri, Candara, Corbel, Tahoma, Franklin Gothic, Lato, Ebrima, Times New Roman, Cambria, Constantia, Palatino Linotype, Book Antiqua, Garamond, Rockwell, Sitka, Consolas, Courier New, Lucida Console, Cambria Math, Segoe UI Black, Segoe UI Semibold, Gabriola, Comic Sans MS and Impact.",
        "Every font is checked against the Windows font folder, so the list only contains fonts that are actually installed.",
        "A live preview below the selection shows the pangram in the chosen font.",
        "All changes from 0.1.14 and older are included in this release.",
      ],
    },
  },
  {
    version: "0.1.14", date: "2026-11-10",
    notes: {
      de: [
        "Neue Website mit sechs Seiten, echten Screenshots und verrückt guten Animationen: jtech-browser.de (GitHub Pages).",
        "Besserer Werbeblocker: Scriptlets (+js(...)) und prozedurale kosmetische Filter (:has-text, :upward, :matches-css, :min-text-length, :xpath und mehr) werden jetzt ausgeführt.",
        "Neuer Schalter in den Einstellungen, um Scriptlets und prozedurale Filter separat zu aktivieren.",
        "Neuer Tab: die Adressleiste wird sofort fokussiert, statt dass die Startseiten-Suche den Fokus stiehlt.",
      ],
      en: [
        "New website with six pages, real screenshots and rich animations: jtech-browser.de (GitHub Pages).",
        "Better ad blocker: scriptlets (+js(...)) and procedural cosmetic filters (:has-text, :upward, :matches-css, :min-text-length, :xpath and more) are now executed.",
        "New setting to enable scriptlets and procedural filters separately.",
        "New tab: the address bar is focused immediately instead of the start page search stealing focus.",
      ],
    },
  },
  {
    version: "0.1.13", date: "2026-11-09",
    notes: {
      de: [
        "Eigenes Kontextmenü auf Webseiten: Links in neuem Tab, im Hintergrund, in Peek oder in der geteilten Ansicht öffnen, als Markdown kopieren und als Lesezeichen speichern.",
        "Bilder in neuem Tab öffnen, markierten Text mit der eigenen Suchmaschine suchen oder als reinen Text kopieren, bei Videos Bild-im-Bild, Tab stummschalten und Medienadresse kopieren.",
        "Auf freier Seitenfläche: Seite als Lesezeichen speichern und geteilte Ansicht mit neuem Tab. Kopieren, Einfügen, Rechtschreibung, Speichern und Drucken bleiben erhalten; „Untersuchen“ nur mit aktivierten Entwicklertools.",
        "Gilt auch im Peek-Fenster; unter Einstellungen › Radialmenü & Peek lässt sich wieder das Standardmenü von WebView2 wählen.",
        "Überarbeitetes Layout: eine einheitliche Kopfzeile, zentrierte Adressleiste und ruhigere Seitenleiste. Interne Seiten zeigen ihr eigenes Symbol und in der Adressleiste „JTech · Einstellungen“ statt der jtech://-Adresse.",
        "Seitenleiste: unten eine Zeile mit „Bibliothek“ (in drei Gruppen) und Einstellungen; der Mini-Player ist eine einzige Zeile und wird nicht mehr vom Menü verdeckt.",
        "Hub-Menü: acht Kacheln mit kurzen Namen, darunter die Aktionen und unter „Mehr“ Performance, Market und Änderungsprotokoll. Zoom nur noch auf Webseiten.",
        "Alle internen Seiten haben denselben Aufbau mit Titel, Aktionen rechts, einheitlichen Abschnitten, Listen und Leerzuständen. Ladeplatzhalter statt Nullen auf der Performance-Seite, verständliche Meldung, wenn der Market offline ist.",
        "Neue Standardwerte für Neuinstallationen: Gruppieren nach Domain aus (sonst erst ab dem zweiten Tab einer Domain), Lesezeichenleiste nur auf der Startseite, Home-Taste nicht mehr in der Symbolleiste. Bestehende Einstellungen bleiben.",
      ],
      en: [
        "Own context menu on web pages: open links in a new tab, in the background, in Peek or in split view, copy them as Markdown and add them to bookmarks.",
        "Open images in a new tab, search selected text with your search engine or copy it as plain text; for videos picture-in-picture, mute tab and copy media address.",
        "On empty page space: add the page to bookmarks and split view with a new tab. Copy, paste, spell check, save and print stay available; “Inspect” only with developer tools enabled.",
        "Also works in the Peek window; Settings › Radial menu & peek can switch back to the standard WebView2 menu.",
        "Reworked layout: one consistent top band, a centred address bar and a calmer sidebar. Internal pages show their own icon and read “JTech · Settings” in the address bar instead of the jtech:// address.",
        "Sidebar: one bottom row with “Library” (in three groups) and settings; the mini player is a single row and is no longer covered by the menu.",
        "Hub menu: eight tiles with short names, then the actions and, under “More”, Performance, Market and Changelog. Zoom only on web pages.",
        "All internal pages share one structure with title, actions on the right and consistent sections, lists and empty states. Loading placeholders instead of zeros on the Performance page, a readable message when the Market is offline.",
        "New defaults for new installations: group by domain off (otherwise only from a domain's second tab), bookmarks bar only on the start page, no Home button in the toolbar. Existing settings are kept.",
      ],
    },
  },
  {
    version: "0.1.12", date: "2026-11-09",
    notes: {
      de: [
        "Hub-Menü: ein Einstieg für Lesezeichen, Verlauf, Downloads, Bibliothek, Market, Erweiterungen, Audio, Leistung, Themes, Datenschutz, Änderungen und Einstellungen – mit Filterfeld.",
        "Einstellungen dort, wo du sie brauchst: Rechtsklick auf die Startseite, auf freie Fläche der Seitenleiste oder auf die Symbolleiste.",
        "Schnellaktionen in der Adressleiste: Bild-im-Bild auf Videoseiten, Stummschalten bei Ton, Zahl blockierter Elemente und Zoom zurücksetzen.",
        "Rückgängig statt Nachfragen: Tabs schließen, Gruppen, Lesezeichen, Verlaufseinträge, Design, Voreinstellungen und Zurücksetzen lassen sich per Hinweis rückgängig machen.",
        "Neue Tabs öffnen neben dem aktuellen; beim Schließen geht es zurück zum Ursprungstab (abschaltbar).",
        "Einstellungen im einfachen Modus mit den wichtigsten Optionen – „Alle Einstellungen anzeigen“ zeigt den Rest.",
        "Symbolleiste per Drag & Drop anpassen.",
        "Voreinstellungen „Minimal“, „Standard“, „Power-User“ und „Streaming“ mit Vorschau.",
        "Animierte Übergänge beim Tabwechsel (abschaltbar, folgt „Animationen reduzieren“).",
        "Live-Suchvorschläge der Suchmaschine beim Tippen – abschaltbar für mehr Datenschutz.",
      ],
      en: [
        "Hub menu: one entry point for bookmarks, history, downloads, library, market, extensions, audio, performance, themes, privacy, changelog and settings – with a filter field.",
        "Settings where you need them: right-click the start page, empty sidebar space or the toolbar.",
        "Address bar quick actions: picture-in-picture on video sites, mute while audio plays, blocked-items count and zoom reset.",
        "Undo instead of confirmations: closing tabs, groups, bookmarks, history entries, theme changes, presets and resets can be undone from a notice.",
        "New tabs open next to the current one; closing a tab returns to the tab it was opened from (switchable).",
        "Simple settings mode with the most important options – “Show all settings” reveals the rest.",
        "Customize the toolbar by drag & drop.",
        "Presets “Minimal”, “Standard”, “Power user” and “Streaming” with a preview.",
        "Animated tab switch transitions (switchable, follows “reduce motion”).",
        "Live search suggestions from the search engine while typing – can be turned off for more privacy.",
      ],
    },
  },
  {
    version: "0.1.11", date: "2026-11-09",
    notes: {
      de: [
        "Radialmenü: mittlere Maustaste halten oder Alt+Q – 4 bis 8 frei belegbare Befehle mit Symbolen.",
        "Ressourcen-Limits: Hintergrund-Tabs sparen Speicher, ruhende Tabs werden pausiert, optionale Grenzen für Gesamtspeicher und CPU.",
        "Audio-Hub: Medientitel, Interpret und Cover, Wiedergabe-Steuerung, „Nur dieser Tab“, Lautstärke pro Tab, immer stumme Seiten und ein Mini-Player in der Seitenleiste.",
        "Startseite: Hintergrund, Uhr, Begrüßung, Suche, Schnellzugriffe, Dichte und Ausrichtung frei einstellbar – direkt über „Anpassen“.",
        "Theme-Galerie im Design-Studio und im JTech Market mit über 20 Themes, Vorschau, Duplizieren und Import/Export.",
        "Peek-Fenster: Umschalt+Klick auf einen Link öffnet ihn schwebend über der Seite.",
        "Änderungsprotokoll (jtech://changelog) und Hinweis „Was ist neu“ nach einem Update.",
        "Geschlossenen Tab wieder öffnen (Strg+Umschalt+T).",
      ],
      en: [
        "Radial menu: hold the middle mouse button or press Alt+Q – 4 to 8 freely assignable commands with icons.",
        "Resource limits: background tabs save memory, idle tabs are suspended, optional caps for total memory and CPU.",
        "Audio hub: media title, artist and artwork, playback controls, “only this tab”, per-tab volume, always-muted sites and a mini player in the sidebar.",
        "Start page: background, clock, greeting, search, quick links, density and alignment are customizable – right from “Customize”.",
        "Theme gallery in the Design Studio and in JTech Market with more than 20 themes, previews, duplicate and import/export.",
        "Peek window: Shift+click a link to open it in a floating panel over the page.",
        "Changelog (jtech://changelog) and a “What's new” notice after an update.",
        "Reopen closed tab (Ctrl+Shift+T).",
      ],
    },
  },
  {
    version: "0.1.10", date: "2026-11-08",
    notes: {
      de: ["Geteilte Ansicht: zwei Tabs nebeneinander oder untereinander, Trenner verschiebbar.", "Gruppen für interne Seiten.", "Twitch-Werbeblocker 1.3.0: stabilere Werbepausen und Player-Neustart nach Werbung."],
      en: ["Split view: two tabs side by side or stacked, with a movable divider.", "Groups for internal pages.", "Twitch ad blocker 1.3.0: more robust ad breaks and player reload after ads."],
    },
  },
  {
    version: "0.1.9", date: null,
    notes: {
      de: ["Erweiterungs-Scripts werden vor der ersten Navigation registriert.", "Twitch-Werbeblocker 1.2.0.", "Entwicklertools optional einschaltbar."],
      en: ["Extension scripts are registered before the first navigation.", "Twitch ad blocker 1.2.0.", "Opt-in developer tools."],
    },
  },
  {
    version: "0.1.8", date: null,
    notes: {
      de: ["Echtes Vollbild für Videos und F11.", "Twitch-Werbeblocker 1.1.0 mit robusterer Mid-Roll-Behandlung."],
      en: ["True full screen for page video and F11.", "Twitch ad blocker 1.1.0 with more robust mid-roll handling."],
    },
  },
  {
    version: "0.1.7", date: null,
    notes: {
      de: ["Mitgelieferter YouTube-Werbeblocker.", "„Zuletzt besucht“ auf der Startseite abschaltbar."],
      en: ["Bundled YouTube ad blocker extension.", "“Recently visited” on the start page can be turned off."],
    },
  },
  {
    version: "0.1.6", date: null,
    notes: {
      de: ["Gebündelte Erweiterungen werden einzeln zugeordnet, alte Ordnerstruktur wird akzeptiert.", "Diagnose für Erweiterungen."],
      en: ["Bundled extensions are mapped explicitly, the legacy folder layout is accepted.", "Extension diagnostics."],
    },
  },
  {
    version: "0.1.5", date: null,
    notes: { de: ["Ordnerstruktur der gebündelten Erweiterungen korrigiert."], en: ["Fixed the folder layout of bundled extensions."] },
  },
  {
    version: "0.1.4", date: null,
    notes: {
      de: ["Neues Design: Seitenleiste, Symbolleiste, Startseite, Befehlspalette.", "Rahmenloses Fenster mit eigenen Fenstersteuerungen.", "Erweiterungssystem mit Twitch-Werbeblocker, JTech Market und Erweiterungsseite.", "Deutsch und Englisch."],
      en: ["New design: sidebar, toolbar, start page, command palette.", "Frameless window with custom window controls.", "Extension system with Twitch ad blocker, JTech Market and extensions page.", "German and English."],
    },
  },
  {
    version: "0.1.3", date: null,
    notes: { de: ["Leistungsseite und Verbesserungen der Seitenleiste."], en: ["Performance page and sidebar improvements."] },
  },
  {
    version: "0.1.2", date: null,
    notes: { de: ["Seitenleiste in der Breite veränderbar."], en: ["Resizable sidebar."] },
  },
  {
    version: "0.1.1", date: null,
    notes: { de: ["JTech-Logo als App-Symbol."], en: ["JTech logo as app icon."] },
  },
  {
    version: "0.1.0", date: null,
    notes: {
      de: ["Erste Version: Tabs mit WebView2, Werbeblocker, Lesezeichen, Verlauf, Downloads, Design-Studio, automatische Updates."],
      en: ["Initial release: WebView2 tabs, ad blocker, bookmarks, history, downloads, Design Studio, automatic updates."],
    },
  },
];

/** Compare "1.2.3" versions (missing parts = 0). */
export function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map(n => parseInt(n, 10) || 0), pb = b.split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d; }
  return 0;
}
