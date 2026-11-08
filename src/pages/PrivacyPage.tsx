import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBrowser } from "../store/BrowserStore";
import { Favicon } from "../components/Favicon";
import { IconShield } from "../components/Icons";
import { Disclosure, Group, Row, Switch } from "../components/SettingsUI";
import { call, siteOf, type CookieInfo, type Count, type FilterStatus, type PrivacyOptions, type PrivacyStats } from "../lib/ipc";

const fmt = (n: number) => n.toLocaleString("de-DE");
const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "nie");
const STATE_LABEL: Record<string, string> = { idle: "Wartet", loading: "Listen werden geladen …", building: "Wird vorbereitet …", ready: "Aktiv", error: "Fehler", empty: "Keine Liste aktiv" };

function Bars({ items, empty }: { items: Count[]; empty: string }) {
  const max = Math.max(1, ...items.map(i => i.count));
  if (!items.length) return <div className="empty">{empty}</div>;
  return <>{items.map(i => (
    <div key={i.name} className="list-row">
      <span className="row-title mono">{i.name}</span>
      <span className="bar"><span style={{ width: `${(i.count / max) * 100}%` }} /></span>
      <span className="num">{fmt(i.count)}</span>
    </div>
  ))}</>;
}

export function PrivacyPage() {
  const b = useBrowser();
  const [stats, setStats] = useState<PrivacyStats | null>(null);
  const [fs, setFs] = useState<FilterStatus | null>(null);
  const [opts, setOpts] = useState<PrivacyOptions | null>(null);
  const [cookieSites, setCookieSites] = useState<Count[] | null>(null);
  const [siteCookies, setSiteCookies] = useState<CookieInfo[] | null>(null);
  const [kinds, setKinds] = useState<Record<string, boolean>>({ cache: true, cookies: false, history: false, storage: false, downloads: false });
  const [jtechHistory, setJtechHistory] = useState(false);
  const [busy, setBusy] = useState("");

  const webTabs = b.tabs.filter(t => !t.internal || t.blocked > 0);
  const maxTab = Math.max(1, ...webTabs.map(t => t.blocked));
  const currentSite = siteOf(b.activeTab?.url);
  const allowlisted = !!currentSite && !!fs?.allowlist.some(h => currentSite === h || currentSite.endsWith("." + h));

  const refreshStats = useCallback(() => { call<PrivacyStats>("privacy_stats", { limit: 15 }).then(s => s && setStats(s)); }, []);
  const refreshCookies = useCallback(async () => {
    const all = await call<CookieInfo[]>("list_cookies", { url: null }, b.setStatus);
    if (!all) { setCookieSites(null); return; }
    const map = new Map<string, number>();
    for (const c of all) { const d = c.domain.replace(/^\./, "").toLowerCase(); map.set(d, (map.get(d) ?? 0) + 1); }
    setCookieSites([...map.entries()].map(([name, count]) => ({ name, count })).sort((a, z) => z.count - a.count));
    if (b.activeTab?.url && currentSite) setSiteCookies((await call<CookieInfo[]>("list_cookies", { url: b.activeTab.url })) ?? null);
  }, [b.setStatus, b.activeTab?.url, currentSite]);

  useEffect(() => {
    refreshStats();
    call<FilterStatus>("filter_status").then(s => s && setFs(s));
    call<PrivacyOptions>("privacy_get_options").then(o => o && setOpts(o));
    const t = setInterval(refreshStats, 5000);
    const un = listen<FilterStatus>("filter-status", ({ payload }) => setFs(payload));
    return () => { clearInterval(t); un.then(f => f()); };
  }, [refreshStats]);

  const setAllow = async (host: string, allowed: boolean) => {
    const list = await call<string[]>("allowlist_set", { host, allowed }, b.setStatus);
    if (list) { setFs(f => (f ? { ...f, allowlist: list } : f)); b.setStatus(allowed ? `Schutz für ${host} aus – Seite neu laden, damit es wirkt` : `Schutz für ${host} wieder an`); }
  };
  const deleteCookies = async (site: string | null) => {
    setBusy("cookies");
    const n = await call<number>("delete_cookies", { site }, b.setStatus);
    setBusy("");
    if (n !== undefined) { b.setStatus(site ? `${n} Cookies von ${site} gelöscht` : "Alle Cookies gelöscht"); refreshCookies(); }
  };
  const clearData = async () => {
    const sel = Object.entries(kinds).filter(([, v]) => v).map(([k]) => k);
    setBusy("clear");
    if (sel.length) {
      const r = await call("clear_browsing_data", { kinds: sel }, b.setStatus);
      if (r !== undefined) b.setStatus("Browserdaten gelöscht");
    }
    if (jtechHistory) b.clearHistory();
    setBusy("");
  };
  const saveOpts = (o: PrivacyOptions) => { setOpts(o); call("privacy_set_options", { opts: o }, b.setStatus); };
  const lists = useMemo(() => fs?.lists ?? [], [fs]);

  const KINDS = [
    ["cache", "Bilder und Dateien im Cache", "Seiten laden danach einmal etwas langsamer"],
    ["cookies", "Cookies", "Meldet dich auf Websites ab"],
    ["storage", "Website-Daten", "Lokal gespeicherte Daten von Websites, z. B. Einstellungen von Web-Apps"],
    ["history", "Interner Seitenverlauf", "Vor- und Zurück-Daten der Webseiten-Engine"],
    ["downloads", "Interne Downloadliste", "Liste der Webseiten-Engine; Dateien bleiben erhalten"],
  ] as const;
  return (
    <div className="page doc-page">
      <header className="page-head"><h1>Datenschutz</h1><p className="muted">Was JTech Shield blockiert, welche Daten gespeichert sind und wie du sie löschst.</p></header>

      <section className="card hero-card">
        <span className={`hero-shield${b.settings.adblock ? "" : " off"}`}><IconShield size={30} /></span>
        <div className="hero-num"><span>{fmt(stats?.lifetimeTotal ?? 0)}</span><small>Werbe- und Trackeranfragen blockiert · {fmt(b.totalBlocked)} seit dem Start</small></div>
        <label className="switch-row">
          <span>{b.settings.adblock ? "Schutz an" : "Schutz aus"}</span>
          <input type="checkbox" role="switch" aria-label="JTech Shield" className="switch" checked={b.settings.adblock} onChange={e => b.updateSettings({ adblock: e.target.checked })} />
        </label>
      </section>

      {currentSite && (
        <Group title={`Diese Website: ${currentSite}`} desc="Gilt für die Seite im aktiven Tab, inklusive Subdomains.">
          <Row title="Schutz auf dieser Website" desc={allowlisted ? "Aus – hier wird nichts blockiert. Neu laden, damit es wirkt." : "An – Werbung und Tracker werden blockiert."}>
            <Switch label={`Schutz auf ${currentSite}`} checked={!allowlisted} onChange={v => setAllow(currentSite, !v)} />
          </Row>
          <Row title="Cookies dieser Website" desc={siteCookies ? `${siteCookies.length} Cookies gespeichert` : "Zum Anzeigen auf „Anzeigen“ klicken"}>
            <button className="btn" onClick={refreshCookies}>Anzeigen</button>
            <button className="btn danger" disabled={busy === "cookies"} onClick={() => deleteCookies(currentSite)}>Löschen</button>
          </Row>
          {siteCookies && siteCookies.length > 0 && (
            <div className="sub-list">
              {siteCookies.slice(0, 100).map((c, i) => (
                <div key={c.domain + c.path + c.name + i} className="list-row">
                  <span className="row-title mono">{c.name}</span>
                  <span className="muted small">{c.domain}{c.path} · {c.session ? "bis zum Schließen" : `bis ${fmtDate(c.expires * 1000)}`}</span>
                </div>
              ))}
            </div>
          )}
        </Group>
      )}

      <Group title="Browserdaten löschen" desc="Wähle aus, was gelöscht werden soll.">
        <div className="check-grid">
          {KINDS.map(([k, label, hint]) => (
            <label key={k} className="check-card"><input type="checkbox" checked={!!kinds[k]} onChange={e => setKinds(s => ({ ...s, [k]: e.target.checked }))} />
              <span><strong>{label}</strong><small>{hint}</small></span></label>
          ))}
          <label className="check-card"><input type="checkbox" checked={jtechHistory} onChange={e => setJtechHistory(e.target.checked)} />
            <span><strong>Verlauf</strong><small>Alle besuchten Seiten in jtech://history</small></span></label>
        </div>
        <div className="row-end">
          <button className="btn danger" disabled={busy === "clear" || (!jtechHistory && !Object.values(kinds).some(Boolean))} onClick={clearData}>{busy === "clear" ? "Wird gelöscht …" : "Auswahl löschen"}</button>
        </div>
        {opts && <>
          <Row title="Cookies beim Beenden löschen" desc="Wird beim nächsten Start ausgeführt, bevor die erste Seite lädt.">
            <Switch label="Cookies beim Beenden löschen" checked={opts.clearCookiesOnExit} onChange={v => saveOpts({ ...opts, clearCookiesOnExit: v })} />
          </Row>
          <Row title="Cache beim Beenden löschen">
            <Switch label="Cache beim Beenden löschen" checked={opts.clearCacheOnExit} onChange={v => saveOpts({ ...opts, clearCacheOnExit: v })} />
          </Row>
        </>}
      </Group>

      <Group title="Cookies aller Websites" desc={cookieSites ? `${fmt(cookieSites.reduce((a, c) => a + c.count, 0))} Cookies von ${cookieSites.length} Websites` : "Zum Laden muss mindestens ein Webseiten-Tab offen sein."}
        actions={<><button className="btn" onClick={refreshCookies}>Laden</button>
          <button className="btn danger" disabled={busy === "cookies"} onClick={() => confirm("Alle Cookies löschen? Du wirst auf allen Websites abgemeldet.") && deleteCookies(null)}>Alle löschen</button></>}>
        {cookieSites && cookieSites.length > 0 && (
          <div className="sub-list">
            {cookieSites.slice(0, 200).map(c => (
              <div key={c.name} className="list-row">
                <Favicon url={`https://${c.name}`} />
                <span className="row-title">{c.name}</span>
                <span className="num">{c.count}</span>
                <button className="btn ghost sm" onClick={() => deleteCookies(c.name)}>Löschen</button>
              </div>
            ))}
          </div>
        )}
      </Group>

      <div className="section-head">
        <h2>Statistik</h2>
        <button className="btn ghost sm" onClick={() => confirm("Statistik zurücksetzen?") && call("privacy_reset_stats", undefined, b.setStatus).then(refreshStats)}>Zurücksetzen</button>
      </div>
      <div className="grid-2">
        <section className="card list-card">
          <h2>Offene Tabs</h2>
          {webTabs.length === 0 && <div className="empty">Keine offenen Webseiten.</div>}
          {webTabs.map(t => (
            <div key={t.id} className="list-row" onClick={() => b.switchTab(t.id)}>
              <Favicon url={t.url} internal={!!t.internal} />
              <span className="row-title">{t.title}</span>
              <span className="bar"><span style={{ width: `${(t.blocked / maxTab) * 100}%` }} /></span>
              <span className="num">{t.blocked}</span>
            </div>
          ))}
        </section>
        <section className="card list-card">
          <h2>Websites mit den meisten Blockierungen</h2>
          <Bars items={stats?.topSites ?? []} empty="Noch nichts blockiert." />
        </section>
        <section className="card list-card">
          <h2>Häufigste Tracker</h2>
          <Bars items={stats?.topDomains ?? []} empty="Noch nichts blockiert." />
        </section>
        <section className="card list-card">
          <h2>Tracker seit dem Start</h2>
          <Bars items={stats?.sessionTopDomains ?? []} empty="In dieser Sitzung noch nichts." />
        </section>
      </div>

      <Group title="Filterlisten" desc={fs ? <><span className={`status-pill ${fs.state}`}>{STATE_LABEL[fs.state] ?? fs.state}</span> {fmt(fs.activeRules)} Regeln aktiv</> : "Status wird geladen …"}
        actions={<button className="btn" disabled={fs?.state === "loading" || fs?.state === "building"} onClick={() => call("filter_update_now", undefined, b.setStatus)}>Jetzt aktualisieren</button>}>
        {lists.map(l => (
          <Row key={l.id} title={l.name} desc={l.error ? `Aktualisierung fehlgeschlagen (${fmtDate(l.lastAttempt)}): ${l.error}` : `${l.note ? l.note + " · " : ""}${l.lastUpdated ? `Stand ${fmtDate(l.lastUpdated)}` : "Noch nicht geladen"}`}>
            <Switch label={l.name} checked={l.enabled} onChange={v => call("filter_set_list", { id: l.id, enabled: v }, b.setStatus)} />
          </Row>
        ))}
        <Row title="Automatisch aktualisieren" desc="Veraltete Listen werden im Hintergrund neu geladen.">
          <select value={fs?.updateDays ?? 4} aria-label="Aktualisierungsintervall" onChange={e => fs && call("filter_set_options", { updateDays: Number(e.target.value), cosmetic: fs.cosmetic }, b.setStatus)}>
            {[1, 2, 4, 7, 14, 30].map(d => <option key={d} value={d}>alle {d} {d === 1 ? "Tag" : "Tage"}</option>)}
          </select>
        </Row>
        <Row title="Leere Werbeflächen ausblenden" desc="Entfernt Platzhalter, die nach dem Blockieren übrig bleiben.">
          <Switch label="Leere Werbeflächen ausblenden" checked={fs?.cosmetic ?? true} onChange={v => fs && call("filter_set_options", { updateDays: fs.updateDays, cosmetic: v }, b.setStatus)} />
        </Row>
        <Row title="Ausnahmen" desc="Websites ohne Blockierung." col>
          <div className="chips">
            {(fs?.allowlist ?? []).length === 0 && <span className="muted small">Keine Ausnahmen.</span>}
            {(fs?.allowlist ?? []).map(h => <span key={h} className="chip">{h}<button title={`${h} entfernen`} aria-label={`${h} entfernen`} onClick={() => setAllow(h, false)}>×</button></span>)}
          </div>
        </Row>
      </Group>

      <Disclosure summary="Technische Details">
        <p className="muted small">Grundlage ist Brave adblock-rust. {fs ? `Engine erstellt ${fs.engineBuiltAt ? fmtDate(fs.engineBuiltAt) : "—"}${fs.fromCache ? " (aus Cache)" : ""}${fs.message ? ` · ${fs.message}` : ""}. ` : ""}
          {lists.map(l => `${l.name}: ≈ ${fmt(l.rules)} Regeln, ${Math.round(l.bytes / 1024)} KB`).join(" · ")}</p>
        <p className="muted small">Blockiert werden Netzwerkanfragen, die WebView2 meldet. Service-Worker-Anfragen, WebSockets nach dem Verbindungsaufbau und manche iframes werden nur eingeschränkt erfasst; Scriptlets (+js) werden nicht ausgeführt.</p>
      </Disclosure>
    </div>
  );
}
