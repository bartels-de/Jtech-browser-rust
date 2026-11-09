import { useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { Favicon } from "../components/Favicon";
import { IconEdit, IconSearch, IconTrash, IconBookmarks } from "../components/Icons";
import { PageShell } from "../components/PageShell";
import { EmptyState } from "../components/EmptyState";
import { useT } from "../i18n";
import { isWebUrl } from "../lib/urls";

export function BookmarksPage() {
  const b = useBrowser();
  const { t } = useT();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ id: string; title: string; url: string } | null>(null);
  const [nu, setNu] = useState({ title: "", url: "" });
  const ql = q.toLowerCase();
  const list = b.bookmarks.filter(x => !ql || x.title.toLowerCase().includes(ql) || x.url.toLowerCase().includes(ql));
  const addUrl = /^https?:\/\//.test(nu.url) ? nu.url : nu.url ? `https://${nu.url}` : "";
  return (
    <PageShell title={t("page.bookmarks")} subtitle={t("bm.saved", { count: b.bookmarks.length })} sticky
      actions={<label className="search-field"><IconSearch size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={t("bm.search")} aria-label={t("bm.search")} /></label>}>
      <section className="card">
        <h2>{t("bm.new")}</h2>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); if (isWebUrl(addUrl)) { b.addBookmark(addUrl, nu.title); setNu({ title: "", url: "" }); } }}>
          <input placeholder={t("c.name")} aria-label={t("c.name")} value={nu.title} onChange={e => setNu({ ...nu, title: e.target.value })} />
          <input placeholder={t("bm.addrPlaceholder")} aria-label={t("c.address")} value={nu.url} onChange={e => setNu({ ...nu, url: e.target.value })} spellCheck={false} />
          <button className="btn primary" disabled={!nu.url.includes(".")}>{t("c.save")}</button>
        </form>
      </section>
      <section className="card list-card">
        {list.length === 0 && (q
          ? <EmptyState icon={<IconSearch size={20} />} title={t("c.noResults")} text={t("bm.noMatch", { q })} action={<button className="btn" onClick={() => setQ("")}>{t("c.clearSearch")}</button>} />
          : <EmptyState icon={<IconBookmarks size={20} />} title={t("bm.emptyTitle")} text={t("bm.emptyText", { keys: b.keyHint("page.bookmark") ?? "" })} />)}
        {list.map(bm => edit?.id === bm.id ? (
          <form key={bm.id} className="list-row editing" onSubmit={e => { e.preventDefault(); b.updateBookmark(bm.id, { title: edit.title, url: edit.url }); setEdit(null); }}>
            <Favicon url={bm.url} />
            <input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} autoFocus aria-label={t("c.name")} />
            <input value={edit.url} onChange={e => setEdit({ ...edit, url: e.target.value })} aria-label={t("c.address")} />
            <button className="btn primary" disabled={!isWebUrl(edit.url)}>{t("c.save")}</button>
            <button type="button" className="btn ghost" onClick={() => setEdit(null)}>{t("c.cancel")}</button>
          </form>
        ) : (
          <div key={bm.id} className="list-row" onClick={() => b.navigate(bm.url)}>
            <Favicon url={bm.url} />
            <span className="row-title" title={bm.title}>{bm.title}</span>
            <span className="row-host" title={bm.url}>{bm.url}</span>
            <button className="icon-btn sm" title={t("c.edit")} aria-label={t("c.edit")} onClick={e => { e.stopPropagation(); setEdit({ id: bm.id, title: bm.title, url: bm.url }); }}><IconEdit size={14} /></button>
            <button className="icon-btn sm" title={t("c.delete")} aria-label={t("c.delete")} onClick={e => { e.stopPropagation(); b.removeBookmark(bm.id); }}><IconTrash size={14} /></button>
          </div>
        ))}
      </section>
    </PageShell>
  );
}
