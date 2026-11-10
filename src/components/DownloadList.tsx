import type { DownloadItem } from "../store/types";
import { useBrowser } from "../store/BrowserStore";
import { hostOf } from "../lib/urls";
import { fmtBytes, fmtPct, t, useT } from "../i18n";
import { IconClose, IconDownload } from "./Icons";

export function formatBytes(n: number): string { return fmtBytes(n); }

export function stateText(d: DownloadItem): string {
  const prog = `${formatBytes(d.received)}${d.total > 0 ? " / " + formatBytes(d.total) : ""}`;
  if (d.state === "completed") return t("dl.done", { size: formatBytes(d.received || d.total) });
  if (d.state === "interrupted") {
    if (d.paused) return t("dl.paused", { size: prog });
    if (!d.live) return t("dl.cancelledPrev");
    return d.interruptReason === 26 || d.interruptReason === 0 ? t("dl.cancelled") : t("dl.interrupted", { reason: String(d.interruptReason) });
  }
  return prog;
}

/** Runde 3: Download-Liste (Toolbar-Panel kompakt, jtech://downloads ausfuehrlich). */
export function DownloadList({ compact = false, limit, items }: { compact?: boolean; limit?: number; items?: DownloadItem[] }) {
  const b = useBrowser();
  useT();
  const source = items ?? b.downloads;
  const list = limit ? source.slice(0, limit) : source;
  if (!list.length) return <div className="empty dl-empty"><IconDownload size={compact ? 22 : 32} /><p>{t("dl.empty")}</p></div>;
  return (
    <div className={`dl-list${compact ? " compact" : ""}`}>
      {list.map(d => {
        const pct = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : null;
        const running = d.live && d.state === "progressing";
        const paused = d.live && d.state === "interrupted" && d.paused;
        const speed = d.speedBytesPerSec > 0 ? `${formatBytes(d.speedBytesPerSec)}/s` : "";
        const status = running ? t("dlp.downloading") : paused ? t("dl.pausedShort") : d.state === "completed" ? t("dlp.completed") : t("dlp.interrupted");
        return (
          <article key={d.key} className={`dl-row dl-${d.state}${paused ? " dl-paused" : ""}${running ? " dl-running" : ""}`}>
            <span className="dl-icon"><IconDownload size={18} /></span>
            <div className="dl-main">
              <div className="dl-title-line"><div className="dl-name" title={d.path}>{d.fileName || d.url}</div><span className={`dl-status dl-status-${running ? "active" : paused ? "paused" : d.state}`}>{status}</span></div>
              {(running || paused) && <div className="dl-bar" role="progressbar" aria-label={status} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}><span style={{ width: pct === null ? "35%" : `${pct}%` }} className={pct === null ? "indeterminate" : ""} /></div>}
              <div className="dl-meta">
                <span>{running || paused ? stateText(d) : d.state === "completed" ? formatBytes(d.received || d.total) : stateText(d)}{(running || paused) && pct !== null ? ` · ${fmtPct(pct)}` : ""}</span>
                {running && speed && <span className="dl-speed">{speed}</span>}
                {!compact && <span className="muted dl-source">{hostOf(d.url)}</span>}
              </div>
            </div>
            <div className="dl-actions">
              {running && <button className="btn ghost sm" onClick={() => b.downloadAction(d.id, "pause")}>{t("dl.pause")}</button>}
              {paused && <button className="btn primary sm" disabled={!d.canResume} onClick={() => b.downloadAction(d.id, "resume")}>{t("dl.resume")}</button>}
              {(running || paused) && <button className="icon-btn sm dl-cancel" title={t("c.cancel")} aria-label={t("c.cancel")} onClick={() => b.downloadAction(d.id, "cancel")}><IconClose size={14} /></button>}
              {d.live && d.state === "completed" && <button className="btn primary sm" onClick={() => b.openDownload(d.id, false)}>{t("c.open")}</button>}
              {d.live && d.state === "completed" && <button className="btn ghost sm" onClick={() => b.openDownload(d.id, true)}>{t("dl.reveal")}</button>}
              {!running && !paused && <button className="icon-btn sm" title={t("dl.removeFromList")} aria-label={t("dl.removeFromList")} onClick={() => b.removeDownload(d.key)}><IconClose size={13} /></button>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
