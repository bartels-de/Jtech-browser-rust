import type { Bang, InternalPage, SearchEngineId } from "../lib/urls";
import { DEFAULT_EFFECTS, type EffectsSettings } from "../lib/fx/effects";
import type { LangSetting } from "../i18n";

/** Sidebar width limits (px); compact matches --sidebar-compact */
export const SIDEBAR_COMPACT_WIDTH = 56;
export const SIDEBAR_MIN_WIDTH = 160;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 248;
export const clampSidebarWidth = (w: unknown) =>
  typeof w === "number" && Number.isFinite(w) ? Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w))) : SIDEBAR_DEFAULT_WIDTH;

export type ThemeSetting = "dark" | "light" | "system";
export type UiDensity = "compact" | "comfortable" | "spacious";
export type IconPack = "line" | "bold" | "soft";
export type SidebarTabStyle = "classic" | "pill" | "underline" | "minimal";

export interface Settings {
  /** "jtech://newtab" oder eine URL */
  startPage: string;
  searchEngine: SearchEngineId;
  theme: ThemeSetting;
  adblock: boolean;
  sidebarExpanded: boolean;
  /** Width of the expanded sidebar in px (drag handle) */
  sidebarWidth: number;
  uiDensity: UiDensity;
  iconPack: IconPack;
  sidebarTabStyle: SidebarTabStyle;
  showBookmarksBar: boolean;
  /** Show the bookmarks bar only on the start page (when showBookmarksBar is on) */
  bookmarksBarOnlyNewTab?: boolean;
  /** Port: eigene JTech Bangs */
  bangs: Bang[];
  /** Runde 3: inaktive Tabs nach X Minuten schlafen legen (0 = aus) */
  tabSleepMinutes: number;
  /** Tabs automatisch nach Domain gruppieren */
  autoGroupByDomain: boolean;
  /** Runde 5: eigene Tastenkuerzel (Befehls-ID -> Kombinationen; fehlt = Standard, [] = keins) */
  shortcuts: Record<string, string[]>;
  /** Runde 5: Design-Studio-Effekte (Hintergrund, Cursor, Spur) */
  effects: EffectsSettings;
  /** Runde 5: Tabs der letzten Sitzung wiederherstellen */
  restoreSession: boolean;
  /** Show "recently visited" on the start page (default true) */
  startShowRecent?: boolean;
  /** Auto-update: check for updates on startup */
  autoUpdateCheck: boolean;
  /** Auto-update: additionally check every X hours (0 = startup only) */
  updateIntervalHours: number;
  /** UI language ("system" follows navigator.language) */
  language: LangSetting;
  /** Developer tools (F12 / "Inspect") for web pages and the UI; default off */
  devTools?: boolean;
  /** Split view: share of the left/top pane (0.15–0.85) */
  splitRatio?: number;
  /** Split view: panes on top of each other instead of side by side */
  splitVertical?: boolean;
  /** Radial menu (normalized by normalizeRadial) */
  radial?: RadialSettings;
  /** Resource limits (normalized by normalizeLimits) */
  limits?: LimitSettings;
  /** Start page layout (normalized by normalizeStart) */
  start?: StartSettings;
  /** Audio hub: sites that are always muted (host without www.) */
  audioMuteSites?: string[];
  /** Audio hub: optional five-band equalizer for YouTube playback. */
  audioEqualizer?: AudioEqualizerSettings;
  /** Shift+click opens links in the peek panel */
  peekEnabled?: boolean;
  /** Changelog: last app version whose "what's new" was shown */
  lastSeenVersion?: string;
  /** New tabs open right after the current tab instead of at the end (default true) */
  newTabNextToCurrent?: boolean;
  /** Closing a tab returns to the tab it was opened from (default true) */
  returnToOpener?: boolean;
  /** Animated tab switch transitions (default true; prefers-reduced-motion always wins) */
  tabAnimations?: boolean;
  /** Live search suggestions from the search engine while typing (default true) */
  liveSuggest?: boolean;
  /** Settings page: show all options (expert) instead of the most important ones */
  settingsExpert?: boolean;
  /** Right-click on web pages shows the standard WebView2 menu instead of the JTech menu (default false) */
  standardContextMenu?: boolean;
  /** Toolbar buttons in order (normalized by normalizeToolbar) */
  toolbar?: ToolbarItem[];
}

