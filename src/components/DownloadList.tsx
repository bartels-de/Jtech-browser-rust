import { useBrowser } from "../store/BrowserStore";
import type { DownloadItem } from "../store/types";
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
export function DownloadList({ compact = false, limit }: { compact?: boolean; limit?: number }) {
  const b = useBrowser();
  useT();
  const list = limit ? b.downloads.slice(0, limit) : b.downloads;
  if (!list.length) return <div className="empty dl-empty"><IconDownload size={compact ? 22 : 32} /><p>{t("dl.empty")}</p></div>;
  return (
    <div className={`dl-list${compact ? " compact" : ""}`}>
      {list.map(d => {
        const pct = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : null;
        const running = d.live && d.state === "progressing";
        const paused = d.live && d.state === "interrupted" && d.paused;
        return (
          <div key={d.key} className={`dl-row dl-${d.state}${paused ? " dl-paused" : ""}`}>
            <span className="dl-icon"><IconDownload size={16} /></span>
            <div className="dl-main">
              <div className="dl-name" title={d.path}>{d.fileName || d.url}</div>
              {(running || paused) && <div className="dl-bar"><span style={{ width: pct === null ? "35%" : `${pct}%` }} className={pct === null ? "indeterminate" : ""} /></div>}
              <div className="dl-meta">
                <span>{stateText(d)}{running && pct !== null ? ` · ${fmtPct(pct)}` : ""}</span>
                {!compact && <span className="muted"> · {hostOf(d.url)}</span>}
              </div>
            </div>
            <div className="dl-actions">
              {running && <button className="btn ghost sm" onClick={() => b.downloadAction(d.id, "pause")}>{t("dl.pause")}</button>}
              {paused && <button className="btn ghost sm" disabled={!d.canResume} onClick={() => b.downloadAction(d.id, "resume")}>{t("dl.resume")}</button>}
              {(running || paused) && <button className="btn ghost sm" onClick={() => b.downloadAction(d.id, "cancel")}>{t("c.cancel")}</button>}
              {d.live && d.state === "completed" && <button className="btn ghost sm" onClick={() => b.openDownload(d.id, false)}>{t("c.open")}</button>}
              {d.live && d.state === "completed" && <button className="btn ghost sm" onClick={() => b.openDownload(d.id, true)}>{t("dl.reveal")}</button>}
              {!running && !paused && <button className="icon-btn sm" title={t("dl.removeFromList")} aria-label={t("dl.removeFromList")} onClick={() => b.removeDownload(d.key)}><IconClose size={13} /></button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
