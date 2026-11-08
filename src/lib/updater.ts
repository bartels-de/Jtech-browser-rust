import { useSyncExternalStore } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Auto-update via tauri-plugin-updater: signed releases (latest.json) from the GitHub repo.
 * Small global store shared by Settings > About JTech and the update notification bar.
 */
export type UpdatePhase = "idle" | "checking" | "uptodate" | "available" | "downloading" | "ready" | "installing" | "error";

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  version?: string;
  date?: string;
  notes?: string;
  /** 0..1, undefined = size unknown */
  progress?: number;
  downloaded: number;
  total?: number;
  error?: string;
  lastCheck?: number;
  /** Version whose notification bar the user dismissed */
  dismissed?: string;
}

let state: UpdateState = { phase: "idle", currentVersion: "", downloaded: 0 };
let pending: Update | null = null;
const subs = new Set<() => void>();
const set = (p: Partial<UpdateState>) => { state = { ...state, ...p }; subs.forEach(f => f()); };

getVersion().then(v => set({ currentVersion: v })).catch(() => {});

export function useUpdater(): UpdateState {
  return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => state);
}

/** Technical error -> user-facing German message (the UI is German). */
export function explainUpdateError(e: unknown): string {
  const raw = String((e as { message?: string })?.message ?? e ?? "");
  const m = raw.toLowerCase();
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return "Keine Internetverbindung – bitte später erneut versuchen.";
  if (m.includes("signature") || m.includes("signatur") || m.includes("minisign") || m.includes("pubkey") || m.includes("public key") || m.includes("base64") || m.includes("different key"))
    return "Die Signatur des Updates ist ungültig oder der öffentliche Schlüssel fehlt. Das Update wurde aus Sicherheitsgründen nicht installiert.";
  if (m.includes("not allowed") || (m.includes("plugin") && m.includes("not found")))
    return "Der Updater ist in diesem Build nicht verfügbar.";
  if (m.includes("platform") && (m.includes("not found") || m.includes("missing")))
    return "Das neueste Release enthält kein Paket für Windows.";
  if (m.includes("valid release json") || m.includes("release json") || m.includes("404") || m.includes("not found"))
    return "Es wurde noch kein Update veröffentlicht (kein Release mit latest.json gefunden).";
  if (m.includes("error sending request") || m.includes("dns") || m.includes("connect") || m.includes("timed out") || m.includes("timeout") || m.includes("network"))
    return "Update-Server nicht erreichbar – Internetverbindung prüfen.";
  return `Update fehlgeschlagen: ${raw || "unbekannter Fehler"}`;
}

/** Checks for updates. silent = background check (errors are not surfaced as an error state). */
export async function checkForUpdate(silent = false): Promise<void> {
  if (["checking", "downloading", "installing"].includes(state.phase)) return;
  if (state.phase === "ready" && pending) return;
  set({ phase: "checking", error: undefined });
  try {
    const u = await check({ timeout: 30000 });
    if (pending && pending !== u) { pending.close().catch(() => {}); }
    pending = u;
    if (!u) { set({ phase: "uptodate", lastCheck: Date.now(), version: undefined, notes: undefined }); return; }
    set({ phase: "available", version: u.version, date: u.date, notes: u.body ?? "", lastCheck: Date.now(), progress: 0, downloaded: 0, total: undefined });
  } catch (e) {
    set({ phase: silent ? "idle" : "error", error: explainUpdateError(e), lastCheck: Date.now() });
  }
}

/** Downloads the found update (the plugin verifies the signature). */
export async function downloadUpdate(): Promise<void> {
  if (!pending || state.phase !== "available") return;
  set({ phase: "downloading", progress: 0, downloaded: 0, total: undefined, error: undefined });
  let done = 0, total: number | undefined;
  try {
    await pending.download(ev => {
      if (ev.event === "Started") { total = ev.data.contentLength || undefined; set({ total, progress: total ? 0 : undefined }); }
      else if (ev.event === "Progress") { done += ev.data.chunkLength; set({ downloaded: done, progress: total ? Math.min(1, done / total) : undefined }); }
      else if (ev.event === "Finished") set({ progress: 1 });
    });
    set({ phase: "ready", progress: 1 });
  } catch (e) {
    set({ phase: "error", error: explainUpdateError(e) });
  }
}

/** Installs the downloaded update and relaunches JTech. */
export async function installAndRestart(): Promise<void> {
  if (!pending || state.phase !== "ready") return;
  set({ phase: "installing", error: undefined });
  try {
    await invoke("prepare_update_exit").catch(() => {});
    await pending.install();
    await relaunch();
  } catch (e) {
    set({ phase: "error", error: explainUpdateError(e) });
  }
}

export function dismissUpdateBar(): void { set({ dismissed: state.version }); }

export function fmtBytes(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.round(n / 1024)} KB`;
}
