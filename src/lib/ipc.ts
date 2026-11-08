import { invoke } from "@tauri-apps/api/core";

/** Tab-Zustand, wie ihn Rust (list_tabs / tabs-changed) liefert. */
export interface RustTab { id: string; title: string; url: string; active: boolean; blocked?: number; playingAudio?: boolean; muted?: boolean; sleeping?: boolean; }

export interface TabEvent {
  tabId: string;
  kind: string;
  url?: string | null;
  title?: string | null;
  isSuccess?: boolean | null;
  webErrorStatus?: number | null;
  errorName?: string | null;
  detail?: string | null;
  navigationId?: number | null;
  stale?: boolean | null;
  benign?: boolean | null;
  canGoBack?: boolean | null;
  canGoForward?: boolean | null;
  key?: string | null;
  playingAudio?: boolean | null;
  muted?: boolean | null;
  /** Runde 3 */
  zoom?: number | null;
  count?: number | null;
}

/** Runde 3: Payload von "download-event" / list_downloads. */
export interface DownloadInfo {
  id: number; tabId: string; url: string; path: string; fileName: string;
  received: number; total: number; state: "progressing" | "interrupted" | "completed";
  paused: boolean; canResume: boolean; interruptReason: number; startedAt: number;
}

/** invoke mit Fehlerbehandlung: Fehler landen im Log und in onError. */
export async function call<T>(cmd: string, args?: Record<string, unknown>, onError?: (msg: string) => void): Promise<T | undefined> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    const msg = `${cmd}: ${String(e)}`;
    console.error(msg);
    onError?.(msg);
    return undefined;
  }
}

// ---------- Runde 4 ----------

export interface FilterListStatus {
  id: string; name: string; url: string; note: string; enabled: boolean;
  lastUpdated: number; lastAttempt: number; rules: number; bytes: number; error?: string | null; cached: boolean;
}
export interface FilterStatus {
  state: "idle" | "loading" | "building" | "ready" | "error" | "empty";
  message: string; lists: FilterListStatus[]; activeRules: number; engineBuiltAt: number;
  fromCache: boolean; updateDays: number; cosmetic: boolean; allowlist: string[];
}
export interface Count { name: string; count: number }
export interface PrivacyStats { lifetimeTotal: number; sessionTotal: number; topSites: Count[]; topDomains: Count[]; sessionTopDomains: Count[] }
export interface CookieInfo { name: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; session: boolean; sameSite: number }
export interface PermissionRequest { id: number; tabId: string; origin: string; kind: string; userInitiated: boolean }
export interface PermissionEntry { origin: string; kind: string; state: "allow" | "deny"; updated: number }
export interface PrivacyOptions { clearCookiesOnExit: boolean; clearCacheOnExit: boolean }

export const PERMISSION_LABELS: Record<string, string> = {
  microphone: "Mikrofon", camera: "Kamera", geolocation: "Standort", notifications: "Benachrichtigungen",
  "other-sensors": "Bewegungssensoren", "clipboard-read": "Zwischenablage lesen", "multiple-downloads": "Mehrere Downloads",
  "file-read-write": "Dateien lesen/schreiben", autoplay: "Automatische Wiedergabe", "local-fonts": "Lokale Schriften",
  "midi-sysex": "MIDI-Geräte", "window-management": "Fensterverwaltung", unknown: "Unbekannte Berechtigung",
};

/** Host einer URL ohne "www." (fuer Allowlist/Cookies); null bei internen Seiten. */
export function siteOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}
