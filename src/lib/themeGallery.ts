import { JTECH_DEFAULT, PRESETS, luminance, type FontId, type ThemeSpec } from "./theme";

/**
 * Theme gallery: the 12 ported presets plus additional curated themes (dark and light).
 * Bundled with the app (no remote install). Each entry is a normal ThemeSpec, so apply,
 * duplicate and export use the existing JSON format.
 */
export interface GalleryTheme { theme: ThemeSpec; tags: ("dark" | "light" | "vivid" | "calm" | "classic")[]; }

const mk = (id: string, name: string, accent: string, accent2: string, bg: string, text: string, textDim: string, radius: number,
  extra: Partial<Pick<ThemeSpec, "glass" | "blur" | "glow" | "font">> = {}): ThemeSpec => ({
  id, name, mode: luminance(bg) > 0.4 ? "light" : "dark", accent, accent2, bg, text, textDim, radius,
  glass: 78, blur: 18, glow: 0, font: "segoe" as FontId, customCss: "", ...extra,
});

export const EXTRA_THEMES: ThemeSpec[] = [
  mk("midnight", "Midnight", "#5b8cff", "#a78bfa", "#0a0e1a", "#e6ebff", "#8a93b2", 12),
  mk("aurora", "Aurora", "#34d399", "#60a5fa", "#071318", "#e3fbf3", "#83a8a0", 14, { glow: 25 }),
  mk("ember", "Ember", "#f97316", "#facc15", "#140c08", "#fff1e6", "#b39280", 10, { glow: 20 }),
  mk("ocean", "Ocean", "#0ea5e9", "#22d3ee", "#06131f", "#e2f3ff", "#7f9cb3", 12),
  mk("rose", "Rosé", "#f43f5e", "#fb7185", "#170a0e", "#ffe9ee", "#b48a94", 16),
  mk("mono", "Mono", "#e5e7eb", "#9ca3af", "#0b0b0c", "#f3f4f6", "#8b8f97", 6, { font: "cascadia" }),
  mk("lavender", "Lavender", "#8b5cf6", "#ec4899", "#f5f3ff", "#1f1633", "#5f5578", 14),
  mk("mint", "Mint", "#0d9488", "#22c55e", "#effaf6", "#10261f", "#4d6b61", 12),
  mk("sand", "Sand", "#b45309", "#0f766e", "#f7f1e7", "#2b2117", "#6d5d4b", 10, { font: "georgia" }),
  mk("arctic", "Arctic", "#2563eb", "#06b6d4", "#f4f8fc", "#0f1a2a", "#56657a", 12),
];

const TAGS: Record<string, GalleryTheme["tags"]> = {
  jtech: ["classic"], synthwave: ["vivid"], toxic: ["vivid"], inferno: ["vivid"], hyperdrive: ["vivid"], nova: ["vivid"],
  graphite: ["calm"], forest: ["calm"], abyss: ["calm"], sakura: ["calm"], paper: ["classic"], daylight: ["classic"],
  midnight: ["calm"], aurora: ["vivid"], ember: ["vivid"], ocean: ["calm"], rose: ["vivid"], mono: ["classic"],
  lavender: ["calm"], mint: ["calm"], sand: ["classic"], arctic: ["classic"],
};

export const GALLERY: GalleryTheme[] = [...PRESETS, ...EXTRA_THEMES].map(theme => ({ theme, tags: [theme.mode, ...(TAGS[theme.id] ?? [])] }));
export const isBuiltinTheme = (id: string) => id === JTECH_DEFAULT.id || GALLERY.some(g => g.theme.id === id);
