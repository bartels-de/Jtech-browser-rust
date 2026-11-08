import { useState } from "react";
import { IconPuzzle } from "./Icons";

/**
 * Extension icon. The backend returns the manifest's SVG icon as text (iconSvg). It is shown through
 * an <img> data: URL, so scripts or external references inside the SVG never run in the UI webview.
 * Fallback (no icon, non-SVG icon, or not bundled yet - market entries carry no icon): puzzle tile.
 */
export function ExtIcon({ svg, size = 40, name }: { svg?: string | null; size?: number; name?: string }) {
  const [broken, setBroken] = useState(false);
  const ok = !!svg && !broken && /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg) && svg.length < 200_000;
  return (
    <span className="ext-icon" style={{ width: size, height: size }} aria-hidden>
      {ok
        ? <img src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg!)} width={size * 0.72} height={size * 0.72} alt="" onError={() => setBroken(true)} />
        : <span className="ext-icon-fallback" title={name}><IconPuzzle size={Math.round(size * 0.5)} /></span>}
    </span>
  );
}
