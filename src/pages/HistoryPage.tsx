import { useMemo, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { Favicon } from "../components/Favicon";
import { IconHistory, IconSearch, IconTrash } from "../components/Icons";
import { PageShell } from "../components/PageShell";
import { EmptyState } from "../components/EmptyState";
import { fmtDate, fmtTime, t, useT } from "../i18n";
import { hostOf } from "../lib/urls";

const dayLabel = (ts: number) => {
  const d = new Date(ts); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t("hist.today");
  if (d.toDateString() === y.toDateString()) return t("hist.yesterday");
  return fmtDate(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

export function HistoryPage() {
  const b = useBrowser();
  const { lang } = useT();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const ql = q.toLowerCase();
    const list = b.history.filter(h => !ql || h.title.toLowerCase().includes(ql) || h.url.toLowerCase().includes(ql)).slice(0, 500);
    const out: { day: string; items: typeof list }[] = [];
    for (const h of list) {
      const day = dayLabel(h.visitedAt);
      if (out[out.length - 1]?.day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(h);
    }
    return out;
  }, [b.history, q, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PageShell title={t("page.history")} subtitle={t("hist.entries", { count: b.history.length })} sticky
      actions={<>
        <label className="search-field"><IconSearch size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={t("hist.search")} aria-label={t("hist.search")} autoFocus /></label>
        <button className="btn ghost danger" disabled={!b.history.length} onClick={() => confirm(t("hist.clearConfirm")) && b.clearHistory()}>{t("hist.clear")}</button>
      </>}>
      {groups.length === 0 && (q
        ? <EmptyState card icon={<IconSearch size={20} />} title={t("c.noResults")} text={t("hist.noMatch", { q })} action={<button className="btn" onClick={() => setQ("")}>{t("c.clearSearch")}</button>} />
        : <EmptyState card icon={<IconHistory size={20} />} title={t("hist.emptyTitle")} text={t("hist.emptyText")} />)}
      {groups.map(g => (
        <section key={g.day} className="list-group" aria-label={g.day}>
          <h2 className="group-label">{g.day}</h2>
          <div className="card list-card">
          {g.items.map(h => (
            <div key={h.id} className="list-row" onClick={() => b.navigate(h.url)}>
              <span className="time">{fmtTime(h.visitedAt)}</span>
              <Favicon url={h.url} />
              <span className="row-title" title={h.title}>{h.title}</span>
              <span className="row-host" title={h.url}>{hostOf(h.url)}</span>
              <button className="icon-btn sm" title={t("hist.removeEntry")} aria-label={t("hist.removeEntry")} onClick={e => { e.stopPropagation(); b.removeHistory(h.id); }}><IconTrash size={14} /></button>
            </div>
          ))}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
