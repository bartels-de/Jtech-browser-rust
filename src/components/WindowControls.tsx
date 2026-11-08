import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useT } from "../i18n";
import { IconWinClose, IconWinMax, IconWinMin, IconWinRestore } from "./Icons";

/**
 * Own caption buttons for the frameless main window (Windows 11 style).
 * Note: the Windows 11 Snap Layouts flyout (hover on maximize) is a feature of the
 * native caption button and is not available here; Win+Z and edge snapping still work.
 */
export function WindowControls() {
  const { t } = useT();
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
    <div className="win-controls" role="group" aria-label={t("win.label")}>
      <button className="win-btn" title={t("win.min")} aria-label={t("win.min")} onClick={run(w => w.minimize())}><IconWinMin /></button>
      <button className="win-btn" title={max ? t("win.restore") : t("win.max")} aria-label={max ? t("win.restore") : t("win.max")}
        onClick={run(w => w.toggleMaximize())}>{max ? <IconWinRestore /> : <IconWinMax />}</button>
      <button className="win-btn close" title={t("c.close")} aria-label={t("c.close")} onClick={run(w => w.close())}><IconWinClose /></button>
    </div>
  );
}
