import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBrowser } from "../store/BrowserStore";
import { BUILTIN_BANGS, SEARCH_ENGINES, normalizeBangs, type SearchEngineId } from "../lib/urls";
import type { ThemeSetting } from "../store/types";
import { PermissionSettings } from "../components/PermissionSettings";
import { ShortcutEditor } from "../components/ShortcutEditor";
import { DownloadList } from "../components/DownloadList";
import { storageBackend } from "../store/storage";
import { call, type FilterStatus, type PrivacyOptions } from "../lib/ipc";
import { matches } from "../lib/suggest";
import { COMMANDS } from "../lib/commands";
import { checkForUpdate, downloadUpdate, fmtBytes, installAndRestart, useUpdater } from "../lib/updater";
import { BACKGROUNDS } from "../lib/fx/effects";
import { IconDownload, IconGlobe, IconHistory, IconMenu, IconSearch, IconSettings, IconShield, IconSidebar, IconStar, IconLock, JTechLogo } from "../components/Icons";

/**
 * Runde 5: aufgeraeumte Einstellungen – linke Unternavigation, Suchfeld, einheitliche Karten/Zeilen.
 * Ohne Suche wird nur der gewaehlte Abschnitt gezeigt; mit Suche alle passenden Abschnitte/Zeilen.
 */
interface Section { id: string; title: string; icon: ReactNode; keywords: string }
const SECTIONS: Section[] = [
  { id: "general", title: "Allgemein", icon: <IconSettings size={16} />, keywords: "Startseite neue Tabs Sitzung wiederherstellen Start Adresse" },
  { id: "appearance", title: "Darstellung", icon: <IconStar size={16} />, keywords: "Design hell dunkel System Farben Design-Studio Seitenleiste Lesezeichenleiste Animation Hintergrund Cursor Effekte" },
  { id: "search", title: "Suche", icon: <IconSearch size={16} />, keywords: "Suchmaschine Bangs DuckDuckGo Google Bing Startpage Brave Kürzel" },
  { id: "tabs", title: "Tabs", icon: <IconSidebar size={16} />, keywords: "Tab-Schlaf schlafen inaktiv Speicher Zoom Website Gruppen" },
  { id: "privacy", title: "Datenschutz & Sicherheit", icon: <IconLock size={16} />, keywords: "Verlauf Cookies Cache löschen Beenden Browserdaten Dashboard Statistik" },
  { id: "adblock", title: "Werbeblocker & Filterlisten", icon: <IconShield size={16} />, keywords: "Werbeblocker Tracker Filterlisten EasyList EasyPrivacy uBlock kosmetisch Elemente ausblenden Ausnahmen aktualisieren" },
  { id: "permissions", title: "Berechtigungen", icon: <IconGlobe size={16} />, keywords: "Website-Berechtigungen Kamera Mikrofon Standort Benachrichtigungen" },
  { id: "downloads", title: "Downloads", icon: <IconDownload size={16} />, keywords: "Downloads Speicherort Ordner Liste leeren" },
  { id: "shortcuts", title: "Tastenkürzel", icon: <IconMenu size={16} />, keywords: "Tastenkürzel Shortcuts Tasten Kürzel Tastatur " + COMMANDS.map(c => c.title).join(" ") },
  { id: "about", title: "Über JTech", icon: <IconHistory size={16} />, keywords: "Version Info Speicher SQLite Tauri WebView2 Update Updates aktualisieren automatisch Neustart" },
];

const SearchCtx = createContext<{ q: string; all: boolean }>({ q: "", all: true });

