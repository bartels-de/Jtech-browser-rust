import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBrowser } from "../store/BrowserStore";
import { Favicon } from "../components/Favicon";
import { IconShield } from "../components/Icons";
import { call, siteOf, type CookieInfo, type Count, type FilterStatus, type PrivacyOptions, type PrivacyStats } from "../lib/ipc";

const fmt = (n: number) => n.toLocaleString("de-DE");
const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "nie");
const STATE_LABEL: Record<string, string> = { idle: "Wartet", loading: "Lädt Listen …", building: "Baut Engine …", ready: "Aktiv", error: "Fehler", empty: "Keine Liste aktiv" };

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

  return (
    <div className="page doc-page">
      <header className="page-head"><h1>Datenschutz</h1><p className="muted">JTech Shield blockiert Werbung und Tracker mit wählbaren Filterlisten (Brave adblock-rust).</p></header>

      <section className="card hero-card">
        <span className={`hero-shield${b.settings.adblock ? "" : " off"}`}><IconShield size={30} /></span>
        <div className="hero-num"><span>{fmt(stats?.lifetimeTotal ?? 0)}</span><small>Anfragen blockiert insgesamt · {fmt(b.totalBlocked)} seit dem Start</small></div>
        <label className="switch-row">
          <span>{b.settings.adblock ? "Aktiv" : "Aus"}</span>
          <input type="checkbox" className="switch" checked={b.settings.adblock} onChange={e => b.updateSettings({ adblock: e.target.checked })} />
        </label>
      </section>

      {currentSite && (
        <section className="card">
          <h2>Diese Seite</h2>
          <label className="setting">
            <div><strong>Schutz auf {currentSite}</strong><small>Aus = keine Blockierung und kein Element-Hiding auf dieser Seite (inkl. Subdomains)</small></div>
            <input type="checkbox" className="switch" checked={!allowlisted} onChange={e => setAllow(currentSite, !e.target.checked)} />
          </label>
          <div className="setting">
            <div><strong>Cookies dieser Seite</strong><small>{siteCookies ? `${siteCookies.length} Cookies für die aktuelle Adresse` : "Noch nicht geladen"}</small></div>
            <div className="inline-form">
              <button className="btn" onClick={refreshCookies}>Anzeigen</button>
              <button className="btn danger" disabled={busy === "cookies"} onClick={() => deleteCookies(currentSite)}>Löschen</button>
            </div>
          </div>
          {siteCookies && siteCookies.length > 0 && siteCookies.slice(0, 100).map((c, i) => (
            <div key={c.domain + c.path + c.name + i} className="list-row">
              <span className="row-title mono">{c.name}</span>
              <span className="muted small">{c.domain}{c.path} · {c.session ? "Sitzung" : `bis ${fmtDate(c.expires * 1000)}`}{c.httpOnly ? " · HttpOnly" : ""}{c.secure ? " · Secure" : ""}</span>
            </div>
          ))}
        </section>
      )}

      <div className="grid-2">
        <section className="card list-card">
          <h2>Pro Tab (Sitzung)</h2>
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
          <h2>Seiten (gesamt)</h2>
          <Bars items={stats?.topSites ?? []} empty="Noch nichts blockiert." />
        </section>
        <section className="card list-card">
          <h2>Blockierte Domains (gesamt)</h2>
          <Bars items={stats?.topDomains ?? []} empty="Noch nichts blockiert." />
        </section>
        <section className="card list-card">
          <h2>Blockierte Domains (Sitzung)</h2>
          <Bars items={stats?.sessionTopDomains ?? []} empty="In dieser Sitzung noch nichts." />
        </section>
      </div>
      <p><button className="btn ghost" onClick={() => call("privacy_reset_stats", undefined, b.setStatus).then(refreshStats)}>Statistik zurücksetzen</button></p>

      <section className="card">
        <h2>Filterlisten</h2>
        <div className="setting">
          <div>
            <strong>Status: <span className={`status-pill ${fs?.state ?? ""}`}>{STATE_LABEL[fs?.state ?? "idle"] ?? fs?.state}</span></strong>
            <small>{fs ? `≈ ${fmt(fs.activeRules)} Regeln aktiv · Engine ${fs.engineBuiltAt ? fmtDate(fs.engineBuiltAt) : "—"}${fs.fromCache ? " (Cache)" : ""}${fs.message ? ` · ${fs.message}` : ""}` : "…"}</small>
          </div>
          <button className="btn" disabled={fs?.state === "loading" || fs?.state === "building"} onClick={() => call("filter_update_now", undefined, b.setStatus)}>Jetzt aktualisieren</button>
        </div>
        {lists.map(l => (
          <label key={l.id} className="filter-row">
            <input type="checkbox" className="switch" checked={l.enabled} onChange={e => call("filter_set_list", { id: l.id, enabled: e.target.checked }, b.setStatus)} />
            <div>
              <strong>{l.name}</strong> <small>{l.note}</small>
              <small>{l.lastUpdated ? `Stand ${fmtDate(l.lastUpdated)} · ≈ ${fmt(l.rules)} Regeln · ${Math.round(l.bytes / 1024)} KB` : "noch nicht geladen"}</small>
              {l.error && <small className="err">Letzter Versuch {fmtDate(l.lastAttempt)}: {l.error}</small>}
            </div>
            <span />
          </label>
        ))}
        <div className="setting">
          <div><strong>Automatisch aktualisieren</strong><small>Listen, die älter sind, werden im Hintergrund neu geladen</small></div>
          <select value={fs?.updateDays ?? 4} onChange={e => fs && call("filter_set_options", { updateDays: Number(e.target.value), cosmetic: fs.cosmetic }, b.setStatus)}>
            {[1, 2, 4, 7, 14, 30].map(d => <option key={d} value={d}>alle {d} {d === 1 ? "Tag" : "Tage"}</option>)}
          </select>
        </div>
        <label className="setting">
          <div><strong>Elemente ausblenden (kosmetische Filter)</strong><small>Fügt nach dem Laden ein Stylesheet ein; kein vollständiger Ersatz für uBlock Origin</small></div>
          <input type="checkbox" className="switch" checked={fs?.cosmetic ?? true} onChange={e => fs && call("filter_set_options", { updateDays: fs.updateDays, cosmetic: e.target.checked }, b.setStatus)} />
        </label>
        <div className="setting col">
          <div><strong>Ausnahmen (Schutz aus)</strong></div>
          <div className="chips">
            {(fs?.allowlist ?? []).length === 0 && <span className="muted small">Keine</span>}
            {(fs?.allowlist ?? []).map(h => <span key={h} className="chip">{h}<button title="Entfernen" onClick={() => setAllow(h, false)}>×</button></span>)}
          </div>
        </div>
      </section>

      <section className="card list-card">
        <h2>Cookies aller Seiten</h2>
        <div className="setting">
          <div><strong>Gespeicherte Cookies</strong><small>{cookieSites ? `${cookieSites.reduce((a, c) => a + c.count, 0)} Cookies von ${cookieSites.length} Domains` : "Benötigt einen offenen Web-Tab"}</small></div>
          <div className="inline-form">
            <button className="btn" onClick={refreshCookies}>Laden</button>
            <button className="btn danger" disabled={busy === "cookies"} onClick={() => deleteCookies(null)}>Alle löschen</button>
          </div>
        </div>
        {cookieSites?.slice(0, 200).map(c => (
          <div key={c.name} className="list-row">
            <span className="row-title mono">{c.name}</span>
            <span className="num">{c.count}</span>
            <button className="btn ghost" onClick={() => deleteCookies(c.name)}>Löschen</button>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Browserdaten löschen</h2>
        <div className="check-list">
          {([["cache", "Cache"], ["cookies", "Cookies"], ["storage", "Website-Speicher (localStorage, IndexedDB …)"], ["history", "WebView2-Verlauf"], ["downloads", "WebView2-Downloadliste"]] as const).map(([k, label]) => (
            <label key={k}><input type="checkbox" checked={!!kinds[k]} onChange={e => setKinds(s => ({ ...s, [k]: e.target.checked }))} /> {label}</label>
          ))}
          <label><input type="checkbox" checked={jtechHistory} onChange={e => setJtechHistory(e.target.checked)} /> JTech-Verlauf</label>
        </div>
        <button className="btn danger" disabled={busy === "clear" || (!jtechHistory && !Object.values(kinds).some(Boolean))} onClick={clearData}>Ausgewähltes löschen</button>
        {opts && <>
          <label className="setting">
            <div><strong>Cookies beim Beenden löschen</strong><small>Wird beim nächsten Start vor dem ersten Laden ausgeführt (WebView2 erlaubt kein verlässliches Löschen beim Beenden)</small></div>
            <input type="checkbox" className="switch" checked={opts.clearCookiesOnExit} onChange={e => saveOpts({ ...opts, clearCookiesOnExit: e.target.checked })} />
          </label>
          <label className="setting">
            <div><strong>Cache beim Beenden löschen</strong></div>
            <input type="checkbox" className="switch" checked={opts.clearCacheOnExit} onChange={e => saveOpts({ ...opts, clearCacheOnExit: e.target.checked })} />
          </label>
        </>}
      </section>

      <p className="muted small">Blockiert werden Netzwerkanfragen, die WebView2 über WebResourceRequested meldet. Service-Worker-Anfragen, WebSockets nach dem Handshake und Anfragen in manchen iframes sind nur eingeschränkt erfasst; Scriptlets (+js) werden nicht ausgeführt. Details: docs/ROUND4.md.</p>
    </div>
  );
}
