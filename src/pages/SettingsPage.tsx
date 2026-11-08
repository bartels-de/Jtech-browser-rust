import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBrowser } from "../store/BrowserStore";
import { BUILTIN_BANGS, SEARCH_ENGINES, normalizeBangs, type SearchEngineId } from "../lib/urls";
import { SIDEBAR_DEFAULT_WIDTH, type ThemeSetting } from "../store/types";
import { PermissionSettings } from "../components/PermissionSettings";
import { ShortcutEditor } from "../components/ShortcutEditor";
import { DownloadList } from "../components/DownloadList";
import { storageBackend } from "../store/storage";
import { call, filterStateLabel, type FilterStatus, type PrivacyOptions } from "../lib/ipc";
import { matches } from "../lib/suggest";
import { COMMANDS } from "../lib/commands";
import { checkForUpdate, downloadUpdate, fmtBytes, installAndRestart, useUpdater } from "../lib/updater";
import { BACKGROUNDS } from "../lib/fx/effects";
import { themeName } from "../lib/theme";
import { Disclosure, Group, Row, SearchCtx, Switch } from "../components/SettingsUI";
import { IconDownload, IconGlobe, IconInfo, IconKeyboard, IconSearch, IconSettings, IconShield, IconSidebar, IconPalette, IconLock, JTechLogo } from "../components/Icons";
import { LANGS, localizeBackend, fmtDate, fmtDateTime, fmtTime, systemLang, t, useT, type LangSetting, type TKey } from "../i18n";
import { formatCombo } from "../lib/keys";

/**
 * Runde 5: aufgeraeumte Einstellungen – linke Unternavigation, Suchfeld, einheitliche Karten/Zeilen.
 * Ohne Suche wird nur der gewaehlte Abschnitt gezeigt; mit Suche alle passenden Abschnitte/Zeilen.
 * i18n: titles/keywords come from the dictionaries (keywords contain both languages' terms where useful).
 */
type SectionId = "general" | "appearance" | "search" | "tabs" | "privacy" | "adblock" | "permissions" | "downloads" | "shortcuts" | "about";
interface Section { id: SectionId; title: string; icon: ReactNode; keywords: string }
const SECTION_ICONS: [SectionId, ReactNode][] = [
  ["general", <IconSettings size={16} />],
  ["appearance", <IconPalette size={16} />],
  ["search", <IconSearch size={16} />],
  ["tabs", <IconSidebar size={16} />],
  ["privacy", <IconLock size={16} />],
  ["adblock", <IconShield size={16} />],
  ["permissions", <IconGlobe size={16} />],
  ["downloads", <IconDownload size={16} />],
  ["shortcuts", <IconKeyboard size={16} />],
  ["about", <IconInfo size={16} />],
];
const sections = (): Section[] => SECTION_ICONS.map(([id, icon]) => ({
  id, icon, title: t(`set.s.${id}` as TKey),
  keywords: t(`set.kw.${id}` as TKey) + (id === "shortcuts" ? " " + COMMANDS.map(c => c.title).join(" ") : ""),
}));

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
      <div className="settings-body">
        {shown.length === 0 && <div className="empty-state"><h2>{t("set.nothing")}</h2><p>{t("set.noMatch", { q })}</p></div>}
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
    </div>
  );
}

function SectionBody({ id, q }: { id: SectionId; q: string }) {
  switch (id) {
    case "general": return <General />;
    case "appearance": return <Appearance />;
    case "search": return <SearchSec />;
    case "tabs": return <TabsSec />;
    case "privacy": return <PrivacySec />;
    case "adblock": return <AdblockSec />;
    case "permissions": return <PermissionSettings />;
    case "downloads": return <DownloadsSec />;
    case "shortcuts": return <div className="card"><ShortcutEditor query={matches(q, t("set.kw.shortcuts")) ? "" : q} /></div>;
    case "about": return <About />;
  }
  return null;
}

function General() {
  const b = useBrowser(); const s = b.settings;
  useT();
  const custom = s.startPage !== "jtech://newtab";
  const [startUrl, setStartUrl] = useState(custom ? s.startPage : "https://");
  const ok = /^https?:\/\/.+\..+/.test(startUrl.trim());
  const sysName = LANGS.find(l => l.id === systemLang())?.name ?? "English";
  const langOpts: [LangSetting, string][] = [["system", t("c.system")], ...LANGS.map(l => [l.id, l.name] as [LangSetting, string])];
  return <>
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
      <Row title={t("set.restore")} desc={t("set.restoreDesc")} keywords="session">
        <Switch label={t("set.restore")} checked={s.restoreSession} onChange={v => b.updateSettings({ restoreSession: v })} />
      </Row>
    </Group>
  </>;
}

