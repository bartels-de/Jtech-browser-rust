import { useBrowser } from "../store/BrowserStore";
import { useT } from "../i18n";
import { DownloadList } from "../components/DownloadList";

/** Runde 3: echte Download-Verwaltung (WebView2 DownloadStarting, siehe docs/ROUND3.md). */
export function DownloadsPage() {
  const b = useBrowser();
  const { t } = useT();
  const running = b.downloads.filter(d => d.live && d.state === "progressing").length;
  return (
    <div className="page doc-page">
      <header className="page-head row">
        <div><h1>{t("page.downloads")}</h1><p className="muted">{running ? t("c.running", { count: running }) : t("dlp.folderHint")}</p></div>
        <button className="btn ghost" disabled={!b.downloads.some(d => d.state !== "progressing")} onClick={b.clearDownloads}>{t("dlp.clearList")}</button>
      </header>
      <section className="card list-card"><DownloadList /></section>
      <p className="muted small">{t("dlp.note")}</p>
    </div>
  );
}
