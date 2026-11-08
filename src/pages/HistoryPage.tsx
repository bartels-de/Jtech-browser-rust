import { useMemo, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { Favicon } from "../components/Favicon";
import { IconSearch, IconTrash } from "../components/Icons";
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
    <div className="page doc-page">
      <header className="page-head page-head-sticky row">
        <div><h1>{t("page.history")}</h1><p className="muted">{t("hist.entries", { count: b.history.length })}</p></div>
        <div className="row gap">
          <label className="search-field"><IconSearch size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={t("hist.search")} aria-label={t("hist.search")} autoFocus /></label>
          <button className="btn danger" disabled={!b.history.length} onClick={() => confirm(t("hist.clearConfirm")) && b.clearHistory()}>{t("hist.clear")}</button>
        </div>
      </header>
      {groups.length === 0 && <div className="empty-state card">{q
        ? <><h2>{t("c.noResults")}</h2><p>{t("hist.noMatch", { q })}</p><button className="btn" onClick={() => setQ("")}>{t("c.clearSearch")}</button></>
        : <><h2>{t("hist.emptyTitle")}</h2><p>{t("hist.emptyText")}</p></>}</div>}
      {groups.map(g => (
        <section key={g.day} className="card list-card">
          <h2 className="list-day">{g.day}</h2>
          {g.items.map(h => (
            <div key={h.id} className="list-row" onClick={() => b.navigate(h.url)}>
              <span className="time">{fmtTime(h.visitedAt)}</span>
              <Favicon url={h.url} />
              <span className="row-title" title={h.title}>{h.title}</span>
              <span className="row-host" title={h.url}>{hostOf(h.url)}</span>
              <button className="icon-btn sm" title={t("hist.removeEntry")} aria-label={t("hist.removeEntry")} onClick={e => { e.stopPropagation(); b.removeHistory(h.id); }}><IconTrash size={14} /></button>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
