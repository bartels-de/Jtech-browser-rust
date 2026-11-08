import { useEffect, useMemo, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { SEARCH_ENGINES, hostOf } from "../lib/urls";
import { Favicon } from "../components/Favicon";
import { IconHistory, IconPlus, IconSearch, IconShield } from "../components/Icons";

function greeting(h: number) {
  return h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
}

/** Laufende Uhr, minutengenau. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function StartPage() {
  const b = useBrowser();
  const [q, setQ] = useState("");
  const now = useNow();
  const engine = SEARCH_ENGINES[b.settings.searchEngine].name;
  const tiles = b.bookmarks.slice(0, 7);
  // Zuletzt besucht: je Host nur der juengste Eintrag
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof b.history = [];
    for (const h of b.history) {
      const host = hostOf(h.url);
      if (!host || seen.has(host)) continue;
      seen.add(host); out.push(h);
      if (out.length >= 4) break;
    }
    return out;
  }, [b.history]);
  const paletteKey = b.keyHint("ui.palette");
  const newTabKey = b.keyHint("tab.new");

  return (
    <div className="page start-page">
      <div className="start-glow" aria-hidden />
      <div className="start-inner">
        <header className="start-brand">
          <time className="start-clock" dateTime={now.toISOString()}>
            {now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
          </time>
          <p className="start-greet">
            {greeting(now.getHours())} · {now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </header>

        <form className="start-search glass" role="search" onSubmit={e => { e.preventDefault(); if (q.trim()) b.navigate(q); }}>
          <IconSearch size={18} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Mit ${engine} suchen oder Adresse eingeben`}
            spellCheck={false} aria-label="Suchen oder Adresse eingeben" />
          {q ? <kbd>Enter</kbd> : <span className="start-engine">{engine}</span>}
        </form>

        <section className="start-section" aria-label="Lesezeichen">
          <div className="tiles">
            {tiles.map(bm => (
              <button key={bm.id} className="tile" onClick={e => (e.ctrlKey ? b.newTab(bm.url) : b.navigate(bm.url))}
                onAuxClick={e => { if (e.button === 1) b.newTab(bm.url); }} title={bm.url}>
                <span className="tile-icon"><Favicon url={bm.url} size={22} /></span>
                <span className="tile-title">{bm.title || hostOf(bm.url)}</span>
              </button>
            ))}
            {tiles.length < 7 && (
              <button className="tile tile-add" onClick={() => b.openPage("bookmarks")} title="Lesezeichen verwalten">
                <span className="tile-icon"><IconPlus size={18} /></span>
                <span className="tile-title">{tiles.length === 0 ? "Erstes Lesezeichen" : "Hinzufügen"}</span>
              </button>
            )}
          </div>
        </section>

        {recent.length > 0 && (
          <section className="start-section start-recent" aria-labelledby="start-recent-h">
            <h2 id="start-recent-h"><IconHistory size={14} /> Zuletzt besucht</h2>
            <div className="recent-list">
              {recent.map(h => (
                <button key={h.id} className="recent-item" onClick={() => b.navigate(h.url)} title={h.url}>
                  <Favicon url={h.url} size={16} />
                  <span className="recent-title">{h.title || h.url}</span>
                  <span className="recent-host">{hostOf(h.url).replace(/^www\./, "")}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <footer className="start-foot">
          <button className="start-shield" onClick={() => b.openPage("privacy")}>
            <IconShield size={15} />
            <span>{b.settings.adblock
              ? <><strong>{b.totalBlocked.toLocaleString("de-DE")}</strong> Tracker und Werbeanfragen blockiert</>
              : "JTech Shield ist ausgeschaltet"}</span>
          </button>
          <span className="start-keys">
            {paletteKey && <span><kbd>{paletteKey}</kbd> Befehlspalette</span>}
            {newTabKey && <span><kbd>{newTabKey}</kbd> Neuer Tab</span>}
          </span>
        </footer>
      </div>
    </div>
  );
}
