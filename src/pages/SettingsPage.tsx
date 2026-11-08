import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBrowser } from "../store/BrowserStore";
import { BUILTIN_BANGS, SEARCH_ENGINES, normalizeBangs, type SearchEngineId } from "../lib/urls";
import { SIDEBAR_DEFAULT_WIDTH, type ThemeSetting } from "../store/types";
import { PermissionSettings } from "../components/PermissionSettings";
import { ShortcutEditor } from "../components/ShortcutEditor";
import { DownloadList } from "../components/DownloadList";
import { storageBackend } from "../store/storage";
import { call, type FilterStatus, type PrivacyOptions } from "../lib/ipc";
import { matches } from "../lib/suggest";
import { COMMANDS } from "../lib/commands";
import { checkForUpdate, downloadUpdate, fmtBytes, installAndRestart, useUpdater } from "../lib/updater";
import { BACKGROUNDS } from "../lib/fx/effects";
import { Disclosure, Group, Row, SearchCtx, Switch } from "../components/SettingsUI";
import { IconDownload, IconGlobe, IconHistory, IconMenu, IconSearch, IconSettings, IconShield, IconSidebar, IconPalette, IconLock, JTechLogo } from "../components/Icons";

/**
 * Runde 5: aufgeraeumte Einstellungen – linke Unternavigation, Suchfeld, einheitliche Karten/Zeilen.
 * Ohne Suche wird nur der gewaehlte Abschnitt gezeigt; mit Suche alle passenden Abschnitte/Zeilen.
 */
interface Section { id: string; title: string; icon: ReactNode; keywords: string }
const SECTION_DESC: Record<string, string> = {
  general: "Was beim Start und in neuen Tabs erscheint.",
  appearance: "Farben, Aufbau der Oberfläche und Effekte.",
  search: "Wie Eingaben in der Adressleiste gesucht werden.",
  tabs: "Speicher sparen, Tabs ordnen und Zoom je Website.",
  privacy: "Was JTech speichert und was beim Beenden gelöscht wird.",
  adblock: "JTech Shield blockiert Werbung und Tracker auf allen Seiten.",
  permissions: "Entscheidungen zu Kamera, Mikrofon, Standort und mehr.",
  downloads: "Wo Dateien landen und was zuletzt geladen wurde.",
  shortcuts: "Tastenkürzel ansehen und nach Wunsch ändern.",
  about: "Version, Updates und Informationen zu JTech Browser.",
};
const SECTIONS: Section[] = [
  { id: "general", title: "Allgemein", icon: <IconSettings size={16} />, keywords: "Startseite neue Tabs Sitzung wiederherstellen Start Adresse" },
  { id: "appearance", title: "Darstellung", icon: <IconPalette size={16} />, keywords: "Design hell dunkel System Farben Design-Studio Seitenleiste Lesezeichenleiste Animation Hintergrund Cursor Effekte" },
  { id: "search", title: "Suche", icon: <IconSearch size={16} />, keywords: "Suchmaschine Bangs DuckDuckGo Google Bing Startpage Brave Kürzel" },
  { id: "tabs", title: "Tabs", icon: <IconSidebar size={16} />, keywords: "Tab-Schlaf schlafen inaktiv Speicher Zoom Website Gruppen Domain" },
  { id: "privacy", title: "Datenschutz & Sicherheit", icon: <IconLock size={16} />, keywords: "Verlauf Cookies Cache löschen Beenden Browserdaten Dashboard Statistik" },
  { id: "adblock", title: "Werbeblocker & Filterlisten", icon: <IconShield size={16} />, keywords: "Werbeblocker Tracker Filterlisten EasyList EasyPrivacy uBlock kosmetisch Elemente ausblenden Ausnahmen aktualisieren" },
  { id: "permissions", title: "Berechtigungen", icon: <IconGlobe size={16} />, keywords: "Website-Berechtigungen Kamera Mikrofon Standort Benachrichtigungen" },
  { id: "downloads", title: "Downloads", icon: <IconDownload size={16} />, keywords: "Downloads Speicherort Ordner Liste leeren" },
  { id: "shortcuts", title: "Tastenkürzel", icon: <IconMenu size={16} />, keywords: "Tastenkürzel Shortcuts Tasten Kürzel Tastatur " + COMMANDS.map(c => c.title).join(" ") },
  { id: "about", title: "Über JTech", icon: <IconHistory size={16} />, keywords: "Version Info Update Updates aktualisieren automatisch Neustart technische Details" },
];

