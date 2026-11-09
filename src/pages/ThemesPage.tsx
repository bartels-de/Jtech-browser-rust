import { ThemeGallery } from "../components/ThemeGallery";
import { PageShell } from "../components/PageShell";
import { isBuiltinTheme } from "../lib/themeGallery";
import { useEffect, useId, useRef, useState } from "react";
import { Group, Row, Switch } from "../components/SettingsUI";
import { useBrowser } from "../store/BrowserStore";
import { CUSTOM_CSS_MAX, FONTS, JTECH_DEFAULT, fontName, themeName, exportTheme, importTheme, normalizeHex, sanitizeCss, type FontId, type ThemeSpec } from "../lib/theme";
import { t, useT, type TKey } from "../i18n";
import { BACKGROUNDS, CURSOR_PRESETS, QUALITY, TRAILS, cursorSpec, imageToCursor, rescaleCursor, type BgId, type EffectsSettings, type Quality } from "../lib/fx/effects";

/** Port: Design-Studio (Standardprojekt: Theme-Editor in index.html / app.js / studio.css). */
const COLORS: { key: keyof ThemeSpec; readonly label: string }[] = (["accent", "accent2", "bg", "text", "textDim"] as const)
  .map(key => ({ key, get label() { return t(`th.c.${key}` as TKey); } }));

