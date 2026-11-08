import { useBrowser } from "../store/BrowserStore";
import { useT } from "../i18n";
import { Favicon } from "../components/Favicon";

/**
 * Port: Audio-Hub (Standardprojekt: Media-Hub, tabs.js media:list / media:command).
 * Nur Tab-Ebene: WebView2 meldet "spielt Audio" und erlaubt Stummschalten. Play/Pause, Spulen und
 * Lautstaerke pro Tab sind nicht portiert (siehe docs/PORT_ELECTRON.md).
 */
export function AudioPage() {
  const b = useBrowser();
  const { t } = useT();
  const audible = b.tabs.filter(t => !t.internal && (t.playingAudio || t.muted));
  return (
    <div className="page doc-page">
      <header className="page-head"><h1>{t("page.audio")}</h1><p className="muted">{t("au.lead")}</p></header>
      <section className="card list-card">
        {audible.length === 0 && <div className="empty-state"><h2>{t("au.emptyTitle")}</h2><p>{t("au.emptyText")}</p></div>}
        {audible.map(x => (
          <div key={x.id} className="list-row" onClick={() => b.switchTab(x.id)}>
            <Favicon url={x.url} internal={false} />
            <span className="row-title" title={x.title}>{x.title}</span>
            <span className={`audio-state${x.playingAudio ? " on" : ""}`}>{x.muted ? t("au.muted") : x.playingAudio ? t("au.playing") : t("au.silent")}</span>
            <button className="btn" onClick={e => { e.stopPropagation(); b.setTabMuted(x.id, !x.muted); }}>{x.muted ? t("au.unmute") : t("au.mute")}</button>
          </div>
        ))}
      </section>
      {audible.length > 1 && (
        <div className="row-end">
          <button className="btn" onClick={() => audible.forEach(x => !x.muted && b.setTabMuted(x.id, true))}>{t("au.muteAll")}</button>
          <button className="btn ghost" onClick={() => audible.forEach(x => x.muted && b.setTabMuted(x.id, false))}>{t("au.unmuteAll")}</button>
        </div>
      )}
      <p className="muted small">{t("au.note")}</p>
    </div>
  );
}
