export type InternalPage = "newtab" | "settings" | "history" | "bookmarks" | "privacy" | "downloads" | "themes" | "audio" | "performance";
export const INTERNAL_PAGES: InternalPage[] = ["newtab", "settings", "history", "bookmarks", "privacy", "downloads", "themes", "audio", "performance"];

export const INTERNAL_TITLES: Record<InternalPage, string> = {
  newtab: "Neuer Tab",
  settings: "Einstellungen",
  history: "Verlauf",
  bookmarks: "Lesezeichen",
  privacy: "Datenschutz",
  downloads: "Downloads",
  themes: "Design-Studio",
  audio: "Audio-Hub",
  performance: "Performance",
};

export type SearchEngineId = "duckduckgo" | "google" | "bing" | "startpage" | "brave";

export const SEARCH_ENGINES: Record<SearchEngineId, { name: string; url: string }> = {
  duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
  google: { name: "Google", url: "https://www.google.com/search?q=" },
  bing: { name: "Bing", url: "https://www.bing.com/search?q=" },
  startpage: { name: "Startpage", url: "https://www.startpage.com/do/search?query=" },
  brave: { name: "Brave Search", url: "https://search.brave.com/search?q=" },
};

export const internalUrl = (p: InternalPage) => `jtech://${p}`;

export function parseInternal(input: string): InternalPage | null {
  const m = /^jtech:\/\/([a-z]+)\/?$/i.exec(input.trim());
  if (!m) return null;
  const p = m[1].toLowerCase() as InternalPage;
  return INTERNAL_PAGES.includes(p) ? p : null;
}

export type Target = { kind: "internal"; page: InternalPage } | { kind: "web"; url: string };

/** Port aus Standardprojekt (main.js resolveInput / app.js BUILTIN_BANGS): JTech Bangs. */
export interface Bang { trigger: string; urlTemplate: string; }
export const BUILTIN_BANGS: Bang[] = [
  { trigger: "yt", urlTemplate: "https://www.youtube.com/results?search_query=%s" },
  { trigger: "yt-d", urlTemplate: "https://www.youtube.com/results?search_query=%s&sp=EgIIAQ%3D%3D" },
  { trigger: "g", urlTemplate: "https://www.google.com/search?q=%s" },
  { trigger: "ddg", urlTemplate: "https://duckduckgo.com/?q=%s" },
  { trigger: "gh", urlTemplate: "https://github.com/search?q=%s" },
];
const BANG_ALIASES: Record<string, string> = { youtube: "yt", ytd: "yt-d", "yt-today": "yt-d", google: "g", github: "gh" };

/** Wie normalizeBangs im Electron-Original: Trigger ohne "!", nur http(s), %s Pflicht (sonst angehaengt). */
export function normalizeBangs(input: unknown): Bang[] {
  if (!Array.isArray(input)) return [];
  const out: Bang[] = []; const seen = new Set<string>();
  for (const e of input) {
    if (!e || typeof e !== "object") continue;
    const trigger = String((e as Bang).trigger ?? "").trim().toLowerCase().replace(/^!/, "");
    if (!trigger || trigger.length > 32 || /\s/.test(trigger) || seen.has(trigger)) continue;
    let tpl = String((e as Bang).urlTemplate ?? "").trim();
    if (!/^https?:\/\//i.test(tpl)) continue;
    if (!tpl.includes("%s")) tpl += (tpl.includes("?") ? "&" : "?") + "q=%s";
    seen.add(trigger); out.push({ trigger, urlTemplate: tpl });
    if (out.length >= 100) break;
  }
  return out;
}

export function resolveBang(s: string, custom: Bang[] = []): string | null {
  const m = /^!(\S+)(?:\s+(.*))?$/.exec(s);
  if (!m) return null;
  const key = m[1].toLowerCase();
  const q = encodeURIComponent((m[2] ?? "").trim());
  const bang = custom.find(b => b.trigger === key) ?? BUILTIN_BANGS.find(b => b.trigger === (BANG_ALIASES[key] ?? key));
  return bang ? bang.urlTemplate.replace("%s", q) : null;
}

/** Eingabe der Adressleiste aufloesen: interne Seite, Bang, URL oder Suche. */
export function resolveInput(input: string, engine: SearchEngineId, bangs: Bang[] = []): Target | null {
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith("!")) { const u = resolveBang(s, bangs); if (u) return { kind: "web", url: u }; }
  const page = parseInternal(s);
  if (page) return { kind: "internal", page };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || s.startsWith("about:")) return { kind: "web", url: s };
  if (!/\s/.test(s) && (/^[^/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s) || /^localhost(:\d+)?(\/.*)?$/i.test(s))) {
    return { kind: "web", url: (s.startsWith("localhost") ? "http://" : "https://") + s };
  }
  return { kind: "web", url: SEARCH_ENGINES[engine].url + encodeURIComponent(s) };
}

export function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return ""; }
}

export function faviconUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}/favicon.ico`;
  } catch { return null; }
}

export type Security = "secure" | "insecure" | "internal" | "none";
export function securityOf(url: string, internal: boolean): Security {
  if (internal) return "internal";
  if (url.startsWith("https://")) return "secure";
  if (url.startsWith("http://")) return "insecure";
  return "none";
}

export const isWebUrl = (u: string) => u.startsWith("http://") || u.startsWith("https://");
