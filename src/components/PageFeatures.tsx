import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBrowser } from "../store/BrowserStore";
import { call, siteOf, type TabEvent } from "../lib/ipc";
import { applyMediaEvent, mediaStore, setThrottle, throttleStore, type BridgeEvent } from "../lib/bridge";
import { COMMAND_BY_ID } from "../lib/commands";
import { isWebUrl } from "../lib/urls";
import { normalizeLimits, normalizeRadial } from "../store/types";
import { openRadialAt } from "./RadialMenu";
import { openPeek } from "./PeekPanel";

/** Page bridge events (radial menu trigger, Shift+click peek, media session) + options to Rust. */
function usePageBridge() {
  const b = useBrowser();
  const radial = normalizeRadial(b.settings.radial, id => COMMAND_BY_ID.has(id));
  const radialMouse = radial.enabled && radial.trigger !== "keyboard";
  const peek = b.settings.peekEnabled !== false;
  useEffect(() => { call("set_bridge_options", { radialMouse, peek }); }, [radialMouse, peek]);
  const zoomRef = useRef<Record<string, number>>({});
  zoomRef.current = Object.fromEntries(b.tabs.map(t => [t.id, t.zoom]));
  useEffect(() => {
    const un = listen<BridgeEvent>("page-bridge", ({ payload: ev }) => {
      if (ev.kind === "media") applyMediaEvent(ev);
      else if (ev.kind === "peek" && ev.url) openPeek(ev.url);
      else if (ev.kind === "radial" && typeof ev.x === "number" && typeof ev.y === "number") {
        const z = zoomRef.current[ev.tabId] ?? 1;
        openRadialAt((ev.rectX ?? 0) + ev.x * z, (ev.rectY ?? 0) + ev.y * z, "mouse");
      }
    });
    return () => { un.then(f => f()); };
  }, []);
  // forget media info of closed tabs
  const ids = b.tabs.map(t => t.id).join(",");
  useEffect(() => {
    const live = new Set(ids.split(","));
    mediaStore.set(m => (Object.keys(m).some(k => !live.has(k)) ? Object.fromEntries(Object.entries(m).filter(([k]) => live.has(k))) : m));
  }, [ids]);
}

/** Audio hub: sites on the always-mute list are muted when a tab shows them (once per tab + site). */
function useAudioRules() {
  const b = useBrowser();
  const list = b.settings.audioMuteSites ?? [];
  const applied = useRef<Record<string, string>>({});
  const sig = b.tabs.map(t => t.id + "=" + t.url).join("|");
  useEffect(() => {
    if (!list.length) return;
    for (const t of b.tabs) {
      if (t.internal || t.sleeping) continue;
      const site = siteOf(t.url);
      if (!site || applied.current[t.id] === site) continue;
      if (list.some(s => site === s || site.endsWith("." + s))) {
        applied.current[t.id] = site;
        if (!t.muted) b.setTabMuted(t.id, true);
      }
    }
  }, [sig, list.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
}

interface Proc { pid: number; memoryBytes: number; cpuTime100ns: number }
interface PerfStats { totalMemoryBytes: number; processes: Proc[] }

/**
 * Resource limits (Settings › Performance limits). WebView2 offers no hard per-tab memory or CPU cap,
 * so the policy uses what it does offer: MemoryUsageTargetLevel LOW for background tabs, TrySuspend
 * for idle background tabs, and the existing tab sleep (webview closed) when the total memory of all
 * browser processes exceeds the cap. Pinned, audio, split-view and active tabs are never touched.
 */
function useResourceLimits() {
  const b = useBrowser();
  const lim = normalizeLimits(b.settings.limits);
  const lastActive = useRef<Record<string, number>>({});
  const cpuPrev = useRef<{ t: number; cpu: number } | null>(null);
  const cpuHigh = useRef(0);
  const stateRef = useRef({ b, lim });
  stateRef.current = { b, lim };
  const activeId = b.activeTab?.id;

  useEffect(() => {
    if (activeId) {
      lastActive.current[activeId] = Date.now();
      const th = throttleStore.get()[activeId];
      if (th?.low) call("set_tab_memory_target", { id: activeId, low: false });
      if (th) setThrottle(activeId, { low: false, suspended: false });
    }
  }, [activeId]);

  // results of TrySuspend / memory target from Rust
  useEffect(() => {
    const un = listen<TabEvent>("tab-event", ({ payload: ev }) => {
      if (ev.kind === "suspended") setThrottle(ev.tabId, { suspended: !!ev.isSuccess });
      else if (ev.kind === "throttle") setThrottle(ev.tabId, { low: ev.detail === "low" });
      else if (ev.kind === "navigation-starting") { if (throttleStore.get()[ev.tabId]?.suspended) setThrottle(ev.tabId, { suspended: false }); }
    });
    return () => { un.then(f => f()); };
  }, []);

  useEffect(() => {
    if (!lim.enabled) {
      // limits switched off: restore normal memory targets
      for (const [id, s] of Object.entries(throttleStore.get())) if (s.low) call("set_tab_memory_target", { id, low: false });
      throttleStore.set({});
      return;
    }
    const tick = async () => {
      const { b, lim } = stateRef.current;
      const now = Date.now();
      const sp = b.split;
      const eligible = b.tabs.filter(t => !t.active && !t.pinned && !t.sleeping && !t.playingAudio && !t.internal && isWebUrl(t.url)
        && !(sp && (sp.a === t.id || sp.b === t.id)));
      const th = throttleStore.get();
      for (const t of eligible) {
        lastActive.current[t.id] ??= now;
        if (lim.lowMemoryBackground && !th[t.id]?.low) call("set_tab_memory_target", { id: t.id, low: true });
        if (lim.suspendAfterMin > 0 && !th[t.id]?.suspended && now - lastActive.current[t.id] > lim.suspendAfterMin * 60_000) call("suspend_tab", { id: t.id });
      }
      if (lim.globalMemoryMb <= 0 && lim.cpuThreshold <= 0) return;
      const s = await call<PerfStats>("get_performance_stats");
      if (!s) return;
      if (lim.globalMemoryMb > 0 && s.totalMemoryBytes > lim.globalMemoryMb * 1024 * 1024) {
        const victim = [...eligible].sort((x, y) => (lastActive.current[x.id] ?? 0) - (lastActive.current[y.id] ?? 0))[0];
        if (victim) call("sleep_tab", { id: victim.id });
      }
      if (lim.cpuThreshold > 0) {
        const cpu = s.processes.reduce((a, p) => a + p.cpuTime100ns, 0), t = performance.now();
        const prev = cpuPrev.current;
        cpuPrev.current = { t, cpu };
        if (prev && t > prev.t) {
          const pct = ((cpu - prev.cpu) / ((t - prev.t) * 10000)) * 100;
          cpuHigh.current = pct > lim.cpuThreshold ? cpuHigh.current + 1 : 0;
          if (cpuHigh.current >= 2) {
            cpuHigh.current = 0;
            for (const x of eligible) if (!throttleStore.get()[x.id]?.suspended) call("suspend_tab", { id: x.id });
          }
        }
      }
    };
    tick();
    const i = setInterval(tick, 20_000);
    return () => clearInterval(i);
  }, [lim.enabled]);
}

/** Mounted once in the shell. */
export function PageFeatures() {
  usePageBridge();
  useAudioRules();
  useResourceLimits();
  return null;
}
