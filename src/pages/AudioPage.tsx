import { useEffect, useMemo, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { useT } from "../i18n";
import { Favicon } from "../components/Favicon";
import { mediaStore } from "../lib/bridge";
import { call, siteOf } from "../lib/ipc";
import { MediaButtons, mediaControl } from "../components/MediaControls";
import { Group } from "../components/SettingsUI";
import { IconMusic, IconTrash } from "../components/Icons";
import { PageShell } from "../components/PageShell";
import { EmptyState } from "../components/EmptyState";
import type { AudioEqPreset } from "../store/types";

const EQ_BANDS = ["60 Hz", "250 Hz", "1 kHz", "4 kHz", "12 kHz"];
const EQ_PRESETS: Record<Exclude<AudioEqPreset, "custom">, number[]> = {
  flat: [0, 0, 0, 0, 0],
  bass: [6, 4, 1, 0, -1],
  voice: [-2, 1, 4, 3, 0],
  treble: [-2, -1, 0, 3, 5],
};

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
  const [selectedEqTabId, setSelectedEqTabId] = useState<string | null>(null);
  const equalizer = b.settings.audioEqualizer ?? { enabled: false, preset: "flat" as const, bands: EQ_PRESETS.flat };
  const activeTab = b.activeTab;
  const eqTabs = useMemo(() => b.tabs.filter(tab => !tab.internal && !tab.sleeping && /^https?:/i.test(tab.url)), [b.tabs]);
  const eqTab = eqTabs.find(tab => tab.id === selectedEqTabId)
    ?? eqTabs.find(tab => tab.id === activeTab?.id)
    ?? eqTabs.find(tab => tab.playingAudio || media[tab.id]?.state === "playing")
    ?? eqTabs[0];
  const eqTabId = eqTab?.id;
  const activeEqStatus = eqTabId ? media[eqTabId]?.equalizerStatus : undefined;
  const bandSignature = equalizer.bands.join(",");
  useEffect(() => {
    if (!eqTabId) return;
    const bands = equalizer.enabled ? equalizer.bands : EQ_PRESETS.flat;
    call("set_media_equalizer", { id: eqTabId, bands }, message => console.warn("Audio equalizer:", message));
  }, [eqTabId, eqTab?.url, equalizer.enabled, bandSignature]);

  const setEqualizer = (next: typeof equalizer) => b.updateSettings({ audioEqualizer: next });
  const choosePreset = (preset: Exclude<AudioEqPreset, "custom">) => setEqualizer({ ...equalizer, preset, bands: EQ_PRESETS[preset] });
  const changeBand = (index: number, value: number) => {
    const bands = [...equalizer.bands];
    bands[index] = value;
    setEqualizer({ ...equalizer, preset: "custom", bands });
  };
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
    <PageShell className="audio-page" title={t("page.audio")} subtitle={t("au.lead")}
      actions={audible.length > 1 ? <>
        <button className="btn" onClick={() => audible.forEach(x => !x.muted && b.setTabMuted(x.id, true))}>{t("au.muteAll")}</button>
        <button className="btn ghost" onClick={() => audible.forEach(x => x.muted && b.setTabMuted(x.id, false))}>{t("au.unmuteAll")}</button>
      </> : undefined}>
      <section className="card list-card">
        {audible.length === 0 && <EmptyState icon={<IconMusic size={20} />} title={t("au.emptyTitle")} text={t("au.emptyText")} />}
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
      <Group title={t("au.eq.title")} desc={t("au.eq.desc")}>
        {eqTab && (
          <div className="eq-panel">
            <div className="eq-toolbar">
              {eqTabs.length > 1 && <label className="eq-enable">
                <span>{t("au.eq.target")}</span>
                <select value={eqTab.id} onChange={e => setSelectedEqTabId(e.target.value)} aria-label={t("au.eq.target")}>
                  {eqTabs.map(tab => <option key={tab.id} value={tab.id}>{tab.title || siteOf(tab.url) || tab.url}</option>)}
                </select>
              </label>}
              <label className="eq-enable">
                <input type="checkbox" role="switch" checked={equalizer.enabled} onChange={e => setEqualizer({ ...equalizer, enabled: e.target.checked })} />
                <span>{t("au.eq.enable")}</span>
              </label>
              <select value={equalizer.preset} onChange={e => choosePreset(e.target.value as Exclude<AudioEqPreset, "custom">)} aria-label={t("au.eq.preset")}>
                {(["flat", "bass", "voice", "treble"] as const).map(preset => <option key={preset} value={preset}>{t(`au.eq.${preset}` as "au.eq.flat")}</option>)}
                {equalizer.preset === "custom" && <option value="custom">{t("au.eq.custom")}</option>}
              </select>
              <button className="btn ghost sm" onClick={() => choosePreset("flat")}>{t("au.eq.reset")}</button>
            </div>
            <div className="eq-bands" aria-label={t("au.eq.title")}>
              {equalizer.bands.map((gain, index) => (
                <label className="eq-band" key={EQ_BANDS[index]}>
                  <span>{EQ_BANDS[index]}</span>
                  <input type="range" min={-12} max={12} step={1} value={gain}
                    aria-label={t("au.eq.band", { band: EQ_BANDS[index] })}
                    onChange={e => changeBand(index, Number(e.target.value))} />
                  <small>{gain > 0 ? "+" : ""}{gain} dB</small>
                </label>
              ))}
            </div>
            <p className={`eq-status${activeEqStatus === "unsupported" || activeEqStatus === "error" ? " warn" : ""}`} role="status">
              {activeEqStatus === "waiting" ? t("au.eq.waiting") : activeEqStatus === "unsupported" ? t("au.eq.unsupported") : activeEqStatus === "error" ? t("au.eq.error") : t("au.eq.note")}
            </p>
          </div>
        )}
        {!eqTab && <EmptyState compact title={t("au.eq.noTabs")} />}
      </Group>
      <Group title={t("au.sitesTitle")} desc={t("au.sitesDesc")}>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); addSite(site); }}>
          <input value={site} onChange={e => setSite(e.target.value)} placeholder="example.com" spellCheck={false} aria-label={t("au.sitesTitle")} />
          <button className="btn">{t("c.add")}</button>
        </form>
        {list.length === 0 ? <EmptyState compact title={t("au.sitesEmpty")} /> : (
          <div className="chips">
            {list.map(s => (
              <span key={s} className="chip chip-static">{s}
                <button className="icon-btn sm" onClick={() => b.updateSettings({ audioMuteSites: list.filter(x => x !== s) })} aria-label={t("c.remove")} title={t("c.remove")}><IconTrash size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </Group>
      <p className="muted small page-note">{t("au.note")}</p>
    </PageShell>
  );
}
