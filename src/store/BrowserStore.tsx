import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { call, type DownloadInfo, type RustTab, type TabEvent } from "../lib/ipc";
import { internalTitle, hostOf, groupHost, internalUrl, isWebUrl, normalizeBangs, parseInternal, resolveInput, type InternalPage } from "../lib/urls";
import { COMMAND_BY_ID, bindingMap, effectiveKeys, normalizeShortcuts } from "../lib/commands";
import { formatCombo, validCombo } from "../lib/keys";
import { normalizeEffects, type EffectsSettings } from "../lib/fx/effects";
import { applyTheme, normalizeTheme, type ThemeSpec } from "../lib/theme";
import { load, save } from "./storage";
import { I18nProvider, localizeBackend, normalizeLangSetting, setLang, systemLang, t as tr, type Lang } from "../i18n";
import { DEFAULT_SETTINGS, GROUP_COLORS, clampSidebarWidth, clampSplitRatio, normalizeAudioEqualizer, normalizeToolbar, presetSettings, type PresetId, type SplitPair, type Bookmark, type DownloadItem, type HistoryEntry, type NavError, type PopoverId, type Settings, type TabGroup, type UiTab } from "./types";
import { ACTIVITY_LIMIT, loadZoom, nextZoom, normalizeActivity, normalizeGroups, validZoom } from "./normalization";
import type { ActivityEvent, FindState, Store, Toast } from "./contracts";
export type { ActivityEvent, FindState, Store, Toast } from "./contracts";
export { ZOOM_STEPS } from "./normalization";

const HISTORY_LIMIT = 5000;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const Ctx = createContext<Store | null>(null);
export const useBrowser = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("BrowserProvider missing");
  return s;
};

