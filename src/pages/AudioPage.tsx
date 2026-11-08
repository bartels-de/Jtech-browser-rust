import { useBrowser } from "../store/BrowserStore";
import { Favicon } from "../components/Favicon";

/**
 * Port: Audio-Hub (Standardprojekt: Media-Hub, tabs.js media:list / media:command).
 * Nur Tab-Ebene: WebView2 meldet "spielt Audio" und erlaubt Stummschalten. Play/Pause, Spulen und
 * Lautstaerke pro Tab sind nicht portiert (siehe docs/PORT_ELECTRON.md).
 */
export function AudioPage() {
  const b = useBrowser();
  const audible = b.tabs.filter(t => !t.internal && (t.playingAudio || t.muted));
  return (
    <div className="page doc-page">
      <header className="page-head"><h1>Audio-Hub</h1><p className="muted">Tabs, die gerade Ton abspielen oder stummgeschaltet sind.</p></header>
      <section className="card list-card">
        {audible.length === 0 && <div className="empty-state"><h2>Gerade ist alles still</h2><p>Sobald ein Tab Ton abspielt, kannst du ihn hier stummschalten oder hinspringen.</p></div>}
        {audible.map(t => (
          <div key={t.id} className="list-row" onClick={() => b.switchTab(t.id)}>
            <Favicon url={t.url} internal={false} />
            <span className="row-title" title={t.title}>{t.title}</span>
            <span className={`audio-state${t.playingAudio ? " on" : ""}`}>{t.muted ? "stumm" : t.playingAudio ? "spielt" : "still"}</span>
            <button className="btn" onClick={e => { e.stopPropagation(); b.setTabMuted(t.id, !t.muted); }}>{t.muted ? "Ton einschalten" : "Stummschalten"}</button>
          </div>
        ))}
      </section>
      {audible.length > 1 && (
        <div className="row-end">
          <button className="btn" onClick={() => audible.forEach(t => !t.muted && b.setTabMuted(t.id, true))}>Alle stummschalten</button>
          <button className="btn ghost" onClick={() => audible.forEach(t => t.muted && b.setTabMuted(t.id, false))}>Alle wieder einschalten</button>
        </div>
      )}
      <p className="muted small">Steuerbar ist der Ton je Tab. Wiedergabe und Lautstärke regelst du direkt auf der Seite.</p>
    </div>
  );
}
