/**
 * Runde 3: Vorschlaege fuer Adressleiste und Befehlspalette (Port-Idee aus Standardprojekt app.js).
 * Reine Funktionen, Daten kommen aus dem Store (Verlauf, Lesezeichen, Tabs, Bangs).
 */
import { BUILTIN_BANGS, INTERNAL_PAGES, INTERNAL_TITLES, hostOf, internalUrl, type Bang } from "./urls";
import type { Bookmark, HistoryEntry, UiTab } from "../store/types";

export type SuggestKind = "go" | "bang" | "page" | "bookmark" | "history" | "tab" | "command";
export interface Suggestion {
  key: string;
  kind: SuggestKind;
  title: string;
  /** Anzeige rechts (URL/Host/Tastenkuerzel) */
  hint?: string;
  /** Wert fuer die Adressleiste / Navigation */
  value?: string;
  /** Bang: nur in das Feld uebernehmen statt sofort navigieren */
  fill?: boolean;
  tabId?: string;
  commandId?: string;
}

const norm = (s: string) => s.toLowerCase();
/** Alle Woerter der Anfrage muessen im Text vorkommen. */
export function matches(query: string, ...fields: string[]): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(fields.join(" "));
  return words.every(w => hay.includes(w));
}

/** Verlauf zu eindeutigen URLs verdichten, nach Haeufigkeit + Aktualitaet sortiert. */
export function rankHistory(history: HistoryEntry[], query: string, limit: number): HistoryEntry[] {
  const byUrl = new Map<string, { e: HistoryEntry; n: number }>();
  for (const e of history) {
    if (!matches(query, e.title, e.url)) continue;
    const cur = byUrl.get(e.url);
    if (cur) cur.n++; else byUrl.set(e.url, { e, n: 1 });
    if (byUrl.size > 400) break;
  }
  const now = Date.now();
  const score = (x: { e: HistoryEntry; n: number }) => {
    const days = (now - x.e.visitedAt) / 86_400_000;
    const hostHit = hostOf(x.e.url).startsWith(norm(query)) ? 5 : 0;
    return Math.log2(1 + x.n) * 3 - Math.min(days, 60) * 0.1 + hostHit;
  };
  return [...byUrl.values()].sort((a, b) => score(b) - score(a)).slice(0, limit).map(x => x.e);
}

export function addressSuggestions(text: string, d: { history: HistoryEntry[]; bookmarks: Bookmark[]; bangs: Bang[]; tabs: UiTab[] }): Suggestion[] {
  const q = text.trim();
  if (!q) return [];
  const out: Suggestion[] = [];
  if (q.startsWith("!")) {
    const m = /^!(\S*)(\s.*)?$/.exec(q);
    const trig = norm(m?.[1] ?? "");
    if (m && m[2] === undefined) {
      const all = [...d.bangs, ...BUILTIN_BANGS.filter(b => !d.bangs.some(c => c.trigger === b.trigger))];
      for (const b of all.filter(b => b.trigger.startsWith(trig)).slice(0, 6))
        out.push({ key: "bang:" + b.trigger, kind: "bang", title: "!" + b.trigger, hint: hostOf(b.urlTemplate), value: "!" + b.trigger + " ", fill: true });
    }
  }
  out.unshift({ key: "go", kind: "go", title: q, value: q });
  for (const p of INTERNAL_PAGES) {
    if (out.length >= 3) break;
    if (q.length >= 2 && (internalUrl(p).startsWith(norm(q)) || norm(INTERNAL_TITLES[p]).startsWith(norm(q))))
      out.push({ key: "page:" + p, kind: "page", title: INTERNAL_TITLES[p], hint: internalUrl(p), value: internalUrl(p) });
  }
  for (const t of d.tabs.filter(t => !t.active && !t.internal && matches(q, t.title, t.url)).slice(0, 2))
    out.push({ key: "tab:" + t.id, kind: "tab", title: t.title, hint: "Zu Tab wechseln", tabId: t.id, value: t.url });
  const seen = new Set<string>();
  for (const b of d.bookmarks.filter(b => matches(q, b.title, b.url)).slice(0, 4)) {
    seen.add(b.url);
    out.push({ key: "bm:" + b.id, kind: "bookmark", title: b.title, hint: b.url, value: b.url });
  }
  for (const h of rankHistory(d.history, q, 8)) {
    if (out.length >= 9) break;
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    out.push({ key: "h:" + h.url, kind: "history", title: h.title || h.url, hint: h.url, value: h.url });
  }
  return out.slice(0, 9);
}
