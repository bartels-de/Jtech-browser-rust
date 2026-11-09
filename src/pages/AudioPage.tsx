import { useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { useT } from "../i18n";
import { Favicon } from "../components/Favicon";
import { mediaStore } from "../lib/bridge";
import { siteOf } from "../lib/ipc";
import { MediaButtons, mediaControl } from "../components/MediaControls";
import { Group } from "../components/SettingsUI";
import { IconTrash } from "../components/Icons";

/**
 * Audio hub (jtech://audio). WebView2 reports "playing audio" and mutes per tab (ICoreWebView2_8).
 * Title/artist/artwork and play/pause/next/prev come from the page bridge (navigator.mediaSession and
 * the page's media elements). Per-tab volume sets HTMLMediaElement.volume – WebView2 has no native
 * per-tab volume, so Web Audio output is not affected.
 */
export function AudioPage() {
  const b = useBrowser();
  const { t } = useT();
  const media = mediaStore.use();
  const [site, setSite] = useState("");
  const list = b.settings.audioMuteSites ?? [];
  const audible = b.tabs.filter(x => !x.internal && !x.sleeping && (x.playingAudio || x.muted || (media[x.id] && media[x.id].state !== "none")));
  const others = (id: string) => audible.filter(x => x.id !== id);
  const addSite = (s: string) => {
    const v = s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!v || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v) || list.includes(v)) return;
    b.updateSettings({ audioMuteSites: [...list, v].slice(0, 200) });
    setSite("");
  };
  return (
    <div className="page doc-page audio-page">
      <header className="page-head"><h1>{t("page.audio")}</h1><p className="muted">{t("au.lead")}</p></header>
      <section className="card list-card">
        {audible.length === 0 && <div className="empty-state"><h2>{t("au.emptyTitle")}</h2><p>{t("au.emptyText")}</p></div>}
        {audible.map(x => {
          const m = media[x.id];
          const host = siteOf(x.url);
          const vol = m && m.volume >= 0 ? m.volume : 1;
          return (
            <div key={x.id} className="audio-row">
              <button className="audio-main" onClick={() => b.switchTab(x.id)} title={x.url}>
                {m?.artwork ? <img className="audio-art" src={m.artwork} alt="" referrerPolicy="no-referrer" /> : <span className="audio-art ph"><Favicon url={x.url} internal={false} /></span>}
                <span className="audio-text">
                  <strong>{m?.title || x.title}</strong>
                  <small className="muted">{[m?.artist, m?.album].filter(Boolean).join(" · ") || host}</small>
                </span>
              </button>
              <span className={`audio-state${x.playingAudio ? " on" : ""}`}>
                {x.muted ? t("au.muted") : x.playingAudio || m?.state === "playing" ? t("au.playing") : m?.state === "paused" ? t("au.paused") : t("au.silent")}
              </span>
              <MediaButtons id={x.id} m={m} />
              <input type="range" className="audio-vol" min={0} max={100} value={Math.round(vol * 100)} aria-label={t("au.volume")} title={t("au.volume")}
                onChange={e => { const v = Number(e.target.value) / 100; mediaStore.set(s => s[x.id] ? { ...s, [x.id]: { ...s[x.id], volume: v } } : s); mediaControl(x.id, "volume", v); }} />
              <button className="btn sm" onClick={() => b.setTabMuted(x.id, !x.muted)}>{x.muted ? t("au.unmute") : t("au.mute")}</button>
              {audible.length > 1 && <button className="btn ghost sm" onClick={() => { if (x.muted) b.setTabMuted(x.id, false); others(x.id).forEach(o => !o.muted && b.setTabMuted(o.id, true)); }}>{t("au.only")}</button>}
              {host && !list.includes(host) && <button className="btn ghost sm" onClick={() => addSite(host)} title={t("au.alwaysMuteDesc")}>{t("au.alwaysMute")}</button>}
            </div>
          );
        })}
      </section>
      {audible.length > 1 && (
        <div className="row-end">
          <button className="btn" onClick={() => audible.forEach(x => !x.muted && b.setTabMuted(x.id, true))}>{t("au.muteAll")}</button>
          <button className="btn ghost" onClick={() => audible.forEach(x => x.muted && b.setTabMuted(x.id, false))}>{t("au.unmuteAll")}</button>
        </div>
      )}
      <Group title={t("au.sitesTitle")} desc={t("au.sitesDesc")}>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); addSite(site); }}>
          <input value={site} onChange={e => setSite(e.target.value)} placeholder="example.com" spellCheck={false} aria-label={t("au.sitesTitle")} />
          <button className="btn">{t("c.add")}</button>
        </form>
        {list.length === 0 ? <p className="muted small">{t("au.sitesEmpty")}</p> : (
          <div className="chips">
            {list.map(s => (
              <span key={s} className="chip chip-static">{s}
                <button className="icon-btn sm" onClick={() => b.updateSettings({ audioMuteSites: list.filter(x => x !== s) })} aria-label={t("c.remove")} title={t("c.remove")}><IconTrash size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </Group>
      <p className="muted small">{t("au.note")}</p>
    </div>
  );
}