function Appearance() {
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
      <Row title={t("set.sidebarWidth")} desc={t("set.sidebarWidthDesc", { px: s.sidebarWidth })} keywords="sidebar">
        <button className="btn" disabled={s.sidebarWidth === SIDEBAR_DEFAULT_WIDTH && s.sidebarExpanded}
          onClick={() => b.updateSettings({ sidebarWidth: SIDEBAR_DEFAULT_WIDTH, sidebarExpanded: true })}>{t("c.reset")}</button>
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
      <Row title={t("set.animBg")} desc={e.bgEnabled ? t("set.animBgOn", { name: BACKGROUNDS.find(x => x.id === e.background)?.name ?? "" }) : t("set.animBgOff")} keywords="animation">
        <Switch label={t("set.animBg")} checked={e.bgEnabled} onChange={v => b.updateEffects({ bgEnabled: v })} />
      </Row>
      <Row title={t("set.cursorWeb")} desc={e.inPages ? t("set.cursorWebOn") : t("set.cursorWebOff")} keywords="cursor script">
        <Switch label={t("set.cursorWeb")} checked={e.inPages} onChange={v => b.updateEffects({ inPages: v })} />
      </Row>
    </Group>
  </>;
}

function SearchSec() {
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

function TabsSec() {
  const b = useBrowser(); const s = b.settings;
  const { fmtPct } = useT();
  const zoom = Object.entries(b.zoomBySite).sort(([a], [c]) => a.localeCompare(c));
  const k = (id: string, f: string) => b.keyHint(id) ?? formatCombo(f);
  return <>
    <Group title={t("set.saveMem")} desc={t("set.saveMemDesc")}>
      <Row title={t("set.autoSleep")} keywords="sleep">
        <select value={s.tabSleepMinutes} aria-label={t("set.autoSleepAria")} onChange={e => b.updateSettings({ tabSleepMinutes: Number(e.target.value) })}>
          {[0, 5, 10, 15, 30, 60, 120, 240].map(m => <option key={m} value={m}>{m === 0 ? t("set.never") : t("set.afterMin", { count: m })}</option>)}
        </select>
      </Row>
      <Row title={t("set.sleepNowTitle")} keywords="sleep">
        <button className="btn" onClick={b.sleepInactiveTabs}>{t("set.sleepNow")}</button>
      </Row>
    </Group>
    <Group title={t("set.groups")} desc={t("set.groupsDesc")}>
      <Row title={t("set.autoGroup")} desc={t("set.autoGroupDesc")} keywords="domain">
        <Switch label={t("set.autoGroup")} checked={s.autoGroupByDomain} onChange={v => b.updateSettings({ autoGroupByDomain: v })} />
      </Row>
      <Row title={t("set.groupNowTitle")} desc={t("set.groupNowDesc")} keywords="domain">
        <button className="btn" onClick={b.groupTabsByDomain}>{t("set.groupNow")}</button>
      </Row>
    </Group>
    <Group title={t("set.zoom")} desc={t("set.zoomDesc", { in: k("page.zoomIn", "ctrl+plus"), out: k("page.zoomOut", "ctrl+minus"), reset: k("page.zoomReset", "ctrl+0") })}>
      {zoom.length === 0 && <p className="muted small s-empty">{t("set.noZoom")}</p>}
      {zoom.map(([host, z]) => (
        <Row key={host} title={host} keywords="zoom">
          <span className="muted">{fmtPct(Math.round(z * 100))}</span>
          <button className="btn ghost sm" onClick={() => b.resetSiteZoom(host)}>{t("c.reset")}</button>
        </Row>
      ))}
    </Group>
  </>;
}

function PrivacySec() {
  const b = useBrowser();
  useT();
  const [opts, setOpts] = useState<PrivacyOptions | null>(null);
  useEffect(() => { call<PrivacyOptions>("privacy_get_options").then(o => o && setOpts(o)); }, []);
  const saveOpts = (o: PrivacyOptions) => { setOpts(o); call("privacy_set_options", { opts: o }, b.setStatus); };
  return <>
    <Group title={t("set.stored")}>
      <Row title={t("page.history")} desc={t("set.historyDesc", { count: b.history.length })}>
        <button className="btn" onClick={() => b.openPage("history")}>{t("c.show")}</button>
        <button className="btn danger" disabled={!b.history.length} onClick={() => confirm(t("hist.clearConfirm")) && b.clearHistory()}>{t("c.delete")}</button>
      </Row>
      <Row title={t("set.privacyOverview")} desc={t("set.privacyOverviewDesc")} keywords="dashboard cookies cache">
        <button className="btn" onClick={() => b.openPage("privacy")}>{t("c.open")}</button>
      </Row>
    </Group>
    {opts && (
      <Group title={t("set.onExit")} desc={t("set.onExitDesc")}>
        <Row title={t("set.delCookies")} desc={t("set.delCookiesDesc")} keywords="cookies">
          <Switch label={t("set.delCookiesExit")} checked={opts.clearCookiesOnExit} onChange={v => saveOpts({ ...opts, clearCookiesOnExit: v })} />
        </Row>
        <Row title={t("set.delCache")} desc={t("set.delCacheDesc")} keywords="cache">
          <Switch label={t("set.delCacheExit")} checked={opts.clearCacheOnExit} onChange={v => saveOpts({ ...opts, clearCacheOnExit: v })} />
        </Row>
      </Group>
    )}
  </>;
}

const dt = (ms: number) => (ms ? fmtDateTime(ms) : t("c.never"));
function AdblockSec() {
  const b = useBrowser();
  useT();
  const [fs, setFs] = useState<FilterStatus | null>(null);
  const refresh = useCallback(() => { call<FilterStatus>("filter_status").then(s => s && setFs(s)); }, []);
  useEffect(() => {
    refresh();
    const un = listen<FilterStatus>("filter-status", ({ payload }) => setFs(payload));
    return () => { un.then(f => f()); };
  }, [refresh]);
  const busy = fs?.state === "loading" || fs?.state === "building";
  const unallow = async (h: string) => { const l = await call<string[]>("allowlist_set", { host: h, allowed: false }, b.setStatus); if (l) setFs(f => (f ? { ...f, allowlist: l } : f)); };
  return <>
    <Group title={t("ab.protection")}>
      <Row title={t("ab.block")} desc={t("ab.blockDesc")} keywords="shield">
        <Switch label={t("ab.block")} checked={b.settings.adblock} onChange={v => b.updateSettings({ adblock: v })} />
      </Row>
      <Row title={t("ab.cosmetic")} desc={t("ab.cosmeticDesc")} keywords="cosmetic">
        <Switch label={t("ab.cosmetic")} disabled={!fs} checked={fs?.cosmetic ?? true} onChange={v => fs && call("filter_set_options", { updateDays: fs.updateDays, cosmetic: v }, b.setStatus)} />
      </Row>
      <Row title={t("ab.exceptions")} desc={t("ab.exceptionsDesc")} col keywords="allowlist">
        <div className="chips">
          {(fs?.allowlist ?? []).length === 0 && <span className="muted small">{t("ab.noExceptions")}</span>}
          {(fs?.allowlist ?? []).map(h => <span key={h} className="chip">{h}<button title={t("th.removeNamed", { name: h })} aria-label={t("th.removeNamed", { name: h })} onClick={() => unallow(h)}>×</button></span>)}
        </div>
      </Row>
    </Group>
    <Group title={t("ab.filterLists")} desc={fs ? <><span className={`status-pill ${fs.state}`}>{filterStateLabel(fs.state)}</span> {t("fs.rules", { count: fs.activeRules })}</> : t("fs.statusLoading")}
      actions={<button className="btn" disabled={busy || !fs} onClick={() => call("filter_update_now", undefined, b.setStatus)}>{busy ? t("fs.running") : t("c.updateNow")}</button>}>
      {(fs?.lists ?? []).map(l => (
        <Row key={l.id} title={l.name} desc={l.error ? t("fs.failed", { detail: localizeBackend(l.error) }) : l.lastUpdated ? t("fs.asOf", { date: dt(l.lastUpdated) }) : t("fs.notLoaded")} keywords="EasyList EasyPrivacy uBlock">
          <Switch label={l.name} checked={l.enabled} onChange={v => call("filter_set_list", { id: l.id, enabled: v }, b.setStatus)} />
        </Row>
      ))}
      <Row title={t("fs.autoUpdate")} desc={t("fs.autoUpdateDesc")} keywords="interval">
        <select value={fs?.updateDays ?? 4} disabled={!fs} aria-label={t("fs.intervalAria")} onChange={e => fs && call("filter_set_options", { updateDays: Number(e.target.value), cosmetic: fs.cosmetic }, b.setStatus)}>
          {[1, 2, 4, 7, 14, 30].map(d => <option key={d} value={d}>{t("fs.everyDays", { count: d })}</option>)}
        </select>
      </Row>
    </Group>
  </>;
}

function DownloadsSec() {
  const b = useBrowser();
  useT();
  return <>
    <Group title={t("dls.location")}>
      <Row title={t("dls.folder")} desc={t("dls.folderDesc")} keywords="folder" />
    </Group>
    <Group title={t("dls.recent")} actions={<>
      <button className="btn ghost" disabled={!b.downloads.some(d => d.state !== "progressing")} onClick={b.clearDownloads}>{t("dlp.clearList")}</button>
      <button className="btn" onClick={() => b.openPage("downloads")}>{t("dls.showAll")}</button></>}>
      <DownloadList compact limit={5} />
    </Group>
  </>;
}

function About() {
  const b = useBrowser(); const s = b.settings;
  const { fmtPct, lang } = useT();
  const u = useUpdater();
  const busy = u.phase === "checking" || u.phase === "downloading" || u.phase === "installing";
  const pct = u.progress === undefined ? undefined : Math.round(u.progress * 100);
  const v = u.version ?? "";
  const statusText =
    u.phase === "checking" ? t("ab.st.checking") :
    u.phase === "uptodate" ? t("ab.st.uptodate") :
    u.phase === "available" ? t("ab.st.available", { v }) :
    u.phase === "downloading" ? t("ab.st.downloading", { v }) :
    u.phase === "ready" ? t("ab.st.ready", { v }) :
    u.phase === "installing" ? t("ab.st.installing") :
    u.phase === "error" ? t("ab.st.error", { detail: u.error ?? t("c.unknownError") }) :
    t("ab.st.idle");
  return <>
    <Group>
      <div className="about-head"><JTechLogo size={48} /><div><strong>JTech Browser</strong><small className="muted">{t("ab.tagline", { v: u.currentVersion || "…" })}</small></div></div>
      <Row title={t("ab.updates")} desc={<>
          <span className={u.phase === "error" ? "update-err" : undefined} role={u.phase === "error" ? "alert" : undefined}>{statusText}</span>
          {u.lastCheck ? <> {t("ab.lastCheck", { time: fmtTime(u.lastCheck) })}</> : null}
        </>} keywords="update version">
        {(u.phase === "idle" || u.phase === "uptodate" || u.phase === "error" || u.phase === "checking") &&
          <button className="btn" disabled={busy} onClick={() => checkForUpdate(false)}>{u.phase === "checking" ? t("ab.searching") : t("ab.check")}</button>}
        {u.phase === "available" && <button className="btn primary" onClick={() => downloadUpdate()}>{t("c.download")}</button>}
        {(u.phase === "ready" || u.phase === "installing") &&
          <button className="btn primary" disabled={u.phase === "installing"} onClick={() => installAndRestart()}>{t("up.restartNow")}</button>}
      </Row>
      {u.phase === "downloading" && (
        <div className="update-dl">
          <progress className="update-progress" max={100} value={pct} aria-label={t("up.progress")} />
          <small className="muted">{fmtBytes(u.downloaded)}{u.total ? ` ${t("ab.of", { total: fmtBytes(u.total) })}` : ""}{pct !== undefined ? ` · ${fmtPct(pct)}` : ""}</small>
        </div>
      )}
      {u.version && u.phase !== "uptodate" && (
        <div className="update-notes">
          <strong>{t("ab.newIn", { v })}{u.date ? ` · ${fmtDate(new Date(u.date))}` : ""}</strong>
          <pre>{u.notes?.trim() || t("ab.noNotes")}</pre>
        </div>
      )}
    </Group>
    <Group title={t("ab.auto")} desc={t("ab.autoDesc")}>
      <Row title={t("ab.autoCheck")} desc={t("ab.autoCheckDesc")} keywords="auto-update">
        <Switch label={t("ab.autoCheck")} checked={s.autoUpdateCheck} onChange={x => b.updateSettings({ autoUpdateCheck: x })} />
      </Row>
      <Row title={t("ab.extra")} desc={t("ab.extraDesc")} keywords="interval update">
        <select value={s.updateIntervalHours} disabled={!s.autoUpdateCheck} onChange={e => b.updateSettings({ updateIntervalHours: Number(e.target.value) })} aria-label={t("ab.intervalAria")}>
          <option value={0}>{t("ab.onlyStart")}</option>
          <option value={6}>{t("ab.every6")}</option>
          <option value={12}>{t("ab.every12")}</option>
          <option value={24}>{t("ab.daily")}</option>
          <option value={72}>{t("ab.every3d")}</option>
        </select>
      </Row>
    </Group>
    <Disclosure summary={t("c.technical")}>
      <dl className="tech-list">
        <dt>{t("ab.t.version")}</dt><dd>{u.currentVersion || "…"}</dd>
        <dt>{t("ab.t.base")}</dt><dd>Tauri 2 · Microsoft WebView2 · Brave adblock-rust</dd>
        <dt>{t("ab.t.storage")}</dt><dd>{storageBackend() === "rust" ? t("ab.t.sqlite") : t("ab.t.local")}</dd>
        <dt>{t("ab.t.effects")}</dt><dd>{t("ab.t.effectsText")}</dd>
        <dt>{t("ab.t.language")}</dt><dd>{LANGS.find(l => l.id === lang)?.name} ({s.language})</dd>
      </dl>
    </Disclosure>
  </>;
}