export function SettingsPage() {
  const b = useBrowser();
  const [q, setQ] = useState("");
  const sec = SECTIONS.some(s => s.id === b.settingsSection) ? b.settingsSection : "general";
  const searchRef = useRef<HTMLInputElement>(null);
  const shown = q.trim() ? SECTIONS.filter(s => matches(q, s.title, s.keywords)) : SECTIONS.filter(s => s.id === sec);
  useEffect(() => { document.querySelector(".content")?.scrollTo({ top: 0 }); }, [sec]);

  return (
    <div className="page settings-page">
      <aside className="settings-nav">
        <h1>Einstellungen</h1>
        <label className="search-field settings-search">
          <IconSearch size={15} />
          <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Einstellungen durchsuchen" spellCheck={false}
            onKeyDown={e => { if (e.key === "Escape") setQ(""); }} aria-label="Einstellungen durchsuchen" />
          {q && <button className="icon-btn sm" title="Suche leeren" onClick={() => { setQ(""); searchRef.current?.focus(); }}>×</button>}
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
        {shown.length === 0 && <div className="empty-state"><h2>Nichts gefunden</h2><p>Keine Einstellung passt zu „{q}“.</p></div>}
        {shown.map(s => (
          <SearchCtx.Provider key={s.id} value={{ q: q.trim(), all: !q.trim() || matches(q, s.title) }}>
            <section className="settings-section" aria-labelledby={`sec-${s.id}`}>
              <h2 id={`sec-${s.id}`} className="settings-h2">{s.icon}{s.title}</h2>
              {!q.trim() && SECTION_DESC[s.id] && <p className="settings-lead">{SECTION_DESC[s.id]}</p>}
              <SectionBody id={s.id} q={q} />
            </section>
          </SearchCtx.Provider>
        ))}
      </div>
    </div>
  );
}

function SectionBody({ id, q }: { id: string; q: string }) {
  switch (id) {
    case "general": return <General />;
    case "appearance": return <Appearance />;
    case "search": return <SearchSec />;
    case "tabs": return <TabsSec />;
    case "privacy": return <PrivacySec />;
    case "adblock": return <AdblockSec />;
    case "permissions": return <PermissionSettings />;
    case "downloads": return <DownloadsSec />;
    case "shortcuts": return <div className="card"><ShortcutEditor query={matches(q, "Tastenkürzel Shortcuts Tasten Kürzel Tastatur") ? "" : q} /></div>;
    case "about": return <About />;
  }
  return null;
}

function General() {
  const b = useBrowser(); const s = b.settings;
  const custom = s.startPage !== "jtech://newtab";
  const [startUrl, setStartUrl] = useState(custom ? s.startPage : "https://");
  const ok = /^https?:\/\/.+\..+/.test(startUrl.trim());
  return <>
    <Group title="Beim Öffnen">
      <Row title="Startseite und neue Tabs" desc="Erscheint beim Klick auf „Startseite“ und in jedem neuen Tab." col keywords="Adresse eigene">
        <div className="choice-list" role="radiogroup" aria-label="Startseite">
          <label className="radio"><input type="radio" checked={!custom} onChange={() => b.updateSettings({ startPage: "jtech://newtab" })} /> JTech-Startseite mit Uhr, Lesezeichen und zuletzt besuchten Seiten</label>
          <label className="radio"><input type="radio" checked={custom} onChange={() => ok && b.updateSettings({ startPage: startUrl.trim() })} /> Eigene Adresse</label>
        </div>
        <div className="inline-form">
          <input value={startUrl} onChange={e => setStartUrl(e.target.value)} placeholder="https://…" spellCheck={false} aria-label="Eigene Startadresse" />
          <button className="btn" disabled={!ok} onClick={() => b.updateSettings({ startPage: startUrl.trim() })}>Übernehmen</button>
        </div>
      </Row>
      <Row title="Letzte Sitzung wiederherstellen" desc="Beim Start alle Tabs vom letzten Mal öffnen, auch Einstellungen oder Verlauf." keywords="Sitzung wiederherstellen">
        <Switch label="Letzte Sitzung wiederherstellen" checked={s.restoreSession} onChange={v => b.updateSettings({ restoreSession: v })} />
      </Row>
    </Group>
  </>;
}

