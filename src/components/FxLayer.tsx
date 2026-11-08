import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useBrowser } from "../store/BrowserStore";
import { call } from "../lib/ipc";
import { QUALITY, cursorCss, cursorSpec } from "../lib/fx/effects";
import "../lib/fx/backgrounds";
import "../lib/fx/cursorFx";

/**
 * Runde 5: animierter Hintergrund (Canvas hinter der Oberflaeche), eigener Cursor und Cursor-Spur.
 * Alles wirkt nur in der UI-Webview (Seitenleiste, Kopfbereich, interne Seiten). Die native
 * Webseiten-Webview liegt darueber; dort nur ueber set_page_fx (Einstellung "Auch auf Webseiten").
 */
export function FxLayer() {
  const b = useBrowser();
  const e = b.settings.effects;
  const ref = useRef<HTMLDivElement>(null);
  const [minimized, setMinimized] = useState(false);
  const webShown = !!b.activeTab && !b.activeTab.internal && !b.activeTab.sleeping;
  const paused = minimized || (e.pauseOnWeb && webShown);

  // Fenster minimiert -> Animation anhalten (document.hidden deckt das nicht immer ab)
  useEffect(() => {
    let un: (() => void) | undefined;
    try {
      const w = getCurrentWindow();
      w.onResized(() => { w.isMinimized().then(setMinimized, () => {}); }).then(f => { un = f; }, () => {});
    } catch { /* ausserhalb von Tauri */ }
    return () => un?.();
  }, []);

  // Hintergrund
  const themeSig = JSON.stringify(b.customTheme) + b.settings.theme;
  useEffect(() => {
    const el = ref.current, api = window.JTechBackgrounds;
    if (!el || !api) return;
    if (!e.bgEnabled) { api.detach(el); return; }
    // Nach applyTheme (Effekt des Stores laeuft nach diesem Kind-Effekt) die Farben lesen.
    const t = setTimeout(() => {
      const cs = getComputedStyle(document.documentElement);
      const v = (n: string, f: string) => { const x = cs.getPropertyValue(n).trim(); return /^#[0-9a-f]{6}$/i.test(x) ? x : f; };
      const q = QUALITY[e.quality];
      api.attach(el, {
        id: e.background, accent: v("--accent", "#2cc5c9"), accentAlt: v("--accent-2", "#5fe0d6"), bg: v("--bg", "#0f1215"), text: v("--text", "#e7ecef"),
        intensity: e.bgIntensity / 100, glow: e.bgGlow / 100, speed: e.bgSpeed / 100, fps: q.fps, quality: q.scale, paused, hidden: false,
      });
    }, 0);
    return () => clearTimeout(t);
  }, [e.bgEnabled, e.background, e.bgIntensity, e.bgGlow, e.bgSpeed, e.quality, paused, themeSig]);
  useEffect(() => { const el = ref.current; return () => { if (el) window.JTechBackgrounds?.detach(el); }; }, []);

  useEffect(() => {
    const r = document.documentElement;
    r.classList.toggle("fx-bg", e.bgEnabled);
    r.style.setProperty("--fx-surface", `${e.surfaceAlpha}%`);
  }, [e.bgEnabled, e.surfaceAlpha]);

  // Eigener Cursor (nur UI)
  const spec = cursorSpec(e);
  const css = spec ? cursorCss(spec) : "";
  useEffect(() => {
    let st = document.getElementById("jtech-cursor-style") as HTMLStyleElement | null;
    if (!css) { st?.remove(); return; }
    if (!st) { st = document.createElement("style"); st.id = "jtech-cursor-style"; document.head.appendChild(st); }
    st.textContent = `*, *::before, *::after { cursor: ${css} !important; }`;
  }, [css]);

  // Cursor-Spur (nur UI)
  useEffect(() => {
    window.JTechCursorEffects?.apply({ effect: e.trail, color: e.trailColor, colorAlt: e.trailColor2, size: e.trailSize, intensity: e.trailIntensity, length: e.trailLength });
  }, [e.trail, e.trailColor, e.trailColor2, e.trailSize, e.trailIntensity, e.trailLength]);

  // Optional: Cursor + Spur auch in Webseiten (Rust injiziert bei DOMContentLoaded)
  const pageCfg = e.inPages && (spec || e.trail !== "none")
    ? { effect: e.trail, color: e.trailColor, colorAlt: e.trailColor2, size: e.trailSize, intensity: e.trailIntensity, length: e.trailLength, cursor: spec?.url ?? null, hotX: spec?.x ?? 0, hotY: spec?.y ?? 0 }
    : null;
  const pageSig = JSON.stringify(pageCfg);
  useEffect(() => { call("set_page_fx", { config: pageCfg }, m => console.warn(m)); }, [pageSig]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} className="fx-layer" aria-hidden />;
}
