import { useEffect, useRef, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { useBrowser } from "../store/BrowserStore";
import { IconSearch } from "../components/Icons";
import { ExpertCtx, SearchCtx } from "../components/SettingsUI";
import { t, useT, type TKey } from "../i18n";
import { matches } from "../lib/suggest";
import { SectionBody, sections } from "./settings/SettingsSections";
export function SettingsPage() {
  const b = useBrowser();
  useT();
  const [q, setQ] = useState("");
  const SECTIONS = sections();
  const sec = SECTIONS.some(s => s.id === b.settingsSection) ? b.settingsSection : "general";
  const searchRef = useRef<HTMLInputElement>(null);
  const shown = q.trim() ? SECTIONS.filter(s => matches(q, s.title, s.keywords)) : SECTIONS.filter(s => s.id === sec);
  useEffect(() => { document.querySelector(".content")?.scrollTo({ top: 0 }); }, [sec]);

  return (
    <div className="page settings-page">
      <aside className="settings-nav">
        <h1>{t("page.settings")}</h1>
        <label className="search-field settings-search">
          <IconSearch size={15} />
          <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder={t("set.search")} spellCheck={false}
            onKeyDown={e => { if (e.key === "Escape") setQ(""); }} aria-label={t("set.search")} />
          {q && <button className="icon-btn sm" title={t("set.clearSearch")} aria-label={t("set.clearSearch")} onClick={() => { setQ(""); searchRef.current?.focus(); }}>×</button>}
        </label>
        <label className="expert-toggle" title={b.settings.settingsExpert === true ? undefined : t("set.simpleNote")}>
          <input type="checkbox" role="switch" className="switch" checked={b.settings.settingsExpert === true} onChange={e => b.updateSettings({ settingsExpert: e.target.checked })} />
          <span>{t("set.expert")}</span>
        </label>
        <nav>
          {SECTIONS.map(s => {
            const hit = !q.trim() || matches(q, s.title, s.keywords);
            return (
              <button key={s.id} className={`settings-nav-item${!q.trim() && s.id === sec ? " on" : ""}${hit ? "" : " dim"}`}
                onClick={() => { setQ(""); b.setSettingsSection(s.id); }}>
                {s.icon}<span>{s.title}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <ExpertCtx.Provider value={b.settings.settingsExpert === true}>
      <div className="settings-body">
        {shown.length === 0 && <EmptyState card icon={<IconSearch size={20} />} title={t("set.nothing")} text={t("set.noMatch", { q })} />}
        {shown.map(s => (
          <SearchCtx.Provider key={s.id} value={{ q: q.trim(), all: !q.trim() || matches(q, s.title) }}>
            <section className="settings-section" aria-labelledby={`sec-${s.id}`}>
              <h2 id={`sec-${s.id}`} className="settings-h2">{s.icon}{s.title}</h2>
              {!q.trim() && <p className="settings-lead">{t(`set.d.${s.id}` as TKey)}</p>}
              <SectionBody id={s.id} q={q} />
            </section>
          </SearchCtx.Provider>
        ))}
      </div>
      </ExpertCtx.Provider>
    </div>
  );
}
