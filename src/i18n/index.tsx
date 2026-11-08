import { createContext, useContext, type ReactNode } from "react";
import { de } from "./de";
import { en } from "./en";

/**
 * i18n: typed dictionaries (de is the reference, en must mirror every key - TypeScript enforces it),
 * t(key, params) with {name} interpolation and plural forms ("one|other", chosen by params.count).
 * The current language is module state so that non-React code (command list, store, updater) can
 * use t() too; the provider re-renders the tree when the language changes.
 * Adding a language: create xx.ts typed as Dict, add it to DICTS and LANGS.
 */
export type TKey = keyof typeof de;
export type Dict = Record<TKey, string>;
export type Lang = "de" | "en";
export type LangSetting = "system" | Lang;
export type TParams = Record<string, string | number>;

const DICTS: Record<Lang, Dict> = { de, en };
/** Selectable languages; names are shown in their own language. */
export const LANGS: { id: Lang; name: string }[] = [{ id: "de", name: "Deutsch" }, { id: "en", name: "English" }];
const LOCALES: Record<Lang, string> = { de: "de-DE", en: "en-US" };

let current: Lang = "de";
const pluralCache = new Map<string, Intl.PluralRules>();

export function systemLang(): Lang {
  const list = typeof navigator !== "undefined" ? [...(navigator.languages ?? []), navigator.language] : [];
  for (const l of list) {
    const short = String(l || "").toLowerCase().split(/[-_]/)[0];
    if (short in DICTS) return short as Lang;
  }
  return "en";
}
export const resolveLang = (s: LangSetting | undefined | null): Lang => (s === "de" || s === "en" ? s : systemLang());
export const normalizeLangSetting = (v: unknown): LangSetting => (v === "de" || v === "en" || v === "system" ? v : "system");

/** Sets the active language (also <html lang>). Called by the provider during render. */
export function setLang(l: Lang) {
  current = l;
  if (typeof document !== "undefined" && document.documentElement.lang !== l) document.documentElement.lang = l;
}
export const getLang = (): Lang => current;
/** BCP-47 locale for Intl formatting. */
export const locale = (): string => LOCALES[current];

function plural(n: number): Intl.LDMLPluralRule {
  const loc = locale();
  let r = pluralCache.get(loc);
  if (!r) { r = new Intl.PluralRules(loc); pluralCache.set(loc, r); }
  return r.select(n);
}

export function t(key: TKey, params?: TParams): string {
  let s: string = DICTS[current][key] ?? de[key] ?? key;
  if (params && typeof params.count === "number" && s.includes("|")) {
    const forms = s.split("|");
    s = plural(params.count) === "one" ? forms[0] : forms[forms.length - 1];
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? (typeof params[k] === "number" ? fmtNum(params[k] as number) : String(params[k])) : m));
  return s;
}

// ---- Intl formatting with the current locale ----
export const fmtNum = (n: number, o?: Intl.NumberFormatOptions) => (Number.isFinite(n) ? n.toLocaleString(locale(), o) : "?");
export const fmtPct = (n: number, digits = 0) => `${fmtNum(n, { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
export const fmtTime = (d: Date | number) => new Date(d).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
export const fmtDate = (d: Date | number, o: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) => new Date(d).toLocaleDateString(locale(), o);
export const fmtDateTime = (d: Date | number) => new Date(d).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" });
/** Bytes with binary units, locale-aware decimals. */
export function fmtBytes(n: number, digits = 1): string {
  if (!Number.isFinite(n) || n < 0) return "?";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${fmtNum(v, { maximumFractionDigits: i === 0 ? 0 : digits, minimumFractionDigits: i === 0 ? 0 : Math.min(digits, 1) })} ${u[i]}`;
}

/**
 * Known German messages from the Rust backend -> keys. Rust stays German (technical log text);
 * the UI maps what users actually see. Unknown messages are shown unchanged.
 */
const BACKEND: [RegExp, TKey][] = [
  [/^Programme\/Skripte werden nicht direkt gestartet/, "be.riskyFile"],
  [/^Download ist noch nicht fertig/, "be.downloadNotDone"],
  [/^Datei liegt nicht im Download-Ordner/, "be.notInDownloads"],
  [/^Datei nicht gefunden/, "be.fileNotFound"],
  [/^kein aktiver Tab/, "be.noActiveTab"],
  [/^aktiver Tab wird nicht schlafen gelegt/, "be.activeNoSleep"],
  [/^Tab \S+ spielt Audio/, "be.tabPlaysAudio"],
  [/^Tab \S+ nicht gefunden/, "be.tabNotFound"],
  [/^Suchbegriff zu lang/, "be.queryTooLong"],
  [/^leere URL/, "be.emptyUrl"],
  [/^ungueltige URL/, "be.invalidUrl"],
  [/^Keine Filterliste aktiv/, "be.noFilterList"],
  [/^Aus Cache geladen/, "be.fromCache"],
  [/^Neu gebaut/, "be.rebuilt"],
  [/^Einstellungen gespeichert/, "be.optionsSaved"],
  [/^Filterlisten werden geladen/, "be.listsLoading"],
  [/^Engine wird gebaut/, "be.engineBuilding"],
  [/^Antwort ist HTML/, "be.htmlNotList"],
  [/^Datenbank nicht verfuegbar/, "be.noDb"],
];
const BACKEND_PREFIX: [RegExp, TKey][] = [
  [/^Teilweise veraltet: /, "be.partlyStale"],
  [/^Keine Liste verfuegbar – /, "be.noListAvailable"],
  [/^Engine bauen: /, "be.engineBuildFailed"],
];
export function localizeBackend(msg: string | null | undefined): string {
  const m = String(msg ?? "");
  if (!m) return m;
  for (const [re, k] of BACKEND) if (re.test(m)) return t(k);
  for (const [re, k] of BACKEND_PREFIX) if (re.test(m)) return t(k, { detail: m.replace(re, "") });
  return m;
}

const I18nCtx = createContext<Lang>("de");

/** Provides the active language; setLang runs during render so every child uses it immediately. */
export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  setLang(lang);
  return <I18nCtx.Provider value={lang}>{children}</I18nCtx.Provider>;
}

/** Hook: re-renders on language change; returns t plus formatters bound to the current locale. */
export function useT() {
  const lang = useContext(I18nCtx);
  return { t, lang, locale: LOCALES[lang], fmtNum, fmtPct, fmtTime, fmtDate, fmtDateTime, fmtBytes };
}
