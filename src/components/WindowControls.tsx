import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconWinClose, IconWinMax, IconWinMin, IconWinRestore } from "./Icons";

/**
 * Own caption buttons for the frameless main window (Windows 11 style).
 * Note: the Windows 11 Snap Layouts flyout (hover on maximize) is a feature of the
 * native caption button and is not available here; Win+Z and edge snapping still work.
 */
export function WindowControls() {
  const [max, setMax] = useState(false);
  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    try {
      const w = getCurrentWindow();
      const sync = () => { w.isMaximized().then(v => { if (alive) setMax(v); }).catch(() => {}); };
      sync();
      w.onResized(sync).then(u => { if (alive) off = u; else u(); }).catch(() => {});
    } catch { /* not inside Tauri (preview) */ }
    return () => { alive = false; off?.(); };
  }, []);
  const run = (f: (w: ReturnType<typeof getCurrentWindow>) => Promise<void>) => () => {
    try { f(getCurrentWindow()).catch(() => {}); } catch { /* preview */ }
  };
  return (
    <div className="win-controls" role="group" aria-label="Fenster">
      <button className="win-btn" title="Minimieren" aria-label="Minimieren" onClick={run(w => w.minimize())}><IconWinMin /></button>
      <button className="win-btn" title={max ? "Verkleinern" : "Maximieren"} aria-label={max ? "Verkleinern" : "Maximieren"}
        onClick={run(w => w.toggleMaximize())}>{max ? <IconWinRestore /> : <IconWinMax />}</button>
      <button className="win-btn close" title="Schließen" aria-label="Schließen" onClick={run(w => w.close())}><IconWinClose /></button>
    </div>
  );
}
