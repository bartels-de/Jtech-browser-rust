import { useEffect } from "react";
import { useBrowser } from "../store/BrowserStore";
import { checkForUpdate, dismissUpdateBar, downloadUpdate, installAndRestart, useUpdater } from "../lib/updater";

/**
 * Auto-update: unobtrusive notification bar in the header (outside the content rect, the
 * page webview just moves down). Also schedules the automatic background checks.
 */
export function UpdateBar() {
  const b = useBrowser();
  const u = useUpdater();
  const { autoUpdateCheck, updateIntervalHours } = b.settings;

  useEffect(() => {
    if (!autoUpdateCheck) return;
    const first = window.setTimeout(() => { checkForUpdate(true); }, 15000);
    const every = updateIntervalHours > 0
      ? window.setInterval(() => { checkForUpdate(true); }, updateIntervalHours * 3600 * 1000)
      : undefined;
    return () => { window.clearTimeout(first); if (every) window.clearInterval(every); };
  }, [autoUpdateCheck, updateIntervalHours]);

  const show = (u.phase === "available" || u.phase === "downloading" || u.phase === "ready" || u.phase === "installing") && u.dismissed !== u.version;
  if (!show) return null;
  const pct = u.progress === undefined ? undefined : Math.round(u.progress * 100);
  const details = () => b.openPage("settings", { section: "about" });

  return (
    <div className="banner update-bar" role="status">
      {u.phase === "available" && <>
        <strong>JTech {u.version} ist verfügbar</strong>
        <span className="muted">Installiert: {u.currentVersion || "?"}</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => downloadUpdate()}>Herunterladen</button>
        <button className="btn ghost" onClick={details}>Details</button>
        <button className="btn ghost" onClick={dismissUpdateBar} title="Bis zum nächsten Update ausblenden">Später</button>
      </>}
      {u.phase === "downloading" && <>
        <strong>Update {u.version} wird geladen</strong>
        <progress className="update-progress" max={100} value={pct} aria-label="Download-Fortschritt" />
        <span className="muted">{pct === undefined ? "…" : `${pct} %`}</span>
      </>}
      {(u.phase === "ready" || u.phase === "installing") && <>
        <strong>Update {u.version} ist bereit</strong>
        <span className="muted">Wird beim Neustart installiert – offene Tabs werden wiederhergestellt, wenn „Sitzung wiederherstellen“ an ist.</span>
        <span className="spacer" />
        <button className="btn primary" disabled={u.phase === "installing"} onClick={() => installAndRestart()}>{u.phase === "installing" ? "Wird installiert…" : "Jetzt neu starten"}</button>
        <button className="btn ghost" onClick={dismissUpdateBar}>Später</button>
      </>}
    </div>
  );
}
