import { invoke } from "@tauri-apps/api/core";
import { localizeBackend, t, type TKey } from "../i18n";

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
    console.error(`${cmd}: ${String(e)}`);
    // Known backend messages are shown localized; technical ones keep the command name as context.
    const raw = String(e);
    const loc = localizeBackend(raw);
    onError?.(loc !== raw ? loc : `${cmd}: ${raw}`);
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

const PERMISSION_KINDS = new Set(["microphone", "camera", "geolocation", "notifications", "other-sensors", "clipboard-read", "multiple-downloads", "file-read-write", "autoplay", "local-fonts", "midi-sysex", "window-management", "unknown"]);
/** Localized name of a website permission kind (unknown kinds are shown raw). */
export const permissionLabel = (kind: string): string => (PERMISSION_KINDS.has(kind) ? t(`perm.${kind}` as TKey) : kind);

/** Host einer URL ohne "www." (fuer Allowlist/Cookies); null bei internen Seiten. */
export function siteOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}

/** Extensions: payload of ext_list / ext_toggle / ext_site_toggle (see docs/EXTENSIONS.md). */
export interface ExtInfo {
  id: string; version: string; name: string; description: string; author: string; license: string;
  iconSvg?: string | null; permissions: string[]; matches: string[]; source: string;
  enabled: boolean; compatible: boolean; error?: string | null; minBrowser?: string | null;
  siteOff: string[]; blocked: number; updateVersion?: string | null;
}

/** Extensions: payload of market_fetch. */
export interface MarketEntry {
  id: string; version: string; installedVersion?: string | null; minBrowser?: string | null;
  name: string; description: string; author: string; license: string;
  status: "installed" | "available" | "update-in-next-release" | "incompatible" | "not-bundled";
  enabled: boolean;
}
export interface MarketResult { fetchedAt: number; indexUrl: string; hotfixInstallEnabled: boolean; entries: MarketEntry[]; }

// ---- i18n helpers for backend payloads ----
const FILTER_STATES = new Set(["idle", "loading", "building", "ready", "error", "empty"]);
/** Localized label of FilterStatus.state. */
export const filterStateLabel = (s: string): string => (FILTER_STATES.has(s) ? t(`fs.${s}` as TKey) : s);
const LIST_NOTES = new Set(["easylist", "easyprivacy", "ublock-filters", "ublock-privacy", "peter-lowe", "fanboy-annoyance"]);
/** Localized note of a built-in filter list (Rust sends German notes); unknown ids keep the backend text. */
export const filterListNote = (id: string, fallback: string): string => (LIST_NOTES.has(id) ? t(`fs.note.${id}` as TKey) : fallback);