export type AudioEqPreset = "flat" | "bass" | "voice" | "treble" | "custom";
export interface AudioEqualizerSettings {
  enabled: boolean;
  preset: AudioEqPreset;
  bands: number[];
}
export const DEFAULT_AUDIO_EQUALIZER: AudioEqualizerSettings = {
  enabled: false,
  preset: "flat",
  bands: [0, 0, 0, 0, 0],
};
export function normalizeAudioEqualizer(raw: unknown): AudioEqualizerSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_AUDIO_EQUALIZER;
  const value = raw as Partial<AudioEqualizerSettings>;
  const presets: AudioEqPreset[] = ["flat", "bass", "voice", "treble", "custom"];
  const bands = Array.isArray(value.bands) && value.bands.length === 5
    ? value.bands.map(x => typeof x === "number" && Number.isFinite(x) ? Math.round(Math.max(-12, Math.min(12, x))) : 0)
    : DEFAULT_AUDIO_EQUALIZER.bands;
  return {
    enabled: value.enabled === true,
    preset: presets.includes(value.preset as AudioEqPreset) ? value.preset as AudioEqPreset : "flat",
    bands,
  };
}

// ---------- Toolbar layout ----------
export type ToolbarItem = "back" | "forward" | "reload" | "home" | "split" | "radial" | "audio" | "extensions" | "bookmarks" | "shield" | "downloads" | "hub";
/** Buttons left of the address bar vs. right of it */
export const TOOLBAR_LEFT: ToolbarItem[] = ["back", "forward", "reload", "home"];
export const TOOLBAR_ITEMS: ToolbarItem[] = ["back", "forward", "reload", "home", "split", "radial", "audio", "extensions", "bookmarks", "shield", "downloads", "hub"];
export const DEFAULT_TOOLBAR: ToolbarItem[] = ["back", "forward", "reload", "shield", "downloads", "hub"];
/** Keeps known ids once each; the hub button can never be removed (it is the only way back into everything). */
export function normalizeToolbar(raw: unknown): ToolbarItem[] {
  if (!Array.isArray(raw)) return DEFAULT_TOOLBAR;
  const out: ToolbarItem[] = [];
  for (const x of raw) if (TOOLBAR_ITEMS.includes(x as ToolbarItem) && !out.includes(x as ToolbarItem)) out.push(x as ToolbarItem);
  if (!out.includes("hub")) out.push("hub");
  return out;
}

// ---------- Presets ----------
export type PresetId = "minimal" | "standard" | "power" | "streaming";
export const PRESET_IDS: PresetId[] = ["minimal", "standard", "power", "streaming"];
/** A coherent set of settings; applied with updateSettings (undo restores the previous values). */
export function presetSettings(id: PresetId, cur: Settings): Partial<Settings> {
  const start = normalizeStart(cur.start);
  const limits = normalizeLimits(cur.limits);
  switch (id) {
    case "minimal": return {
      toolbar: ["back", "reload", "hub"], sidebarExpanded: false, showBookmarksBar: false, tabAnimations: false,
      start: { ...start, greeting: false, quickLinks: false, trackerStats: false, shortcutHints: false, density: "compact" }, startShowRecent: false,
      limits: { ...limits, enabled: true, lowMemoryBackground: true, suspendAfterMin: 10 },
    };
    case "standard": return {
      toolbar: DEFAULT_TOOLBAR, sidebarExpanded: true, showBookmarksBar: true, bookmarksBarOnlyNewTab: true, tabAnimations: true,
      start: { ...start, greeting: true, quickLinks: true, trackerStats: true, shortcutHints: true, density: "comfortable" }, startShowRecent: true,
      limits: { ...limits, enabled: false },
    };
    case "power": return {
      toolbar: ["back", "forward", "reload", "home", "split", "radial", "bookmarks", "extensions", "shield", "downloads", "hub"], sidebarExpanded: true, showBookmarksBar: true, bookmarksBarOnlyNewTab: false,
      tabAnimations: true, settingsExpert: true,
      start: { ...start, quickLinks: true, rows: Math.max(2, start.rows), trackerStats: true, shortcutHints: true, density: "compact" }, startShowRecent: true,
      limits: { ...limits, enabled: true, lowMemoryBackground: true, suspendAfterMin: 15 },
    };
    case "streaming": return {
      toolbar: ["back", "reload", "audio", "shield", "hub"], sidebarExpanded: false, showBookmarksBar: true, bookmarksBarOnlyNewTab: true, tabAnimations: true,
      start: { ...start, quickLinks: true, greeting: false, density: "spacious" }, startShowRecent: true,
      limits: { ...limits, enabled: true, lowMemoryBackground: true, suspendAfterMin: 30 }, tabSleepMinutes: 60,
    };
  }
}