function Appearance() {
  const b = useBrowser(); const s = b.settings; const e = s.effects;
  return <>
    <Group title="Farben">
      <Row title="Farbschema" desc="Hell, dunkel oder wie in Windows eingestellt. Ein eigenes Theme aus dem Design-Studio hat Vorrang." keywords="Design hell dunkel System">
        <div className="segmented" role="radiogroup" aria-label="Farbschema">
          {(["dark", "light", "system"] as ThemeSetting[]).map(t => (
            <button key={t} role="radio" aria-checked={s.theme === t} className={s.theme === t ? "on" : ""} onClick={() => b.updateSettings({ theme: t })}>{t === "dark" ? "Dunkel" : t === "light" ? "Hell" : "System"}</button>
          ))}
        </div>
      </Row>
      <Row title="Design-Studio" desc={b.customTheme ? `Aktives Theme: ${b.customTheme.name}` : "Eigene Farben, Schrift, Rundungen, Hintergründe und Cursor gestalten."} keywords="Theme Farben Cursor Hintergrund">
        <button className="btn" onClick={() => b.openPage("themes")}>Design-Studio öffnen</button>
      </Row>
    </Group>
    <Group title="Aufbau">
      <Row title="Seitenleiste mit Tab-Titeln" desc="Aus: nur Symbole – mehr Platz für Webseiten. Breite lässt sich am rechten Rand ziehen, Doppelklick klappt ein und aus." keywords="Seitenleiste ausgeklappt kompakt">
        <Switch label="Seitenleiste mit Tab-Titeln" checked={s.sidebarExpanded} onChange={v => b.updateSettings({ sidebarExpanded: v })} />
      </Row>
      <Row title="Breite der Seitenleiste" desc={`Aktuell ${s.sidebarWidth} px.`} keywords="Seitenleiste Breite zurücksetzen Sidebar">
        <button className="btn" disabled={s.sidebarWidth === SIDEBAR_DEFAULT_WIDTH && s.sidebarExpanded}
          onClick={() => b.updateSettings({ sidebarWidth: SIDEBAR_DEFAULT_WIDTH, sidebarExpanded: true })}>Zurücksetzen</button>
      </Row>
      <Row title="Lesezeichenleiste anzeigen" desc="Deine Lesezeichen als schmale Leiste unter der Adressleiste. Ohne Lesezeichen bleibt sie ausgeblendet." keywords="Lesezeichenleiste Lesezeichen Leiste">
        <div className="segmented" role="radiogroup" aria-label="Lesezeichenleiste anzeigen">
          {([["always", "Immer"], ["newtab", "Nur auf Startseite"], ["never", "Nie"]] as const).map(([k, label]) => {
            const cur = !s.showBookmarksBar ? "never" : s.bookmarksBarOnlyNewTab ? "newtab" : "always";
            return <button key={k} role="radio" aria-checked={cur === k} className={cur === k ? "on" : ""}
              onClick={() => b.updateSettings({ showBookmarksBar: k !== "never", bookmarksBarOnlyNewTab: k === "newtab" })}>{label}</button>;
          })}
        </div>
      </Row>
    </Group>
    <Group title="Effekte">
      <Row title="Animierter Hintergrund" desc={e.bgEnabled ? `${BACKGROUNDS.find(x => x.id === e.background)?.name ?? ""} – Auswahl und Feinheiten im Design-Studio` : "Ein bewegter Hintergrund hinter Seitenleiste und internen Seiten."} keywords="Animation Effekte">
        <Switch label="Animierter Hintergrund" checked={e.bgEnabled} onChange={v => b.updateEffects({ bgEnabled: v })} />
      </Row>
      <Row title="Cursor und Spur auf Webseiten" desc={e.inPages ? "An – eigener Cursor und Spur erscheinen auch auf Webseiten." : "Aus – Webseiten bleiben unverändert."} keywords="Cursor Script Webseiten">
        <Switch label="Cursor und Spur auf Webseiten" checked={e.inPages} onChange={v => b.updateEffects({ inPages: v })} />
      </Row>
    </Group>
  </>;
}

