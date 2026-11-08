import { useEffect, useId, useRef, useState } from "react";
import { Group, Row, Switch } from "../components/SettingsUI";
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
      <header className="page-head"><h1>Design-Studio</h1><p className="muted">Gestalte JTech nach deinem Geschmack. Jede Änderung wirkt sofort und wird automatisch gespeichert.</p></header>
      <nav className="studio-jump" aria-label="Bereiche des Design-Studios">
        {[["st-presets", "Vorlagen"], ["st-edit", "Farben & Formen"], ["st-bg", "Hintergrund"], ["st-cursor", "Cursor"], ["st-trail", "Cursor-Spur"], ["st-io", "Teilen"], ["st-css", "Eigenes CSS"]].map(([id, l]) =>
          <button key={id} className="chip-btn" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{l}</button>)}
      </nav>

      <Group id="st-presets" title="Vorlagen" desc="Ein Klick wechselt das komplette Erscheinungsbild. Eigene Themes erscheinen hier ebenfalls."
        actions={<label className="switch-row small"><span>Mit Hintergrund und Cursor-Spur</span>
          <Switch label="Hintergrund und Cursor-Spur der Vorlage mit übernehmen" checked={withFx} onChange={setWithFx} /></label>}>
        <div className="theme-grid">
          {[...PRESETS, ...b.savedThemes].map(t => (
            <button key={t.id} className={`theme-card${(b.customTheme?.id ?? "jtech") === t.id ? " on" : ""}`} onClick={() => preset(t)} title={t.name}>
              <span className="theme-swatch" style={{ background: t.bg, borderRadius: t.radius }}>
                <i style={{ background: t.accent }} /><i style={{ background: t.accent2 }} /><i style={{ background: t.text }} />
              </span>
              <span className="theme-name">{t.name}</span>
              {b.savedThemes.some(s => s.id === t.id) && <span className="theme-del" role="button" aria-label={`${t.name} entfernen`} title="Entfernen" onClick={e => { e.stopPropagation(); b.removeTheme(t.id); }}>×</span>}
            </button>
          ))}
        </div>
      </Group>

      <Group id="st-edit" title="Farben und Formen" desc="Passe das aktive Theme an. Vorlagen werden dabei als eigene Kopie weitergeführt.">
        <Row title="Name" desc="So erscheint das Theme in den Vorlagen.">
          <input className="text-input" value={cur.name} maxLength={40} aria-label="Theme-Name" onChange={e => patch({ name: e.target.value })} />
        </Row>
        <Row title="Grundton" desc="Hell oder dunkel – steuert auch Scrollbalken und Formularfelder.">
          <div className="segmented" role="radiogroup" aria-label="Grundton">
            {(["dark", "light"] as const).map(m => <button key={m} role="radio" aria-checked={cur.mode === m} className={cur.mode === m ? "on" : ""} onClick={() => patch({ mode: m })}>{m === "dark" ? "Dunkel" : "Hell"}</button>)}
          </div>
        </Row>
        <div className="color-row">
          {COLORS.map(c => (
            <label key={c.key} className="color-swatch">
              <input type="color" value={cur[c.key] as string} aria-label={c.label} onChange={e => patch({ [c.key]: e.target.value } as Partial<ThemeSpec>)} />
              <span><strong>{c.label}</strong>
                <input className="mono" value={cur[c.key] as string} maxLength={7} spellCheck={false} aria-label={`${c.label} als Hex-Wert`}
                  onChange={e => { const v = normalizeHex(e.target.value, ""); if (v) patch({ [c.key]: v } as Partial<ThemeSpec>); }} /></span>
            </label>
          ))}
        </div>
        <Slider label="Ecken-Rundung" value={cur.radius} min={0} max={24} unit=" px" onChange={v => patch({ radius: v })} />
        <Slider label="Deckkraft von Menüs" value={cur.glass} min={30} max={100} unit=" %" hint="Menüs, Panels, Befehlspalette" onChange={v => patch({ glass: v })} />
        <Slider label="Unschärfe hinter Menüs" value={cur.blur} min={0} max={40} unit=" px" onChange={v => patch({ blur: v })} />
        <Slider label="Leuchten" value={cur.glow} min={0} max={100} unit=" %" hint="um Akzent-Elemente; 0 = aus" onChange={v => patch({ glow: v })} />
        <Row title="Schrift" desc="Nur auf Windows installierte Schriften.">
          <select value={cur.font} aria-label="Schrift" onChange={e => patch({ font: e.target.value as FontId })}>
            {(Object.keys(FONTS) as FontId[]).map(f => <option key={f} value={f}>{FONTS[f].name}</option>)}
          </select>
        </Row>
        <div className="theme-preview glass" aria-label="Vorschau">
          <span className="btn primary">Primär</span><span className="btn">Normal</span><span className="btn ghost">Dezent</span>
          <span className="muted">Gedimmter Text</span>
        </div>
        <div className="row-end">
          <button className="btn ghost" onClick={() => b.setCustomTheme(null)}>Auf JTech-Standard zurücksetzen</button>
          <button className="btn primary" disabled={!b.customTheme} onClick={() => { b.saveTheme(cur); setMsg(`„${cur.name}“ gespeichert.`); }}>Als eigenes Theme speichern</button>
        </div>
        {msg && <p className="small form-msg" role="status">{msg}</p>}
      </Group>

      <EffectsEditor />

      <Group id="st-io" title="Teilen" desc="Themes als Datei sichern oder von anderen übernehmen. Themes aus dem alten JTech-Browser (Electron) werden ebenfalls erkannt.">
        <div className="row-start">
          <button className="btn" onClick={doExport}>Exportieren</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Datei importieren …</button>
          <button className="btn ghost" disabled={!json.trim()} onClick={() => doImport(json)}>Text unten importieren</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (f) { if (f.size > 20000) setMsg("Die Datei ist zu groß (max. 20 KB)."); else f.text().then(doImport); }
          }} />
        </div>
        <textarea className="mono theme-json" value={json} onChange={e => setJson(e.target.value)} placeholder='Theme-Text hier einfügen, z. B. {"format":"jtech-theme", …}' spellCheck={false} aria-label="Theme als Text" />
      </Group>

      <CustomCssEditor value={cur.customCss} onSave={css => patch({ customCss: css })} />

    </div>
  );
}