// ---------- Radial menu ----------
export type RadialTrigger = "mouse" | "keyboard" | "both";
export interface RadialSettings { enabled: boolean; trigger: RadialTrigger; slots: string[]; }
export const RADIAL_MIN = 4, RADIAL_MAX = 8;
export const DEFAULT_RADIAL: RadialSettings = {
  enabled: true, trigger: "both",
  slots: ["nav.back", "nav.forward", "nav.reload", "tab.new", "tab.close", "tab.reopen", "view.split", "open.settings"],
};
export function normalizeRadial(raw: unknown, known: (id: string) => boolean): RadialSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<RadialSettings>;
  const trigger: RadialTrigger = r.trigger === "mouse" || r.trigger === "keyboard" || r.trigger === "both" ? r.trigger : DEFAULT_RADIAL.trigger;
  let slots = Array.isArray(r.slots) ? r.slots.filter((x): x is string => typeof x === "string" && known(x)).slice(0, RADIAL_MAX) : DEFAULT_RADIAL.slots;
  if (slots.length < RADIAL_MIN) slots = DEFAULT_RADIAL.slots;
  return { enabled: typeof r.enabled === "boolean" ? r.enabled : true, trigger, slots };
}

// ---------- Resource limits ----------
export interface LimitSettings {
  enabled: boolean;
  /** Background tabs get MemoryUsageTargetLevel LOW */
  lowMemoryBackground: boolean;
  /** Suspend (TrySuspend) background tabs after X minutes without use (0 = off) */
  suspendAfterMin: number;
  /** Total browser memory cap in MB; above it the least recently used tab is put to sleep (0 = off) */
  globalMemoryMb: number;
  /** Total CPU % threshold; above it (two samples in a row) background tabs are suspended (0 = off) */
  cpuThreshold: number;
}
export const DEFAULT_LIMITS: LimitSettings = { enabled: false, lowMemoryBackground: true, suspendAfterMin: 10, globalMemoryMb: 0, cpuThreshold: 0 };
const clampN = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : d);
export function normalizeLimits(raw: unknown): LimitSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LimitSettings>;
  const d = DEFAULT_LIMITS;
  return {
    enabled: r.enabled === true,
    lowMemoryBackground: typeof r.lowMemoryBackground === "boolean" ? r.lowMemoryBackground : d.lowMemoryBackground,
    suspendAfterMin: clampN(r.suspendAfterMin, 0, 240, d.suspendAfterMin),
    globalMemoryMb: clampN(r.globalMemoryMb, 0, 64000, d.globalMemoryMb),
    cpuThreshold: clampN(r.cpuThreshold, 0, 400, d.cpuThreshold),
  };
}