function SearchSec() {
  const b = useBrowser(); const s = b.settings;
  const [bangTrigger, setBangTrigger] = useState("");
  const [bangUrl, setBangUrl] = useState("https://");
  const newBang = normalizeBangs([{ trigger: bangTrigger, urlTemplate: bangUrl }])[0];
  return <>
    <Group title="Suchmaschine">
      <Row title="Standard-Suchmaschine" desc="Für alles, was du in die Adressleiste tippst und keine Adresse ist." keywords="Suchmaschine Google Bing DuckDuckGo">
        <select value={s.searchEngine} aria-label="Suchmaschine" onChange={e => b.updateSettings({ searchEngine: e.target.value as SearchEngineId })}>
          {Object.entries(SEARCH_ENGINES).map(([id, x]) => <option key={id} value={id}>{x.name}</option>)}
        </select>
      </Row>
    </Group>
    <Group title="Bangs" desc={<>Mit einem Kürzel direkt auf einer Website suchen, z. B. <kbd>!yt lofi</kbd>. Eingebaut: {BUILTIN_BANGS.map(x => "!" + x.trigger).join(", ")}.</>}>
      <Row title="Eigene Bangs" desc="In der Adresse steht %s für deinen Suchbegriff." col keywords="Kürzel eigene Bang">
        {s.bangs.length === 0 && <span className="muted small">Noch keine eigenen Bangs.</span>}
        {s.bangs.map(x => (
          <div key={x.trigger} className="row item-row"><span><strong>!{x.trigger}</strong> <span className="mono muted">{x.urlTemplate}</span></span>
            <button className="btn ghost sm" onClick={() => b.updateSettings({ bangs: s.bangs.filter(y => y.trigger !== x.trigger) })}>Entfernen</button></div>
        ))}
        <div className="inline-form">
          <input value={bangTrigger} onChange={e => setBangTrigger(e.target.value)} placeholder="Kürzel, z. B. wiki" spellCheck={false} aria-label="Kürzel" style={{ maxWidth: 160 }} />
          <input value={bangUrl} onChange={e => setBangUrl(e.target.value)} placeholder="https://de.wikipedia.org/w/index.php?search=%s" spellCheck={false} aria-label="Such-Adresse mit %s" />
          <button className="btn" disabled={!newBang} onClick={() => { if (newBang) { b.updateSettings({ bangs: [...s.bangs.filter(y => y.trigger !== newBang.trigger), newBang] }); setBangTrigger(""); setBangUrl("https://"); } }}>Hinzufügen</button>
        </div>
      </Row>
    </Group>
  </>;
}