export function ThemesPage() {
  const b = useBrowser();
  useT();
  const cur = b.customTheme ?? JTECH_DEFAULT;
  const [json, setJson] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Jede Aenderung wird sofort angewendet (Live-Vorschau = gesamte Oberflaeche) und gespeichert.
  const patch = (p: Partial<ThemeSpec>) => b.setCustomTheme({ ...cur, ...p, id: cur.id === "jtech" || isBuiltinTheme(cur.id) ? "custom-" + Date.now().toString(36) : cur.id, name: isBuiltinTheme(cur.id) ? t("th.adjusted", { name: themeName(cur) }) : cur.name });
  const doImport = (text: string) => {
    try { const x = importTheme(text); b.setCustomTheme(x); b.saveTheme(x); setMsg(t("th.imported", { name: x.name })); }
    catch (e) { setMsg(t("th.importFailed", { detail: String(e instanceof Error ? e.message : e) })); }
  };
  const doExport = () => {
    const text = exportTheme(cur);
    setJson(text);
    navigator.clipboard?.writeText(text).then(() => setMsg(t("th.copied")), () => setMsg(t("th.shownBelow")));
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.download = `${cur.name.replace(/[^\w-]+/g, "_") || "theme"}.jtech-theme.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch { /* Download in der UI-Webview evtl. nicht moeglich */ }
  };
  // Runde 5: wie im Electron-Original bringen Vorlagen ihren Hintergrund/Cursor-Effekt mit (abschaltbar).
  const [withFx, setWithFx] = useState(true);

  return (
    <PageShell title={t("page.themes")} subtitle={t("th.lead")}>
      <nav className="studio-jump" aria-label={t("th.jump")}>
        {([["st-presets", "th.j.presets"], ["st-edit", "th.j.edit"], ["st-bg", "th.j.bg"], ["st-cursor", "th.j.cursor"], ["st-trail", "th.j.trail"], ["st-io", "th.j.io"], ["st-css", "th.j.css"]] as [string, TKey][]).map(([id, l]) =>
          <button key={id} className="chip-btn" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t(l)}</button>)}
      </nav>

      <Group id="st-presets" title={t("th.j.presets")} desc={t("th.presetsDesc")}
        actions={<label className="switch-row small"><span>{t("th.withFx")}</span>
          <Switch label={t("th.withFxLabel")} checked={withFx} onChange={setWithFx} /></label>}>
        <ThemeGallery withFx={withFx} />
      </Group>

      <Group id="st-edit" title={t("th.editTitle")} desc={t("th.editDesc")}>
        <Row title={t("c.name")} desc={t("th.nameDesc")}>
          <input className="text-input" value={themeName(cur)} maxLength={40} aria-label={t("th.nameAria")} onChange={e => patch({ name: e.target.value })} />
        </Row>
        <Row title={t("th.mode")} desc={t("th.modeDesc")}>
          <div className="segmented" role="radiogroup" aria-label={t("th.mode")}>
            {(["dark", "light"] as const).map(m => <button key={m} role="radio" aria-checked={cur.mode === m} className={cur.mode === m ? "on" : ""} onClick={() => patch({ mode: m })}>{m === "dark" ? t("c.dark") : t("c.light")}</button>)}
          </div>
        </Row>
        <div className="color-row">
          {COLORS.map(c => (
            <label key={c.key} className="color-swatch">
              <input type="color" value={cur[c.key] as string} aria-label={c.label} onChange={e => patch({ [c.key]: e.target.value } as Partial<ThemeSpec>)} />
              <span><strong>{c.label}</strong>
                <input className="mono" value={cur[c.key] as string} maxLength={7} spellCheck={false} aria-label={t("th.hex", { label: c.label })}
                  onChange={e => { const v = normalizeHex(e.target.value, ""); if (v) patch({ [c.key]: v } as Partial<ThemeSpec>); }} /></span>
            </label>
          ))}
        </div>
        <Slider label={t("th.radius")} value={cur.radius} min={0} max={24} unit=" px" onChange={v => patch({ radius: v })} />
        <Slider label={t("th.glass")} value={cur.glass} min={30} max={100} unit=" %" hint={t("th.glassHint")} onChange={v => patch({ glass: v })} />
        <Slider label={t("th.blur")} value={cur.blur} min={0} max={40} unit=" px" onChange={v => patch({ blur: v })} />
        <Slider label={t("th.glow")} value={cur.glow} min={0} max={100} unit=" %" hint={t("th.glowHint")} onChange={v => patch({ glow: v })} />
        <Row title={t("th.font")} desc={t("th.fontDesc")}>
          <select value={cur.font} aria-label={t("th.font")} onChange={e => patch({ font: e.target.value as FontId })}>
            {(Object.keys(FONTS) as FontId[]).map(f => <option key={f} value={f}>{fontName(f)}</option>)}
          </select>
        </Row>
        <div className="theme-preview glass" aria-label={t("th.preview")}>
          <span className="btn primary">{t("th.pPrimary")}</span><span className="btn">{t("th.pNormal")}</span><span className="btn ghost">{t("th.pSubtle")}</span>
          <span className="muted">{t("th.c.textDim")}</span>
        </div>
        <div className="row-end">
          <button className="btn ghost" onClick={() => b.setCustomTheme(null)}>{t("th.resetDefault")}</button>
          <button className="btn primary" disabled={!b.customTheme} onClick={() => { b.saveTheme(cur); setMsg(t("th.saved", { name: cur.name })); }}>{t("th.saveOwn")}</button>
        </div>
        {msg && <p className="small form-msg" role="status">{msg}</p>}
      </Group>

      <EffectsEditor />

      <Group id="st-io" title={t("th.j.io")} desc={t("th.ioDesc")}>
        <div className="row-start">
          <button className="btn" onClick={doExport}>{t("th.export")}</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>{t("th.importFile")}</button>
          <button className="btn ghost" disabled={!json.trim()} onClick={() => doImport(json)}>{t("th.importText")}</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (f) { if (f.size > 20000) setMsg(t("th.fileTooBig")); else f.text().then(doImport); }
          }} />
        </div>
        <textarea className="mono theme-json" value={json} onChange={e => setJson(e.target.value)} placeholder={t("th.jsonPlaceholder")} spellCheck={false} aria-label={t("th.jsonAria")} />
      </Group>

      <CustomCssEditor value={cur.customCss} onSave={css => patch({ customCss: css })} />

    </PageShell>
  );
}

/** Runde 3: eigenes CSS – wirkt ausschliesslich auf die Browser-Oberflaeche (UI-Webview), nie auf Webseiten. */
function CustomCssEditor({ value, onSave }: { value: string; onSave(css: string): void }) {
  const { t, fmtNum } = useT();
  const [draft, setDraft] = useState(value);
  const clean = sanitizeCss(draft);
  const changed = clean !== draft;
  return (
    <Group id="st-css" title={t("th.j.css")} desc={<>{t("th.cssDesc1")} <span className="mono">@import</span>, <span className="mono">url(…)</span>, <span className="mono">expression()</span> {t("th.cssDesc2", { max: fmtNum(CUSTOM_CSS_MAX) })} <span className="mono">--accent</span> {t("th.cssDesc3")}</>}>
      <textarea className="mono theme-json" value={draft} maxLength={CUSTOM_CSS_MAX} spellCheck={false} onChange={e => setDraft(e.target.value)}
        placeholder={".tab-item.active { outline: 1px solid var(--accent); }"} aria-label={t("th.j.css")} />
      {changed && <p className="small" style={{ color: "var(--warn)" }}>{t("th.cssStripped")}</p>}
      <div className="row-end">
        <button className="btn ghost" disabled={!value} onClick={() => { setDraft(""); onSave(""); }}>{t("c.remove")}</button>
        <button className="btn primary" disabled={clean === value} onClick={() => { setDraft(clean); onSave(clean); }}>{t("c.apply")}</button>
      </div>
    </Group>
  );
}

/** Runde 5: Hintergrund-Vorschau (eine Szene der portierten backgrounds.ts, animiert nur bei Hover). */
function BgPreview({ id, on, onPick }: { id: BgId; on: boolean; onPick(): void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const el = ref.current, api = window.JTechBackgrounds;
    if (!el || !api) return;
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => { const x = cs.getPropertyValue(n).trim(); return /^#[0-9a-f]{6}$/i.test(x) ? x : f; };
    api.attach(el, { id, accent: v("--accent", "#2cc5c9"), accentAlt: v("--accent-2", "#5fe0d6"), bg: v("--bg", "#0f1215"), text: v("--text", "#e7ecef"), intensity: 0.5, glow: 0.5, speed: 1, fps: 24, quality: 0.6, paused: !hover });
  });
  useEffect(() => { const el = ref.current; return () => { if (el) window.JTechBackgrounds?.detach(el); }; }, []);
  const meta = BACKGROUNDS.find(x => x.id === id);
  return (
    <button className={`bg-card${on ? " on" : ""}`} onClick={onPick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title={meta?.description}>
      <span ref={ref} className="bg-thumb" />
      <span className="theme-name">{meta?.name}</span>
    </button>
  );
}

function Slider({ label, value, min, max, unit = "", onChange, hint }: { label: string; value: number; min: number; max: number; unit?: string; hint?: string; onChange(v: number): void }) {
  const id = useId();
  return (
    <Row title={label} desc={hint} htmlFor={id}>
      <input id={id} type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} />
      <output className="range-val" htmlFor={id}>{value}{unit}</output>
    </Row>
  );
}
function Color({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  return (
    <Row title={label}>
      <div className="color-field">
        <input type="color" value={value} aria-label={label} onChange={e => onChange(e.target.value)} />
        <input className="mono" defaultValue={value} key={value} maxLength={7} spellCheck={false} aria-label={t("th.hex", { label })} onBlur={e => { const v = normalizeHex(e.target.value, ""); if (v) onChange(v); }} />
      </div>
    </Row>
  );
}

/** Runde 5: animierte Hintergruende, eigener Cursor, Cursor-Spur (Port der Electron-Variante). */
function EffectsEditor() {
  const b = useBrowser();
  const e = b.settings.effects;
  const set = (p: Partial<EffectsSettings>) => b.updateEffects(p);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  useT();
  const accent = () => {
    const cs = getComputedStyle(document.documentElement);
    return [cs.getPropertyValue("--accent").trim(), cs.getPropertyValue("--accent-2").trim()].map(x => normalizeHex(x, "#2cc5c9"));
  };
  const setSize = async (size: number) => {
    if (e.cursor === "image" && e.cursorImage) {
      try { set({ cursorSize: size, cursorImage: await rescaleCursor(e.cursorImage, size) }); } catch { set({ cursorSize: size }); }
    } else set({ cursorSize: size });
  };
  return (
    <>
      <Group id="st-bg" title={t("th.bgTitle")} desc={t("th.bgDesc")}>
        <Row title={t("th.bgShow")}>
          <Switch label={t("th.bgShow")} checked={e.bgEnabled} onChange={v => set({ bgEnabled: v })} />
        </Row>
        <div className={`bg-grid${e.bgEnabled ? "" : " disabled"}`}>
          {BACKGROUNDS.map(x => <BgPreview key={x.id} id={x.id} on={e.bgEnabled && e.background === x.id} onPick={() => set({ background: x.id, bgEnabled: true })} />)}
        </div>
        <Slider label={t("th.intensity")} value={e.bgIntensity} min={0} max={100} unit=" %" hint={t("th.intensityHint")} onChange={v => set({ bgIntensity: v })} />
        <Slider label={t("th.speed")} value={e.bgSpeed} min={0} max={200} unit=" %" hint={t("th.speedHint")} onChange={v => set({ bgSpeed: v })} />
        <Slider label={t("th.glow")} value={e.bgGlow} min={0} max={100} unit=" %" onChange={v => set({ bgGlow: v })} />
        <Slider label={t("th.surface")} value={e.surfaceAlpha} min={40} max={100} unit=" %" hint={t("th.surfaceHint")} onChange={v => set({ surfaceAlpha: v })} />
        <Row title={t("th.quality")} desc={t("th.qualityDesc")}>
          <select value={e.quality} aria-label={t("th.quality")} onChange={ev => set({ quality: ev.target.value as Quality })}>
            {(Object.keys(QUALITY) as Quality[]).map(q => <option key={q} value={q}>{QUALITY[q].name}</option>)}
          </select>
        </Row>
        <Row title={t("th.pauseWeb")} desc={t("th.pauseWebDesc")}>
          <Switch label={t("th.pauseWeb")} checked={e.pauseOnWeb} onChange={v => set({ pauseOnWeb: v })} />
        </Row>
      </Group>

      <Group id="st-cursor" title={t("th.cursorTitle")} desc={t("th.cursorDesc")}>
        <div className="cursor-grid">
          {CURSOR_PRESETS.filter(c => c.id !== "image").map(c => {
            const sp = c.id ? cursorSpec({ ...e, cursor: c.id, cursorSize: 32 }) : null;
            return (
              <button key={c.id || "sys"} className={`cursor-card${e.cursor === c.id ? " on" : ""}`} onClick={() => set({ cursor: c.id })} title={c.name}>
                <span className="cursor-thumb">{sp ? <img src={sp.url} alt="" width={28} height={28} /> : <span className="muted small">Aa</span>}</span>
                <span className="theme-name">{c.name}</span>
              </button>
            );
          })}
          <button className={`cursor-card${e.cursor === "image" ? " on" : ""}`} onClick={() => (e.cursorImage ? set({ cursor: "image" }) : fileRef.current?.click())} title={t("fx.cur.image")}>
            <span className="cursor-thumb">{e.cursorImage ? <img src={e.cursorImage} alt="" width={28} height={28} /> : "+"}</span>
            <span className="theme-name">{t("fx.cur.image")}</span>
          </button>
        </div>
        <Color label={t("th.cursorColor")} value={e.cursorColor} onChange={v => set({ cursorColor: v })} />
        <Slider label={t("th.size")} value={e.cursorSize} min={16} max={64} unit=" px" hint={t("th.sizeHint")} onChange={setSize} />
        <Row title={t("fx.cur.image")} desc={t("th.imgDesc", { size: e.cursorSize })}>
            <button className="btn" onClick={() => fileRef.current?.click()}>{t("th.pickImage")}</button>
            {e.cursorImage && <button className="btn ghost" onClick={() => set({ cursorImage: "", cursor: e.cursor === "image" ? "" : e.cursor })}>{t("c.remove")}</button>}
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml" onChange={async ev => {
              const f = ev.target.files?.[0]; ev.target.value = "";
              if (!f) return;
              try { set({ cursorImage: await imageToCursor(f, e.cursorSize), cursor: "image" }); setMsg(t("th.cursorTaken")); }
              catch (err) { setMsg(String(err instanceof Error ? err.message : err)); }
            }} />
        </Row>
        {e.cursor === "image" && (
          <Row title={t("th.hotspot")} desc={t("th.hotspotDesc")}>
            <div className="segmented">
              <button className={e.cursorHotspot === "center" ? "on" : ""} onClick={() => set({ cursorHotspot: "center" })}>{t("th.center")}</button>
              <button className={e.cursorHotspot === "topleft" ? "on" : ""} onClick={() => set({ cursorHotspot: "topleft" })}>{t("th.topleft")}</button>
            </div></Row>
        )}
        {msg && <p className="small form-msg" role="status">{msg}</p>}
      </Group>

      <Group id="st-trail" title={t("th.trailTitle")} desc={t("th.trailDesc")}>
        <Row title={t("th.style")} col>
          <div className="segmented wrap">
            {TRAILS.map(x => <button key={x.id} className={e.trail === x.id ? "on" : ""} onClick={() => set({ trail: x.id })}>{x.name}</button>)}
          </div>
        </Row>
        <Color label={t("th.color")} value={e.trailColor} onChange={v => set({ trailColor: v })} />
        <Color label={t("th.color2")} value={e.trailColor2} onChange={v => set({ trailColor2: v })} />
        <div className="row-end"><button className="btn ghost sm" onClick={() => { const [a, c] = accent(); set({ trailColor: a, trailColor2: c, cursorColor: a }); }}>{t("th.takeAccent")}</button></div>
        <Slider label={t("th.size")} value={e.trailSize} min={2} max={40} unit=" px" onChange={v => set({ trailSize: v })} />
        <Slider label={t("th.length")} value={e.trailLength} min={0} max={100} unit=" %" hint={t("th.lengthHint")} onChange={v => set({ trailLength: v })} />
        <Slider label={t("th.strength")} value={e.trailIntensity} min={0} max={100} unit=" %" onChange={v => set({ trailIntensity: v })} />
        <Row title={t("th.inPages")} desc={t("th.inPagesDesc")}>
          <Switch label={t("th.inPagesLabel")} checked={e.inPages} onChange={v => set({ inPages: v })} />
        </Row>
      </Group>
    </>
  );
}
