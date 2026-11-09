import { useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { GALLERY, type GalleryTheme } from "../lib/themeGallery";
import { PRESET_EFFECTS } from "../lib/fx/effects";
import { themeName, type ThemeSpec } from "../lib/theme";
import { IconCheck, IconCopy } from "./Icons";
import { useT, type TKey } from "../i18n";

type Filter = "all" | "dark" | "light" | "vivid" | "calm" | "classic";
const FILTERS: Filter[] = ["all", "dark", "light", "vivid", "calm", "classic"];

/** Live mini preview of a theme: sidebar, toolbar, tabs and a card, drawn with the theme's colors. */
export function ThemeMini({ x }: { x: ThemeSpec }) {
  const panel = x.mode === "light" ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.06)";
  const line = x.mode === "light" ? "rgba(0,0,0,.10)" : "rgba(255,255,255,.10)";
  const r = Math.min(10, x.radius) / 2;
  return (
    <span className="theme-mini" style={{ background: x.bg, borderRadius: Math.min(14, x.radius + 2), color: x.text }} aria-hidden>
      <span className="tm-side" style={{ background: panel, borderRight: `1px solid ${line}` }}>
        <i style={{ background: x.accent, borderRadius: r }} /><i style={{ background: line, borderRadius: r }} /><i style={{ background: line, borderRadius: r }} />
      </span>
      <span className="tm-main">
        <span className="tm-bar" style={{ background: panel, borderRadius: r * 2, border: `1px solid ${line}` }}><b style={{ background: x.textDim }} /></span>
        <span className="tm-card" style={{ background: panel, borderRadius: r * 2, border: `1px solid ${line}`, boxShadow: x.glow ? `0 0 ${x.glow / 5}px ${x.accent}` : undefined }}>
          <b style={{ background: x.text }} /><b style={{ background: x.textDim, width: "60%" }} />
          <span className="tm-btns"><em style={{ background: x.accent, borderRadius: r }} /><em style={{ background: x.accent2, borderRadius: r }} /></span>
        </span>
      </span>
    </span>
  );
}

/** Theme gallery (Design Studio and JTech Market › Themes): apply with one click, duplicate to customize. */
export function ThemeGallery({ withFx = true, compact = false }: { withFx?: boolean; compact?: boolean }) {
  const b = useBrowser();
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const cur = b.customTheme?.id ?? "jtech";
  const apply = (x: ThemeSpec) => {
    b.setCustomTheme(x.id === "jtech" ? null : x);
    if (withFx) b.updateEffects(PRESET_EFFECTS[x.id] ?? { bgEnabled: false, trail: "none" });
    b.setStatus(t("tg.applied", { name: themeName(x) }));
  };
  const duplicate = (x: ThemeSpec) => {
    const copy: ThemeSpec = { ...x, id: "custom-" + Date.now().toString(36), name: t("tg.copyName", { name: themeName(x) }).slice(0, 40) };
    b.saveTheme(copy);
    b.setCustomTheme(copy);
    b.setStatus(t("tg.duplicated", { name: copy.name }));
  };
  const own: GalleryTheme[] = b.savedThemes.map(theme => ({ theme, tags: [theme.mode] }));
  const list = [...GALLERY, ...own].filter(g => filter === "all" || g.tags.includes(filter));
  return (
    <div className="theme-gallery">
      <div className="segmented tg-filter" role="radiogroup" aria-label={t("tg.filter")}>
        {FILTERS.map(f => <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{t(`tg.f.${f}` as TKey)}</button>)}
      </div>
      <div className={`tg-grid${compact ? " compact" : ""}`}>
        {list.map(({ theme: x }) => {
          const on = cur === x.id;
          const saved = b.savedThemes.some(s => s.id === x.id);
          return (
            <article key={x.id} className={`tg-card${on ? " on" : ""}`}>
              <button className="tg-preview" onClick={() => apply(x)} title={t("tg.apply")} aria-label={t("tg.applyNamed", { name: themeName(x) })}>
                <ThemeMini x={x} />
                {on && <span className="tg-on"><IconCheck size={13} /></span>}
              </button>
              <div className="tg-foot">
                <span className="tg-name">{themeName(x)}<small className="muted">{x.mode === "light" ? t("c.light") : t("c.dark")}{saved ? " · " + t("tg.own") : ""}</small></span>
                <button className="icon-btn sm" onClick={() => duplicate(x)} title={t("tg.duplicate")} aria-label={t("tg.duplicate")}><IconCopy size={14} /></button>
                {saved && <button className="icon-btn sm" onClick={() => b.removeTheme(x.id)} title={t("c.remove")} aria-label={t("th.removeNamed", { name: x.name })}>×</button>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