/** Runde 3: eigenes CSS – wirkt ausschliesslich auf die Browser-Oberflaeche (UI-Webview), nie auf Webseiten. */
function CustomCssEditor({ value, onSave }: { value: string; onSave(css: string): void }) {
  const [draft, setDraft] = useState(value);
  const clean = sanitizeCss(draft);
  const changed = clean !== draft;
  return (
    <Group id="st-css" title="Eigenes CSS" desc={<>Für Fortgeschrittene: gilt nur für die Oberfläche von JTech, nicht für Webseiten. Aus Sicherheitsgründen werden <span className="mono">@import</span>, <span className="mono">url(…)</span>, <span className="mono">expression()</span> und HTML entfernt. Max. {CUSTOM_CSS_MAX.toLocaleString("de-DE")} Zeichen; Variablen wie <span className="mono">--accent</span> sind verfügbar.</>}>
      <textarea className="mono theme-json" value={draft} maxLength={CUSTOM_CSS_MAX} spellCheck={false} onChange={e => setDraft(e.target.value)}
        placeholder={".tab-item.active { outline: 1px solid var(--accent); }"} aria-label="Eigenes CSS" />
      {changed && <p className="small" style={{ color: "var(--warn)" }}>Einige Teile werden beim Übernehmen entfernt.</p>}
      <div className="row-end">
        <button className="btn ghost" disabled={!value} onClick={() => { setDraft(""); onSave(""); }}>Entfernen</button>
        <button className="btn primary" disabled={clean === value} onClick={() => { setDraft(clean); onSave(clean); }}>Übernehmen</button>
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
        <input className="mono" defaultValue={value} key={value} maxLength={7} spellCheck={false} aria-label={`${label} als Hex-Wert`} onBlur={e => { const v = normalizeHex(e.target.value, ""); if (v) onChange(v); }} />
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
      <Group id="st-bg" title="Animierter Hintergrund" desc="Liegt hinter Seitenleiste, Kopfbereich und internen Seiten. Webseiten bleiben unverändert. Fahre über eine Vorschau, um sie zu animieren.">
        <Row title="Hintergrund anzeigen">
          <Switch label="Hintergrund anzeigen" checked={e.bgEnabled} onChange={v => set({ bgEnabled: v })} />
        </Row>
        <div className={`bg-grid${e.bgEnabled ? "" : " disabled"}`}>
          {BACKGROUNDS.map(x => <BgPreview key={x.id} id={x.id} on={e.bgEnabled && e.background === x.id} onPick={() => set({ background: x.id, bgEnabled: true })} />)}
        </div>
        <Slider label="Intensität" value={e.bgIntensity} min={0} max={100} unit=" %" hint="Menge der Partikel und Linien" onChange={v => set({ bgIntensity: v })} />
        <Slider label="Geschwindigkeit" value={e.bgSpeed} min={0} max={200} unit=" %" hint="0 = stehend" onChange={v => set({ bgSpeed: v })} />
        <Slider label="Leuchten" value={e.bgGlow} min={0} max={100} unit=" %" onChange={v => set({ bgGlow: v })} />
        <Slider label="Deckkraft der Oberfläche" value={e.surfaceAlpha} min={40} max={100} unit=" %" hint="Wie stark Seitenleiste und Kopfbereich den Hintergrund abdecken" onChange={v => set({ surfaceAlpha: v })} />
        <Row title="Qualität" desc="Bildrate und Auflösung. Pausiert bei minimiertem Fenster und beachtet „Animationen reduzieren“ in Windows.">
          <select value={e.quality} aria-label="Qualität" onChange={ev => set({ quality: ev.target.value as Quality })}>
            {(Object.keys(QUALITY) as Quality[]).map(q => <option key={q} value={q}>{QUALITY[q].name}</option>)}
          </select>
        </Row>
        <Row title="Auf Webseiten pausieren" desc="Spart Akku und CPU – animiert nur auf internen Seiten.">
          <Switch label="Auf Webseiten pausieren" checked={e.pauseOnWeb} onChange={v => set({ pauseOnWeb: v })} />
        </Row>
      </Group>

      <Group id="st-cursor" title="Eigener Cursor" desc="Ersetzt den Mauszeiger über der JTech-Oberfläche.">
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
        <Slider label="Größe" value={e.cursorSize} min={16} max={64} unit=" px" hint="Windows zeigt sehr große Cursor eventuell verkleinert" onChange={setSize} />
        <Row title="Eigenes Bild" desc={`PNG, JPG, GIF, WebP, BMP oder SVG – wird auf ${e.cursorSize} px verkleinert und nur lokal gespeichert.`}>
            <button className="btn" onClick={() => fileRef.current?.click()}>Bild wählen…</button>
            {e.cursorImage && <button className="btn ghost" onClick={() => set({ cursorImage: "", cursor: e.cursor === "image" ? "" : e.cursor })}>Entfernen</button>}
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml" onChange={async ev => {
              const f = ev.target.files?.[0]; ev.target.value = "";
              if (!f) return;
              try { set({ cursorImage: await imageToCursor(f, e.cursorSize), cursor: "image" }); setMsg("Cursorbild übernommen."); }
              catch (err) { setMsg(String(err instanceof Error ? err.message : err)); }
            }} />
        </Row>
        {e.cursor === "image" && (
          <Row title="Klickpunkt" desc="Wo im Bild der Klick ausgelöst wird.">
            <div className="segmented">
              <button className={e.cursorHotspot === "center" ? "on" : ""} onClick={() => set({ cursorHotspot: "center" })}>Mitte</button>
              <button className={e.cursorHotspot === "topleft" ? "on" : ""} onClick={() => set({ cursorHotspot: "topleft" })}>Oben links</button>
            </div></Row>
        )}
        {msg && <p className="small form-msg" role="status">{msg}</p>}
      </Group>

      <Group id="st-trail" title="Cursor-Spur" desc="Ein Effekt, der dem Mauszeiger folgt.">
        <Row title="Stil" col>
          <div className="segmented wrap">
            {TRAILS.map(t => <button key={t.id} className={e.trail === t.id ? "on" : ""} onClick={() => set({ trail: t.id })}>{t.name}</button>)}
          </div>
        </Row>
        <Color label="Farbe" value={e.trailColor} onChange={v => set({ trailColor: v })} />
        <Color label="Zweite Farbe" value={e.trailColor2} onChange={v => set({ trailColor2: v })} />
        <div className="row-end"><button className="btn ghost sm" onClick={() => { const [a, c] = accent(); set({ trailColor: a, trailColor2: c, cursorColor: a }); }}>Akzentfarben des Themes übernehmen</button></div>
        <Slider label="Größe" value={e.trailSize} min={2} max={40} unit=" px" onChange={v => set({ trailSize: v })} />
        <Slider label="Länge" value={e.trailLength} min={0} max={100} unit=" %" hint="wie lange die Spur sichtbar bleibt" onChange={v => set({ trailLength: v })} />
        <Slider label="Stärke" value={e.trailIntensity} min={0} max={100} unit=" %" onChange={v => set({ trailIntensity: v })} />
        <Row title="Auch auf Webseiten" desc="Ohne diese Option wirken Cursor und Spur nur auf Seitenleiste, Kopfbereich und internen Seiten. Gilt ab dem nächsten Laden; manche Websites lassen das nicht zu.">
          <Switch label="Cursor und Spur auch auf Webseiten" checked={e.inPages} onChange={v => set({ inPages: v })} />
        </Row>
      </Group>
    </>
  );
}