/** Einheitliche Einstellungszeile; blendet sich bei aktiver Suche aus, wenn sie nicht passt. */
function Row({ title, desc, keywords = "", col, children }: { title: string; desc?: ReactNode; keywords?: string; col?: boolean; children?: ReactNode }) {
  const { q, all } = useContext(SearchCtx);
  if (q && !all && !matches(q, title, typeof desc === "string" ? desc : "", keywords)) return null;
  return (
    <div className={`setting${col ? " col" : ""}`}>
      <div className="setting-text"><strong>{title}</strong>{desc && <small>{desc}</small>}</div>
      {children && <div className="setting-ctl">{children}</div>}
    </div>
  );
}
const Switch = ({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) =>
  <input type="checkbox" className="switch" aria-label={label} checked={checked} onChange={e => onChange(e.target.checked)} />;

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
  return (
    <div className="card">
      <Row title="Startseite und neue Tabs" desc="Was beim Klick auf „Startseite“ und in neuen Tabs erscheint" col keywords="Adresse eigene">
        <label className="radio"><input type="radio" checked={!custom} onChange={() => b.updateSettings({ startPage: "jtech://newtab" })} /> JTech-Startseite</label>
        <label className="radio"><input type="radio" checked={custom} onChange={() => ok && b.updateSettings({ startPage: startUrl.trim() })} /> Eigene Adresse</label>
        <div className="inline-form">
          <input value={startUrl} onChange={e => setStartUrl(e.target.value)} placeholder="https://…" spellCheck={false} />
          <button className="btn" disabled={!ok} onClick={() => b.updateSettings({ startPage: startUrl.trim() })}>Übernehmen</button>
        </div>
      </Row>
      <Row title="Sitzung wiederherstellen" desc="Beim Start die Tabs der letzten Sitzung öffnen – auch interne Seiten wie Einstellungen">
        <Switch label="Sitzung wiederherstellen" checked={s.restoreSession} onChange={v => b.updateSettings({ restoreSession: v })} />
      </Row>
    </div>
  );
}

function Appearance() {
  const b = useBrowser(); const s = b.settings; const e = s.effects;
  return (
    <div className="card">
      <Row title="Farbschema" desc="Hell, dunkel oder wie Windows (ein eigenes Theme aus dem Design-Studio hat Vorrang)" keywords="Design hell dunkel System">
        <div className="segmented">
          {(["dark", "light", "system"] as ThemeSetting[]).map(t => (
            <button key={t} className={s.theme === t ? "on" : ""} onClick={() => b.updateSettings({ theme: t })}>{t === "dark" ? "Dunkel" : t === "light" ? "Hell" : "System"}</button>
          ))}
        </div>
      </Row>
      <Row title="Design-Studio" desc={b.customTheme ? `Aktives Theme: ${b.customTheme.name}` : "Standard-Farben"} keywords="Theme Farben Cursor Hintergrund">
        <button className="btn" onClick={() => b.openPage("themes")}>Öffnen</button>
      </Row>
      <Row title="Animierter Hintergrund" desc={e.bgEnabled ? `${BACKGROUNDS.find(x => x.id === e.background)?.name ?? ""} – Details im Design-Studio` : "Aus"} keywords="Animation Effekte">
        <Switch label="Animierter Hintergrund" checked={e.bgEnabled} onChange={v => b.updateEffects({ bgEnabled: v })} />
      </Row>
      <Row title="Seitenleiste ausgeklappt" desc="Tabs mit Titel statt nur Symbol">
        <Switch label="Seitenleiste ausgeklappt" checked={s.sidebarExpanded} onChange={v => b.updateSettings({ sidebarExpanded: v })} />
      </Row>
      <Row title="Lesezeichenleiste anzeigen">
        <Switch label="Lesezeichenleiste anzeigen" checked={s.showBookmarksBar} onChange={v => b.updateSettings({ showBookmarksBar: v })} />
      </Row>
    </div>
  );
}