function TabsSec() {
  const b = useBrowser(); const s = b.settings;
  const zoom = Object.entries(b.zoomBySite).sort(([a], [c]) => a.localeCompare(c));
  return <>
    <Group title="Speicher sparen" desc="Schlafende Tabs geben Arbeitsspeicher frei und laden beim Anklicken neu. Angeheftete Tabs, interne Seiten und Tabs mit Ton schlafen nie.">
      <Row title="Inaktive Tabs automatisch schlafen legen" keywords="Tab-Schlaf schlafen">
        <select value={s.tabSleepMinutes} aria-label="Tabs schlafen legen nach" onChange={e => b.updateSettings({ tabSleepMinutes: Number(e.target.value) })}>
          {[0, 5, 10, 15, 30, 60, 120, 240].map(m => <option key={m} value={m}>{m === 0 ? "Nie" : `nach ${m} Minuten`}</option>)}
        </select>
      </Row>
      <Row title="Alle inaktiven Tabs jetzt schlafen legen" keywords="schlafen sofort">
        <button className="btn" onClick={b.sleepInactiveTabs}>Jetzt schlafen legen</button>
      </Row>
    </Group>
    <Group title="Tab-Gruppen" desc="Gruppen fassen zusammengehörige Tabs farbig zusammen. Rechtsklick auf einen Tab: zu Gruppe hinzufügen.">
      <Row title="Automatisch nach Website gruppieren" desc="Neue Tabs kommen in die Gruppe ihrer Website." keywords="Gruppen Domain Auto">
        <Switch label="Automatisch nach Website gruppieren" checked={s.autoGroupByDomain} onChange={v => b.updateSettings({ autoGroupByDomain: v })} />
      </Row>
      <Row title="Offene Tabs jetzt gruppieren" desc="Legt für jede Website eine Gruppe an." keywords="Domain Gruppen">
        <button className="btn" onClick={b.groupTabsByDomain}>Jetzt gruppieren</button>
      </Row>
    </Group>
    <Group title="Zoom je Website" desc="Strg + / Strg − / Strg 0 oder Strg + Mausrad. JTech merkt sich den Zoom pro Website.">
      {zoom.length === 0 && <p className="muted small s-empty">Keine Website mit eigenem Zoom.</p>}
      {zoom.map(([host, z]) => (
        <Row key={host} title={host} keywords="Zoom">
          <span className="muted">{Math.round(z * 100)} %</span>
          <button className="btn ghost sm" onClick={() => b.resetSiteZoom(host)}>Zurücksetzen</button>
        </Row>
      ))}
    </Group>
  </>;
}

function PrivacySec() {
  const b = useBrowser();
  const [opts, setOpts] = useState<PrivacyOptions | null>(null);
  useEffect(() => { call<PrivacyOptions>("privacy_get_options").then(o => o && setOpts(o)); }, []);
  const saveOpts = (o: PrivacyOptions) => { setOpts(o); call("privacy_set_options", { opts: o }, b.setStatus); };
  return <>
    <Group title="Gespeicherte Daten">
      <Row title="Verlauf" desc={`${b.history.length.toLocaleString("de-DE")} besuchte Seiten gespeichert.`}>
        <button className="btn" onClick={() => b.openPage("history")}>Anzeigen</button>
        <button className="btn danger" disabled={!b.history.length} onClick={() => confirm("Gesamten Verlauf löschen?") && b.clearHistory()}>Löschen</button>
      </Row>
      <Row title="Datenschutz-Übersicht" desc="Blockier-Statistik, Cookies je Website und Browserdaten gezielt löschen." keywords="Dashboard Statistik Cookies Cache">
        <button className="btn" onClick={() => b.openPage("privacy")}>Öffnen</button>
      </Row>
    </Group>
    {opts && (
      <Group title="Beim Beenden" desc="Wird beim nächsten Start ausgeführt, bevor die erste Seite lädt.">
        <Row title="Cookies löschen" desc="Du wirst dann auf Websites abgemeldet." keywords="Cookies Beenden">
          <Switch label="Cookies beim Beenden löschen" checked={opts.clearCookiesOnExit} onChange={v => saveOpts({ ...opts, clearCookiesOnExit: v })} />
        </Row>
        <Row title="Cache löschen" desc="Zwischengespeicherte Bilder und Dateien. Seiten laden danach etwas langsamer." keywords="Cache Beenden">
          <Switch label="Cache beim Beenden löschen" checked={opts.clearCacheOnExit} onChange={v => saveOpts({ ...opts, clearCacheOnExit: v })} />
        </Row>
      </Group>
    )}
  </>;
}

