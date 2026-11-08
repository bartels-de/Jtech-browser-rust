import { t, type TKey } from "../../i18n";
/**
 * Runde 5: Design-Studio-Effekte (Port der Ideen aus Standardprojekt: backgrounds.js, cursor-fx.js,
 * CURSOR_PRESETS in app.js). Wirken auf die Browser-Oberflaeche (UI-Webview). Webseiten liegen als
 * eigene native WebView2 darueber – dort nur, wenn "Auch auf Webseiten" aktiv ist (per Script-Injektion).
 */
export type BgId = "none" | "constellation" | "synthwave" | "flowfield" | "hyperdrive" | "hexgrid" | "nebula" | "ribbons" | "embers";
/** name/description are getters in the current UI language (keys fx.bg.<id>, fx.bg.<id>.d) */
const BG_IDS: BgId[] = ["none", "constellation", "synthwave", "flowfield", "hyperdrive", "hexgrid", "nebula", "ribbons", "embers"];
export const BACKGROUNDS: { id: BgId; readonly name: string; readonly description: string }[] =
  BG_IDS.map(id => ({ id, get name() { return t(`fx.bg.${id}` as TKey); }, get description() { return t(`fx.bg.${id}.d` as TKey); } }));

export type TrailId = "none" | "trail" | "sparks" | "comet" | "ripple" | "laser" | "bubbles";
const TRAIL_IDS: TrailId[] = ["none", "trail", "comet", "sparks", "ripple", "laser", "bubbles"];
export const TRAILS: { id: TrailId; readonly name: string }[] = TRAIL_IDS.map(id => ({ id, get name() { return t(`fx.tr.${id}` as TKey); } }));

export type Quality = "low" | "medium" | "high";
export const QUALITY: Record<Quality, { readonly name: string; fps: number; scale: number }> = {
  low: { get name() { return t("fx.q.low"); }, fps: 20, scale: 0.5 },
  medium: { get name() { return t("fx.q.medium"); }, fps: 30, scale: 0.75 },
  high: { get name() { return t("fx.q.high"); }, fps: 60, scale: 1 },
};

export interface EffectsSettings {
  bgEnabled: boolean;
  background: BgId;
  bgIntensity: number;   // 0..100
  bgSpeed: number;       // 0..200 (%)
  bgGlow: number;        // 0..100
  quality: Quality;
  pauseOnWeb: boolean;   // pausieren, solange eine Webseite angezeigt wird
  surfaceAlpha: number;  // 40..100 – Deckkraft von Seitenleiste/Kopf/Seiten ueber dem Hintergrund
  cursor: string;        // "" = System, Preset-ID oder "image"
  cursorColor: string;
  cursorSize: number;    // 16..64
  cursorImage: string;   // data:image/png;base64,… (bereits auf cursorSize skaliert)
  cursorHotspot: "center" | "topleft";
  trail: TrailId;
  trailColor: string;
  trailColor2: string;
  trailSize: number;     // 2..40
  trailIntensity: number; // 0..100
  trailLength: number;   // 0..100
  inPages: boolean;      // Cursor + Spur auch in Webseiten injizieren (Standard: aus)
}

export const DEFAULT_EFFECTS: EffectsSettings = {
  bgEnabled: false, background: "constellation", bgIntensity: 50, bgSpeed: 100, bgGlow: 50, quality: "medium", pauseOnWeb: false, surfaceAlpha: 78,
  cursor: "", cursorColor: "#2cc5c9", cursorSize: 24, cursorImage: "", cursorHotspot: "center",
  trail: "none", trailColor: "#2cc5c9", trailColor2: "#5fe0d6", trailSize: 16, trailIntensity: 60, trailLength: 50,
  inPages: false,
};