function SearchSec() {
  const b = useBrowser(); const s = b.settings;
  const [bangTrigger, setBangTrigger] = useState("");
  const [bangUrl, setBangUrl] = useState("https://");
  const newBang = normalizeBangs([{ trigger: bangTrigger, urlTemplate: bangUrl }])[0];
  return (
    <div className="card">
      <Row title="Suchmaschine" desc="Für Eingaben in der Adressleiste">
        <select value={s.searchEngine} onChange={e => b.updateSettings({ searchEngine: e.target.value as SearchEngineId })}>
          {Object.entries(SEARCH_ENGINES).map(([id, x]) => <option key={id} value={id}>{x.name}</option>)}
        </select>
      </Row>
      <Row title="JTech Bangs" desc={`In der Adressleiste z. B. „!yt lofi“. Eingebaut: ${BUILTIN_BANGS.map(x => "!" + x.trigger).join(", ")}. Platzhalter %s = Suchbegriff.`} col keywords="Kürzel eigene">
        {s.bangs.map(x => (
          <div key={x.trigger} className="row"><span><strong>!{x.trigger}</strong> <span className="mono muted">{x.urlTemplate}</span></span>
            <button className="btn ghost sm" onClick={() => b.updateSettings({ bangs: s.bangs.filter(y => y.trigger !== x.trigger) })}>Entfernen</button></div>
        ))}
        <div className="inline-form">
          <input value={bangTrigger} onChange={e => setBangTrigger(e.target.value)} placeholder="Kürzel, z. B. wiki" spellCheck={false} />
          <input value={bangUrl} onChange={e => setBangUrl(e.target.value)} placeholder="https://de.wikipedia.org/w/index.php?search=%s" spellCheck={false} />
          <button className="btn" disabled={!newBang} onClick={() => { if (newBang) { b.updateSettings({ bangs: [...s.bangs.filter(y => y.trigger !== newBang.trigger), newBang] }); setBangTrigger(""); setBangUrl("https://"); } }}>Hinzufügen</button>
        </div>
      </Row>
    </div>
  );
}

function TabsSec() {
  const b = useBrowser(); const s = b.settings;
  const zoom = Object.entries(b.zoomBySite).sort(([a], [c]) => a.localeCompare(c));
  return (
    <div className="card">
      <Row title="Inaktive Tabs schlafen legen" desc="Gibt Speicher frei. Angeheftete, interne und Audio abspielende Tabs schlafen nie." keywords="Tab-Schlaf">
        <select value={s.tabSleepMinutes} onChange={e => b.updateSettings({ tabSleepMinutes: Number(e.target.value) })}>
          {[0, 5, 10, 15, 30, 60, 120, 240].map(m => <option key={m} value={m}>{m === 0 ? "Nie" : `nach ${m} Minuten`}</option>)}
        </select>
      </Row>
      <Row title="Jetzt schlafen legen" desc="Alle inaktiven Tabs sofort schlafen legen">
        <button className="btn" onClick={b.sleepInactiveTabs}>Ausführen</button>
      </Row>
      <Row title="Zoom pro Website" desc="Strg + / Strg − / Strg 0 oder Strg + Mausrad; wird je Host gespeichert." col>
        {zoom.length === 0 && <span className="muted small">Keine Websites mit eigenem Zoom.</span>}
        {zoom.map(([host, z]) => (
          <div key={host} className="row"><span className="mono">{host}</span><span>{Math.round(z * 100)} %</span>
            <button className="btn ghost sm" onClick={() => b.resetSiteZoom(host)}>Zurücksetzen</button></div>
        ))}
      </Row>
      <Row title="Interne Seiten" desc="Einstellungen, Verlauf, Lesezeichen, Downloads usw. öffnen immer als eigener Tab; ist die Seite schon offen, wird ihr Tab angezeigt." keywords="Tab neuer" />
    </div>
  );
}

