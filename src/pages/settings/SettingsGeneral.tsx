import { useState } from "react";
import { useBrowser } from "../../store/BrowserStore";
import { BUILTIN_BANGS, SEARCH_ENGINES, normalizeBangs, type SearchEngineId } from "../../lib/urls";
import { PRESET_IDS, SIDEBAR_DEFAULT_WIDTH, presetSettings, type PresetId, type ThemeSetting } from "../../store/types";
import { Group, Row, Switch } from "../../components/SettingsUI";
import { BACKGROUNDS } from "../../lib/fx/effects";
import { themeName } from "../../lib/theme";
import { LANGS, systemLang, t, useT, type LangSetting, type TKey } from "../../i18n";
/** One-click presets with a preview of what changes; applying them can be undone from the toast. */
function Presets() {
  const b = useBrowser();
  useT();
  const [pick, setPick] = useState<PresetId | null>(null);
  const preview = (id: PresetId) => {
    const p = presetSettings(id, b.settings);
    const out: string[] = [];
    if (p.toolbar) out.push(t("preset.pv.toolbar", { n: p.toolbar.length }));
    if (p.sidebarExpanded !== undefined) out.push(p.sidebarExpanded ? t("preset.pv.sidebarFull") : t("preset.pv.sidebarCompact"));
    if (p.showBookmarksBar !== undefined) out.push(!p.showBookmarksBar ? t("preset.pv.bmOff") : p.bookmarksBarOnlyNewTab ? t("preset.pv.bmNewtab") : t("preset.pv.bmOn"));
    if (p.tabAnimations !== undefined) out.push(p.tabAnimations ? t("preset.pv.animOn") : t("preset.pv.animOff"));
    if (p.start) out.push(p.start.quickLinks ? t("preset.pv.startFull") : t("preset.pv.startMin"));
    if (p.limits) out.push(p.limits.enabled ? t("preset.pv.limitsOn", { min: p.limits.suspendAfterMin }) : t("preset.pv.limitsOff"));
    if (p.settingsExpert) out.push(t("preset.pv.expert"));
    if (p.tabSleepMinutes) out.push(t("preset.pv.sleep", { count: p.tabSleepMinutes }));
    return out;
  };
  return (
    <Group title={t("preset.title")} desc={t("preset.desc")}>
      <div className="preset-grid">
        {PRESET_IDS.map(id => (
          <button key={id} className={`preset-card${pick === id ? " on" : ""}`} onClick={() => setPick(id)} aria-pressed={pick === id}>
            <strong>{t(`preset.${id}` as TKey)}</strong><small>{t(`preset.${id}.desc` as TKey)}</small>
          </button>
        ))}
      </div>
      {pick && (
        <div className="preset-preview">
          <strong>{t("preset.changes")}</strong>
          <ul>{preview(pick).map(x => <li key={x}>{x}</li>)}</ul>
          <div className="row-end">
            <button className="btn ghost" onClick={() => setPick(null)}>{t("c.cancel")}</button>
            <button className="btn primary" onClick={() => { b.applyPreset(pick); setPick(null); }}>{t("preset.apply")}</button>
          </div>
        </div>
      )}
    </Group>
  );
}

