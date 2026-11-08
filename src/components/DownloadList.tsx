import { useBrowser } from "../store/BrowserStore";
import type { DownloadItem } from "../store/types";
import { hostOf } from "../lib/urls";
import { IconClose, IconDownload } from "./Icons";

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "?";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString("de-DE", { maximumFractionDigits: i === 0 ? 0 : 1 })} ${u[i]}`;
}

export function stateText(d: DownloadItem): string {
  if (d.state === "completed") return `Fertig · ${formatBytes(d.received || d.total)}`;
  if (d.state === "interrupted") {
    if (d.paused) return `Pausiert · ${formatBytes(d.received)}${d.total > 0 ? " / " + formatBytes(d.total) : ""}`;
    if (!d.live) return "Abgebrochen (frühere Sitzung)";
    return d.interruptReason === 26 || d.interruptReason === 0 ? "Abgebrochen" : `Unterbrochen (Grund ${d.interruptReason})`;
  }
  return `${formatBytes(d.received)}${d.total > 0 ? " / " + formatBytes(d.total) : ""}`;
}

/** Runde 3: Download-Liste (Toolbar-Panel kompakt, jtech://downloads ausfuehrlich). */
export function DownloadList({ compact = false, limit }: { compact?: boolean; limit?: number }) {
  const b = useBrowser();
  const list = limit ? b.downloads.slice(0, limit) : b.downloads;
  if (!list.length) return <div className="empty"><IconDownload size={compact ? 22 : 32} /><p>Noch keine Downloads.</p></div>;
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
                <span>{stateText(d)}{running && pct !== null ? ` · ${pct} %` : ""}</span>
                {!compact && <span className="muted"> · {hostOf(d.url)}</span>}
              </div>
            </div>
            <div className="dl-actions">
              {running && <button className="btn ghost sm" onClick={() => b.downloadAction(d.id, "pause")}>Pause</button>}
              {paused && <button className="btn ghost sm" disabled={!d.canResume} onClick={() => b.downloadAction(d.id, "resume")}>Fortsetzen</button>}
              {(running || paused) && <button className="btn ghost sm" onClick={() => b.downloadAction(d.id, "cancel")}>Abbrechen</button>}
              {d.live && d.state === "completed" && <button className="btn ghost sm" onClick={() => b.openDownload(d.id, false)}>Öffnen</button>}
              {d.live && d.state === "completed" && <button className="btn ghost sm" onClick={() => b.openDownload(d.id, true)}>Im Ordner zeigen</button>}
              {!running && !paused && <button className="icon-btn sm" title="Aus Liste entfernen" onClick={() => b.removeDownload(d.key)}><IconClose size={13} /></button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
