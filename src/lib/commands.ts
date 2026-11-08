import type { Store } from "../store/BrowserStore";
import { validCombo } from "./keys";

/**
 * Runde 5: zentrale Befehlsliste. Wird von Tastenkuerzeln (UI + Rust AcceleratorKeyPressed),
 * der Befehlspalette und dem Kuerzel-Editor in den Einstellungen benutzt.
 */
export type CommandCategory = "Tabs" | "Navigation" | "Seite" | "Öffnen" | "Ansicht";
export interface CommandDef {
  id: string;
  title: string;
  category: CommandCategory;
  /** Standard-Kuerzel (kanonisch, siehe lib/keys.ts) */
  keys: string[];
  /** Nur anbieten/ausfuehren, wenn true (fehlt = immer) */
  when?(b: Store): boolean;
  run(b: Store): void;
  /** In der Palette ausblenden (z. B. "Tab 1" … "Tab 8") */
  hidden?: boolean;
}

const web = (b: Store) => !!b.activeTab && !b.activeTab.internal && !b.activeTab.sleeping;
const hasTab = (b: Store) => !!b.activeTab;
const gotoTab = (b: Store, i: number) => { const t = i < 0 ? b.tabs[b.tabs.length - 1] : b.tabs[i]; if (t) b.switchTab(t.id); };