export function BrowserProvider({ children }: { children: ReactNode }) {
  const [rustTabs, setRustTabs] = useState<RustTab[]>([]);
  const [internal, setInternal] = useState<Record<string, InternalPage | null>>({});
  const internalRef = useRef<Record<string, InternalPage | null>>({});
  const [orphanPage, setOrphanPage] = useState<InternalPage>("newtab");
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [pinned, setPinned] = useState<string[]>([]);
  const [totalBlocked, setTotalBlocked] = useState(0);
  const [navError, setNavError] = useState<NavError | null>(null);
  const [status, setStatus] = useState("");
  const [activity, setActivity] = useState<ActivityEvent[]>(() => normalizeActivity(load<unknown>("activity", [])));
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = useCallback((msg: string, undo?: () => void) => {
    clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({ id, msg, undo });
    toastTimer.current = setTimeout(() => setToast(x => (x?.id === id ? null : x)), undo ? 7000 : 3500);
  }, []);
  const dismissToast = useCallback(() => { clearTimeout(toastTimer.current); setToast(null); }, []);
  /** Tab opener (new tab id -> tab that was active when it was opened) */
  const openerRef = useRef<Record<string, string>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => {
    const s = load("settings", DEFAULT_SETTINGS);
    return { ...s, shortcuts: normalizeShortcuts(s.shortcuts), effects: normalizeEffects(s.effects), restoreSession: typeof s.restoreSession === "boolean" ? s.restoreSession : true,
      autoGroupByDomain: typeof s.autoGroupByDomain === "boolean" ? s.autoGroupByDomain : DEFAULT_SETTINGS.autoGroupByDomain,
      autoUpdateCheck: typeof s.autoUpdateCheck === "boolean" ? s.autoUpdateCheck : true,
      devTools: s.devTools === true,
      updateIntervalHours: [0, 6, 12, 24, 72].includes(s.updateIntervalHours) ? s.updateIntervalHours : 24,
      sidebarWidth: clampSidebarWidth(s.sidebarWidth), language: normalizeLangSetting(s.language),
      splitRatio: clampSplitRatio(s.splitRatio), splitVertical: s.splitVertical === true, toolbar: normalizeToolbar(s.toolbar),
      audioEqualizer: normalizeAudioEqualizer(s.audioEqualizer) };
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Developer tools setting -> backend (applies to open tabs and new ones)
  useEffect(() => { call("set_devtools", { enabled: settings.devTools === true }, m => console.warn(m)); }, [settings.devTools]);
  // ---- i18n: language from settings ("system" follows navigator.language, also when it changes) ----
  const [sysLang, setSysLang] = useState<Lang>(systemLang);
  useEffect(() => {
    const on = () => setSysLang(systemLang());
    window.addEventListener("languagechange", on);
    return () => window.removeEventListener("languagechange", on);
  }, []);
  const lang: Lang = settings.language === "system" ? sysLang : settings.language;
  setLang(lang);
  const [settingsSection, setSettingsSection] = useState("general");
  /** Runde 5: interne Seiten, deren Tab gerade angelegt wird (verhindert Doppel-Tabs bei Doppelklick) */
  const pendingPages = useRef(new Set<InternalPage>());
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => load("bookmarks", [] as Bookmark[]));
  const [history, setHistory] = useState<HistoryEntry[]>(() => load("history", [] as HistoryEntry[]));
  const [popover, setPopover] = useState<PopoverId>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [customTheme, setCustomThemeState] = useState<ThemeSpec | null>(() => normalizeTheme(load<unknown>("customTheme", null)));
  const [savedThemes, setSavedThemes] = useState<ThemeSpec[]>(() => {
    const raw = load<unknown>("savedThemes", []);
    return Array.isArray(raw) ? raw.map(x => normalizeTheme(x)).filter((x): x is ThemeSpec => !!x).slice(0, 50) : [];
  });
  /** Spinner-Fix: Rueckfall-Timer nach DOMContentLoaded, falls kein passendes Completed kommt. */
  const domTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [navState, setNavState] = useState<Record<string, { back: boolean; fwd: boolean }>>({});
  /** Etappe CD: neueste NavigationId je Tab – aeltere Completed-Events werden ignoriert. */
  const latestNav = useRef<Record<string, number>>({});
  const stoppedByUser = useRef<Record<string, boolean>>({});
  /** Etappe CD: Kuerzel aus der Webseite (Rust AcceleratorKeyPressed) -> gleiche Aktionen wie useShortcuts. */
  const shortcutRef = useRef<(key: string) => void>(() => {});

  const onError = useCallback((m: string) => setStatus(m), []);

  // ---- Runde 3: Zustand ----
  const dlStamp = useRef(Date.now().toString(36));
  const knownDl = useRef(new Set<string>());
  const [downloads, setDownloads] = useState<DownloadItem[]>(() => {
    const raw = load<unknown>("downloads", []);
    return (Array.isArray(raw) ? raw : []).filter((x): x is DownloadItem => !!x && typeof x === "object" && typeof (x as DownloadItem).key === "string" && typeof (x as DownloadItem).fileName === "string")
      .slice(0, 200).map(x => ({ ...x, live: false, paused: false, state: x.state === "completed" ? "completed" : "interrupted" }));
  });
  const [zoomBySite, setZoomBySite] = useState<Record<string, number>>(loadZoom);
  const [tabZoom, setTabZoom] = useState<Record<string, number>>({});
  const tabZoomRef = useRef<Record<string, number>>({});
  tabZoomRef.current = tabZoom;
  const [find, setFind] = useState<FindState>({ open: false, query: "", count: 0, found: false, tick: 0 });
  const [paletteMode, setPaletteMode] = useState<"all" | "commands">("all");
  const [groups, setGroups] = useState<TabGroup[]>(() => normalizeGroups(load<unknown>("groups", [])));
  const [tabGroup, setTabGroupMap] = useState<Record<string, string>>({});
  const [split, setSplit] = useState<SplitPair | null>(null);
  const splitRef = useRef<SplitPair | null>(null);
  splitRef.current = split;
  const [splitLive, setSplitLive] = useState<number | null>(null);
  const [splitDragging, setSplitDragging] = useState(false);
  const restoreDone = useRef(false);
  const lastActive = useRef<Record<string, number>>({});

  const upsertDownload = useCallback((d: DownloadInfo) => {
    const key = `${dlStamp.current}-${d.id}`;
    if (!knownDl.current.has(key)) { knownDl.current.add(key); if (d.state === "progressing") setStatus(tr("st.dlStarted", { name: d.fileName })); }
    setDownloads(list => {
      const item: DownloadItem = { ...d, speedBytesPerSec: d.speedBytesPerSec ?? 0, key, live: true };
      const i = list.findIndex(x => x.key === key);
      if (i < 0) return [item, ...list].slice(0, 200);
      const n = [...list]; n[i] = item; return n;
    });
  }, []);
  internalRef.current = internal;
  const tabsRef = useRef<RustTab[]>([]);
  tabsRef.current = rustTabs;
  const lastHistoryByTab = useRef<Record<string, string>>({});

  useEffect(() => save("settings", settings), [settings]);
  useEffect(() => save("bookmarks", bookmarks), [bookmarks]);
  useEffect(() => save("history", history), [history]);
  useEffect(() => { save("customTheme", customTheme); applyTheme(customTheme); }, [customTheme]);
  useEffect(() => save("savedThemes", savedThemes), [savedThemes]);
  useEffect(() => save("zoom", zoomBySite), [zoomBySite]);
  useEffect(() => save("groups", groups), [groups]);
  const dlSig = downloads.filter(d => d.state !== "progressing").map(d => d.key + d.state).join("|");
  useEffect(() => { save("downloads", downloads.filter(d => d.state !== "progressing").slice(0, 200)); }, [dlSig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => save("activity", activity.slice(0, 500)), [activity]);

  // ---- abgeleitete Tabs ----
  const tabs: UiTab[] = useMemo(() => rustTabs.map(t => {
    const ov = internal[t.id] ?? null;
    // about:blank ohne Override = Startseite
    const page: InternalPage | null = ov ?? (t.url === "about:blank" || t.url === "" ? "newtab" : null);
    return {
      id: t.id,
      url: t.url,
      title: page ? internalTitle(page) : (t.title && t.title !== t.url ? t.title : t.url),
      active: t.active,
      blocked: t.blocked ?? 0,
      pinned: pinned.includes(t.id),
      loading: !page && !t.sleeping && !!loading[t.id],
      canGoBack: !!navState[t.id]?.back,
      canGoForward: !!navState[t.id]?.fwd,
      playingAudio: !!t.playingAudio,
      muted: !!t.muted,
      internal: page,
      sleeping: !!t.sleeping,
      zoom: tabZoom[t.id] ?? 1,
      groupId: tabGroup[t.id] ?? null,
    };
  }), [rustTabs, internal, pinned, loading, navState, tabZoom, tabGroup, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const uiTabsRef = useRef<UiTab[]>([]);
  uiTabsRef.current = tabs;
  const activeTab = tabs.find(t => t.active) ?? null;
  const activePage = activeTab ? activeTab.internal : orphanPage;

  // ---- Rust-Sync ----
  const applyTabs = useCallback((t: RustTab[]) => setRustTabs(t), []);
  const refresh = useCallback(async () => {
    const t = await call<RustTab[]>("list_tabs", undefined, onError);
    if (t) applyTabs(t);
    const b = await call<number>("get_blocked_count", undefined, onError);
    if (b !== undefined) setTotalBlocked(b);
  }, [applyTabs, onError]);

  useEffect(() => { refresh(); const i = setInterval(refresh, 3000); return () => clearInterval(i); }, [refresh]);

  useEffect(() => {
    const unTabs = listen<RustTab[]>("tabs-changed", ({ payload }) => applyTabs(payload));
    const unDl = listen<DownloadInfo>("download-event", ({ payload }) => upsertDownload(payload));
    call<DownloadInfo[]>("list_downloads").then(list => list?.forEach(upsertDownload));
    const unFs = listen<{ fullscreen: boolean }>("content-fullscreen", ({ payload }) => setFullscreen(!!payload.fullscreen));
    const unEv = listen<TabEvent>("tab-event", ({ payload: ev }) => {
      if (ev.kind === "error") { setStatus(localizeBackend(ev.detail) || tr("c.error")); return; }
      const id = ev.tabId;
      const patchUrl = (url?: string | null) => {
        if (!url) return;
        setRustTabs(ts => ts.map(t => t.id === id ? { ...t, url } : t));
      };
      const endLoading = () => {
        clearTimeout(domTimers.current[id]);
        delete domTimers.current[id];
        setLoading(l => (l[id] ? { ...l, [id]: false } : l));
      };
      switch (ev.kind) {
        case "navigation-starting":
          clearTimeout(domTimers.current[id]);
          if (typeof ev.navigationId === "number" && ev.navigationId > 0) latestNav.current[id] = ev.navigationId;
          stoppedByUser.current[id] = false;
          setLoading(l => ({ ...l, [id]: true }));
          setNavError(e => (e?.tabId === id ? null : e));
          patchUrl(ev.url);
          break;
        case "source-changed":
          patchUrl(ev.url);
          break;
        case "navigation-completed": {
          // Etappe CD: Completed einer ueberholten Navigation (z. B. Google-SERP startet sofort
          // eine neue) aendert weder Ladezustand noch Fehleranzeige.
          // Spinner-Fix: Id 0/fehlend gilt als "aktuell" (frueher: 0 !== latest -> ignoriert, Spinner blieb).
          // Eine Id, die NEUER ist als die zuletzt gesehene (Starting verpasst), ist ebenfalls aktuell.
          const latest = latestNav.current[id];
          const nid = typeof ev.navigationId === "number" ? ev.navigationId : 0;
          const stale = nid > 0 && (!!ev.stale || (latest !== undefined && nid < latest));
          if (stale) break;
          if (nid > 0) latestNav.current[id] = Math.max(nid, latest ?? 0);
          endLoading();
          if (ev.isSuccess === false) {
            const benign = !!ev.benign || ev.webErrorStatus === 14 || stoppedByUser.current[id];
            if (!benign)
              setNavError({ tabId: id, url: ev.url ?? "", message: tr("st.navError", { name: ev.errorName ?? tr("c.error"), status: String(ev.webErrorStatus ?? "?") }) });
          } else if (ev.url && isWebUrl(ev.url)) {
            const t = tabsRef.current.find(x => x.id === id);
            const entry: HistoryEntry = { id: uid(), url: ev.url, title: t && t.title !== t.url ? t.title : ev.url, visitedAt: Date.now() };
            lastHistoryByTab.current[id] = entry.id;
            setHistory(h => [entry, ...h.filter(x => !(x.url === entry.url && entry.visitedAt - x.visitedAt < 60_000))].slice(0, HISTORY_LIMIT));
          }
          break;
        }
        case "dom-content-loaded": {
          // Rueckfall: Dokument der neuesten Navigation ist da. Kommt binnen 5 s kein Completed
          // (z. B. Navigation ohne eigenes Completed), endet die Ladeanzeige trotzdem.
          const latest = latestNav.current[id];
          const nid = ev.navigationId ?? 0;
          if (nid === 0 || latest === undefined || nid >= latest) {
            clearTimeout(domTimers.current[id]);
            domTimers.current[id] = setTimeout(endLoading, 5000);
          }
          break;
        }
        case "audio-changed": {
          const playingAudio = !!ev.playingAudio, muted = !!ev.muted;
          setRustTabs(ts => ts.map(t => t.id === id ? { ...t, playingAudio, muted } : t));
          break;
        }
        case "process-failed":
          endLoading();
          setNavError({ tabId: id, url: ev.url ?? "", message: tr("st.crashed", { detail: ev.detail ?? "" }) });
          break;
        case "history-changed":
          setNavState(n => ({ ...n, [id]: { back: !!ev.canGoBack, fwd: !!ev.canGoForward } }));
          break;
        case "popup-blocked":
          setActivity(items => [{
            id: uid(), time: Date.now(), kind: "popup-blocked", tabId: id,
            tabTitle: (ev.tabTitle ?? "").slice(0, 300), url: (ev.url ?? "").slice(0, 4096),
            detail: (ev.detail ?? "").slice(0, 512), reason: (ev.reason ?? "unknown").slice(0, 64),
          }, ...items].slice(0, ACTIVITY_LIMIT));
          setStatus(tr("st.popupBlocked", { url: ev.url ?? "" }));
          break;
        case "shortcut":
          if (ev.key) shortcutRef.current(ev.key);
          break;
        case "focus": {
          // Split view: clicking into a pane focuses it (toolbar/address bar follow the active tab).
          const sp = splitRef.current;
          const cur = tabsRef.current.find(t => t.active);
          if (sp && (id === sp.a || id === sp.b) && cur && cur.id !== id && (cur.id === sp.a || cur.id === sp.b)) call("switch_tab", { id });
          break;
        }
        case "zoom-changed": {
          const z = ev.zoom;
          if (!validZoom(z)) break;
          setTabZoom(m => ({ ...m, [id]: z }));
          const t = tabsRef.current.find(x => x.id === id);
          const host = t && isWebUrl(t.url) ? hostOf(t.url) : "";
          if (host) setZoomBySite(m => {
            const r = Math.round(z * 100) / 100;
            if (Math.abs(r - 1) < 0.001) { if (!(host in m)) return m; const n = { ...m }; delete n[host]; return n; }
            return m[host] === r ? m : { ...m, [host]: r };
          });
          break;
        }
        case "find-result":
          setFind(f => ({ ...f, count: ev.count ?? 0, found: !!ev.isSuccess }));
          break;
        case "title-changed":
          if (ev.title) {
            const title = ev.title;
            setRustTabs(ts => ts.map(t => t.id === id ? { ...t, title } : t));
            const hid = lastHistoryByTab.current[id];
            if (hid) setHistory(h => h.map(x => x.id === hid ? { ...x, title } : x));
          }
          break;
      }
    });
    return () => { unTabs.then(f => f()); unEv.then(f => f()); unDl.then(f => f()); unFs.then(f => f()); };
  }, [applyTabs, upsertDownload]);

  // Aufraeumen von Zustand geschlossener Tabs
  useEffect(() => {
    const ids = new Set(rustTabs.map(t => t.id));
    setPinned(p => (p.every(x => ids.has(x)) ? p : p.filter(x => ids.has(x))));
    // Runde 3: schlafende Tabs bekommen beim Aufwecken eine neue Webview (Zoom 1)
    const asleep = rustTabs.filter(t => t.sleeping).map(t => t.id);
    if (asleep.some(i => i in tabZoomRef.current)) setTabZoom(m => { const n = { ...m }; asleep.forEach(i => delete n[i]); return n; });
    // Closing one pane ends split view
    setSplit(sp => (sp && (!ids.has(sp.a) || !ids.has(sp.b)) && restoreDone.current ? null : sp));
    if (rustTabs.length === 0 || !restoreDone.current) return;
    setTabGroupMap(m => (Object.keys(m).every(k => ids.has(k)) ? m : Object.fromEntries(Object.entries(m).filter(([k]) => ids.has(k)))));
  }, [rustTabs]);
  // Runde 3: leere Gruppen entfernen (erst nach Sitzungswiederherstellung)
  useEffect(() => {
    if (!restoreDone.current || rustTabs.length === 0) return;
    const used = new Set(Object.values(tabGroup));
    setGroups(gs => (gs.every(g => used.has(g.id)) ? gs : gs.filter(g => used.has(g.id))));
  }, [tabGroup, rustTabs.length]);

  // Auto-Gruppierung nach Domain
  useEffect(() => {
    if (!settings.autoGroupByDomain || !restoreDone.current) return;
    const ungrouped = uiTabsRef.current.filter(t => isWebUrl(t.url) && !t.internal && !t.sleeping && !t.groupId);
    if (ungrouped.length === 0) return;
    // A domain becomes a group only from its second tab; an existing group of that name is always joined.
    const count = new Map<string, number>();
    for (const t of ungrouped) { const h = groupHost(t.url); if (h) count.set(h, (count.get(h) ?? 0) + 1); }
    setGroups(gs => {
      const byName = new Map(gs.map(g => [g.name, g.id]));
      const newGroups = [...gs];
      const hostGroup: Record<string, string> = {};
      for (const t of ungrouped) {
        const h = groupHost(t.url);
        if (!h || (!byName.has(h) && (count.get(h) ?? 0) < 2)) continue;
        if (!byName.has(h)) {
          const g: TabGroup = { id: uid(), name: h, color: GROUP_COLORS[newGroups.length % GROUP_COLORS.length], collapsed: false };
          newGroups.push(g); byName.set(h, g.id);
        }
        hostGroup[t.id] = byName.get(h)!;
      }
      setTabGroupMap(m => {
        const n = { ...m };
        for (const t of ungrouped) { if (hostGroup[t.id]) n[t.id] = hostGroup[t.id]; }
        return n;
      });
      return newGroups;
    });
  }, [rustTabs, settings.autoGroupByDomain]);

  // ---- Content-Sichtbarkeit: native Webview liegt UEBER React ----
  // While the sidebar is resized the native webview is hidden so the drag keeps receiving pointer events.
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const splitActive = !!split && !!activeTab && (activeTab.id === split.a || activeTab.id === split.b)
    && rustTabs.some(t => t.id === split.a) && rustTabs.some(t => t.id === split.b);
  // Split view: Rust shows each pane by its own flag (set_layout); here only overlays hide everything.
  const contentVisible = !!activeTab && (splitActive || (!activeTab.internal && !activeTab.sleeping)) && popover === null && !sidebarResizing && !splitDragging && !overlay;
  useEffect(() => { call("set_content_visible", { visible: contentVisible }, onError); }, [contentVisible, activeTab?.id, rustTabs.length, onError]);

  // ---- Adblock-Schalter an Rust ----
  useEffect(() => { call("set_adblock_enabled", { enabled: settings.adblock }, onError); }, [settings.adblock, onError]);

  // ---- Theme ----
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const t = customTheme ? customTheme.mode : settings.theme === "system" ? (mq.matches ? "light" : "dark") : settings.theme;
      document.documentElement.dataset.theme = t;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme, customTheme]);

  // ---- Aktionen ----
  const setPage = useCallback((tabId: string | null, p: InternalPage | null) => {
    if (tabId) setInternal(m => ({ ...m, [tabId]: p }));
    else if (p) setOrphanPage(p);
  }, []);

  const newTab = useCallback(async (input?: string, opts?: { background?: boolean }) => {
    setPopover(null);
    const target = resolveInput(input ?? settings.startPage, settings.searchEngine, settings.bangs) ?? { kind: "internal" as const, page: "newtab" as InternalPage };
    const url = target.kind === "web" ? target.url : "about:blank";
    const opener = tabsRef.current.find(t => t.active)?.id;
    const background = opts?.background === true;
    const id = await call<string>("new_tab", { url, background }, onError);
    if (id && opener) {
      openerRef.current[id] = opener;
      if (settingsRef.current.newTabNextToCurrent !== false) {
        // Rust appends the tab; move it right after the tab it was opened from.
        const list = await call<RustTab[]>("list_tabs");
        if (list) {
          const ids = list.map(t => t.id).filter(x => x !== id);
          const at = ids.indexOf(opener);
          if (at >= 0 && at < ids.length - 1) {
            ids.splice(at + 1, 0, id);
            setRustTabs(list.map(t => t).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
            call("reorder_tabs", { order: ids }, m => console.warn(m));
          }
        }
      }
    }
    if (id && target.kind === "internal" && target.page !== "newtab") setPage(id, target.page);
    if (target.kind === "internal" && target.page === "newtab" && !background) setFocusTick(x => x + 1);
    return id;
  }, [settings.startPage, settings.searchEngine, settings.bangs, onError, setPage]);

  const openPageRef = useRef<(p: InternalPage) => void>(() => {});
  const switchTabRef = useRef<(id: string) => void>(() => {});
  const navigate = useCallback(async (input: string) => {
    setStatus("");
    setPopover(null);
    const target = resolveInput(input, settings.searchEngine, settings.bangs);
    if (!target) return;
    const active = tabsRef.current.find(t => t.active);
    if (target.kind === "internal") {
      // Runde 5: vorhandenen Tab dieser Seite fokussieren; sonst leeren/internen Tab umwidmen, sonst neuer Tab.
      const existing = target.page !== "newtab" ? uiTabsRef.current.find(t => t.internal === target.page) : undefined;
      if (existing) { if (!existing.active) switchTabRef.current(existing.id); return; }
      const cur = uiTabsRef.current.find(t => t.active);
      if (!cur || cur.internal) { setPage(active?.id ?? null, target.page); return; }
      openPageRef.current(target.page);
      return;
    }
    if (!active) { await call("new_tab", { url: target.url }, onError); return; }
    setPage(active.id, null);
    setNavError(null);
    const real = await call<string>("navigate_active", { url: target.url }, onError);
    if (real) setRustTabs(ts => ts.map(t => t.id === active.id ? { ...t, url: real } : t));
  }, [settings.searchEngine, settings.bangs, onError, setPage]);

  /**
   * Runde 5: interne Seiten oeffnen immer als eigener Tab (Singleton je Seite, ausser "Neuer Tab").
   * Ein solcher Tab ist ein normaler Rust-Tab mit about:blank, dessen native Webview versteckt bleibt
   * (contentVisible = false, siehe unten); Schliessen/Umsortieren/Sitzung wie bei jedem Tab.
   */
  const openPage = useCallback((p: InternalPage, opts?: { section?: string }) => {
    setPopover(null);
    if (p === "settings" && opts?.section) setSettingsSection(opts.section);
    if (p === "newtab") { newTab("jtech://newtab"); return; }
    const existing = uiTabsRef.current.find(t => t.internal === p);
    if (existing) { if (!existing.active) call("switch_tab", { id: existing.id }, onError); return; }
    if (pendingPages.current.has(p)) return;
    pendingPages.current.add(p);
    newTab(internalUrl(p)).finally(() => pendingPages.current.delete(p));
  }, [newTab, onError]);
  openPageRef.current = openPage;

  const [closedTabs, setClosedTabs] = useState<string[]>([]);
  /** URL to reopen a tab with (web URL or jtech:// page), null for an empty new tab */
  const reopenUrl = (id: string): string | null => {
    const ct = tabsRef.current.find(t => t.id === id);
    if (!ct) return null;
    const pg = internalRef.current[id];
    if (pg && pg !== "newtab") return internalUrl(pg);
    return isWebUrl(ct.url) ? ct.url : null;
  };
  const reopenRef = useRef<(urls: (string | null)[]) => void>(() => {});
  const closeTab = useCallback((id: string, silent = false) => {
    const ct = tabsRef.current.find(t => t.id === id);
    if (ct && isWebUrl(ct.url) && !internalRef.current[id]) { const u = ct.url; setClosedTabs(l => [u, ...l.filter(x => x !== u)].slice(0, 25)); }
    const url = reopenUrl(id);
    const opener = openerRef.current[id];
    delete openerRef.current[id];
    const back = !!ct?.active && !!opener && settingsRef.current.returnToOpener !== false && tabsRef.current.some(t => t.id === opener);
    setInternal(m => { const n = { ...m }; delete n[id]; return n; });
    call("close_tab", { id }, onError).then(() => { if (back) call("switch_tab", { id: opener }); });
    if (!silent && url) showToast(tr("undo.tabClosed"), () => reopenRef.current([url]));
  }, [onError, showToast]);

  const closeOtherTabs = useCallback((id: string) => {
    const list = tabsRef.current.filter(t => t.id !== id && !pinned.includes(t.id));
    const urls = list.map(t => reopenUrl(t.id));
    list.forEach(t => { setInternal(m => { const n = { ...m }; delete n[t.id]; return n; }); call("close_tab", { id: t.id }, onError); });
    if (list.length) showToast(tr("undo.tabsClosed", { count: list.length }), () => reopenRef.current(urls));
  }, [pinned, onError, showToast]);

  const switchTab = useCallback((id: string) => { setPopover(null); call("switch_tab", { id }, onError); }, [onError]);
  switchTabRef.current = switchTab;

  const orderedIds = useCallback(() => {
    const ids = tabsRef.current.map(t => t.id);
    return [...ids.filter(i => pinned.includes(i)), ...ids.filter(i => !pinned.includes(i))];
  }, [pinned]);

  const cycleTab = useCallback((dir: 1 | -1) => {
    const ids = orderedIds();
    if (ids.length < 2) return;
    const cur = ids.indexOf(tabsRef.current.find(t => t.active)?.id ?? "");
    switchTab(ids[(cur + dir + ids.length) % ids.length]);
  }, [orderedIds, switchTab]);

  const reorder = useCallback((ids: string[]) => {
    setRustTabs(ts => ids.map(i => ts.find(t => t.id === i)!).filter(Boolean));
    call("reorder_tabs", { order: ids }, onError);
  }, [onError]);

  const togglePin = useCallback((id: string) => {
    const next = pinned.includes(id) ? pinned.filter(x => x !== id) : [...pinned, id];
    setPinned(next);
    const ids = tabsRef.current.map(t => t.id);
    reorder([...ids.filter(i => next.includes(i)), ...ids.filter(i => !next.includes(i))]);
  }, [pinned, reorder]);

  const activeId = activeTab?.id ?? null;
  const activeInternalOverride = activeId ? internal[activeId] ?? null : null;

  const back = useCallback(() => {
    // Interne Seite ueber einer echten Seite: "Zurueck" kehrt zur Seite zurueck.
    if (activeId && activeInternalOverride && isWebUrl(activeTab?.url ?? "")) { setPage(activeId, null); return; }
    call("go_back", undefined, onError);
  }, [activeId, activeInternalOverride, activeTab?.url, onError, setPage]);
  const forward = useCallback(() => { call("go_forward", undefined, onError); }, [onError]);
  const reload = useCallback(() => {
    setNavError(null); setStatus("");
    if (activeTab && !activeTab.internal) call("reload_active", undefined, onError);
  }, [activeTab, onError]);
  const stop = useCallback(() => {
    if (activeId) { stoppedByUser.current[activeId] = true; clearTimeout(domTimers.current[activeId]); }
    call("stop_active", undefined, onError);
    if (activeId) setLoading(l => ({ ...l, [activeId]: false }));
  }, [activeId, onError]);
  const home = useCallback(() => { navigate(settings.startPage); }, [navigate, settings.startPage]);
  const focusAddressBar = useCallback(() => setFocusTick(x => x + 1), []);

  // ---- Runde 3: Zoom pro Seite ----
  const activeHost = activeTab && !activeTab.internal && !activeTab.sleeping && isWebUrl(activeTab.url) ? hostOf(activeTab.url) : "";
  useEffect(() => {
    if (!activeId || !activeHost) return;
    const want = zoomBySite[activeHost] ?? 1;
    const cur = tabZoomRef.current[activeId] ?? 1;
    if (Math.abs(want - cur) > 0.001) call("set_tab_zoom", { id: activeId, factor: want }, m => console.warn(m));
  }, [activeId, activeHost, zoomBySite]);
  const zoomStep = useCallback((dir: 1 | -1 | 0) => {
    if (!activeId || !activeHost) { setStatus(tr("st.zoomWebOnly")); return; }
    const cur = tabZoomRef.current[activeId] ?? zoomBySite[activeHost] ?? 1;
    const factor = dir === 0 ? 1 : nextZoom(cur, dir);
    setTabZoom(m => ({ ...m, [activeId]: factor }));
    setZoomBySite(m => { const n = { ...m }; if (factor === 1) delete n[activeHost]; else n[activeHost] = factor; return n; });
    call("set_tab_zoom", { id: activeId, factor }, onError);
  }, [activeId, activeHost, zoomBySite, onError]);
  const resetSiteZoom = useCallback((host: string) => setZoomBySite(m => { const n = { ...m }; delete n[host]; return n; }), []);

  // ---- Runde 3: Suchen / Drucken ----
  const isWebActive = !!activeTab && !activeTab.internal && !activeTab.sleeping;
  const openFind = useCallback(() => {
    if (!isWebActive) { setStatus(tr("st.findWebOnly")); return; }
    setFind(f => ({ ...f, open: true, tick: f.tick + 1 }));
  }, [isWebActive]);
  const findRun = useCallback((query: string, backwards = false) => {
    const q = query.slice(0, 300);
    setFind(f => ({ ...f, query: q, ...(q ? {} : { count: 0, found: false }) }));
    call("find_in_page", { query: q, backwards, caseSensitive: false }, onError);
  }, [onError]);
  const closeFind = useCallback(() => {
    setFind(f => (f.open ? { ...f, open: false, count: 0, found: false } : f));
    call("find_in_page", { query: "", backwards: false, caseSensitive: false });
  }, []);
  const findOpenRef = useRef(false);
  findOpenRef.current = find.open;
  useEffect(() => { if (findOpenRef.current) closeFind(); }, [activeId, closeFind]);
  const print = useCallback(() => {
    if (!isWebActive) { setStatus(tr("st.printWebOnly")); return; }
    call("print_active", undefined, onError);
  }, [isWebActive, onError]);

  // ---- Runde 3: Tab-Schlaf ----
  const prevActive = useRef<string | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (prevActive.current) lastActive.current[prevActive.current] = now;
    if (activeId) lastActive.current[activeId] = now;
    prevActive.current = activeId;
  }, [activeId]);
  const canSleep = (t: UiTab) => !t.active && !t.pinned && !t.sleeping && !t.playingAudio && isWebUrl(t.url)
    && !(splitRef.current && (splitRef.current.a === t.id || splitRef.current.b === t.id));
  const sleepTab = useCallback((id: string) => { call("sleep_tab", { id }, onError); }, [onError]);
  const sleepInactiveTabs = useCallback(() => {
    const list = uiTabsRef.current.filter(canSleep);
    list.forEach(t => call("sleep_tab", { id: t.id }, onError));
    setStatus(list.length ? tr("st.slept", { count: list.length }) : tr("st.nothingToSleep"));
  }, [onError]);
  const sleepMinutes = settings.tabSleepMinutes;
  useEffect(() => {
    if (!sleepMinutes || sleepMinutes <= 0) return;
    const tick = () => {
      const now = Date.now();
      for (const t of uiTabsRef.current) {
        if (!canSleep(t)) continue;
        const la = lastActive.current[t.id] ?? (lastActive.current[t.id] = now);
        if (now - la > sleepMinutes * 60_000) { lastActive.current[t.id] = now; call("sleep_tab", { id: t.id }); }
      }
    };
    const i = setInterval(tick, 30_000);
    return () => clearInterval(i);
  }, [sleepMinutes]);

  // ---- Runde 3: Downloads ----
  const downloadAction = useCallback((id: number, action: "pause" | "resume" | "cancel") => { call("download_action", { id, action }, onError); }, [onError]);
  const openDownload = useCallback((id: number, reveal: boolean) => { call("open_download", { id, reveal }, onError); }, [onError]);
  const removeDownload = useCallback((key: string) => setDownloads(l => l.filter(d => d.key !== key || d.state === "progressing")), []);
  const clearDownloads = useCallback(() => setDownloads(l => l.filter(d => d.state === "progressing")), []);

  // ---- Runde 3: Befehlspalette / Gruppen ----
  const openPalette = useCallback((mode: "all" | "commands" = "all") => { setPaletteMode(mode); setPopover("palette"); }, []);
  const createGroup = useCallback((tabId: string) => {
    const g: TabGroup = { id: uid(), name: tr("st.groupN", { n: groups.length + 1 }), color: GROUP_COLORS[groups.length % GROUP_COLORS.length], collapsed: false };
    setGroups(gs => [...gs, g]);
    setTabGroupMap(m => ({ ...m, [tabId]: g.id }));
  }, [groups.length]);
  const setTabGroup = useCallback((tabId: string, groupId: string | null) => setTabGroupMap(m => {
    const n = { ...m };
    if (groupId) n[tabId] = groupId; else delete n[tabId];
    return n;
  }), []);
  const updateGroup = useCallback((id: string, p: Partial<TabGroup>) => setGroups(gs => gs.map(g => g.id !== id ? g : {
    ...g,
    name: typeof p.name === "string" ? (p.name.trim().slice(0, 30) || g.name) : g.name,
    color: p.color && GROUP_COLORS.includes(p.color) ? p.color : g.color,
    collapsed: typeof p.collapsed === "boolean" ? p.collapsed : g.collapsed,
  })), []);
  const removeGroup = useCallback((id: string, closeTabs = false) => {
    const members = Object.entries(tabGroup).filter(([, g]) => g === id).map(([t]) => t);
    const group = groups.find(g => g.id === id);
    const urls = closeTabs ? members.map(reopenUrl) : [];
    if (closeTabs) members.forEach(t => call("close_tab", { id: t }, onError));
    setTabGroupMap(m => Object.fromEntries(Object.entries(m).filter(([, g]) => g !== id)));
    setGroups(gs => gs.filter(g => g.id !== id));
    if (group) showToast(closeTabs ? tr("undo.groupClosed", { name: group.name }) : tr("undo.groupDissolved", { name: group.name }), () => {
      if (closeTabs) { reopenRef.current(urls); return; }
      setGroups(gs => (gs.some(g => g.id === id) ? gs : [...gs, group]));
      setTabGroupMap(m => { const n = { ...m }; members.forEach(t => { if (tabsRef.current.some(x => x.id === t)) n[t] = id; }); return n; });
    });
  }, [tabGroup, groups, onError, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupTabsByDomain = useCallback(() => {
    const tabs = uiTabsRef.current.filter(t => isWebUrl(t.url) && !t.internal && !t.sleeping);
    const perHost = new Map<string, number>();
    for (const t of tabs) { const h = groupHost(t.url); if (h) perHost.set(h, (perHost.get(h) ?? 0) + 1); }
    const hosts = [...perHost.keys()].filter(h => (perHost.get(h) ?? 0) >= 2);
    setGroups(gs => {
      const byName = new Map(gs.map(g => [g.name, g.id]));
      const newGroups = [...gs];
      const hostGroup: Record<string, string> = {};
      for (const h of hosts) {
        if (byName.has(h)) hostGroup[h] = byName.get(h)!;
        else {
          const g: TabGroup = { id: uid(), name: h, color: GROUP_COLORS[newGroups.length % GROUP_COLORS.length], collapsed: false };
          newGroups.push(g);
          byName.set(h, g.id);
          hostGroup[h] = g.id;
        }
      }
      setTabGroupMap(m => {
        const n = { ...m };
        for (const t of tabs) { const h = groupHost(t.url); if (h && hostGroup[h]) n[t.id] = hostGroup[h]; }
        return n;
      });
      return newGroups;
    });
  }, []);

  const groupInternalTabs = useCallback(() => {
    const list = uiTabsRef.current.filter(t => t.internal && !t.pinned);
    if (!list.length) { setStatus(tr("st.noInternalTabs")); return; }
    const name = tr("st.internalGroup");
    setGroups(gs => {
      let g = gs.find(x => x.name === name);
      const out = g ? gs : [...gs, (g = { id: uid(), name, color: GROUP_COLORS[gs.length % GROUP_COLORS.length], collapsed: false })];
      const gid = g.id;
      setTabGroupMap(m => { const n = { ...m }; list.forEach(t => { n[t.id] = gid; }); return n; });
      return out;
    });
  }, []);

  // ---- Split view ----
  const splitRatio = splitLive ?? clampSplitRatio(settings.splitRatio);
  const splitVertical = settings.splitVertical === true;
  const openSplit = useCallback(async (withId?: string) => {
    setPopover(null);
    const cur = tabsRef.current.find(t => t.active);
    if (!cur) return;
    let other = withId && withId !== cur.id && tabsRef.current.some(t => t.id === withId) ? withId : undefined;
    if (!other) {
      // last used other tab
      other = tabsRef.current.filter(t => t.id !== cur.id).sort((x, y) => (lastActive.current[y.id] ?? 0) - (lastActive.current[x.id] ?? 0))[0]?.id;
    }
    if (!other) {
      other = await newTab();
      if (!other) return;
    }
    setSplit({ a: cur.id, b: other });
    // Focus the newly added pane
    call("switch_tab", { id: other }, onError);
  }, [newTab, onError]);
  const openInSplit = useCallback(async (url?: string, fromId?: string) => {
    setPopover(null);
    const cur = (fromId ? tabsRef.current.find(t => t.id === fromId) : undefined) ?? tabsRef.current.find(t => t.active);
    if (!cur) { await newTab(url); return; }
    const other = await newTab(url, { background: true });
    if (!other) return;
    setSplit({ a: cur.id, b: other });
    call("switch_tab", { id: other }, onError);
  }, [newTab, onError]);
  const closeSplit = useCallback(() => setSplit(null), []);
  const toggleSplit = useCallback(() => {
    if (splitRef.current && uiTabsRef.current.some(t => t.active && (t.id === splitRef.current!.a || t.id === splitRef.current!.b))) setSplit(null);
    else void openSplit();
  }, [openSplit]);
  const swapSplit = useCallback(() => setSplit(sp => (sp ? { a: sp.b, b: sp.a } : sp)), []);
  const toggleSplitOrientation = useCallback(() => setSettings(s => ({ ...s, splitVertical: !s.splitVertical })), []);
  const setSplitRatio = useCallback((r: number, live = false) => {
    const v = clampSplitRatio(r);
    if (live) { setSplitLive(v); return; }
    setSplitLive(null);
    setSettings(s => ({ ...s, splitRatio: Math.round(v * 1000) / 1000 }));
  }, []);

  const applySettings = useCallback((p: Partial<Settings>) => setSettings(s => ({
    ...s, ...p,
    bangs: normalizeBangs(p.bangs ?? s.bangs),
    shortcuts: p.shortcuts ? normalizeShortcuts(p.shortcuts) : s.shortcuts,
    effects: p.effects ? normalizeEffects(p.effects) : s.effects,
    sidebarWidth: clampSidebarWidth(p.sidebarWidth ?? s.sidebarWidth),
    language: normalizeLangSetting(p.language ?? s.language),
    splitRatio: clampSplitRatio(p.splitRatio ?? s.splitRatio),
    toolbar: p.toolbar ? normalizeToolbar(p.toolbar) : s.toolbar,
  })), []);
  const updateSettingsUndoable = useCallback((p: Partial<Settings>, msg: string) => {
    const cur = settingsRef.current;
    const prev = Object.fromEntries(Object.keys(p).map(k => [k, cur[k as keyof Settings]])) as Partial<Settings>;
    applySettings(p);
    showToast(msg, () => applySettings(prev));
  }, [applySettings, showToast]);
  const updateSettings = useCallback((p: Partial<Settings>) => {
    // Theme change: offer undo instead of asking first
    if (p.theme !== undefined && p.theme !== settingsRef.current.theme && Object.keys(p).length === 1) { updateSettingsUndoable(p, tr("undo.theme")); return; }
    applySettings(p);
  }, [applySettings, updateSettingsUndoable]);
  const applyPreset = useCallback((id: PresetId) => {
    updateSettingsUndoable(presetSettings(id, settingsRef.current), tr("undo.preset", { name: tr(`preset.${id}` as "preset.minimal") }));
  }, [updateSettingsUndoable]);
  const updateEffects = useCallback((p: Partial<EffectsSettings>) => setSettings(s => ({ ...s, effects: normalizeEffects({ ...s.effects, ...p }) })), []);

  // ---- Runde 5: Tastenkuerzel ----
  const bindings = useMemo(() => bindingMap(settings.shortcuts), [settings.shortcuts]);
  const bindingSig = [...bindings.keys()].sort().join(",");
  // Rust leitet nur diese Kombinationen aus Webseiten weiter (AcceleratorKeyPressed); alles andere bleibt bei der Seite.
  useEffect(() => { call("set_shortcuts", { keys: bindingSig ? bindingSig.split(",") : [] }, onError); }, [bindingSig, onError]);
  const keysFor = useCallback((id: string) => effectiveKeys(settings.shortcuts, id), [settings.shortcuts]);
  const keyHint = useCallback((id: string) => { const k = effectiveKeys(settings.shortcuts, id)[0]; return k ? formatCombo(k) : undefined; }, [settings.shortcuts]);
  const setShortcut = useCallback((id: string, keys: string[] | null) => setSettings(s => {
    const n = { ...s.shortcuts };
    if (keys === null) delete n[id]; else n[id] = keys.filter(validCombo);
    return { ...s, shortcuts: normalizeShortcuts(n) };
  }), []);

  // ---- Port: Audio-Hub / Design-Studio ----
  const setTabMuted = useCallback((id: string, muted: boolean) => {
    setRustTabs(ts => ts.map(t => t.id === id ? { ...t, muted } : t));
    call("set_tab_muted", { id, muted }, onError);
  }, [onError]);
  const customThemeRef = useRef(customTheme);
  customThemeRef.current = customTheme;
  const setCustomTheme = useCallback((t: ThemeSpec | null) => {
    const prev = customThemeRef.current;
    const next = t ? normalizeTheme(t) : null;
    setCustomThemeState(next);
    // Switching to another theme (not live edits of the same one) can be undone
    if ((prev?.id ?? null) !== (next?.id ?? null)) showToast(tr("undo.theme"), () => setCustomThemeState(prev));
  }, [showToast]);
  const saveTheme = useCallback((t: ThemeSpec) => {
    const n = normalizeTheme(t); if (!n) return;
    setSavedThemes(list => [n, ...list.filter(x => x.id !== n.id)].slice(0, 50));
  }, []);
  const removeTheme = useCallback((id: string) => setSavedThemes(list => list.filter(x => x.id !== id)), []);

  const isBookmarked = useCallback((url: string) => bookmarks.find(b => b.url === url), [bookmarks]);
  const addBookmark = useCallback((url: string, title: string) => {
    if (!isWebUrl(url)) return;
    setBookmarks(b => b.some(x => x.url === url) ? b : [...b, { id: uid(), url, title: title || url, createdAt: Date.now() }]);
  }, []);
  const updateBookmark = useCallback((id: string, p: Partial<Bookmark>) => setBookmarks(b => b.map(x => x.id === id ? { ...x, ...p } : x)), []);
  const removeBookmark = useCallback((id: string) => setBookmarks(b => {
    const i = b.findIndex(x => x.id === id);
    if (i < 0) return b;
    const item = b[i];
    showToast(tr("undo.bookmark", { name: item.title.slice(0, 40) }), () => setBookmarks(l => (l.some(x => x.id === id || x.url === item.url) ? l : [...l.slice(0, i), item, ...l.slice(i)])));
    return b.filter(x => x.id !== id);
  }), [showToast]);
  const removeHistory = useCallback((id: string) => setHistory(h => {
    const i = h.findIndex(x => x.id === id);
    if (i < 0) return h;
    const item = h[i];
    showToast(tr("undo.history"), () => setHistory(l => (l.some(x => x.id === id) ? l : [...l.slice(0, i), item, ...l.slice(i)])));
    return h.filter(x => x.id !== id);
  }), [showToast]);
  const clearHistory = useCallback(() => { setHistory([]); lastHistoryByTab.current = {}; }, []);

  // ---- Etappe CD / Runde 5: Kuerzel (UI-Webview und Rust AcceleratorKeyPressed) -> Befehl ----
  const storeRef = useRef<Store | null>(null);
  const runCommand = useCallback((id: string) => {
    const c = COMMAND_BY_ID.get(id), st = storeRef.current;
    if (!c || !st) return;
    if (c.when && !c.when(st)) return;
    c.run(st);
  }, []);
  shortcutRef.current = (key: string) => {
    let id = bindings.get(key);
    // "+" braucht auf manchen Layouts Umschalt: Strg+Umschalt+Plus wie Strg+Plus behandeln
    if (!id && key.endsWith("+shift+plus")) id = bindings.get(key.replace("+shift+plus", "+plus"));
    if (id) runCommand(id);
  };

  // ---- Etappe CD: Sitzung wiederherstellen (offene + angeheftete Tabs) ----
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || rustTabs.length === 0) return;
    restored.current = true;
    // Runde 5: auch interne Tabs (jtech://settings …) werden gespeichert/wiederhergestellt.
    const saved = settings.restoreSession
      ? load("session", [] as { url: string; pinned: boolean; group?: string; split?: "a" | "b" }[]).filter(x => x && typeof x.url === "string" && (isWebUrl(x.url) || !!parseInternal(x.url)))
      : [];
    if (!saved.length) { restoreDone.current = true; return; }
    const openSaved = async (url: string): Promise<string | undefined> => {
      const page = parseInternal(url);
      if (!page) return call<string>("new_tab", { url }, onError);
      const id = await call<string>("new_tab", { url: "about:blank" }, onError);
      if (id && page !== "newtab") setPage(id, page);
      return id;
    };
    (async () => {
      const first = rustTabs[0];
      const ids: (string | undefined)[] = [];
      const firstPage = parseInternal(saved[0].url);
      if (first && (first.url === "about:blank" || first.url === "")) {
        if (firstPage) { if (firstPage !== "newtab") setPage(first.id, firstPage); }
        else await call("navigate_active", { url: saved[0].url }, onError);
        ids.push(first.id);
      } else ids.push(await openSaved(saved[0].url));
      for (const s of saved.slice(1)) ids.push(await openSaved(s.url));
      setPinned(saved.map((s, i) => (s.pinned ? ids[i] : undefined)).filter((x): x is string => !!x));
      // Runde 3: Gruppen-Zugehoerigkeit wiederherstellen
      const map: Record<string, string> = {};
      saved.forEach((s, i) => { const id = ids[i]; if (id && typeof s.group === "string") map[id] = s.group; });
      setTabGroupMap(map);
      // Split view pair
      const ia = saved.findIndex(s => s.split === "a"), ib = saved.findIndex(s => s.split === "b");
      const sa = ia >= 0 ? ids[ia] : undefined, sb = ib >= 0 ? ids[ib] : undefined;
      if (sa && sb && sa !== sb) setSplit({ a: sa, b: sb });
      restoreDone.current = true;
    })();
  }, [rustTabs, onError]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!restored.current) return;
    const sessUrl = (t: UiTab) => (t.internal && t.internal !== "newtab" && !isWebUrl(t.url) ? internalUrl(t.internal) : isWebUrl(t.url) ? t.url : null);
    save("session", tabs.filter(t => sessUrl(t)).sort((a, b) => Number(b.pinned) - Number(a.pinned)).map(t => ({ url: sessUrl(t)!, pinned: t.pinned, ...(t.groupId ? { group: t.groupId } : {}),
      ...(split?.a === t.id ? { split: "a" } : split?.b === t.id ? { split: "b" } : {}) })));
  }, [tabs, split]);

  const store: Store = {
    tabs: [...tabs.filter(t => t.pinned), ...tabs.filter(t => !t.pinned)],
    activeTab, activePage, totalBlocked, navError, status, activity, clearActivity: () => setActivity([]), settings, bookmarks, history, popover, focusTick,
    setStatus, dismissError: () => setNavError(null), setPopover, updateSettings, sidebarResizing, setSidebarResizing, fullscreen,
    newTab, closeTab, closeOtherTabs, switchTab, cycleTab, togglePin, reorder, navigate, openPage,
    back, forward, reload, stop, home, focusAddressBar,
    isBookmarked, addBookmark, updateBookmark, removeBookmark, removeHistory, clearHistory,
    setTabMuted, customTheme, savedThemes, setCustomTheme, saveTheme, removeTheme,
    downloads, downloadAction, openDownload, removeDownload, clearDownloads,
    zoomBySite, zoomStep, resetSiteZoom, find, openFind, closeFind, findRun, print,
    sleepTab, sleepInactiveTabs, runShortcut: (k: string) => shortcutRef.current(k),
    paletteMode, openPalette, groups, createGroup, setTabGroup, updateGroup, removeGroup, groupTabsByDomain, groupInternalTabs,
    split, splitActive, splitRatio, splitVertical, splitDragging, setSplitDragging, openSplit, openInSplit, closeSplit, toggleSplit, swapSplit, toggleSplitOrientation, setSplitRatio,
    overlay, setOverlay, closedTabs,
    toast, showToast, dismissToast, updateSettingsUndoable, applyPreset,
    reopenClosedTab: () => { const [u, ...rest] = closedTabs; if (u) { setClosedTabs(rest); newTab(u); } else setStatus(tr("st.noClosedTab")); },
    settingsSection, setSettingsSection, updateEffects, runCommand, bindings, keysFor, keyHint, setShortcut,
  };
  storeRef.current = store;
  reopenRef.current = (urls) => { for (const u of urls) void newTab(u ?? undefined); };
  return <I18nProvider lang={lang}><Ctx.Provider value={store}>{children}</Ctx.Provider></I18nProvider>;
}
