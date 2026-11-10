import { t as tr, type TKey } from "../i18n";
/**
 * Port aus Standardprojekt (src/renderer/js/app.js PRESETS, src/main/config.js normalizeTheme):
 * Theme-Editor fuer die Design-Tokens aus styles/tokens.css. Ein Theme besteht aus wenigen
 * Quellwerten; alle Tokens (Flaechen, Rahmen, Akzent-Varianten) werden daraus abgeleitet und als
 * Inline-CSS-Variablen auf :root gesetzt. null = Standard-Tokens aus tokens.css.
 */
export interface ThemeSpec {
  id: string;
  name: string;
  mode: "dark" | "light";
  accent: string;
  accent2: string;
  bg: string;
  text: string;
  textDim: string;
  radius: number;
  /** Runde 3: Deckkraft der Glasflaechen 30..100 (%) */
  glass: number;
  /** Runde 3: Weichzeichner der Glasflaechen 0..40 px */
  blur: number;
  /** Runde 3: Leuchten um Akzent-Elemente 0..100 */
  glow: number;
  /** Runde 3: Schrift (nur Werte aus FONTS) */
  font: FontId;
  /** Runde 3: eigenes CSS – wirkt NUR auf die UI-Webview, wird bereinigt (sanitizeCss) */
  customCss: string;
}

export type FontId =
  | "segoe" | "system" | "bahnschrift" | "verdana" | "trebuchet" | "georgia" | "cascadia"
  | "arial" | "calibri" | "candara" | "corbel" | "franklingothic" | "lato"
  | "segoeuiblack" | "seguisb" | "sitka" | "tahoma" | "times" | "constan"
  | "cambria" | "palatino" | "rockwell" | "bookantiqua" | "garamond" | "ebrima"
  | "consolas" | "cournew" | "lucida" | "cambriamono" | "gabriola" | "comic" | "impact";
