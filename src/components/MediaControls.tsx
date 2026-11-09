import { useBrowser } from "../store/BrowserStore";
import { call } from "../lib/ipc";
import { mediaStore, type MediaInfo } from "../lib/bridge";
import { IconBack, IconForward, IconMute, IconVolume } from "./Icons";
import { useT } from "../i18n";

export const mediaControl = (id: string, action: "play" | "pause" | "next" | "prev" | "volume", value?: number) =>
  call("media_control", { id, action, value: value ?? null });

const IconPlay = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 5l12 7-12 7z" /></svg>;
const IconPause = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>;

/** Play/pause/prev/next buttons for a tab (page bridge, see pagebridge.rs). */
export function MediaButtons({ id, m, size = 15 }: { id: string; m?: MediaInfo; size?: number }) {
  const { t } = useT();
  const playing = m?.state === "playing";
  return (
    <span className="media-btns">
      {m?.canPrev && <button className="icon-btn sm" onClick={e => { e.stopPropagation(); mediaControl(id, "prev"); }} title={t("au.prev")} aria-label={t("au.prev")}><IconBack size={size} /></button>}
      <button className="icon-btn sm" onClick={e => { e.stopPropagation(); mediaControl(id, playing ? "pause" : "play"); }}
        title={playing ? t("au.pause") : t("au.play")} aria-label={playing ? t("au.pause") : t("au.play")}>{playing ? <IconPause size={size} /> : <IconPlay size={size} />}</button>
      {m?.canNext && <button className="icon-btn sm" onClick={e => { e.stopPropagation(); mediaControl(id, "next"); }} title={t("au.next")} aria-label={t("au.next")}><IconForward size={size} /></button>}
    </span>
  );
}

/** Compact player at the bottom of the sidebar for the most relevant audio tab. */
export function MiniPlayer({ expanded }: { expanded: boolean }) {
  const b = useBrowser();
  const { t } = useT();
  const media = mediaStore.use();
  const cands = b.tabs.filter(x => !x.internal && !x.sleeping && (x.playingAudio || media[x.id]?.state === "playing" || media[x.id]?.state === "paused"));
  const tab = cands.find(x => x.playingAudio) ?? cands.find(x => media[x.id]?.state === "playing") ?? cands[0];
  if (!tab) return null;
  const m = media[tab.id];
  const title = m?.title || tab.title;
  return (
    <div className={`mini-player${expanded ? "" : " compact"}`} role="region" aria-label={t("au.mini")}>
      {expanded && (
        <button className="mini-info" onClick={() => b.switchTab(tab.id)} title={`${title}\n${tab.url}`}>
          {m?.artwork ? <img src={m.artwork} alt="" className="mini-art" referrerPolicy="no-referrer" /> : <span className="mini-art ph"><IconVolume size={14} /></span>}
          <span className="mini-text"><strong>{title}</strong><small className="muted">{m?.artist || tab.title}</small></span>
        </button>
      )}
      <span className="mini-ctl">
        <MediaButtons id={tab.id} m={m} size={13} />
        <button className="icon-btn sm" onClick={() => b.setTabMuted(tab.id, !tab.muted)} title={tab.muted ? t("au.unmute") : t("au.mute")} aria-label={tab.muted ? t("au.unmute") : t("au.mute")}>
          {tab.muted ? <IconMute size={13} /> : <IconVolume size={13} />}
        </button>
      </span>
    </div>
  );
}
