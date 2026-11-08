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
        {audible.length === 0 && <div className="empty">Kein Tab spielt gerade Audio.</div>}
        {audible.map(t => (
          <div key={t.id} className="list-row" onClick={() => b.switchTab(t.id)}>
            <Favicon url={t.url} internal={false} />
            <span className="row-title">{t.title}</span>
            <span className={`audio-state${t.playingAudio ? " on" : ""}`}>{t.muted ? "stumm" : t.playingAudio ? "spielt" : "still"}</span>
            <button className="btn" onClick={e => { e.stopPropagation(); b.setTabMuted(t.id, !t.muted); }}>{t.muted ? "Ton an" : "Stumm"}</button>
          </div>
        ))}
      </section>
      {audible.length > 1 && (
        <div className="row-end">
          <button className="btn" onClick={() => audible.forEach(t => !t.muted && b.setTabMuted(t.id, true))}>Alle stumm</button>
          <button className="btn ghost" onClick={() => audible.forEach(t => t.muted && b.setTabMuted(t.id, false))}>Alle laut</button>
        </div>
      )}
      <p className="muted small">Benötigt WebView2-Runtime mit ICoreWebView2_8 (ab 1.0.1072). Status kommt aus dem Ereignis IsDocumentPlayingAudioChanged.</p>
    </div>
  );
}