/** SVG-Cursor (aus Standardprojekt CURSOR_PRESETS, skaliert ueber viewBox). [(unused name), base size, Hotspot x, y, SVG-Inhalt mit {c} = Farbe] */
const P: Record<string, [string, number, number, number, string]> = {
  dot: ["", 24, 12, 12, "<circle cx='12' cy='12' r='5' fill='{c}' stroke='white' stroke-width='2'/>"],
  ring: ["", 32, 16, 16, "<circle cx='16' cy='16' r='10' fill='none' stroke='{c}' stroke-width='2'/>"],
  cross: ["", 24, 12, 12, "<path d='M12 2v20M2 12h20' stroke='{c}' stroke-width='2' stroke-linecap='round'/>"],
  "arrow-glow": ["", 24, 4, 2, "<path d='M4 2l16 10-8 2 4 8-3 1-4-8-5 5z' fill='{c}' stroke='white' stroke-width='1'/>"],
  target: ["", 32, 16, 16, "<circle cx='16' cy='16' r='12' fill='none' stroke='{c}' stroke-width='2'/><circle cx='16' cy='16' r='3' fill='{c}'/>"],
  pointer: ["", 24, 6, 2, "<path d='M6 2l12 8-5 1 4 9-3 1-4-9-4 4z' fill='{c}' stroke='white' stroke-width='1.2'/>"],
  diamond: ["", 24, 12, 12, "<path d='M12 2l10 10-10 10L2 12z' fill='none' stroke='{c}' stroke-width='2'/><circle cx='12' cy='12' r='2' fill='{c}'/>"],
  hex: ["", 28, 14, 14, "<path d='M14 2l11.3 6.5v13L14 28 2.7 21.5v-13z' fill='none' stroke='{c}' stroke-width='2'/>"],
  "circle-ring": ["", 32, 16, 16, "<circle cx='16' cy='16' r='12' fill='none' stroke='white' stroke-width='2'/><circle cx='16' cy='16' r='6' fill='{c}'/>"],
  "crosshair-dot": ["", 24, 12, 12, "<path d='M12 4v6M12 14v6M4 12h6M14 12h6' stroke='{c}' stroke-width='2'/><circle cx='12' cy='12' r='2' fill='white'/>"],
  beam: ["", 28, 14, 14, "<rect x='12' y='2' width='4' height='24' rx='2' fill='{c}'/>"],
  scope: ["", 32, 16, 16, "<circle cx='16' cy='16' r='14' fill='none' stroke='white' stroke-width='1.5'/><path d='M16 2v6M16 24v6M2 16h6M24 16h6' stroke='{c}' stroke-width='1.5'/><circle cx='16' cy='16' r='2' fill='{c}'/>"],
  play: ["", 24, 6, 4, "<path d='M6 4l14 8-14 8z' fill='{c}' stroke='white' stroke-width='1'/>"],
};
/** Preset names (P[..][0]) are German reference names; the displayed name is localized. */
export const CURSOR_PRESETS: { id: string; readonly name: string }[] = ["", ...Object.keys(P), "image"].map(id => ({ id, get name() { return t(`fx.cur.${id || "system"}` as TKey); } }));

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown, f: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : f);
const num = (v: unknown, min: number, max: number, f: number) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : f; };
export const CURSOR_IMAGE_MAX = 150_000;
const IMG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export function normalizeEffects(raw: unknown): EffectsSettings {
  const d = DEFAULT_EFFECTS;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const img = typeof r.cursorImage === "string" && r.cursorImage.length <= CURSOR_IMAGE_MAX && IMG.test(r.cursorImage) ? r.cursorImage : "";
  const cursor = typeof r.cursor === "string" && (r.cursor === "" || r.cursor in P || (r.cursor === "image" && img)) ? r.cursor : "";
  return {
    bgEnabled: typeof r.bgEnabled === "boolean" ? r.bgEnabled : d.bgEnabled,
    background: BACKGROUNDS.some(b => b.id === r.background) ? (r.background as BgId) : d.background,
    bgIntensity: num(r.bgIntensity, 0, 100, d.bgIntensity),
    bgSpeed: num(r.bgSpeed, 0, 200, d.bgSpeed),
    bgGlow: num(r.bgGlow, 0, 100, d.bgGlow),
    quality: r.quality === "low" || r.quality === "medium" || r.quality === "high" ? r.quality : d.quality,
    pauseOnWeb: typeof r.pauseOnWeb === "boolean" ? r.pauseOnWeb : d.pauseOnWeb,
    surfaceAlpha: num(r.surfaceAlpha, 40, 100, d.surfaceAlpha),
    cursor,
    cursorColor: hex(r.cursorColor, d.cursorColor),
    cursorSize: num(r.cursorSize, 16, 64, d.cursorSize),
    cursorImage: img,
    cursorHotspot: r.cursorHotspot === "topleft" ? "topleft" : "center",
    trail: TRAILS.some(t => t.id === r.trail) ? (r.trail as TrailId) : d.trail,
    trailColor: hex(r.trailColor, d.trailColor),
    trailColor2: hex(r.trailColor2, d.trailColor2),
    trailSize: num(r.trailSize, 2, 40, d.trailSize),
    trailIntensity: num(r.trailIntensity, 0, 100, d.trailIntensity),
    trailLength: num(r.trailLength, 0, 100, d.trailLength),
    inPages: typeof r.inPages === "boolean" ? r.inPages : d.inPages,
  };
}

