import { useState, useSyncExternalStore } from "react";
import { useBrowser } from "../store/BrowserStore";
import { load, save } from "../store/storage";
import { DEFAULT_START, normalizeStart, type QuickLink, type StartSettings } from "../store/types";
import { Row, Switch } from "./SettingsUI";
import { IconChevronDown, IconChevronUp, IconTrash } from "./Icons";
import { useT, type TKey } from "../i18n";

// ---- background image (own storage key, data URL; not part of settings to keep saves small) ----
const IMG_MAX = 3_000_000;
let image: string | null = null; // read lazily (storage is initialized after module load)
const getImage = () => (image ??= load<string>("startBg", ""));
const subs = new Set<() => void>();
function setImage(v: string) { image = v; save("startBg", v); subs.forEach(f => f()); }
export function useStartImage(): string {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, getImage);
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange(v: T): void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([id, l]) => <button key={id} role="radio" aria-checked={value === id} className={value === id ? "on" : ""} onClick={() => onChange(id)}>{l}</button>)}
    </div>
  );
}

/** Start page settings (side panel on the start page and Settings › Start page). Changes apply live. */
export function StartEditor() {
  const b = useBrowser();
  const { t } = useT();
  const sp = normalizeStart(b.settings.start);
  const set = (p: Partial<StartSettings>) => b.updateSettings({ start: { ...sp, ...p } });
  const img = useStartImage();
  const [msg, setMsg] = useState("");
  const [nl, setNl] = useState({ title: "", url: "https://" });
  const links: QuickLink[] = sp.links ?? b.bookmarks.slice(0, sp.rows * sp.cols).map(x => ({ id: x.id, title: x.title, url: x.url }));
  const setLinks = (l: QuickLink[]) => set({ links: l });
  const move = (i: number, d: -1 | 1) => { const l = [...links]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setLinks(l); };
  const okUrl = /^https?:\/\/[^\s/]+\.[^\s]+/i.test(nl.url.trim());
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { setMsg(t("se.imgType")); return; }
    if (f.size > IMG_MAX) { setMsg(t("se.imgTooBig")); return; }
    const r = new FileReader();
    r.onload = () => { if (typeof r.result === "string") { setImage(r.result); set({ background: "image" }); setMsg(""); } };
    r.readAsDataURL(f);
  };

  return (
    <div className="start-editor">
      <h3 className="se-h">{t("se.background")}</h3>
      <Seg label={t("se.background")} value={sp.background} onChange={v => set({ background: v })}
        options={[["none", t("se.bg.none")], ["gradient", t("se.bg.gradient")], ["image", t("se.bg.image")], ["fx", t("se.bg.fx")]]} />
      {sp.background === "gradient" && (
        <div className="row gap se-colors">
          <input type="color" value={sp.gradient[0]} aria-label={t("se.color1")} onChange={e => set({ gradient: [e.target.value, sp.gradient[1]] })} />
          <input type="color" value={sp.gradient[1]} aria-label={t("se.color2")} onChange={e => set({ gradient: [sp.gradient[0], e.target.value] })} />
        </div>
      )}
      {sp.background === "image" && (
        <div className="row gap">
          <label className="btn sm">{t("se.upload")}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
          {img && <button className="btn ghost sm" onClick={() => setImage("")}>{t("c.remove")}</button>}
        </div>
      )}
      {sp.background === "fx" && (
        <p className="muted small">{t("se.fxHint")} {!b.settings.effects.bgEnabled && <button className="btn sm" onClick={() => b.updateEffects({ bgEnabled: true })}>{t("se.fxOn")}</button>}</p>
      )}
      {msg && <p className="small form-msg" role="status">{msg}</p>}

      <h3 className="se-h">{t("se.clockGreeting")}</h3>
      <Row title={t("se.clock")}><Switch label={t("se.clock")} checked={sp.clock} onChange={v => set({ clock: v })} /></Row>
      {sp.clock && <>
        <Row title={t("se.format")}><Seg label={t("se.format")} value={sp.clock24 ? "24" : "12"} onChange={v => set({ clock24: v === "24" })} options={[["24", t("se.h24")], ["12", t("se.h12")]]} /></Row>
        <Row title={t("se.seconds")}><Switch label={t("se.seconds")} checked={sp.seconds} onChange={v => set({ seconds: v })} /></Row>
      </>}
      <Row title={t("se.greeting")}><Switch label={t("se.greeting")} checked={sp.greeting} onChange={v => set({ greeting: v })} /></Row>
      {sp.greeting && <Row title={t("se.name")}><input className="text-input" value={sp.name} maxLength={40} placeholder={t("se.namePh")} aria-label={t("se.name")} onChange={e => set({ name: e.target.value })} /></Row>}

      <h3 className="se-h">{t("se.search")}</h3>
      <Row title={t("se.searchBox")}><Switch label={t("se.searchBox")} checked={sp.search} onChange={v => set({ search: v })} /></Row>
      {sp.search && <Row title={t("se.showEngine")}><Switch label={t("se.showEngine")} checked={sp.showEngine} onChange={v => set({ showEngine: v })} /></Row>}

      <h3 className="se-h">{t("sp.quickLinks")}</h3>
      <Row title={t("se.quickLinks")}><Switch label={t("se.quickLinks")} checked={sp.quickLinks} onChange={v => set({ quickLinks: v })} /></Row>
      {sp.quickLinks && <>
        <Row title={t("se.rows")}><input type="range" min={1} max={4} value={sp.rows} aria-label={t("se.rows")} onChange={e => set({ rows: Number(e.target.value) })} /><span className="mono small">{sp.rows}</span></Row>
        <Row title={t("se.cols")}><input type="range" min={3} max={10} value={sp.cols} aria-label={t("se.cols")} onChange={e => set({ cols: Number(e.target.value) })} /><span className="mono small">{sp.cols}</span></Row>
        <Row title={t("se.iconStyle")}>
          <select value={sp.iconStyle} aria-label={t("se.iconStyle")} onChange={e => set({ iconStyle: e.target.value as StartSettings["iconStyle"] })}>
            {(["rounded", "circle", "square", "minimal"] as const).map(s => <option key={s} value={s}>{t(`se.icon.${s}` as TKey)}</option>)}
          </select>
        </Row>
        <Row title={t("se.source")}>
          <Seg label={t("se.source")} value={sp.links ? "own" : "bm"} onChange={v => set({ links: v === "own" ? links : null })} options={[["bm", t("se.fromBm")], ["own", t("se.own")]]} />
        </Row>
        {sp.links && (
          <div className="se-links">
            {links.map((l, i) => (
              <div key={l.id} className="se-link">
                <input className="text-input" value={l.title} maxLength={60} placeholder={t("c.name")} aria-label={t("c.name")}
                  onChange={e => setLinks(links.map(x => x.id === l.id ? { ...x, title: e.target.value } : x))} />
                <span className="mono small se-url" title={l.url}>{l.url}</span>
                <button className="icon-btn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("se.up")} title={t("se.up")}><IconChevronUp size={13} /></button>
                <button className="icon-btn sm" disabled={i === links.length - 1} onClick={() => move(i, 1)} aria-label={t("se.down")} title={t("se.down")}><IconChevronDown size={13} /></button>
                <button className="icon-btn sm" onClick={() => setLinks(links.filter(x => x.id !== l.id))} aria-label={t("c.remove")} title={t("c.remove")}><IconTrash size={13} /></button>
              </div>
            ))}
            <form className="se-link" onSubmit={e => { e.preventDefault(); if (!okUrl) return; setLinks([...links, { id: Date.now().toString(36), title: nl.title.trim(), url: nl.url.trim() }]); setNl({ title: "", url: "https://" }); }}>
              <input className="text-input" value={nl.title} maxLength={60} placeholder={t("c.name")} aria-label={t("c.name")} onChange={e => setNl({ ...nl, title: e.target.value })} />
              <input className="text-input" value={nl.url} placeholder="https://…" spellCheck={false} aria-label="URL" onChange={e => setNl({ ...nl, url: e.target.value })} />
              <button className="btn sm" disabled={!okUrl}>{t("c.add")}</button>
            </form>
          </div>
        )}
      </>}

      <h3 className="se-h">{t("se.layout")}</h3>
      <Row title={t("se.density")}><Seg label={t("se.density")} value={sp.density} onChange={v => set({ density: v })} options={[["compact", t("se.d.compact")], ["comfortable", t("se.d.comfortable")], ["spacious", t("se.d.spacious")]]} /></Row>
      <Row title={t("se.align")}><Seg label={t("se.align")} value={sp.align} onChange={v => set({ align: v })} options={[["center", t("se.a.center")], ["top", t("se.a.top")]]} /></Row>
      <Row title={t("set.startRecent")}><Switch label={t("set.startRecent")} checked={b.settings.startShowRecent !== false} onChange={v => b.updateSettings({ startShowRecent: v })} /></Row>
      <Row title={t("se.trackers")}><Switch label={t("se.trackers")} checked={sp.trackerStats} onChange={v => set({ trackerStats: v })} /></Row>
      <Row title={t("se.hints")}><Switch label={t("se.hints")} checked={sp.shortcutHints} onChange={v => set({ shortcutHints: v })} /></Row>
      <div className="row-end"><button className="btn ghost sm" onClick={() => { b.updateSettingsUndoable({ start: DEFAULT_START }, t("undo.startReset")); setImage(""); }}>{t("se.reset")}</button></div>
    </div>
  );
}
