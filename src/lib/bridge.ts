import { useSyncExternalStore } from "react";

/**
 * Small module stores for data that arrives from Rust events outside the main store:
 * media session info (page bridge), resource-limit state per tab, peek panel state.
 */
function createStore<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next: T | ((v: T) => T)) {
      value = typeof next === "function" ? (next as (v: T) => T)(value) : next;
      subs.forEach(f => f());
    },
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
    use(): T { return useSyncExternalStore(this.subscribe, this.get); },
  };
}

/** Payload of the "page-bridge" event (see src-tauri/src/pagebridge.rs). */
export interface BridgeEvent {
  tabId: string; kind: "radial" | "peek" | "media" | "equalizer";
  x?: number | null; y?: number | null; rectX?: number | null; rectY?: number | null;
  url?: string | null; state?: string | null; title?: string | null; artist?: string | null; album?: string | null;
  artwork?: string | null; canNext?: boolean | null; canPrev?: boolean | null; volume?: number | null;
}

export interface MediaInfo {
  state: "playing" | "paused" | "none";
  title: string; artist: string; album: string; artwork: string;
  canNext: boolean; canPrev: boolean;
  /** -1 = untouched */
  volume: number;
  updated: number;
  equalizerStatus?: "ready" | "waiting" | "unsupported" | "error";
}
export const mediaStore = createStore<Record<string, MediaInfo>>({});

export function applyMediaEvent(ev: BridgeEvent) {
  const state = ev.state === "playing" || ev.state === "paused" ? ev.state : "none";
  mediaStore.set(m => ({
    ...m,
    [ev.tabId]: {
      state, title: ev.title ?? "", artist: ev.artist ?? "", album: ev.album ?? "", artwork: ev.artwork ?? "",
      canNext: !!ev.canNext, canPrev: !!ev.canPrev, volume: typeof ev.volume === "number" ? ev.volume : -1, updated: Date.now(),
      equalizerStatus: m[ev.tabId]?.equalizerStatus,
    },
  }));
}

export function applyEqualizerEvent(ev: BridgeEvent) {
  const status = ev.state;
  if (status !== "ready" && status !== "waiting" && status !== "unsupported" && status !== "error") return;
  mediaStore.set(m => {
    const current = m[ev.tabId] ?? {
      state: "none" as const, title: "", artist: "", album: "", artwork: "",
      canNext: false, canPrev: false, volume: -1, updated: Date.now(),
    };
    return { ...m, [ev.tabId]: { ...current, equalizerStatus: status } };
  });
}

/** Resource limits: what was applied to a tab. */
export interface ThrottleState { low: boolean; suspended: boolean }
export const throttleStore = createStore<Record<string, ThrottleState>>({});
export function setThrottle(id: string, p: Partial<ThrottleState>) {
  throttleStore.set(m => {
    const cur = m[id] ?? { low: false, suspended: false };
    const next = { ...cur, ...p };
    if (next.low === cur.low && next.suspended === cur.suspended && m[id]) return m;
    return { ...m, [id]: next };
  });
}

export interface PeekState { open: boolean; url: string; title: string; }
export const peekStore = createStore<PeekState>({ open: false, url: "", title: "" });
