import type { InternalPage } from "../lib/urls";
import type { EffectsSettings } from "../lib/fx/effects";
import type { ThemeSpec } from "../lib/theme";
import type { PresetId, SplitPair, Bookmark, DownloadItem, HistoryEntry, NavError, PopoverId, Settings, TabGroup, UiTab } from "./types";

export interface ActivityEvent { id: string; time: number; kind: string; tabId: string; tabTitle: string; url: string; detail: string; reason: string; }
/** Toast with an optional "Undo" action (replaces confirmations for reversible actions). */
export interface Toast { id: number; msg: string; undo?: () => void; }
export interface FindState { open: boolean; query: string; count: number; found: boolean; tick: number; }


export interface Store {
  tabs: UiTab[];
  activeTab: UiTab | null;
  /** interne Seite im Content-Bereich (auch wenn kein Tab offen ist) */
  activePage: InternalPage | null;
  totalBlocked: number;
  navError: NavError | null;
  status: string;
  activity: ActivityEvent[];
  clearActivity(): void;
  settings: Settings;
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  popover: PopoverId;
  focusTick: number;
  setStatus(s: string): void;
  dismissError(): void;
  setPopover(p: PopoverId): void;
  updateSettings(p: Partial<Settings>): void;
  /** Sidebar drag in progress (hides the content webview) */
  sidebarResizing: boolean;
  /** Vollbild (Seiten-Element oder F11): UI-Chrome ausblenden, Content deckt das Fenster */
  fullscreen: boolean;
  setSidebarResizing(v: boolean): void;
  /** background = open without switching to it (page context menu) */
  newTab(input?: string, opts?: { background?: boolean }): Promise<string | undefined>;
  closeTab(id: string, silent?: boolean): void;
  closeOtherTabs(id: string): void;
  switchTab(id: string): void;
  cycleTab(dir: 1 | -1): void;
  togglePin(id: string): void;
  reorder(ids: string[]): void;
  navigate(input: string): Promise<void>;
  /** Runde 5: interne Seite als eigener Tab (je Seite hoechstens einer; vorhandener wird fokussiert). */
  openPage(p: InternalPage, opts?: { section?: string }): void;
  /** Runde 5: Abschnitt der Einstellungsseite */
  settingsSection: string;
  setSettingsSection(s: string): void;
  /** Runde 5: Design-Studio-Effekte */
  updateEffects(p: Partial<EffectsSettings>): void;
  /** Runde 5: zentrale Befehle + eigene Kuerzel */
  runCommand(id: string): void;
  bindings: Map<string, string>;
  keysFor(id: string): string[];
  keyHint(id: string): string | undefined;
  setShortcut(id: string, keys: string[] | null): void;
  back(): void;
  forward(): void;
  reload(): void;
  stop(): void;
  home(): void;
  focusAddressBar(): void;
  isBookmarked(url: string): Bookmark | undefined;
  addBookmark(url: string, title: string): void;
  updateBookmark(id: string, p: Partial<Bookmark>): void;
  removeBookmark(id: string): void;
  removeHistory(id: string): void;
  clearHistory(): void;
  /** Port: Audio-Hub */
  setTabMuted(id: string, muted: boolean): void;
  /** Port: Design-Studio (null = Standard-Tokens) */
  customTheme: ThemeSpec | null;
  savedThemes: ThemeSpec[];
  setCustomTheme(t: ThemeSpec | null): void;
  saveTheme(t: ThemeSpec): void;
  removeTheme(id: string): void;
  /** Runde 3: Downloads */
  downloads: DownloadItem[];
  downloadAction(id: number, action: "pause" | "resume" | "cancel"): void;
  openDownload(id: number, reveal: boolean): void;
  removeDownload(key: string): void;
  clearDownloads(): void;
  /** Runde 3: Zoom pro Seite (Host -> Faktor) */
  zoomBySite: Record<string, number>;
  zoomStep(dir: 1 | -1 | 0): void;
  resetSiteZoom(host: string): void;
  /** Runde 3: Suchen auf der Seite */
  find: FindState;
  openFind(): void;
  closeFind(): void;
  findRun(query: string, backwards?: boolean): void;
  print(): void;
  /** Runde 3: Tab-Schlaf */
  sleepTab(id: string): void;
  sleepInactiveTabs(): void;
  /** Runde 3: Tastenkuerzel (UI + Rust AcceleratorKeyPressed) */
  runShortcut(key: string): void;
  /** Runde 3: Befehlspalette */
  paletteMode: "all" | "commands";
  openPalette(mode?: "all" | "commands"): void;
  /** Runde 3: Tab-Gruppen */
  groups: TabGroup[];
  createGroup(tabId: string): void;
  setTabGroup(tabId: string, groupId: string | null): void;
  groupTabsByDomain(): void;
  updateGroup(id: string, p: Partial<TabGroup>): void;
  removeGroup(id: string, closeTabs?: boolean): void;
  /** Put all internal tabs (settings, history, …) into one group */
  groupInternalTabs(): void;
  /** Split view: pair of tabs (kept while another tab is active; shown when one of them is active) */
  split: SplitPair | null;
  /** Split view is currently on screen (active tab is part of the pair) */
  splitActive: boolean;
  /** Live ratio (also during divider drag) and orientation */
  splitRatio: number;
  splitVertical: boolean;
  /** Divider drag in progress (native webviews hidden) */
  splitDragging: boolean;
  setSplitDragging(v: boolean): void;
  /** Open split view: active tab + `withId` (default: last used other tab, else a new tab) */
  openSplit(withId?: string): Promise<void>;
  /** Page context menu: open `url` (default: start page) next to tab `fromId` (default: active tab) in split view */
  openInSplit(url?: string, fromId?: string): Promise<void>;
  closeSplit(): void;
  toggleSplit(): void;
  swapSplit(): void;
  toggleSplitOrientation(): void;
  /** live = only update the preview; otherwise persist */
  setSplitRatio(r: number, live?: boolean): void;
  /** Overlay over the content area (radial menu): hides the native webviews while true */
  overlay: boolean;
  setOverlay(v: boolean): void;
  /** Recently closed web tabs (newest first) */
  closedTabs: string[];
  reopenClosedTab(): void;
  /** Toast / undo */
  toast: Toast | null;
  showToast(msg: string, undo?: () => void): void;
  dismissToast(): void;
  /** Apply settings and offer "Undo" (restores the previous values of the changed keys) */
  updateSettingsUndoable(p: Partial<Settings>, msg: string): void;
  applyPreset(id: PresetId): void;
}