const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "nie");
const FILTER_STATE: Record<string, string> = { idle: "Wartet", loading: "Listen werden geladen …", building: "Wird vorbereitet …", ready: "Aktiv", error: "Fehler", empty: "Keine Liste aktiv" };
function AdblockSec() {
  const b = useBrowser();
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
    <Group title="Schutz">
      <Row title="Werbung und Tracker blockieren" desc="Wirkt sofort in allen Tabs." keywords="Werbeblocker Shield">
        <Switch label="Werbung und Tracker blockieren" checked={b.settings.adblock} onChange={v => b.updateSettings({ adblock: v })} />
      </Row>
      <Row title="Leere Werbeflächen ausblenden" desc="Entfernt Platzhalter, die nach dem Blockieren übrig bleiben." keywords="kosmetisch Elemente ausblenden">
        <Switch label="Leere Werbeflächen ausblenden" disabled={!fs} checked={fs?.cosmetic ?? true} onChange={v => fs && call("filter_set_options", { updateDays: fs.updateDays, cosmetic: v }, b.setStatus)} />
      </Row>
      <Row title="Ausnahmen" desc="Websites ohne Blockierung. Hinzufügen über das Schild in der Adressleiste." col keywords="Allowlist Ausnahmen">
        <div className="chips">
          {(fs?.allowlist ?? []).length === 0 && <span className="muted small">Keine Ausnahmen.</span>}
          {(fs?.allowlist ?? []).map(h => <span key={h} className="chip">{h}<button title={`${h} entfernen`} aria-label={`${h} entfernen`} onClick={() => unallow(h)}>×</button></span>)}
        </div>
      </Row>
    </Group>
    <Group title="Filterlisten" desc={fs ? <><span className={`status-pill ${fs.state}`}>{FILTER_STATE[fs.state] ?? fs.state}</span> {fs.activeRules.toLocaleString("de-DE")} Regeln aktiv</> : "Status wird geladen …"}
      actions={<button className="btn" disabled={busy || !fs} onClick={() => call("filter_update_now", undefined, b.setStatus)}>{busy ? "Läuft …" : "Jetzt aktualisieren"}</button>}>
      {(fs?.lists ?? []).map(l => (
        <Row key={l.id} title={l.name} desc={l.error ? `Aktualisierung fehlgeschlagen: ${l.error}` : l.lastUpdated ? `Stand ${fmtDate(l.lastUpdated)}` : "Noch nicht geladen"} keywords="EasyList EasyPrivacy uBlock Filterliste">
          <Switch label={l.name} checked={l.enabled} onChange={v => call("filter_set_list", { id: l.id, enabled: v }, b.setStatus)} />
        </Row>
      ))}
      <Row title="Automatisch aktualisieren" desc="Veraltete Listen werden im Hintergrund neu geladen." keywords="aktualisieren Intervall">
        <select value={fs?.updateDays ?? 4} disabled={!fs} aria-label="Aktualisierungsintervall" onChange={e => fs && call("filter_set_options", { updateDays: Number(e.target.value), cosmetic: fs.cosmetic }, b.setStatus)}>
          {[1, 2, 4, 7, 14, 30].map(d => <option key={d} value={d}>alle {d} {d === 1 ? "Tag" : "Tage"}</option>)}
        </select>
      </Row>
    </Group>
  </>;
}

function DownloadsSec() {
  const b = useBrowser();
  return <>
    <Group title="Speicherort">
      <Row title="Download-Ordner" desc="Dateien landen im Windows-Ordner „Downloads“." keywords="Ordner Speicherort" />
    </Group>
    <Group title="Zuletzt heruntergeladen" actions={<>
      <button className="btn ghost" disabled={!b.downloads.some(d => d.state !== "progressing")} onClick={b.clearDownloads}>Liste leeren</button>
      <button className="btn" onClick={() => b.openPage("downloads")}>Alle anzeigen</button></>}>
      <DownloadList compact limit={5} />
    </Group>
  </>;
}