// ---------- Start page ----------
export type StartBackground = "none" | "gradient" | "image" | "fx";
export type IconStyle = "rounded" | "circle" | "square" | "minimal";
export interface QuickLink { id: string; title: string; url: string; }
export interface StartSettings {
  background: StartBackground;
  gradient: [string, string];
  clock: boolean;
  clock24: boolean;
  seconds: boolean;
  greeting: boolean;
  name: string;
  search: boolean;
  showEngine: boolean;
  quickLinks: boolean;
  /** null = first bookmarks */
  links: QuickLink[] | null;
  rows: number;
  cols: number;
  iconStyle: IconStyle;
  trackerStats: boolean;
  shortcutHints: boolean;
  density: "compact" | "comfortable" | "spacious";
  align: "center" | "top";
}
export const DEFAULT_START: StartSettings = {
  background: "none", gradient: ["#1b2a4a", "#0f1215"], clock: true, clock24: true, seconds: false, greeting: true, name: "",
  search: true, showEngine: true, quickLinks: true, links: null, rows: 1, cols: 7, iconStyle: "rounded",
  trackerStats: true, shortcutHints: true, density: "comfortable", align: "center",
};
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
export function normalizeStart(raw: unknown): StartSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<StartSettings>;
  const d = DEFAULT_START;
  const bool = (k: keyof StartSettings) => (typeof r[k] === "boolean" ? r[k] as boolean : d[k] as boolean);
  const links = Array.isArray(r.links)
    ? r.links.filter(l => l && typeof l.url === "string" && /^https?:\/\//i.test(l.url)).slice(0, 48)
      .map(l => ({ id: String(l.id ?? Math.random().toString(36).slice(2)).slice(0, 40), title: String(l.title ?? "").slice(0, 60), url: l.url.slice(0, 2048) }))
    : null;
  return {
    background: (["none", "gradient", "image", "fx"] as const).includes(r.background as StartBackground) ? r.background as StartBackground : d.background,
    gradient: [hex(r.gradient?.[0], d.gradient[0]), hex(r.gradient?.[1], d.gradient[1])],
    clock: bool("clock"), clock24: bool("clock24"), seconds: bool("seconds"), greeting: bool("greeting"),
    name: typeof r.name === "string" ? r.name.slice(0, 40) : "",
    search: bool("search"), showEngine: bool("showEngine"), quickLinks: bool("quickLinks"), links,
    rows: clampN(r.rows, 1, 4, d.rows), cols: clampN(r.cols, 3, 10, d.cols),
    iconStyle: (["rounded", "circle", "square", "minimal"] as const).includes(r.iconStyle as IconStyle) ? r.iconStyle as IconStyle : d.iconStyle,
    trackerStats: bool("trackerStats"), shortcutHints: bool("shortcutHints"),
    density: r.density === "compact" || r.density === "spacious" ? r.density : "comfortable",
    align: r.align === "top" ? "top" : "center",
  };
}

export const DEFAULT_SETTINGS: Settings = {
  startPage: "jtech://newtab",
  searchEngine: "duckduckgo",
  theme: "dark",
  adblock: true,
  sidebarExpanded: true,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  uiDensity: "comfortable",
  iconPack: "line",
  sidebarTabStyle: "classic",
  showBookmarksBar: true,
  bookmarksBarOnlyNewTab: true,
  bangs: [],
  tabSleepMinutes: 30,
  autoGroupByDomain: false,
  shortcuts: {},
  effects: DEFAULT_EFFECTS,
  restoreSession: true,
  autoUpdateCheck: true,
  updateIntervalHours: 24,
  language: "system",
  audioEqualizer: DEFAULT_AUDIO_EQUALIZER,
};

/** Split view: gap between the two native webviews (px); must match SPLIT_GAP in lib.rs */
export const SPLIT_GAP = 6;
export const SPLIT_MIN = 0.15;
export const SPLIT_MAX = 0.85;
export const clampSplitRatio = (r: unknown) =>
  typeof r === "number" && Number.isFinite(r) ? Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, r)) : 0.5;
/** Split view: a = left/top, b = right/bottom (tab ids) */
export interface SplitPair { a: string; b: string; }

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
  speedBytesPerSec: number;
  state: "progressing" | "interrupted" | "completed";
  paused: boolean;
  canResume: boolean;
  interruptReason: number;
  startedAt: number;
}

export interface NavError { tabId: string; url: string; message: string; }

export type PopoverId = "menu" | "toolbar" | "sidebarmenu" | "downloads" | "shield" | "bookmark" | "tabmenu" | "palette" | "suggest" | "groupmenu" | null;
