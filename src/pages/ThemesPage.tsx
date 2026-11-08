import { useEffect, useRef, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { CUSTOM_CSS_MAX, FONTS, JTECH_DEFAULT, PRESETS, exportTheme, importTheme, normalizeHex, sanitizeCss, type FontId, type ThemeSpec } from "../lib/theme";
import { BACKGROUNDS, CURSOR_PRESETS, PRESET_EFFECTS, QUALITY, TRAILS, cursorSpec, imageToCursor, rescaleCursor, type BgId, type EffectsSettings, type Quality } from "../lib/fx/effects";

/** Port: Design-Studio (Standardprojekt: Theme-Editor in index.html / app.js / studio.css). */
const COLORS: { key: keyof ThemeSpec; label: string }[] = [
  { key: "accent", label: "Akzent" },
  { key: "accent2", label: "Zweiter Akzent" },
  { key: "bg", label: "Hintergrund" },
  { key: "text", label: "Text" },
  { key: "textDim", label: "Gedimmter Text" },
];

export function ThemesPage() {
  const b = useBrowser();
  const cur = b.customTheme ?? JTECH_DEFAULT;
  const [json, setJson] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Jede Aenderung wird sofort angewendet (Live-Vorschau = gesamte Oberflaeche) und gespeichert.
  const patch = (p: Partial<ThemeSpec>) => b.setCustomTheme({ ...cur, ...p, id: cur.id === "jtech" || PRESETS.some(x => x.id === cur.id) ? "custom-" + Date.now().toString(36) : cur.id, name: PRESETS.some(x => x.id === cur.id) ? `${cur.name} (angepasst)` : cur.name });
  const doImport = (text: string) => {
    try { const t = importTheme(text); b.setCustomTheme(t); b.saveTheme(t); setMsg(`„${t.name}“ importiert.`); }
    catch (e) { setMsg(`Import fehlgeschlagen: ${String(e instanceof Error ? e.message : e)}`); }
  };
  const doExport = () => {
    const text = exportTheme(cur);
    setJson(text);
    navigator.clipboard?.writeText(text).then(() => setMsg("JSON in die Zwischenablage kopiert."), () => setMsg("JSON unten angezeigt."));
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.download = `${cur.name.replace(/[^\w-]+/g, "_") || "theme"}.jtech-theme.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch { /* Download in der UI-Webview evtl. nicht moeglich */ }
  };
  // Runde 5: wie im Electron-Original bringen Vorlagen ihren Hintergrund/Cursor-Effekt mit (abschaltbar).
  const [withFx, setWithFx] = useState(true);
  const preset = (t: ThemeSpec) => {
    b.setCustomTheme(t.id === "jtech" ? null : t);
    if (withFx) b.updateEffects(PRESET_EFFECTS[t.id] ?? { bgEnabled: false, trail: "none" });
  };

  return (
    <div className="page doc-page">
      <header className="page-head"><h1>Design-Studio</h1><p className="muted">Farben, animierte Hintergründe, Cursor und Cursor-Spuren. Änderungen wirken sofort und werden gespeichert.</p></header>
      <nav className="studio-jump">
        {[["st-presets", "Vorlagen"], ["st-edit", "Farben"], ["st-bg", "Hintergrund"], ["st-cursor", "Cursor"], ["st-trail", "Cursor-Spur"], ["st-css", "Eigenes CSS"], ["st-io", "Import/Export"]].map(([id, l]) =>
          <button key={id} className="chip-btn" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{l}</button>)}
      </nav>

      <section className="card" id="st-presets">
        <h2>Vorlagen</h2>
        <label className="switch-row small"><span>Hintergrund und Cursor-Spur der Vorlage mit übernehmen</span>
          <input type="checkbox" className="switch" checked={withFx} onChange={e => setWithFx(e.target.checked)} /></label>
        <div className="theme-grid">
          {[...PRESETS, ...b.savedThemes].map(t => (
            <button key={t.id} className={`theme-card${(b.customTheme?.id ?? "jtech") === t.id ? " on" : ""}`} onClick={() => preset(t)} title={t.name}>
              <span className="theme-swatch" style={{ background: t.bg, borderRadius: t.radius }}>
                <i style={{ background: t.accent }} /><i style={{ background: t.accent2 }} /><i style={{ background: t.text }} />
              </span>
              <span className="theme-name">{t.name}</span>
              {b.savedThemes.some(s => s.id === t.id) && <span className="theme-del" role="button" title="Entfernen" onClick={e => { e.stopPropagation(); b.removeTheme(t.id); }}>×</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="card" id="st-edit">
        <h2>Farben und Formen</h2>
        <label className="setting"><div><strong>Name</strong></div>
          <input value={cur.name} maxLength={40} onChange={e => patch({ name: e.target.value })} /></label>
        <div className="setting"><div><strong>Modus</strong><small>Steuert Systemfarben (Scrollbalken, Formulare)</small></div>
          <div className="segmented">
            {(["dark", "light"] as const).map(m => <button key={m} className={cur.mode === m ? "on" : ""} onClick={() => patch({ mode: m })}>{m === "dark" ? "Dunkel" : "Hell"}</button>)}
          </div></div>
        {COLORS.map(c => (
          <div key={c.key} className="setting"><div><strong>{c.label}</strong></div>
            <div className="color-field">
              <input type="color" value={cur[c.key] as string} onChange={e => patch({ [c.key]: e.target.value } as Partial<ThemeSpec>)} />
              <input className="mono" value={cur[c.key] as string} maxLength={7} spellCheck={false}
                onChange={e => { const v = normalizeHex(e.target.value, ""); if (v) patch({ [c.key]: v } as Partial<ThemeSpec>); }} />
            </div></div>
        ))}
        <label className="setting"><div><strong>Rundung</strong><small>{cur.radius}px</small></div>
          <input type="range" min={0} max={24} value={cur.radius} onChange={e => patch({ radius: Number(e.target.value) })} /></label>
        <label className="setting"><div><strong>Glas-Deckkraft</strong><small>{cur.glass} % – Menüs, Panels, Befehlspalette</small></div>
          <input type="range" min={30} max={100} value={cur.glass} onChange={e => patch({ glass: Number(e.target.value) })} /></label>
        <label className="setting"><div><strong>Weichzeichner (Blur)</strong><small>{cur.blur}px</small></div>
          <input type="range" min={0} max={40} value={cur.blur} onChange={e => patch({ blur: Number(e.target.value) })} /></label>
        <label className="setting"><div><strong>Leuchten (Glow)</strong><small>{cur.glow === 0 ? "aus" : `${cur.glow} %`} – um Akzent-Elemente</small></div>
          <input type="range" min={0} max={100} value={cur.glow} onChange={e => patch({ glow: Number(e.target.value) })} /></label>
        <div className="setting"><div><strong>Schrift</strong><small>Nur installierte Windows-Schriften</small></div>
          <select value={cur.font} onChange={e => patch({ font: e.target.value as FontId })}>
            {(Object.keys(FONTS) as FontId[]).map(f => <option key={f} value={f}>{FONTS[f].name}</option>)}
          </select></div>
        <div className="theme-preview glass">
          <span className="btn primary">Primär</span><span className="btn">Normal</span><span className="btn ghost">Ghost</span>
          <span className="muted">Gedimmter Text</span>
        </div>
        <div className="row-end">
          <button className="btn ghost" onClick={() => b.setCustomTheme(null)}>Zurücksetzen</button>
          <button className="btn primary" disabled={!b.customTheme} onClick={() => { b.saveTheme(cur); setMsg(`„${cur.name}“ gespeichert.`); }}>Als eigenes Theme speichern</button>
        </div>
      </section>

      <EffectsEditor />

      <CustomCssEditor value={cur.customCss} onSave={css => patch({ customCss: css })} />

      <section className="card" id="st-io">
        <h2>Import / Export</h2>
        <p className="muted small">JSON-Format <span className="mono">jtech-theme</span>. Themes aus dem alten Electron-Browser (Felder accent, accentAlt, bg, text, textDim, radius) werden ebenfalls erkannt.</p>
        <div className="row">
          <button className="btn" onClick={doExport}>Exportieren</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Datei importieren…</button>
          <button className="btn ghost" disabled={!json.trim()} onClick={() => doImport(json)}>JSON unten importieren</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (f) { if (f.size > 20000) setMsg("Datei zu groß."); else f.text().then(doImport); }
          }} />
        </div>
        <textarea className="mono theme-json" value={json} onChange={e => setJson(e.target.value)} placeholder='{"format":"jtech-theme", …}' spellCheck={false} />
        {msg && <p className="small">{msg}</p>}
      </section>
    </div>
  );
}

/** Runde 3: eigenes CSS – wirkt ausschliesslich auf die Browser-Oberflaeche (UI-Webview), nie auf Webseiten. */
function CustomCssEditor({ value, onSave }: { value: string; onSave(css: string): void }) {
  const [draft, setDraft] = useState(value);
  const clean = sanitizeCss(draft);
  const changed = clean !== draft;
  return (
    <section className="card" id="st-css">
      <h2>Eigenes CSS</h2>
      <p className="muted small">Gilt nur für die Oberfläche von JTech Browser, nicht für Webseiten. Aus Sicherheitsgründen werden <span className="mono">@import</span>, <span className="mono">url(…)</span>, <span className="mono">expression()</span> und HTML entfernt. Max. {CUSTOM_CSS_MAX.toLocaleString("de-DE")} Zeichen. Variablen wie <span className="mono">--accent</span> sind verfügbar.</p>
      <textarea className="mono theme-json" value={draft} maxLength={CUSTOM_CSS_MAX} spellCheck={false} onChange={e => setDraft(e.target.value)}
        placeholder={".tab-item.active { outline: 1px solid var(--accent); }"} />
      {changed && <p className="small" style={{ color: "var(--warn)" }}>Einige Teile werden beim Übernehmen entfernt.</p>}
      <div className="row-end">
        <button className="btn ghost" disabled={!value} onClick={() => { setDraft(""); onSave(""); }}>Entfernen</button>
        <button className="btn primary" disabled={clean === value} onClick={() => { setDraft(clean); onSave(clean); }}>Übernehmen</button>
      </div>
    </section>
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
  return (
    <label className="setting"><div><strong>{label}</strong><small>{value}{unit}{hint ? ` – ${hint}` : ""}</small></div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} /></label>
  );
}
function Color({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  return (
    <div className="setting"><div><strong>{label}</strong></div>
      <div className="color-field">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} />
        <input className="mono" defaultValue={value} key={value} maxLength={7} spellCheck={false} onBlur={e => { const v = normalizeHex(e.target.value, ""); if (v) onChange(v); }} />
      </div></div>
  );
}

/** Runde 5: animierte Hintergruende, eigener Cursor, Cursor-Spur (Port der Electron-Variante). */
function EffectsEditor() {
  const b = useBrowser();
  const e = b.settings.effects;
  const set = (p: Partial<EffectsSettings>) => b.updateEffects(p);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
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
      <section className="card" id="st-bg">
        <h2>Animierter Hintergrund</h2>
        <label className="setting"><div><strong>Hintergrund anzeigen</strong><small>Liegt hinter Seitenleiste, Kopfbereich und internen Seiten. Webseiten selbst bleiben unverändert.</small></div>
          <input type="checkbox" className="switch" checked={e.bgEnabled} onChange={ev => set({ bgEnabled: ev.target.checked })} /></label>
        <div className={`bg-grid${e.bgEnabled ? "" : " disabled"}`}>
          {BACKGROUNDS.map(x => <BgPreview key={x.id} id={x.id} on={e.bgEnabled && e.background === x.id} onPick={() => set({ background: x.id, bgEnabled: true })} />)}
        </div>
        <Slider label="Intensität" value={e.bgIntensity} min={0} max={100} unit=" %" hint="Menge der Partikel/Linien" onChange={v => set({ bgIntensity: v })} />
        <Slider label="Geschwindigkeit" value={e.bgSpeed} min={0} max={200} unit=" %" hint="0 = stehend" onChange={v => set({ bgSpeed: v })} />
        <Slider label="Leuchten" value={e.bgGlow} min={0} max={100} unit=" %" onChange={v => set({ bgGlow: v })} />
        <Slider label="Deckkraft der Oberfläche" value={e.surfaceAlpha} min={40} max={100} unit=" %" hint="wie stark Seitenleiste/Kopf den Hintergrund abdecken" onChange={v => set({ surfaceAlpha: v })} />
        <div className="setting"><div><strong>Leistung</strong><small>Bildrate und Auflösung. Läuft nicht, wenn das Fenster minimiert ist; respektiert „Bewegung reduzieren“ von Windows.</small></div>
          <select value={e.quality} onChange={ev => set({ quality: ev.target.value as Quality })}>
            {(Object.keys(QUALITY) as Quality[]).map(q => <option key={q} value={q}>{QUALITY[q].name}</option>)}
          </select></div>
        <label className="setting"><div><strong>Pausieren, solange eine Webseite angezeigt wird</strong><small>Spart Akku/CPU – animiert dann nur auf internen Seiten</small></div>
          <input type="checkbox" className="switch" checked={e.pauseOnWeb} onChange={ev => set({ pauseOnWeb: ev.target.checked })} /></label>
      </section>

      <section className="card" id="st-cursor">
        <h2>Eigener Cursor</h2>
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
          <button className={`cursor-card${e.cursor === "image" ? " on" : ""}`} onClick={() => (e.cursorImage ? set({ cursor: "image" }) : fileRef.current?.click())} title="Eigenes Bild">
            <span className="cursor-thumb">{e.cursorImage ? <img src={e.cursorImage} alt="" width={28} height={28} /> : "+"}</span>
            <span className="theme-name">Eigenes Bild</span>
          </button>
        </div>
        <Color label="Cursorfarbe" value={e.cursorColor} onChange={v => set({ cursorColor: v })} />
        <Slider label="Größe" value={e.cursorSize} min={16} max={64} unit=" px" hint="Windows zeigt große Cursor evtl. verkleinert" onChange={setSize} />
        <div className="setting"><div><strong>Bild hochladen</strong><small>PNG, JPG, GIF, WebP, BMP oder SVG; wird auf {e.cursorSize} px verkleinert und lokal gespeichert</small></div>
          <div className="row">
            <button className="btn" onClick={() => fileRef.current?.click()}>Bild wählen…</button>
            {e.cursorImage && <button className="btn ghost" onClick={() => set({ cursorImage: "", cursor: e.cursor === "image" ? "" : e.cursor })}>Entfernen</button>}
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml" onChange={async ev => {
              const f = ev.target.files?.[0]; ev.target.value = "";
              if (!f) return;
              try { set({ cursorImage: await imageToCursor(f, e.cursorSize), cursor: "image" }); setMsg("Cursorbild übernommen."); }
              catch (err) { setMsg(String(err instanceof Error ? err.message : err)); }
            }} />
          </div></div>
        {e.cursor === "image" && (
          <div className="setting"><div><strong>Klickpunkt</strong><small>Wo im Bild der Klick ausgelöst wird</small></div>
            <div className="segmented">
              <button className={e.cursorHotspot === "center" ? "on" : ""} onClick={() => set({ cursorHotspot: "center" })}>Mitte</button>
              <button className={e.cursorHotspot === "topleft" ? "on" : ""} onClick={() => set({ cursorHotspot: "topleft" })}>Oben links</button>
            </div></div>
        )}
        {msg && <p className="small">{msg}</p>}
      </section>

      <section className="card" id="st-trail">
        <h2>Cursor-Spur</h2>
        <div className="setting"><div><strong>Stil</strong></div>
          <div className="segmented wrap">
            {TRAILS.map(t => <button key={t.id} className={e.trail === t.id ? "on" : ""} onClick={() => set({ trail: t.id })}>{t.name}</button>)}
          </div></div>
        <Color label="Farbe" value={e.trailColor} onChange={v => set({ trailColor: v })} />
        <Color label="Zweite Farbe" value={e.trailColor2} onChange={v => set({ trailColor2: v })} />
        <div className="row-end"><button className="btn ghost sm" onClick={() => { const [a, c] = accent(); set({ trailColor: a, trailColor2: c, cursorColor: a }); }}>Akzentfarben des Themes übernehmen</button></div>
        <Slider label="Größe" value={e.trailSize} min={2} max={40} unit=" px" onChange={v => set({ trailSize: v })} />
        <Slider label="Länge" value={e.trailLength} min={0} max={100} unit=" %" hint="wie lange die Spur sichtbar bleibt" onChange={v => set({ trailLength: v })} />
        <Slider label="Stärke" value={e.trailIntensity} min={0} max={100} unit=" %" onChange={v => set({ trailIntensity: v })} />
        <label className="setting"><div><strong>Auch auf Webseiten</strong><small>Standard: aus. Fügt Cursor und Spur per Script in jede geladene Webseite ein (ab dem nächsten Laden). Kann auf manchen Seiten stören oder von deren Sicherheitsregeln (CSP) blockiert werden.</small></div>
          <input type="checkbox" className="switch" checked={e.inPages} onChange={ev => set({ inPages: ev.target.checked })} /></label>
        <p className="muted small">Hinweis: Webseiten werden in einer eigenen WebView2 über der Oberfläche angezeigt. Ohne „Auch auf Webseiten“ wirken Cursor und Spur nur über Seitenleiste, Kopfbereich und internen Seiten (Startseite, Einstellungen …).</p>
      </section>
    </>
  );
}