export function General() {
  const b = useBrowser(); const s = b.settings;
  useT();
  const custom = s.startPage !== "jtech://newtab";
  const [startUrl, setStartUrl] = useState(custom ? s.startPage : "https://");
  const ok = /^https?:\/\/.+\..+/.test(startUrl.trim());
  const sysName = LANGS.find(l => l.id === systemLang())?.name ?? "English";
  const langOpts: [LangSetting, string][] = [["system", t("c.system")], ...LANGS.map(l => [l.id, l.name] as [LangSetting, string])];
  return <>
    <Presets />
    <Group title={t("set.lang.group")}>
      <Row title={t("set.lang.title")} desc={t("set.lang.desc", { sys: sysName })} keywords="Sprache Language Deutsch English System">
        <div className="segmented" role="radiogroup" aria-label={t("set.lang.title")}>
          {langOpts.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={s.language === id} className={s.language === id ? "on" : ""}
              lang={id === "system" ? undefined : id} onClick={() => b.updateSettings({ language: id })}>{label}</button>
          ))}
        </div>
      </Row>
    </Group>
    <Group title={t("set.onOpen")}>
      <Row title={t("set.startTitle")} desc={t("set.startDesc")} col keywords={t("set.startKw")}>
        <div className="choice-list" role="radiogroup" aria-label={t("cmd.nav.home")}>
          <label className="radio"><input type="radio" checked={!custom} onChange={() => b.updateSettings({ startPage: "jtech://newtab" })} /> {t("set.startJtech")}</label>
          <label className="radio"><input type="radio" checked={custom} onChange={() => ok && b.updateSettings({ startPage: startUrl.trim() })} /> {t("set.startCustom")}</label>
        </div>
        <div className="inline-form">
          <input value={startUrl} onChange={e => setStartUrl(e.target.value)} placeholder="https://…" spellCheck={false} aria-label={t("set.startCustomAria")} />
          <button className="btn" disabled={!ok} onClick={() => b.updateSettings({ startPage: startUrl.trim() })}>{t("c.apply")}</button>
        </div>
      </Row>
      <Row title={t("set.startRecent")} desc={t("set.startRecentDesc")} keywords="Recent Verlauf" advanced>
        <Switch label={t("set.startRecent")} checked={s.startShowRecent !== false} onChange={v => b.updateSettings({ startShowRecent: v })} />
      </Row>
      <Row title={t("set.restore")} desc={t("set.restoreDesc")} keywords="session">
        <Switch label={t("set.restore")} checked={s.restoreSession} onChange={v => b.updateSettings({ restoreSession: v })} />
      </Row>
    </Group>
  </>;
}

export function Appearance() {
  const b = useBrowser(); const s = b.settings; const e = s.effects;
  useT();
  return <>
    <Group title={t("set.colors")}>
      <Row title={t("set.scheme")} desc={t("set.schemeDesc")} keywords="theme">
        <div className="segmented" role="radiogroup" aria-label={t("set.scheme")}>
          {(["dark", "light", "system"] as ThemeSetting[]).map(x => (
            <button key={x} role="radio" aria-checked={s.theme === x} className={s.theme === x ? "on" : ""} onClick={() => b.updateSettings({ theme: x })}>{x === "dark" ? t("c.dark") : x === "light" ? t("c.light") : t("c.system")}</button>
          ))}
        </div>
      </Row>
      <Row title={t("page.themes")} desc={b.customTheme ? t("set.studioActive", { name: themeName(b.customTheme) }) : t("set.studioDesc")} keywords="theme">
        <button className="btn" onClick={() => b.openPage("themes")}>{t("cmd.open.themes")}</button>
      </Row>
    </Group>
    <Group title={t("set.layout")}>
      <Row title={t("set.sidebarTitles")} desc={t("set.sidebarTitlesDesc")} keywords="sidebar">
        <Switch label={t("set.sidebarTitles")} checked={s.sidebarExpanded} onChange={v => b.updateSettings({ sidebarExpanded: v })} />
      </Row>
      <Row title={t("tbc.title")} desc={t("tbc.desc")} keywords="toolbar symbolleiste buttons">
        <button className="btn" onClick={() => b.setPopover("toolbar")}>{t("tbc.open")}</button>
      </Row>
      <Row title={t("set.sidebarWidth")} desc={t("set.sidebarWidthDesc", { px: s.sidebarWidth })} keywords="sidebar" advanced>
        <button className="btn" disabled={s.sidebarWidth === SIDEBAR_DEFAULT_WIDTH && s.sidebarExpanded}
          onClick={() => b.updateSettingsUndoable({ sidebarWidth: SIDEBAR_DEFAULT_WIDTH, sidebarExpanded: true }, t("undo.sidebarReset"))}>{t("c.reset")}</button>
      </Row>
      <Row title={t("set.bmBar")} desc={t("set.bmBarDesc")} keywords="bookmarks">
        <div className="segmented" role="radiogroup" aria-label={t("set.bmBar")}>
          {([["always", t("set.bmAlways")], ["newtab", t("set.bmNewtab")], ["never", t("set.bmNever")]] as const).map(([k, label]) => {
            const cur = !s.showBookmarksBar ? "never" : s.bookmarksBarOnlyNewTab ? "newtab" : "always";
            return <button key={k} role="radio" aria-checked={cur === k} className={cur === k ? "on" : ""}
              onClick={() => b.updateSettings({ showBookmarksBar: k !== "never", bookmarksBarOnlyNewTab: k === "newtab" })}>{label}</button>;
          })}
        </div>
      </Row>
    </Group>
    <Group title={t("set.effects")}>
      <Row title={t("set.tabAnim")} desc={t("set.tabAnimDesc")} keywords="animation transition übergang motion">
        <Switch label={t("set.tabAnim")} checked={s.tabAnimations !== false} onChange={v => b.updateSettings({ tabAnimations: v })} />
      </Row>
      <Row title={t("set.animBg")} desc={e.bgEnabled ? t("set.animBgOn", { name: BACKGROUNDS.find(x => x.id === e.background)?.name ?? "" }) : t("set.animBgOff")} keywords="animation">
        <Switch label={t("set.animBg")} checked={e.bgEnabled} onChange={v => b.updateEffects({ bgEnabled: v })} />
      </Row>
      <Row title={t("set.cursorWeb")} desc={e.inPages ? t("set.cursorWebOn") : t("set.cursorWebOff")} keywords="cursor script" advanced>
        <Switch label={t("set.cursorWeb")} checked={e.inPages} onChange={v => b.updateEffects({ inPages: v })} />
      </Row>
    </Group>
  </>;
}

