import { useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { SEARCH_ENGINES, hostOf } from "../lib/urls";
import { Favicon } from "../components/Favicon";
import { IconSearch, IconShield, JTechLogo } from "../components/Icons";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
}

export function StartPage() {
  const b = useBrowser();
  const [q, setQ] = useState("");
  const engine = SEARCH_ENGINES[b.settings.searchEngine].name;
  const tiles = b.bookmarks.slice(0, 12);
  return (
    <div className="page start-page">
      <div className="start-glow" aria-hidden />
      <div className="start-inner">
        <div className="start-brand"><JTechLogo size={56} /><div><h1>{greeting()}</h1><p className="muted">JTech Browser · privat und schnell</p></div></div>
        <form className="start-search glass" onSubmit={e => { e.preventDefault(); if (q.trim()) b.navigate(q); }}>
          <IconSearch size={18} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Mit ${engine} suchen oder Adresse eingeben`} spellCheck={false} />
          <kbd>Enter</kbd>
        </form>
        <div className="tiles">
          {tiles.map(bm => (
            <button key={bm.id} className="tile glass" onClick={() => b.navigate(bm.url)} title={bm.url}>
              <span className="tile-icon"><Favicon url={bm.url} size={24} /></span>
              <span className="tile-title">{bm.title}</span>
              <span className="tile-host">{hostOf(bm.url).replace(/^www\./, "")}</span>
            </button>
          ))}
          {tiles.length === 0 && <p className="muted small tiles-empty">Gespeicherte Lesezeichen erscheinen hier als Kacheln.</p>}
        </div>
        <button className="start-shield glass" onClick={() => b.openPage("privacy")}>
          <IconShield size={16} /><span><strong>{b.totalBlocked.toLocaleString("de-DE")}</strong> Tracker und Werbeanfragen blockiert</span>
        </button>
      </div>
    </div>
  );
}
