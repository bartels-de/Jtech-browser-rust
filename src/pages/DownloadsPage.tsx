import { useBrowser } from "../store/BrowserStore";
import { useT } from "../i18n";
import { DownloadList } from "../components/DownloadList";
import { PageShell } from "../components/PageShell";

/** Runde 3: echte Download-Verwaltung (WebView2 DownloadStarting, siehe docs/ROUND3.md). */
export function DownloadsPage() {
  const b = useBrowser();
  const { t } = useT();
  const running = b.downloads.filter(d => d.live && d.state === "progressing").length;
  return (
    <PageShell title={t("page.downloads")} subtitle={running ? t("c.running", { count: running }) : t("dlp.folderHint")}
      actions={<button className="btn ghost" disabled={!b.downloads.some(d => d.state !== "progressing")} onClick={b.clearDownloads}>{t("dlp.clearList")}</button>}>
      <section className="card list-card"><DownloadList /></section>
      <p className="muted small page-note">{t("dlp.note")}</p>
    </PageShell>
  );
}
