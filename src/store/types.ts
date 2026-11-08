import type { Bang, InternalPage, SearchEngineId } from "../lib/urls";
import { DEFAULT_EFFECTS, type EffectsSettings } from "../lib/fx/effects";

/** Sidebar width limits (px); compact matches --sidebar-compact */
export const SIDEBAR_COMPACT_WIDTH = 64;
export const SIDEBAR_MIN_WIDTH = 160;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 250;
export const clampSidebarWidth = (w: unknown) =>
  typeof w === "number" && Number.isFinite(w) ? Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w))) : SIDEBAR_DEFAULT_WIDTH;

export type ThemeSetting = "dark" | "light" | "system";

export interface Settings {
  /** "jtech://newtab" oder eine URL */
  startPage: string;
  searchEngine: SearchEngineId;
  theme: ThemeSetting;
  adblock: boolean;
  sidebarExpanded: boolean;
  /** Width of the expanded sidebar in px (drag handle) */
  sidebarWidth: number;
  showBookmarksBar: boolean;
  /** Port: eigene JTech Bangs */
  bangs: Bang[];
  /** Runde 3: inaktive Tabs nach X Minuten schlafen legen (0 = aus) */
  tabSleepMinutes: number;
  /** Runde 5: eigene Tastenkuerzel (Befehls-ID -> Kombinationen; fehlt = Standard, [] = keins) */
  shortcuts: Record<string, string[]>;
  /** Runde 5: Design-Studio-Effekte (Hintergrund, Cursor, Spur) */
  effects: EffectsSettings;
  /** Runde 5: Tabs der letzten Sitzung wiederherstellen */
  restoreSession: boolean;
  /** Auto-update: check for updates on startup */
  autoUpdateCheck: boolean;
  /** Auto-update: additionally check every X hours (0 = startup only) */
  updateIntervalHours: number;
}

export const DEFAULT_SETTINGS: Settings = {
  startPage: "jtech://newtab",
  searchEngine: "duckduckgo",
  theme: "dark",
  adblock: true,
  sidebarExpanded: true,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  showBookmarksBar: true,
  bangs: [],
  tabSleepMinutes: 30,
  shortcuts: {},
  effects: DEFAULT_EFFECTS,
  restoreSession: true,
  autoUpdateCheck: true,
  updateIntervalHours: 24,
};

export interface Bookmark { id: string; url: string; title: string; createdAt: number; }
export interface HistoryEntry { id: string; url: string; title: string; visitedAt: number; }

export interface UiTab {
  id: string;
  title: string;
  url: string;
  active: boolean;
  blocked: number;
  pinned: boolean;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Port Audio-Hub */
  playingAudio: boolean;
  muted: boolean;
  /** interne Seite, die gerade ueber diesem Tab angezeigt wird */
  internal: InternalPage | null;
  /** Runde 3 */
  sleeping: boolean;
  zoom: number;
  groupId: string | null;
}

/** Runde 3: Tab-Gruppe (nur UI). */
export interface TabGroup { id: string; name: string; color: string; collapsed: boolean; }
export const GROUP_COLORS = ["#2cc5c9", "#7c6cff", "#ff5a8a", "#f3a712", "#4fd18b", "#3aa0ff", "#ef6f6c", "#a5b4cb"];

/** Runde 3: Download aus Rust (download-event) bzw. aus frueheren Sitzungen (live = false). */
export interface DownloadItem {
  key: string;
  id: number;
  live: boolean;
  tabId: string;
  url: string;
  path: string;
  fileName: string;
  received: number;
  total: number;
  state: "progressing" | "interrupted" | "completed";
  paused: boolean;
  canResume: boolean;
  interruptReason: number;
  startedAt: number;
}

export interface NavError { tabId: string; url: string; message: string; }

export type PopoverId = "menu" | "downloads" | "shield" | "bookmark" | "tabmenu" | "palette" | "suggest" | "groupmenu" | null;