export function SearchSec() {
  const b = useBrowser(); const s = b.settings;
  useT();
  const [bangTrigger, setBangTrigger] = useState("");
  const [bangUrl, setBangUrl] = useState("https://");
  const newBang = normalizeBangs([{ trigger: bangTrigger, urlTemplate: bangUrl }])[0];
  return <>
    <Group title={t("set.engine")}>
      <Row title={t("set.engineDefault")} desc={t("set.engineDesc")} keywords="Google Bing DuckDuckGo">
        <select value={s.searchEngine} aria-label={t("set.engine")} onChange={e => b.updateSettings({ searchEngine: e.target.value as SearchEngineId })}>
          {Object.entries(SEARCH_ENGINES).map(([id, x]) => <option key={id} value={id}>{x.name}</option>)}
        </select>
      </Row>
      <Row title={t("set.liveSuggest")} desc={<>{t("set.liveSuggestDesc")} <strong>{t("sug.privacyNote")}</strong>{s.searchEngine === "startpage" ? <> {t("set.liveSuggestStartpage")}</> : null}</>} keywords="suggestions vorschläge autocomplete datenschutz privacy">
        <Switch label={t("set.liveSuggest")} checked={s.liveSuggest !== false} onChange={v => b.updateSettings({ liveSuggest: v })} />
      </Row>
    </Group>
    <Group title="Bangs" desc={<>{t("set.bangsDesc1")} <kbd>!yt lofi</kbd>. {t("set.bangsDesc2", { list: BUILTIN_BANGS.map(x => "!" + x.trigger).join(", ") })}</>}>
      <Row title={t("set.ownBangs")} desc={t("set.ownBangsDesc")} col keywords="bang">
        {s.bangs.length === 0 && <span className="muted small">{t("set.noBangs")}</span>}
        {s.bangs.map(x => (
          <div key={x.trigger} className="row item-row"><span><strong>!{x.trigger}</strong> <span className="mono muted">{x.urlTemplate}</span></span>
            <button className="btn ghost sm" onClick={() => b.updateSettings({ bangs: s.bangs.filter(y => y.trigger !== x.trigger) })}>{t("c.remove")}</button></div>
        ))}
        <div className="inline-form">
          <input value={bangTrigger} onChange={e => setBangTrigger(e.target.value)} placeholder={t("set.bangTrigger")} spellCheck={false} aria-label={t("set.bangTriggerAria")} style={{ maxWidth: 160 }} />
          <input value={bangUrl} onChange={e => setBangUrl(e.target.value)} placeholder={t("set.bangUrlPlaceholder")} spellCheck={false} aria-label={t("set.bangUrlAria")} />
          <button className="btn" disabled={!newBang} onClick={() => { if (newBang) { b.updateSettings({ bangs: [...s.bangs.filter(y => y.trigger !== newBang.trigger), newBang] }); setBangTrigger(""); setBangUrl("https://"); } }}>{t("c.add")}</button>
        </div>
      </Row>
    </Group>
  </>;
}

