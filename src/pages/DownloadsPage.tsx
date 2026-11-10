import { useMemo, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { useT } from "../i18n";
import { DownloadList } from "../components/DownloadList";
import { PageShell } from "../components/PageShell";

type Filter = "all" | "active" | "completed" | "interrupted";

export function DownloadsPage() {
  const b = useBrowser();
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const active = b.downloads.filter(d => d.live && (d.state === "progressing" || (d.state === "interrupted" && d.paused)));
  const completed = b.downloads.filter(d => d.state === "completed");
  const interrupted = b.downloads.filter(d => d.state === "interrupted" && !d.paused);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return b.downloads.filter(d => {
      const matchesFilter = filter === "all" || (filter === "active" && (d.state === "progressing" || (d.live && d.paused))) || (filter === "completed" && d.state === "completed") || (filter === "interrupted" && d.state === "interrupted" && !d.paused);
      return matchesFilter && (!q || `${d.fileName} ${d.url} ${d.path}`.toLocaleLowerCase().includes(q));
    });
  }, [b.downloads, filter, query]);
  const filters: [Filter, string, number][] = [["all", t("dlp.all"), b.downloads.length], ["active", t("dlp.active"), active.length], ["completed", t("dlp.completed"), completed.length], ["interrupted", t("dlp.interrupted"), interrupted.length]];
  const subtitle = active.length ? t("dlp.activeSummary", { count: active.length }) : t("dlp.folderHint");
  return (
    <PageShell title={t("page.downloads")} subtitle={subtitle}
      actions={<button className="btn ghost" disabled={!b.downloads.some(d => d.state !== "progressing")} onClick={b.clearDownloads}>{t("dlp.clearList")}</button>}>
      <section className="card dl-manager">
        <div className="dl-toolbar">
          <label className="dl-search"><span className="sr-only">{t("dlp.search")}</span><input className="text-input" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("dlp.searchPlaceholder")} /></label>
          <div className="dl-filters" role="group" aria-label={t("dlp.filterDownloads")}>
            {filters.map(([id, label, count]) => <button key={id} className={`btn sm ${filter === id ? "primary" : "ghost"}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span className="dl-filter-count">{count}</span></button>)}
          </div>
        </div>
        <DownloadList items={filtered} />
        {!filtered.length && b.downloads.length > 0 && <p className="muted dl-no-results">{t("dlp.noResults")}</p>}
      </section>
      <p className="muted small page-note">{t("dlp.note")}</p>
    </PageShell>
  );
}