export const FONTS: Record<FontId, { name: string; stack: string }> = {
  segoe: { name: "Segoe UI (Standard)", stack: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif' },
  system: { name: "System", stack: "system-ui, sans-serif" },
  bahnschrift: { name: "Bahnschrift", stack: 'Bahnschrift, "Segoe UI", sans-serif' },
  verdana: { name: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  trebuchet: { name: "Trebuchet MS", stack: '"Trebuchet MS", "Segoe UI", sans-serif' },
  georgia: { name: "Georgia (Serif)", stack: 'Georgia, "Times New Roman", serif' },
  cascadia: { name: "Cascadia (Mono)", stack: '"Cascadia Code", Consolas, monospace' },
  // Weitere Sans-Schriften (alle auf Windows 10/11 vorinstalliert)
  arial: { name: "Arial", stack: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
  calibri: { name: "Calibri", stack: 'Calibri, "Segoe UI", sans-serif' },
  candara: { name: "Candara", stack: 'Candara, "Segoe UI", sans-serif' },
  corbel: { name: "Corbel", stack: 'Corbel, "Segoe UI", sans-serif' },
  tahoma: { name: "Tahoma", stack: 'Tahoma, "Segoe UI", sans-serif' },
  franklingothic: { name: "Franklin Gothic", stack: '"Franklin Gothic Medium", "Franklin Gothic", "Segoe UI", sans-serif' },
  lato: { name: "Lato", stack: 'Lato, "Segoe UI", sans-serif' },
  ebrima: { name: "Ebrima", stack: 'Ebrima, "Segoe UI", sans-serif' },
  // Serif
  times: { name: "Times New Roman", stack: '"Times New Roman", Times, serif' },
  cambria: { name: "Cambria", stack: 'Cambria, Georgia, serif' },
  constan: { name: "Constantia", stack: 'Constantia, Cambria, Georgia, serif' },
  palatino: { name: "Palatino Linotype", stack: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  bookantiqua: { name: "Book Antiqua", stack: '"Book Antiqua", "Palatino Linotype", serif' },
  garamond: { name: "Garamond", stack: 'Garamond, "EB Garamond", Georgia, serif' },
  rockwell: { name: "Rockwell", stack: 'Rockwell, "Roboto Slab", Georgia, serif' },
  sitka: { name: "Sitka", stack: 'Sitka, "Sitka Text", Cambria, serif' },
  // Mono
  consolas: { name: "Consolas", stack: 'Consolas, "Cascadia Code", monospace' },
  cournew: { name: "Courier New", stack: '"Courier New", Courier, monospace' },
  lucida: { name: "Lucida Console", stack: '"Lucida Console", "Lucida Sans Typewriter", monospace' },
  cambriamono: { name: "Cambria Math", stack: '"Cambria Math", Consolas, monospace' },
  // Auszeichnung
  segoeuiblack: { name: "Segoe UI Black", stack: '"Segoe UI Black", "Segoe UI", sans-serif' },
  seguisb: { name: "Segoe UI Semibold", stack: '"Segoe UI Semibold", "Segoe UI", sans-serif' },
  gabriola: { name: "Gabriola", stack: 'Gabriola, "Segoe UI", serif' },
  comic: { name: "Comic Sans MS", stack: '"Comic Sans MS", "Segoe UI", cursive' },
  impact: { name: "Impact", stack: 'Impact, Haettenschweiler, "Arial Black", sans-serif' },
};
export const CUSTOM_CSS_MAX = 20000;

/** Gruppen der Schrift-Auswahl im Theme-Editor. */
export const FONT_GROUPS: { id: string; label: string; fonts: FontId[] }[] = [
  { id: "sans", label: "th.fontGroup.sans", fonts: ["segoe", "system", "bahnschrift", "arial", "calibri", "candara", "corbel", "verdana", "tahoma", "trebuchet", "franklingothic", "lato", "ebrima"] },
  { id: "serif", label: "th.fontGroup.serif", fonts: ["georgia", "times", "cambria", "constan", "palatino", "bookantiqua", "garamond", "rockwell", "sitka"] },
  { id: "mono", label: "th.fontGroup.mono", fonts: ["cascadia", "consolas", "cournew", "lucida", "cambriamono"] },
  { id: "display", label: "th.fontGroup.display", fonts: ["segoeuiblack", "seguisb", "gabriola", "comic", "impact"] },
];

/**
 * Eigenes CSS bereinigen: keine externen Ladevorgaenge (@import, url()), keine Script-artigen
 * Konstrukte (expression(), javascript:, behavior, -moz-binding), keine HTML-Tags.
 * Das Ergebnis wird per textContent in ein <style> der UI-Webview gesetzt – nie in Webseiten.
 */
export function sanitizeCss(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.slice(0, CUSTOM_CSS_MAX)
    .replace(/<\/?[a-z!][^>]*>/gi, "")
    .replace(/</g, "")
    .replace(/@import[^;]*;?/gi, "/* @import entfernt */")
    .replace(/@charset[^;]*;?/gi, "")
    .replace(/url\s*\([^)]*\)/gi, "none")
    .replace(/image-set\s*\([^)]*\)/gi, "none")
    .replace(/expression\s*\(/gi, "/*x*/(")
    .replace(/javascript\s*:/gi, "")
    .replace(/behavior\s*:/gi, "x-behavior:")
    .replace(/-moz-binding/gi, "x-binding");
}

const HEX = /^#[0-9a-f]{6}$/i;
const SHORT = /^#[0-9a-f]{3}$/i;
export function normalizeHex(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  if (HEX.test(t)) return t.toLowerCase();
  if (SHORT.test(t)) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toLowerCase();
  return fallback;
}
const clamp = (v: unknown, min: number, max: number, f: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f;
};

/** Relative Helligkeit (0..1) fuer Kontrast/Modus-Erkennung. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

const EXTRA = { glass: 78, blur: 18, glow: 0, font: "segoe" as FontId, customCss: "" };
/** Display name of a font (localized where it carries a word). */
export const fontName = (f: FontId): string => (f === "segoe" || f === "system" || f === "georgia" || f === "cascadia" ? tr(`th.font.${f}` as TKey) : FONTS[f].name);
/** Display name of a theme: the built-in default is localized, user/preset names are shown as stored. */
export const themeName = (x: { id: string; name: string }): string => (x.id === "jtech" ? tr("th.default") : x.name);
export const JTECH_DEFAULT: ThemeSpec = { id: "jtech", name: "JTech (Standard)", mode: "dark", accent: "#2cc5c9", accent2: "#5fe0d6", bg: "#0f1215", text: "#e7ecef", textDim: "#a7b1ba", radius: 10, ...EXTRA };

const p = (id: string, name: string, accent: string, accent2: string, bg: string, text: string, textDim: string, radius: number): ThemeSpec =>
  ({ id, name, mode: luminance(bg) > 0.4 ? "light" : "dark", accent, accent2, bg, text, textDim, radius, ...EXTRA, glow: id === "synthwave" || id === "toxic" || id === "hyperdrive" ? 40 : 0 });

/** Farben/Radien der 11 Electron-Presets (Animationen, Cursor, Glow nicht portiert). */
export const PRESETS: ThemeSpec[] = [
  JTECH_DEFAULT,
  p("nova", "Nova", "#7c6cff", "#22d3ee", "#0b0d17", "#e7e9f5", "#8b90ab", 12),
  p("synthwave", "Synthwave", "#ff3d9a", "#ffb86b", "#140a24", "#f6e9ff", "#a98fc0", 10),
  p("toxic", "Toxic", "#39ff88", "#00e5ff", "#060d0a", "#e6fff1", "#7fa894", 6),
  p("inferno", "Inferno", "#ff5a1f", "#ffc23d", "#100806", "#fdeee6", "#a8877a", 10),
  p("hyperdrive", "Hyperdrive", "#4cc9ff", "#c77dff", "#05060d", "#e8f3ff", "#8494ad", 8),
  p("abyss", "Abyss", "#00e0c6", "#3aa0ff", "#04121a", "#e2f6f7", "#7fa2aa", 14),
  p("sakura", "Sakura", "#ff8fb8", "#b69cff", "#150d14", "#fbeef4", "#ab8f9f", 16),
  p("forest", "Forest", "#6fcf97", "#d4e79e", "#0a120e", "#e8f2ea", "#8aa394", 14),
  p("graphite", "Graphite", "#a5b4cb", "#6b7a90", "#101113", "#e4e6ea", "#878b94", 8),
  p("paper", "Paper", "#3b5bfd", "#12b5a6", "#eef0f5", "#1b1f2a", "#5d6475", 12),
  p("daylight", "Daylight", "#e4572e", "#f3a712", "#f6efe5", "#2a2118", "#6f6253", 14),
];

/** Validiert ein (importiertes) Theme. Unbekannte Felder werden verworfen. */
export function normalizeTheme(input: unknown, fallback: ThemeSpec = JTECH_DEFAULT): ThemeSpec | null {
  if (!input || typeof input !== "object") return null;
  const t = input as Record<string, unknown>;
  const bg = normalizeHex(t.bg, fallback.bg);
  const name = typeof t.name === "string" && t.name.trim() ? t.name.trim().slice(0, 40) : tr("th.custom");
  const id = typeof t.id === "string" && /^[a-z0-9-]{1,40}$/i.test(t.id) ? t.id : "custom-" + Date.now().toString(36);
  return {
    id, name,
    mode: t.mode === "light" || t.mode === "dark" ? t.mode : luminance(bg) > 0.4 ? "light" : "dark",
    accent: normalizeHex(t.accent, fallback.accent),
    accent2: normalizeHex(t.accent2 ?? t.accentAlt, fallback.accent2),
    bg,
    text: normalizeHex(t.text, fallback.text),
    textDim: normalizeHex(t.textDim, fallback.textDim),
    radius: Math.round(clamp(t.radius, 0, 24, fallback.radius)),
    glass: Math.round(clamp(t.glass, 30, 100, fallback.glass)),
    blur: Math.round(clamp(t.blur, 0, 40, fallback.blur)),
    glow: Math.round(clamp(t.glow, 0, 100, fallback.glow)),
    font: typeof t.font === "string" && t.font in FONTS ? (t.font as FontId) : fallback.font,
    customCss: sanitizeCss(t.customCss ?? fallback.customCss),
  };
}

const mix = (a: string, b: string, pct: number) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

/** Leitet alle Token-Werte aus tokens.css ab. */
export function themeVars(t: ThemeSpec): Record<string, string> {
  const light = t.mode === "light";
  const r = t.radius;
  return {
    "--bg": t.bg,
    "--surface-0": mix(t.text, t.bg, light ? 2 : 3),
    "--surface-1": light ? mix("#ffffff", t.bg, 70) : mix(t.text, t.bg, 6),
    "--surface-2": mix(t.text, t.bg, light ? 5 : 10),
    "--surface-3": mix(t.text, t.bg, light ? 10 : 15),
    "--glass": mix(light ? "#ffffff" : t.bg, "transparent", t.glass),
    "--glass-blur": `${t.blur}px`,
    "--glow": `${Math.round(t.glow * 0.3)}px`,
    "--font-sans": FONTS[t.font].stack,
    "--glass-border": mix(t.text, "transparent", 8),
    "--border": mix(t.text, "transparent", 8),
    "--border-strong": mix(t.text, "transparent", 15),
    "--text": t.text,
    "--text-2": t.textDim,
    "--text-3": mix(t.textDim, t.bg, 65),
    "--accent": t.accent,
    "--accent-2": t.accent2,
    "--accent-strong": mix(t.accent, "#000000", 82),
    "--accent-ink": luminance(t.accent) > 0.35 ? "#06181c" : "#ffffff",
    "--accent-soft": mix(t.accent, "transparent", light ? 11 : 14),
    "--accent-ring": mix(t.accent, "transparent", 36),
    "--hover": mix(t.text, "transparent", 5),
    "--press": mix(t.text, "transparent", 9),
    "--r-xs": `${Math.max(0, Math.round(r * 0.6))}px`,
    "--r-sm": `${Math.round(r * 0.8)}px`,
    "--r-md": `${r}px`,
    "--r-lg": `${Math.round(r * 1.4)}px`,
    "--r-xl": `${Math.round(r * 2)}px`,
  };
}

const KEYS = Object.keys(themeVars(JTECH_DEFAULT));

/** Setzt (oder entfernt bei null) die Inline-Variablen auf :root. */
export function applyTheme(t: ThemeSpec | null, root: HTMLElement = document.documentElement) {
  for (const k of KEYS) root.style.removeProperty(k);
  let style = document.getElementById("jtech-custom-css") as HTMLStyleElement | null;
  if (!t) { style?.remove(); return; }
  for (const [k, v] of Object.entries(themeVars(t))) root.style.setProperty(k, v);
  const css = sanitizeCss(t.customCss);
  if (!css.trim()) { style?.remove(); return; }
  if (!style) { style = document.createElement("style"); style.id = "jtech-custom-css"; document.head.appendChild(style); }
  style.textContent = css;
}

export function exportTheme(t: ThemeSpec): string {
  const { id, name, mode, accent, accent2, bg, text, textDim, radius, glass, blur, glow, font, customCss } = t;
  return JSON.stringify({ format: "jtech-theme", version: 2, id, name, mode, accent, accent2, bg, text, textDim, radius, glass, blur, glow, font, customCss }, null, 2);
}

/** Akzeptiert eigenes Format und Electron-Themes (accentAlt). Wirft bei kaputtem JSON. */
export function importTheme(json: string): ThemeSpec {
  if (json.length > 60000) throw new Error(tr("th.err.tooBig"));
  const t = normalizeTheme(JSON.parse(json));
  if (!t) throw new Error(tr("th.err.noTheme"));
  return { ...t, id: "custom-" + Date.now().toString(36) };
}