export const COMMANDS: CommandDef[] = [
  // Tabs
  { id: "tab.new", title: "Neuer Tab", category: "Tabs", keys: ["ctrl+t"], run: b => b.newTab() },
  { id: "tab.close", title: "Tab schließen", category: "Tabs", keys: ["ctrl+w", "ctrl+f4"], when: hasTab, run: b => b.activeTab && b.closeTab(b.activeTab.id) },
  { id: "tab.next", title: "Nächster Tab", category: "Tabs", keys: ["ctrl+tab", "ctrl+pagedown"], run: b => b.cycleTab(1) },
  { id: "tab.prev", title: "Vorheriger Tab", category: "Tabs", keys: ["ctrl+shift+tab", "ctrl+pageup"], run: b => b.cycleTab(-1) },
  { id: "tab.duplicate", title: "Tab duplizieren", category: "Tabs", keys: [], when: b => !!b.activeTab && (!b.activeTab.internal || b.activeTab.internal === "newtab"), run: b => { const t = b.activeTab; if (t) b.newTab(t.internal ? undefined : t.url); } },
  { id: "tab.pin", title: "Tab anheften / lösen", category: "Tabs", keys: [], when: hasTab, run: b => b.activeTab && b.togglePin(b.activeTab.id) },
  { id: "tab.mute", title: "Tab stumm / Ton an", category: "Tabs", keys: [], when: web, run: b => b.activeTab && b.setTabMuted(b.activeTab.id, !b.activeTab.muted) },
  { id: "tab.group", title: "Tab in neue Gruppe", category: "Tabs", keys: [], when: b => !!b.activeTab && !b.activeTab.groupId, run: b => b.activeTab && b.createGroup(b.activeTab.id) },
  { id: "tab.closeOthers", title: "Andere Tabs schließen", category: "Tabs", keys: [], when: hasTab, run: b => b.activeTab && b.closeOtherTabs(b.activeTab.id) },
  { id: "tab.sleepInactive", title: "Inaktive Tabs schlafen legen", category: "Tabs", keys: [], run: b => b.sleepInactiveTabs() },
  ...Array.from({ length: 8 }, (_, i): CommandDef => ({ id: `tab.goto${i + 1}`, title: `Zu Tab ${i + 1}`, category: "Tabs", keys: [`ctrl+${i + 1}`], hidden: true, run: b => gotoTab(b, i) })),
  { id: "tab.last", title: "Zum letzten Tab", category: "Tabs", keys: ["ctrl+9"], hidden: true, run: b => gotoTab(b, -1) },
  // Navigation
  { id: "nav.back", title: "Zurück", category: "Navigation", keys: ["alt+left"], run: b => b.back() },
  { id: "nav.forward", title: "Vorwärts", category: "Navigation", keys: ["alt+right"], run: b => b.forward() },
  { id: "nav.reload", title: "Neu laden", category: "Navigation", keys: ["ctrl+r", "f5"], when: web, run: b => b.reload() },
  { id: "nav.stop", title: "Laden stoppen", category: "Navigation", keys: [], when: web, run: b => b.stop() },
  { id: "nav.home", title: "Startseite", category: "Navigation", keys: ["alt+home"], run: b => b.home() },
  { id: "nav.address", title: "Adressleiste fokussieren", category: "Navigation", keys: ["ctrl+l", "alt+d", "f6"], run: b => b.focusAddressBar() },
  // Seite
  { id: "page.bookmark", title: "Lesezeichen hinzufügen", category: "Seite", keys: ["ctrl+d"], when: web, run: b => { const t = b.activeTab; if (t && !t.internal) { b.addBookmark(t.url, t.title); b.setPopover("bookmark"); } } },
  { id: "page.find", title: "Auf Seite suchen", category: "Seite", keys: ["ctrl+f"], when: web, run: b => b.openFind() },
  { id: "page.findNext", title: "Weitersuchen", category: "Seite", keys: ["f3"], when: web, run: b => (b.find.query ? b.findRun(b.find.query, false) : b.openFind()) },
  { id: "page.findPrev", title: "Rückwärts suchen", category: "Seite", keys: ["shift+f3"], when: web, run: b => (b.find.query ? b.findRun(b.find.query, true) : b.openFind()) },
  { id: "page.print", title: "Drucken", category: "Seite", keys: ["ctrl+p"], when: web, run: b => b.print() },
  { id: "page.zoomIn", title: "Vergrößern", category: "Seite", keys: ["ctrl+plus"], when: web, run: b => b.zoomStep(1) },
  { id: "page.zoomOut", title: "Verkleinern", category: "Seite", keys: ["ctrl+minus"], when: web, run: b => b.zoomStep(-1) },
  { id: "page.zoomReset", title: "Zoom zurücksetzen", category: "Seite", keys: ["ctrl+0"], when: web, run: b => b.zoomStep(0) },
  // Oeffnen (immer als eigener Tab, siehe Store.openPage)
  { id: "open.settings", title: "Einstellungen öffnen", category: "Öffnen", keys: ["ctrl+comma"], run: b => b.openPage("settings") },
  { id: "open.history", title: "Verlauf öffnen", category: "Öffnen", keys: ["ctrl+h"], run: b => b.openPage("history") },
  { id: "open.bookmarks", title: "Lesezeichen öffnen", category: "Öffnen", keys: ["ctrl+shift+o"], run: b => b.openPage("bookmarks") },
  { id: "open.downloads", title: "Downloads öffnen", category: "Öffnen", keys: ["ctrl+j"], run: b => b.openPage("downloads") },
  { id: "open.privacy", title: "Datenschutz öffnen", category: "Öffnen", keys: [], run: b => b.openPage("privacy") },
  { id: "open.themes", title: "Design-Studio öffnen", category: "Öffnen", keys: [], run: b => b.openPage("themes") },
  { id: "open.audio", title: "Audio-Hub öffnen", category: "Öffnen", keys: [], run: b => b.openPage("audio") },
  { id: "open.shortcuts", title: "Tastenkürzel bearbeiten", category: "Öffnen", keys: [], run: b => b.openPage("settings", { section: "shortcuts" }) },
  // Ansicht
  { id: "ui.palette", title: "Befehlspalette", category: "Ansicht", keys: ["ctrl+k"], run: b => b.openPalette("all") },
  { id: "ui.commands", title: "Nur Befehle suchen", category: "Ansicht", keys: ["ctrl+shift+p"], run: b => b.openPalette("commands") },
  { id: "ui.sidebar", title: "Seitenleiste ein-/ausklappen", category: "Ansicht", keys: [], run: b => b.updateSettings({ sidebarExpanded: !b.settings.sidebarExpanded }) },
  { id: "ui.bookmarksBar", title: "Lesezeichenleiste ein/aus", category: "Ansicht", keys: ["ctrl+shift+b"], run: b => b.updateSettings({ showBookmarksBar: !b.settings.showBookmarksBar }) },
  { id: "ui.adblock", title: "Werbeblocker ein/aus", category: "Ansicht", keys: [], run: b => b.updateSettings({ adblock: !b.settings.adblock }) },
  { id: "ui.theme", title: "Hell/Dunkel umschalten", category: "Ansicht", keys: [], run: b => b.updateSettings({ theme: document.documentElement.dataset.theme === "light" ? "dark" : "light" }) },
  { id: "ui.effects", title: "Animierten Hintergrund ein/aus", category: "Ansicht", keys: [], run: b => b.updateEffects({ bgEnabled: !b.settings.effects.bgEnabled }) },
];
export const COMMAND_BY_ID = new Map(COMMANDS.map(c => [c.id, c]));

/** Gespeicherte Ueberschreibungen bereinigen: nur bekannte Befehle, gueltige Kombinationen, max. 4 je Befehl. */
export function normalizeShortcuts(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!COMMAND_BY_ID.has(id) || !Array.isArray(v)) continue;
    out[id] = [...new Set(v.filter((k): k is string => typeof k === "string" && validCombo(k)))].slice(0, 4);
  }
  return out;
}

/** Wirksame Kuerzel je Befehl (Ueberschreibung oder Standard). */
export function effectiveKeys(overrides: Record<string, string[]>, id: string): string[] {
  return overrides[id] ?? COMMAND_BY_ID.get(id)?.keys ?? [];
}

/** Kombination -> Befehl. Bei doppelter Belegung gewinnt der erste Befehl in COMMANDS. */
export function bindingMap(overrides: Record<string, string[]>): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of COMMANDS) for (const k of effectiveKeys(overrides, c.id)) if (!m.has(k)) m.set(k, c.id);
  return m;
}
