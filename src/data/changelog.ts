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
    version: "0.1.11", date: null,
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