function About() {
  const b = useBrowser(); const s = b.settings;
  const u = useUpdater();
  const busy = u.phase === "checking" || u.phase === "downloading" || u.phase === "installing";
  const pct = u.progress === undefined ? undefined : Math.round(u.progress * 100);
  const statusText =
    u.phase === "checking" ? "Suche nach Updates …" :
    u.phase === "uptodate" ? "JTech ist auf dem neuesten Stand." :
    u.phase === "available" ? `Version ${u.version} ist verfügbar.` :
    u.phase === "downloading" ? `Version ${u.version} wird heruntergeladen …` :
    u.phase === "ready" ? `Version ${u.version} ist bereit – wird beim Neustart installiert.` :
    u.phase === "installing" ? "Update wird installiert, JTech startet gleich neu …" :
    u.phase === "error" ? `Update-Suche fehlgeschlagen: ${u.error ?? "unbekannter Fehler"}` :
    "Noch nicht gesucht.";
  return <>
    <Group>
      <div className="about-head"><JTechLogo size={48} /><div><strong>JTech Browser</strong><small className="muted">Version {u.currentVersion || "…"} · privat, schnell und schlicht</small></div></div>
      <Row title="Updates" desc={<>
          <span className={u.phase === "error" ? "update-err" : undefined} role={u.phase === "error" ? "alert" : undefined}>{statusText}</span>
          {u.lastCheck ? <> Zuletzt geprüft um {new Date(u.lastCheck).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}.</> : null}
        </>} keywords="Update aktualisieren Version suchen">
        {(u.phase === "idle" || u.phase === "uptodate" || u.phase === "error" || u.phase === "checking") &&
          <button className="btn" disabled={busy} onClick={() => checkForUpdate(false)}>{u.phase === "checking" ? "Suche …" : "Nach Updates suchen"}</button>}
        {u.phase === "available" && <button className="btn primary" onClick={() => downloadUpdate()}>Herunterladen</button>}
        {(u.phase === "ready" || u.phase === "installing") &&
          <button className="btn primary" disabled={u.phase === "installing"} onClick={() => installAndRestart()}>Jetzt neu starten</button>}
      </Row>
      {u.phase === "downloading" && (
        <div className="update-dl">
          <progress className="update-progress" max={100} value={pct} aria-label="Download-Fortschritt" />
          <small className="muted">{fmtBytes(u.downloaded)}{u.total ? ` von ${fmtBytes(u.total)}` : ""}{pct !== undefined ? ` · ${pct} %` : ""}</small>
        </div>
      )}
      {u.version && u.phase !== "uptodate" && (
        <div className="update-notes">
          <strong>Neu in {u.version}{u.date ? ` · ${new Date(u.date).toLocaleDateString("de-DE")}` : ""}</strong>
          <pre>{u.notes?.trim() || "Keine Versionshinweise angegeben."}</pre>
        </div>
      )}
    </Group>
    <Group title="Automatische Updates" desc="JTech sucht im Hintergrund. Installiert wird erst, wenn du es bestätigst.">
      <Row title="Automatisch nach Updates suchen" desc="Kurz nach dem Start prüfen." keywords="Auto-Update automatisch">
        <Switch label="Automatisch nach Updates suchen" checked={s.autoUpdateCheck} onChange={v => b.updateSettings({ autoUpdateCheck: v })} />
      </Row>
      <Row title="Zusätzlich prüfen" desc="Während JTech geöffnet ist." keywords="Intervall Update">
        <select value={s.updateIntervalHours} disabled={!s.autoUpdateCheck} onChange={e => b.updateSettings({ updateIntervalHours: Number(e.target.value) })} aria-label="Update-Intervall">
          <option value={0}>Nur beim Start</option>
          <option value={6}>Alle 6 Stunden</option>
          <option value={12}>Alle 12 Stunden</option>
          <option value={24}>Täglich</option>
          <option value={72}>Alle 3 Tage</option>
        </select>
      </Row>
    </Group>
    <Disclosure summary="Technische Details">
      <dl className="tech-list">
        <dt>Version</dt><dd>{u.currentVersion || "…"}</dd>
        <dt>Grundlage</dt><dd>Tauri 2 · Microsoft WebView2 · Brave adblock-rust</dd>
        <dt>Datenspeicher</dt><dd>{storageBackend() === "rust" ? "SQLite im App-Datenordner (jtech.sqlite3)" : "Rückfall auf localStorage (Rust-Speicher nicht verfügbar)"}</dd>
        <dt>Effekte</dt><dd>Hintergrund, Cursor und Spur wirken auf die Oberfläche; auf Webseiten nur mit „Cursor und Spur auf Webseiten“.</dd>
      </dl>
    </Disclosure>
  </>;
}