/** Cursor als data:-URL + Hotspot (null = Systemcursor). Zeichenvorrat ohne Klammern/Anfuehrungszeichen (Rust prueft erneut). */
export function cursorSpec(e: EffectsSettings): { url: string; x: number; y: number } | null {
  const s = e.cursorSize;
  if (e.cursor === "image" && e.cursorImage) return { url: e.cursorImage, x: e.cursorHotspot === "topleft" ? 0 : Math.floor(s / 2), y: e.cursorHotspot === "topleft" ? 0 : Math.floor(s / 2) };
  const p = P[e.cursor];
  if (!p) return null;
  const [, base, hx, hy, body] = p;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}' viewBox='0 0 ${base} ${base}'>${body.split("{c}").join(e.cursorColor)}</svg>`;
  const k = s / base;
  return { url: "data:image/svg+xml," + encodeURIComponent(svg), x: Math.min(s - 1, Math.round(hx * k)), y: Math.min(s - 1, Math.round(hy * k)) };
}
export const cursorCss = (c: { url: string; x: number; y: number }) => `url("${c.url}") ${c.x} ${c.y}, auto`;

/** Effekt-Teil der Electron-Presets (bgAnimation/cursorEffect/cursorColor), nach Theme-ID. */
export const PRESET_EFFECTS: Record<string, Partial<EffectsSettings>> = {
  nova: { bgEnabled: true, background: "constellation", trail: "none" },
  synthwave: { bgEnabled: true, background: "synthwave", bgIntensity: 60, bgGlow: 75, trail: "trail", trailColor: "#ff3d9a", trailColor2: "#ffb86b" },
  toxic: { bgEnabled: true, background: "hexgrid", bgIntensity: 60, bgGlow: 70, trail: "sparks", trailColor: "#39ff88", trailColor2: "#00e5ff" },
  inferno: { bgEnabled: true, background: "embers", bgIntensity: 60, bgGlow: 60, trail: "none", trailColor: "#ff5a1f", trailColor2: "#ffc23d" },
  hyperdrive: { bgEnabled: true, background: "hyperdrive", bgGlow: 65, trail: "comet", trailColor: "#4cc9ff", trailColor2: "#c77dff" },
  abyss: { bgEnabled: true, background: "flowfield", bgIntensity: 50, bgGlow: 45, trail: "none" },
  sakura: { bgEnabled: true, background: "nebula", bgIntensity: 55, bgGlow: 40, trail: "none" },
  forest: { bgEnabled: true, background: "ribbons", bgIntensity: 45, bgSpeed: 70, bgGlow: 30, trail: "none" },
  graphite: { bgEnabled: true, background: "none", bgGlow: 15, trail: "none" },
  paper: { bgEnabled: true, background: "constellation", bgIntensity: 35, bgGlow: 20, trail: "none" },
  daylight: { bgEnabled: true, background: "ribbons", bgIntensity: 35, bgSpeed: 70, bgGlow: 20, trail: "none" },
};

/** Bild-Datei -> quadratisches PNG in Cursorgroesse (data:-URL). */
export async function imageToCursor(file: File, size: number): Promise<string> {
  if (file.size > 5_000_000) throw new Error(t("fx.err.tooBig"));
  if (!/^image\/(png|jpeg|gif|webp|bmp|svg\+xml)$/.test(file.type)) throw new Error(t("fx.err.type"));
  const url = URL.createObjectURL(file);
  try { return await drawCursor(url, size); } finally { URL.revokeObjectURL(url); }
}
/** Bereits gespeichertes Cursorbild auf eine neue Groesse bringen. */
export const rescaleCursor = (dataUrl: string, size: number) => drawCursor(dataUrl, size);

async function drawCursor(url: string, size: number): Promise<string> {
  {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error(t("fx.err.unreadable"))); i.src = url; });
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error(t("fx.err.canvas"));
    const k = Math.min(size / (img.naturalWidth || size), size / (img.naturalHeight || size));
    const w = (img.naturalWidth || size) * k, h = (img.naturalHeight || size) * k;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    const out = c.toDataURL("image/png");
    if (out.length > CURSOR_IMAGE_MAX) throw new Error(t("fx.err.tooBigAfter"));
    return out;
  }
}

/** Typen der portierten Skripte (backgrounds.ts / cursorFx.ts setzen diese globalen Objekte). */
export interface BgController { update(o: Record<string, unknown>): BgController; setPaused(p: boolean): BgController; destroy(): void; }
declare global {
  interface Window {
    JTechBackgrounds?: { attach(el: HTMLElement, o: Record<string, unknown>): BgController | null; detach(el: HTMLElement): void };
    JTechCursorEffects?: { apply(o: Record<string, unknown>): void };
  }
}
