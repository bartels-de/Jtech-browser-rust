import { useMemo, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { Favicon } from "../components/Favicon";
import { IconSearch, IconTrash } from "../components/Icons";
import { hostOf } from "../lib/urls";

const dayLabel = (ts: number) => {
  const d = new Date(ts); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Heute";
  if (d.toDateString() === y.toDateString()) return "Gestern";
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

export function HistoryPage() {
  const b = useBrowser();
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
  }, [b.history, q]);
  return (
    <div className="page doc-page">
      <header className="page-head row">
        <div><h1>Verlauf</h1><p className="muted">{b.history.length} Einträge</p></div>
        <div className="row gap">
          <label className="search-field"><IconSearch size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Verlauf durchsuchen" autoFocus /></label>
          <button className="btn danger" disabled={!b.history.length} onClick={() => confirm("Gesamten Verlauf löschen?") && b.clearHistory()}>Alles löschen</button>
        </div>
      </header>
      {groups.length === 0 && <div className="empty card">{q ? "Keine Treffer." : "Noch kein Verlauf. Besuchte Seiten erscheinen hier."}</div>}
      {groups.map(g => (
        <section key={g.day} className="card list-card">
          <h2>{g.day}</h2>
          {g.items.map(h => (
            <div key={h.id} className="list-row" onClick={() => b.navigate(h.url)}>
              <span className="time">{new Date(h.visitedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
              <Favicon url={h.url} />
              <span className="row-title">{h.title}</span>
              <span className="row-host">{hostOf(h.url)}</span>
              <button className="icon-btn sm" title="Eintrag entfernen" onClick={e => { e.stopPropagation(); b.removeHistory(h.id); }}><IconTrash size={14} /></button>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
