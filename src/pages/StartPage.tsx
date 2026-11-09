import { useEffect, useMemo, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { SEARCH_ENGINES, hostOf } from "../lib/urls";
import { Favicon } from "../components/Favicon";
import { t, useT } from "../i18n";
import { IconClose, IconEyeOff, IconHistory, IconPalette, IconPlus, IconSearch, IconShield } from "../components/Icons";
import { normalizeStart } from "../store/types";
import { StartEditor, useStartImage } from "../components/StartEditor";

function greeting(h: number) {
  return t(h < 5 ? "sp.night" : h < 11 ? "sp.morning" : h < 18 ? "sp.day" : "sp.evening");
}

/** Running clock (every second when seconds are shown, otherwise every 15 s). */
function useNow(seconds: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), seconds ? 1000 : 15000);
    return () => window.clearInterval(t);
  }, [seconds]);
  return now;
}

export function StartPage() {
  const b = useBrowser();
  const { t: tt, fmtDate, fmtNum, lang } = useT();
  const sp = normalizeStart(b.settings.start);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const now = useNow(sp.clock && sp.seconds);
  const image = useStartImage();
  const engine = SEARCH_ENGINES[b.settings.searchEngine].name;
  const max = sp.rows * sp.cols;
  const tiles = (sp.links ?? b.bookmarks.map(x => ({ id: x.id, title: x.title, url: x.url }))).slice(0, max);
  const custom = !!sp.links;
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
  const time = now.toLocaleTimeString(lang === "de" ? "de-DE" : "en-US", { hour: "2-digit", minute: "2-digit", ...(sp.seconds ? { second: "2-digit" } : {}), hour12: !sp.clock24 });
  const bgStyle: React.CSSProperties =
    sp.background === "gradient" ? { background: `linear-gradient(135deg, ${sp.gradient[0]}, ${sp.gradient[1]})` }
    : sp.background === "image" && image ? { backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center" }
    : sp.background === "fx" ? { background: "transparent" } : {};

  return (
    <div className={`page start-page sp-${sp.density} sp-align-${sp.align} sp-icons-${sp.iconStyle}${sp.background !== "none" ? " sp-has-bg" : ""}${editing ? " sp-editing" : ""}`} style={bgStyle}>
      {sp.background === "none" && <div className="start-glow" aria-hidden />}
      <button className="btn ghost sm start-customize" onClick={() => setEditing(v => !v)} aria-expanded={editing}>
        <IconPalette size={14} /> {tt("sp.customize")}
      </button>
      <div className="start-inner">
        {(sp.clock || sp.greeting) && (
          <header className="start-brand">
            {sp.clock && <time className="start-clock" dateTime={now.toISOString()}>{time}</time>}
            {sp.greeting && (
              <p className="start-greet">
                {greeting(now.getHours())}{sp.name ? `, ${sp.name}` : ""} · {fmtDate(now, { weekday: "long", day: "numeric", month: "long" })}
              </p>
            )}
          </header>
        )}

        {sp.search && (
          <form className="start-search glass" role="search" onSubmit={e => { e.preventDefault(); if (q.trim()) b.navigate(q); }}>
            <IconSearch size={18} />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={tt("sp.searchWith", { engine })}
              spellCheck={false} aria-label={tt("tb.placeholder")} />
            {q ? <kbd>Enter</kbd> : sp.showEngine && <span className="start-engine">{engine}</span>}
          </form>
        )}

        {sp.quickLinks && (
          <section className="start-section" aria-label={tt("sp.quickLinks")}>
            <div className="tiles" style={{ gridTemplateColumns: `repeat(${sp.cols}, minmax(0, 1fr))` }}>
              {tiles.map(bm => (
                <button key={bm.id} className="tile" onClick={e => (e.ctrlKey ? b.newTab(bm.url) : b.navigate(bm.url))}
                  onAuxClick={e => { if (e.button === 1) b.newTab(bm.url); }} title={bm.url}>
                  <span className="tile-icon"><Favicon url={bm.url} size={22} /></span>
                  <span className="tile-title" title={bm.title || hostOf(bm.url)}>{bm.title || hostOf(bm.url)}</span>
                </button>
              ))}
              {tiles.length < max && (
                <button className="tile tile-add" onClick={() => (custom ? setEditing(true) : b.openPage("bookmarks"))} title={tt("sp.manageBm")}>
                  <span className="tile-icon"><IconPlus size={18} /></span>
                  <span className="tile-title">{tiles.length === 0 ? tt("sp.firstBm") : tt("c.add")}</span>
                </button>
              )}
            </div>
          </section>
        )}

        {b.settings.startShowRecent !== false && recent.length > 0 && (
          <section className="start-section start-recent" aria-labelledby="start-recent-h">
            <div className="start-section-head">
              <h2 id="start-recent-h"><IconHistory size={14} /> {tt("sp.recent")}</h2>
              <button className="start-hide" onClick={() => b.updateSettings({ startShowRecent: false })}
                title={tt("sp.recentHide")} aria-label={tt("sp.recentHide")}><IconEyeOff size={14} /></button>
            </div>
            <div className="recent-list">
              {recent.map(h => (
                <button key={h.id} className="recent-item" onClick={() => b.navigate(h.url)} title={h.url}>
                  <Favicon url={h.url} size={16} />
                  <span className="recent-title" title={h.title || h.url}>{h.title || h.url}</span>
                  <span className="recent-host">{hostOf(h.url).replace(/^www\./, "")}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {(sp.trackerStats || sp.shortcutHints) && (
          <footer className="start-foot">
            {sp.trackerStats ? (
              <button className="start-shield" onClick={() => b.openPage("privacy")}>
                <IconShield size={15} />
                <span>{b.settings.adblock
                  ? <><strong>{fmtNum(b.totalBlocked)}</strong> {tt("sp.blocked")}</>
                  : tt("sp.shieldOff")}</span>
              </button>
            ) : <span />}
            {sp.shortcutHints && (
              <span className="start-keys">
                {paletteKey && <span><kbd>{paletteKey}</kbd> {tt("cmd.ui.palette")}</span>}
                {newTabKey && <span><kbd>{newTabKey}</kbd> {tt("c.newTab")}</span>}
              </span>
            )}
          </footer>
        )}
      </div>

      {editing && (
        <aside className="start-panel glass" aria-label={tt("sp.customize")}>
          <header className="start-panel-head">
            <strong>{tt("sp.customize")}</strong>
            <button className="icon-btn sm" onClick={() => setEditing(false)} title={tt("c.close")} aria-label={tt("c.close")}><IconClose size={14} /></button>
          </header>
          <div className="start-panel-body"><StartEditor /></div>
        </aside>
      )}
    </div>
  );
}
