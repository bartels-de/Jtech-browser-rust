import { call, type ExtInfo, type MarketResult } from "./ipc";
import { getLang, t, type TKey } from "../i18n";

/**
 * Extensions / JTech Market: thin wrappers around the Rust commands (docs/EXTENSIONS.md).
 * Every call passes the current UI language so names and descriptions come back localized
 * (Rust falls back to "en" when a manifest has no entry for the language).
 */
export const extList = (onError?: (m: string) => void) => call<ExtInfo[]>("ext_list", { lang: getLang() }, onError);
export interface ExtDiagnostics { searchedPath: string; pathExists: boolean; legacyFlatLayout: boolean; loaded: string[]; errors: { path: string; error: string }[] }
export const extDiagnostics = (onError?: (m: string) => void) => call<ExtDiagnostics>("ext_diagnostics", {}, onError);
export const extToggle = (id: string, enabled: boolean, onError?: (m: string) => void) =>
  call<ExtInfo[]>("ext_toggle", { id, enabled, lang: getLang() }, onError);
export const extSiteToggle = (id: string, host: string, enabled: boolean, onError?: (m: string) => void) =>
  call<ExtInfo[]>("ext_site_toggle", { id, host, enabled, lang: getLang() }, onError);
/** market_fetch rejects when offline; the error is returned instead of being shown as a toast. */
export async function marketFetch(): Promise<{ result?: MarketResult; error?: string }> {
  let error: string | undefined;
  const result = await call<MarketResult>("market_fetch", { lang: getLang() }, m => { error = m; });
  return { result, error };
}

export const TWITCH_ID = "jtech.twitch-adblock";

const KNOWN_PERMS = new Set(["scripts:main-world", "network", "styles"]);
/** Permission -> short title + plain-language explanation (unknown permissions are shown raw). */
export function explainPermission(p: string): { title: string; text: string } {
  if (!KNOWN_PERMS.has(p)) return { title: p, text: "" };
  return { title: t(`perm.x.title.${p}` as TKey), text: t(`perm.x.${p}` as TKey) };
}

/** Readable host from a match pattern: "*://*.twitch.tv/*" -> "twitch.tv (+ subdomains)". */
export function matchHost(pattern: string): { host: string; sub: boolean } | null {
  if (pattern === "<all_urls>") return null;
  const m = /^(\*|https?):\/\/([^/]+)\//.exec(pattern);
  if (!m) return { host: pattern, sub: false };
  const h = m[2];
  return h.startsWith("*.") ? { host: h.slice(2), sub: true } : { host: h, sub: false };
}

/** Does the extension run on this host (siteOf-normalized, without "www.")? */
export function extMatchesHost(ext: Pick<ExtInfo, "matches">, host: string): boolean {
  return ext.matches.some(p => {
    if (p === "<all_urls>") return true;
    const mh = matchHost(p);
    if (!mh) return true;
    if (mh.host === "*") return true;
    const base = mh.host.replace(/^www\./, "");
    return host === base || (mh.sub && host.endsWith("." + base));
  });
}

/** Is the extension switched off for this host (siteOff covers subdomains)? */
export const extOffOn = (ext: Pick<ExtInfo, "siteOff">, host: string) => ext.siteOff.some(h => host === h || host.endsWith("." + h));