function PrivacySec() {
  const b = useBrowser();
  const [opts, setOpts] = useState<PrivacyOptions | null>(null);
  useEffect(() => { call<PrivacyOptions>("privacy_get_options").then(o => o && setOpts(o)); }, []);
  const saveOpts = (o: PrivacyOptions) => { setOpts(o); call("privacy_set_options", { opts: o }, b.setStatus); };
  return (
    <div className="card">
      <Row title="Datenschutz-Übersicht" desc="Statistik, Cookies je Seite, Browserdaten löschen" keywords="Dashboard Statistik">
        <button className="btn" onClick={() => b.openPage("privacy")}>Öffnen</button>
      </Row>
      <Row title="Verlauf" desc={`${b.history.length.toLocaleString("de-DE")} Einträge gespeichert`}>
        <button className="btn danger" onClick={() => confirm("Gesamten Verlauf löschen?") && b.clearHistory()}>Verlauf löschen</button>
      </Row>
      {opts && <>
        <Row title="Cookies beim Beenden löschen" desc="Wird beim nächsten Start vor dem ersten Laden ausgeführt">
          <Switch label="Cookies beim Beenden löschen" checked={opts.clearCookiesOnExit} onChange={v => saveOpts({ ...opts, clearCookiesOnExit: v })} />
        </Row>
        <Row title="Cache beim Beenden löschen">
          <Switch label="Cache beim Beenden löschen" checked={opts.clearCacheOnExit} onChange={v => saveOpts({ ...opts, clearCacheOnExit: v })} />
        </Row>
      </>}
      <Row title="Effekte auf Webseiten" desc={b.settings.effects.inPages ? "An – Cursor/Spur werden in Webseiten eingefügt (Design-Studio)" : "Aus – Webseiten bleiben unverändert"} keywords="Cursor Script Injektion" />
    </div>
  );
}

const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "nie");
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
  return (
    <div className="card">
      <Row title="Werbe- und Trackerblocker" desc="Wirkt sofort auf alle Tabs">
        <Switch label="Werbeblocker" checked={b.settings.adblock} onChange={v => b.updateSettings({ adblock: v })} />
      </Row>
      <Row title="Filterlisten" desc={fs ? `${fs.message || fs.state} · ≈ ${fs.activeRules.toLocaleString("de-DE")} Regeln${fs.engineBuiltAt ? ` · Engine ${fmtDate(fs.engineBuiltAt)}` : ""}` : "…"} col keywords="EasyList EasyPrivacy uBlock aktualisieren">
        {(fs?.lists ?? []).map(l => (
          <label key={l.id} className="row filter-mini">
            <span><strong>{l.name}</strong> <small className="muted">{l.lastUpdated ? `Stand ${fmtDate(l.lastUpdated)}` : "noch nicht geladen"}{l.error ? ` · Fehler: ${l.error}` : ""}</small></span>
            <input type="checkbox" className="switch" checked={l.enabled} onChange={e => call("filter_set_list", { id: l.id, enabled: e.target.checked }, b.setStatus)} />
          </label>
        ))}
        <div className="row-end">
          <button className="btn" disabled={busy} onClick={() => call("filter_update_now", undefined, b.setStatus)}>{busy ? "Läuft …" : "Jetzt aktualisieren"}</button>
        </div>
      </Row>
      <Row title="Automatisch aktualisieren" desc="Ältere Listen werden im Hintergrund neu geladen">
        <select value={fs?.updateDays ?? 4} disabled={!fs} onChange={e => fs && call("filter_set_options", { updateDays: Number(e.target.value), cosmetic: fs.cosmetic }, b.setStatus)}>
          {[1, 2, 4, 7, 14, 30].map(d => <option key={d} value={d}>alle {d} {d === 1 ? "Tag" : "Tage"}</option>)}
        </select>
      </Row>
      <Row title="Elemente ausblenden (kosmetische Filter)" desc="Leere Werbeplätze per Stylesheet ausblenden" keywords="kosmetisch">
        <Switch label="Kosmetische Filter" checked={fs?.cosmetic ?? true} onChange={v => fs && call("filter_set_options", { updateDays: fs.updateDays, cosmetic: v }, b.setStatus)} />
      </Row>
      <Row title="Ausnahmen (Schutz aus)" desc="Seiten ohne Blockierung – hinzufügen über das Schild in der Adressleiste" col keywords="Allowlist">
        <div className="chips">
          {(fs?.allowlist ?? []).length === 0 && <span className="muted small">Keine</span>}
          {(fs?.allowlist ?? []).map(h => <span key={h} className="chip">{h}<button title="Entfernen" onClick={() => unallow(h)}>×</button></span>)}
        </div>
      </Row>
    </div>
  );
}

