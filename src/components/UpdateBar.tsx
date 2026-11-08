import { useEffect } from "react";
import { useBrowser } from "../store/BrowserStore";
import { fmtPct, useT } from "../i18n";
import { checkForUpdate, dismissUpdateBar, downloadUpdate, installAndRestart, useUpdater } from "../lib/updater";

/**
 * Auto-update: unobtrusive notification bar in the header (outside the content rect, the
 * page webview just moves down). Also schedules the automatic background checks.
 */
export function UpdateBar() {
  const b = useBrowser();
  const u = useUpdater();
  const { t } = useT();
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
        <strong>{t("up.available", { version: u.version ?? "" })}</strong>
        <span className="muted">{t("up.installed", { version: u.currentVersion || "?" })}</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => downloadUpdate()}>{t("c.download")}</button>
        <button className="btn ghost" onClick={details}>{t("c.details")}</button>
        <button className="btn ghost" onClick={dismissUpdateBar} title={t("up.hideTitle")}>{t("c.later")}</button>
      </>}
      {u.phase === "downloading" && <>
        <strong>{t("up.loading", { version: u.version ?? "" })}</strong>
        <progress className="update-progress" max={100} value={pct} aria-label={t("up.progress")} />
        <span className="muted">{pct === undefined ? "…" : fmtPct(pct)}</span>
      </>}
      {(u.phase === "ready" || u.phase === "installing") && <>
        <strong>{t("up.ready", { version: u.version ?? "" })}</strong>
        <span className="muted">{t("up.readyHint")}</span>
        <span className="spacer" />
        <button className="btn primary" disabled={u.phase === "installing"} onClick={() => installAndRestart()}>{u.phase === "installing" ? t("up.installing") : t("up.restartNow")}</button>
        <button className="btn ghost" onClick={dismissUpdateBar}>{t("c.later")}</button>
      </>}
    </div>
  );
}
