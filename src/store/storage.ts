import { invoke } from "@tauri-apps/api/core";

/**
 * Runde 4: Persistenz liegt in Rust (SQLite, Tabelle kv). Die UI arbeitet weiter synchron mit
 * load/save auf einem Cache, der vor dem ersten Render per initStorage() gefuellt wird.
 * Schreiben geht entprellt an `storage_set`; ohne Rust-Speicher bleibt Persistenz deaktiviert.
 * Beim ersten Start mit SQLite werden die vorhandenen localStorage-Daten einmalig importiert
 * (localStorage bleibt als Sicherung unveraendert liegen).
 */
/** Muss zu storage::KV_KEYS in Rust passen. */
export const KV_KEYS = ["settings", "bookmarks", "history", "customTheme", "savedThemes", "zoom", "groups", "downloads", "session", "startBg", "activity"] as const;

const cache = new Map<string, string>();
const PREFIX = "jtech."; // ausschließlich für den einmaligen Import vorhandener Daten
let backend: "rust" | "unavailable" = "unavailable";
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingValues = new Map<string, string>();

interface Snapshot { available: boolean; migrated: boolean; entries: Record<string, string> }

function readLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const k of KV_KEYS) {
      const v = localStorage.getItem(PREFIX + k);
      if (v != null) out[k] = v;
    }
  } catch { /* blockiert */ }
  return out;
}

export async function initStorage(): Promise<void> {
  try {
    const snap = await invoke<Snapshot>("storage_load");
    if (!snap.available) throw new Error("Rust-Speicher nicht verfuegbar");
    let entries = snap.entries;
    if (!snap.migrated) {
      const local = readLocal();
      const n = await invoke<number>("storage_import", { entries: local });
      console.info(`localStorage -> SQLite: ${n} Eintraege migriert`);
      entries = { ...local, ...entries };
    }
    for (const [k, v] of Object.entries(entries)) cache.set(k, v);
    backend = "rust";
  } catch (e) {
    console.error("Rust-Speicher nicht verfuegbar; persistente Daten bleiben deaktiviert:", e);
    backend = "unavailable";
  }
}

export const storageBackend = () => backend;

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = cache.get(key) ?? null;
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) return { ...fallback, ...v };
    return v as T;
  } catch { return fallback; }
}

function writeNow(key: string) {
  const v = pendingValues.get(key);
  pendingValues.delete(key);
  timers.delete(key);
  if (v === undefined) return;
  invoke("storage_set", { key, value: v }).catch(e => {
    console.error(`storage_set ${key}:`, e);
  });
}

export function save(key: string, value: unknown) {
  let json: string;
  try { json = JSON.stringify(value) ?? "null"; } catch { return; }
  if (cache.get(key) === json) return;
  cache.set(key, json);
  if (backend !== "rust") return;
  pendingValues.set(key, json);
  if (!timers.has(key)) timers.set(key, setTimeout(() => writeNow(key), 400));
}

/** Alle ausstehenden Schreibvorgaenge sofort senden (z. B. beim Schliessen). */
export function flushStorage() {
  for (const [k, t] of timers) { clearTimeout(t); writeNow(k); }
}

if (typeof window !== "undefined") window.addEventListener("beforeunload", flushStorage);