function DownloadsSec() {
  const b = useBrowser();
  return (
    <div className="card">
      <Row title="Speicherort" desc="Windows-Download-Ordner (von WebView2 vorgegeben)" keywords="Ordner" />
      <Row title="Letzte Downloads" col>
        <DownloadList compact limit={5} />
        <div className="row-end">
          <button className="btn ghost" disabled={!b.downloads.some(d => d.state !== "progressing")} onClick={b.clearDownloads}>Liste leeren</button>
          <button className="btn" onClick={() => b.openPage("downloads")}>Alle Downloads</button>
        </div>
      </Row>
    </div>
  );
}

function About() {
  const b = useBrowser(); const s = b.settings;
  const u = useUpdater();
  const busy = u.phase === "checking" || u.phase === "downloading" || u.phase === "installing";
  const pct = u.progress === undefined ? undefined : Math.round(u.progress * 100);
  const statusText =
    u.phase === "checking" ? "Suche nach Updates…" :
    u.phase === "uptodate" ? "JTech ist auf dem neuesten Stand." :
    u.phase === "available" ? `Version ${u.version} ist verfügbar.` :
    u.phase === "downloading" ? `Version ${u.version} wird heruntergeladen…` :
    u.phase === "ready" ? `Version ${u.version} ist heruntergeladen und bereit.` :
    u.phase === "installing" ? "Update wird installiert – JTech startet gleich neu…" :
    u.phase === "error" ? (u.error ?? "Fehler") :
    "Noch nicht gesucht.";
  return (
    <div className="card about-card">
      <div className="about-head"><JTechLogo size={44} /><div><strong>JTech Browser {u.currentVersion || "…"}</strong><small className="muted">Tauri 2 · WebView2 · adblock-rust</small></div></div>
      <Row title="Updates" desc={<>
          <span className={u.phase === "error" ? "update-err" : undefined} role={u.phase === "error" ? "alert" : undefined}>{statusText}</span>
          {u.lastCheck ? <> · zuletzt geprüft {new Date(u.lastCheck).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</> : null}
        </>} keywords="Update aktualisieren Version suchen">
        {(u.phase === "idle" || u.phase === "uptodate" || u.phase === "error" || u.phase === "checking") &&
          <button className="btn" disabled={busy} onClick={() => checkForUpdate(false)}>{u.phase === "checking" ? "Suche…" : "Nach Updates suchen"}</button>}
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
      <Row title="Automatisch nach Updates suchen" desc="Beim Start (nach ein paar Sekunden) im Hintergrund prüfen. Installiert wird nur nach Klick." keywords="Auto-Update automatisch">
        <Switch label="Automatisch nach Updates suchen" checked={s.autoUpdateCheck} onChange={v => b.updateSettings({ autoUpdateCheck: v })} />
      </Row>
      <Row title="Zusätzlich prüfen" desc="Während JTech läuft" keywords="Intervall Update">
        <select value={s.updateIntervalHours} disabled={!s.autoUpdateCheck} onChange={e => b.updateSettings({ updateIntervalHours: Number(e.target.value) })} aria-label="Update-Intervall">
          <option value={0}>Nur beim Start</option>
          <option value={6}>Alle 6 Stunden</option>
          <option value={12}>Alle 12 Stunden</option>
          <option value={24}>Täglich</option>
          <option value={72}>Alle 3 Tage</option>
        </select>
      </Row>
      <Row title="Datenspeicher" desc={storageBackend() === "rust" ? "SQLite im App-Datenordner (jtech.sqlite3)" : "Rust-Speicher nicht verfügbar – Rückfall auf localStorage"} keywords="SQLite" />
      <Row title="Effekte" desc="Animierter Hintergrund, Cursor und Spur wirken auf die Browser-Oberfläche. Webseiten nur, wenn im Design-Studio „Auch auf Webseiten“ aktiv ist." />
    </div>
  );
}
