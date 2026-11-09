import type { Store } from "../store/BrowserStore";
import { validCombo } from "./keys";
import { call } from "./ipc";
import { t, type TKey } from "../i18n";

/**
 * Runde 5: zentrale Befehlsliste. Wird von Tastenkuerzeln (UI + Rust AcceleratorKeyPressed),
 * der Befehlspalette und dem Kuerzel-Editor in den Einstellungen benutzt.
 */
export type CommandCategory = "tabs" | "nav" | "page" | "open" | "view";
export const COMMAND_CATEGORIES: CommandCategory[] = ["tabs", "nav", "page", "open", "view"];
export const categoryLabel = (c: CommandCategory) => t(`cat.${c}` as TKey);
export interface CommandDef {
  id: string;
  /** Localized title (getter, follows the current language) */
  readonly title: string;
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

type RawCommand = Omit<CommandDef, "title">;
const RAW: RawCommand[] = [
  // Tabs
  { id: "tab.new", category: "tabs", keys: ["ctrl+t"], run: b => b.newTab() },
  { id: "tab.close", category: "tabs", keys: ["ctrl+w", "ctrl+f4"], when: hasTab, run: b => b.activeTab && b.closeTab(b.activeTab.id) },
  { id: "tab.next", category: "tabs", keys: ["ctrl+tab", "ctrl+pagedown"], run: b => b.cycleTab(1) },
  { id: "tab.prev", category: "tabs", keys: ["ctrl+shift+tab", "ctrl+pageup"], run: b => b.cycleTab(-1) },
  { id: "tab.duplicate", category: "tabs", keys: [], when: b => !!b.activeTab && (!b.activeTab.internal || b.activeTab.internal === "newtab"), run: b => { const t = b.activeTab; if (t) b.newTab(t.internal ? undefined : t.url); } },
  { id: "tab.pin", category: "tabs", keys: [], when: hasTab, run: b => b.activeTab && b.togglePin(b.activeTab.id) },
  { id: "tab.mute", category: "tabs", keys: [], when: web, run: b => b.activeTab && b.setTabMuted(b.activeTab.id, !b.activeTab.muted) },
  { id: "tab.group", category: "tabs", keys: [], when: b => !!b.activeTab && !b.activeTab.groupId, run: b => b.activeTab && b.createGroup(b.activeTab.id) },
  { id: "tab.groupByDomain", category: "tabs", keys: [], run: b => b.groupTabsByDomain() },
  { id: "tab.groupInternal", category: "tabs", keys: [], when: b => b.tabs.some(t => !!t.internal && !t.pinned), run: b => b.groupInternalTabs() },
  { id: "tab.closeOthers", category: "tabs", keys: [], when: hasTab, run: b => b.activeTab && b.closeOtherTabs(b.activeTab.id) },
  { id: "tab.sleepInactive", category: "tabs", keys: [], run: b => b.sleepInactiveTabs() },
  ...Array.from({ length: 8 }, (_, i): RawCommand => ({ id: `tab.goto${i + 1}`, category: "tabs", keys: [`ctrl+${i + 1}`], hidden: true, run: b => gotoTab(b, i) })),
  { id: "tab.last", category: "tabs", keys: ["ctrl+9"], hidden: true, run: b => gotoTab(b, -1) },
  // Navigation
  { id: "nav.back", category: "nav", keys: ["alt+left"], run: b => b.back() },
  { id: "nav.forward", category: "nav", keys: ["alt+right"], run: b => b.forward() },
  { id: "nav.reload", category: "nav", keys: ["ctrl+r", "f5"], when: web, run: b => b.reload() },
  { id: "nav.stop", category: "nav", keys: [], when: web, run: b => b.stop() },
  { id: "nav.home", category: "nav", keys: ["alt+home"], run: b => b.home() },
  { id: "nav.address", category: "nav", keys: ["ctrl+l", "alt+d", "f6"], run: b => b.focusAddressBar() },
  // Seite
  { id: "page.bookmark", category: "page", keys: ["ctrl+d"], when: web, run: b => { const t = b.activeTab; if (t && !t.internal) { b.addBookmark(t.url, t.title); b.setPopover("bookmark"); } } },
  { id: "page.find", category: "page", keys: ["ctrl+f"], when: web, run: b => b.openFind() },
  { id: "page.findNext", category: "page", keys: ["f3"], when: web, run: b => (b.find.query ? b.findRun(b.find.query, false) : b.openFind()) },
  { id: "page.findPrev", category: "page", keys: ["shift+f3"], when: web, run: b => (b.find.query ? b.findRun(b.find.query, true) : b.openFind()) },
  { id: "page.print", category: "page", keys: ["ctrl+p"], when: web, run: b => b.print() },
  { id: "page.pip", category: "page", keys: [], when: web, run: () => { call("pip_active"); } },
  { id: "page.zoomIn", category: "page", keys: ["ctrl+plus"], when: web, run: b => b.zoomStep(1) },
  { id: "page.zoomOut", category: "page", keys: ["ctrl+minus"], when: web, run: b => b.zoomStep(-1) },
  { id: "page.zoomReset", category: "page", keys: ["ctrl+0"], when: web, run: b => b.zoomStep(0) },
  // Oeffnen (immer als eigener Tab, siehe Store.openPage)
  { id: "open.settings", category: "open", keys: ["ctrl+comma"], run: b => b.openPage("settings") },
  { id: "open.history", category: "open", keys: ["ctrl+h"], run: b => b.openPage("history") },
  { id: "open.bookmarks", category: "open", keys: ["ctrl+shift+o"], run: b => b.openPage("bookmarks") },
  { id: "open.downloads", category: "open", keys: ["ctrl+j"], run: b => b.openPage("downloads") },
  { id: "open.privacy", category: "open", keys: [], run: b => b.openPage("privacy") },
  { id: "open.themes", category: "open", keys: [], run: b => b.openPage("themes") },
  { id: "open.audio", category: "open", keys: [], run: b => b.openPage("audio") },
  { id: "open.performance", category: "open", keys: [], run: b => b.openPage("performance") },
  { id: "open.market", category: "open", keys: [], run: b => b.openPage("market") },
  { id: "open.extensions", category: "open", keys: [], run: b => b.openPage("extensions") },
  { id: "open.shortcuts", category: "open", keys: [], run: b => b.openPage("settings", { section: "shortcuts" }) },
  // Ansicht
  { id: "ui.fullscreen", category: "view", keys: ["f11"], run: () => { call("toggle_fullscreen"); } },
  { id: "ui.palette", category: "view", keys: ["ctrl+k"], run: b => b.openPalette("all") },
  { id: "ui.commands", category: "view", keys: ["ctrl+shift+p"], run: b => b.openPalette("commands") },
  { id: "view.split", category: "view", keys: ["ctrl+shift+s"], when: hasTab, run: b => b.toggleSplit() },
  { id: "view.splitSwap", category: "view", keys: [], when: b => b.splitActive, run: b => b.swapSplit() },
  { id: "view.splitOrientation", category: "view", keys: [], when: b => b.splitActive, run: b => b.toggleSplitOrientation() },
  { id: "ui.sidebar", category: "view", keys: [], run: b => b.updateSettings({ sidebarExpanded: !b.settings.sidebarExpanded }) },
  { id: "ui.bookmarksBar", category: "view", keys: ["ctrl+shift+b"], run: b => b.updateSettings({ showBookmarksBar: !b.settings.showBookmarksBar }) },
  { id: "ui.adblock", category: "view", keys: [], run: b => b.updateSettings({ adblock: !b.settings.adblock }) },
  { id: "ui.theme", category: "view", keys: [], run: b => b.updateSettings({ theme: document.documentElement.dataset.theme === "light" ? "dark" : "light" }) },
  { id: "ui.effects", category: "view", keys: [], run: b => b.updateEffects({ bgEnabled: !b.settings.effects.bgEnabled }) },
];
const titleOf = (id: string): string => {
  const m = /^tab\.goto(\d)$/.exec(id);
  return m ? t("cmd.tab.goto", { n: m[1] }) : t(`cmd.${id}` as TKey);
};
export const COMMANDS: CommandDef[] = RAW.map(c => Object.defineProperty({ ...c }, "title", { get: () => titleOf(c.id), enumerable: true }) as CommandDef);
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
