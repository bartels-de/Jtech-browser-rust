import { useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { Favicon } from "../components/Favicon";
import { IconEdit, IconSearch, IconTrash } from "../components/Icons";
import { isWebUrl } from "../lib/urls";

export function BookmarksPage() {
  const b = useBrowser();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ id: string; title: string; url: string } | null>(null);
  const [nu, setNu] = useState({ title: "", url: "" });
  const ql = q.toLowerCase();
  const list = b.bookmarks.filter(x => !ql || x.title.toLowerCase().includes(ql) || x.url.toLowerCase().includes(ql));
  const addUrl = /^https?:\/\//.test(nu.url) ? nu.url : nu.url ? `https://${nu.url}` : "";
  return (
    <div className="page doc-page">
      <header className="page-head page-head-sticky row">
        <div><h1>Lesezeichen</h1><p className="muted">{b.bookmarks.length} gespeichert</p></div>
        <label className="search-field"><IconSearch size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Lesezeichen durchsuchen" aria-label="Lesezeichen durchsuchen" /></label>
      </header>
      <section className="card">
        <h2>Neues Lesezeichen</h2>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); if (isWebUrl(addUrl)) { b.addBookmark(addUrl, nu.title); setNu({ title: "", url: "" }); } }}>
          <input placeholder="Name" aria-label="Name" value={nu.title} onChange={e => setNu({ ...nu, title: e.target.value })} />
          <input placeholder="Adresse, z. B. wikipedia.org" aria-label="Adresse" value={nu.url} onChange={e => setNu({ ...nu, url: e.target.value })} spellCheck={false} />
          <button className="btn primary" disabled={!nu.url.includes(".")}>Speichern</button>
        </form>
      </section>
      <section className="card list-card">
        {list.length === 0 && <div className="empty-state">{q
          ? <><h2>Keine Treffer</h2><p>Kein Lesezeichen passt zu „{q}“.</p><button className="btn" onClick={() => setQ("")}>Suche zurücksetzen</button></>
          : <><h2>Noch keine Lesezeichen</h2><p>Speichere Seiten mit dem Stern in der Adressleiste oder mit Strg+D – oder füge oben eine Adresse hinzu.</p></>}</div>}
        {list.map(bm => edit?.id === bm.id ? (
          <form key={bm.id} className="list-row editing" onSubmit={e => { e.preventDefault(); b.updateBookmark(bm.id, { title: edit.title, url: edit.url }); setEdit(null); }}>
            <Favicon url={bm.url} />
            <input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} autoFocus />
            <input value={edit.url} onChange={e => setEdit({ ...edit, url: e.target.value })} />
            <button className="btn primary" disabled={!isWebUrl(edit.url)}>Speichern</button>
            <button type="button" className="btn ghost" onClick={() => setEdit(null)}>Abbrechen</button>
          </form>
        ) : (
          <div key={bm.id} className="list-row" onClick={() => b.navigate(bm.url)}>
            <Favicon url={bm.url} />
            <span className="row-title" title={bm.title}>{bm.title}</span>
            <span className="row-host" title={bm.url}>{bm.url}</span>
            <button className="icon-btn sm" title="Bearbeiten" aria-label="Bearbeiten" onClick={e => { e.stopPropagation(); setEdit({ id: bm.id, title: bm.title, url: bm.url }); }}><IconEdit size={14} /></button>
            <button className="icon-btn sm" title="Löschen" aria-label="Löschen" onClick={e => { e.stopPropagation(); b.removeBookmark(bm.id); }}><IconTrash size={14} /></button>
          </div>
        ))}
      </section>
    </div>
  );
}
