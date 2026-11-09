import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../components/PageShell";
import { EmptyState } from "../components/EmptyState";
import { listen } from "@tauri-apps/api/event";
import { useBrowser } from "../store/BrowserStore";
import { Favicon } from "../components/Favicon";
import { IconShield } from "../components/Icons";
import { Disclosure, Group, Row, Switch } from "../components/SettingsUI";
import { fmtDateTime, fmtNum, localizeBackend, t, useT, type TKey } from "../i18n";
import { call, filterListNote, filterStateLabel, siteOf, type CookieInfo, type Count, type FilterStatus, type PrivacyOptions, type PrivacyStats } from "../lib/ipc";

const fmt = (n: number) => fmtNum(n);
const fmtDate = (ms: number) => (ms ? fmtDateTime(ms) : t("c.never"));

function Bars({ items, empty }: { items: Count[]; empty: string }) {
  const max = Math.max(1, ...items.map(i => i.count));
  if (!items.length) return <EmptyState compact title={empty} />;
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
  useT();
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
    if (list) { setFs(f => (f ? { ...f, allowlist: list } : f)); b.setStatus(allowed ? t("pv.allowedOff", { host }) : t("pv.allowedOn", { host })); }
  };
  const deleteCookies = async (site: string | null) => {
    setBusy("cookies");
    const n = await call<number>("delete_cookies", { site }, b.setStatus);
    setBusy("");
    if (n !== undefined) { b.setStatus(site ? t("pv.cookiesDeleted", { count: n, site }) : t("pv.allCookiesDeleted")); refreshCookies(); }
  };
  const clearData = async () => {
    const sel = Object.entries(kinds).filter(([, v]) => v).map(([k]) => k);
    setBusy("clear");
    if (sel.length) {
      const r = await call("clear_browsing_data", { kinds: sel }, b.setStatus);
      if (r !== undefined) b.setStatus(t("pv.dataDeleted"));
    }
    if (jtechHistory) b.clearHistory();
    setBusy("");
  };
  const saveOpts = (o: PrivacyOptions) => { setOpts(o); call("privacy_set_options", { opts: o }, b.setStatus); };
  const lists = useMemo(() => fs?.lists ?? [], [fs]);

  const KINDS = (["cache", "cookies", "storage", "history", "downloads"] as const).map(k => [k, t(`pv.k.${k}` as TKey), t(`pv.k.${k}.h` as TKey)] as const);
  return (
    <PageShell title={t("page.privacy")} subtitle={t("pv.lead")}>

      <section className="card hero-card">
        <span className={`hero-shield${b.settings.adblock ? "" : " off"}`}><IconShield size={30} /></span>
        <div className="hero-num"><span>{stats ? fmt(stats.lifetimeTotal) : <span className="skeleton skel-num" aria-label={t("c.loading")} />}</span><small>{t("pv.heroSub", { n: b.totalBlocked })}</small></div>
        <label className="switch-row">
          <span>{b.settings.adblock ? t("pv.on") : t("pv.off")}</span>
          <input type="checkbox" role="switch" aria-label="JTech Shield" className="switch" checked={b.settings.adblock} onChange={e => b.updateSettings({ adblock: e.target.checked })} />
        </label>
      </section>

      {currentSite && (
        <Group title={t("pv.site", { site: currentSite })} desc={t("pv.siteDesc")}>
          <Row title={t("pv.siteShield")} desc={allowlisted ? t("pv.siteOff") : t("pv.siteOn")}>
            <Switch label={t("shield.onSite", { site: currentSite })} checked={!allowlisted} onChange={v => setAllow(currentSite, !v)} />
          </Row>
          <Row title={t("pv.siteCookies")} desc={siteCookies ? t("pv.siteCookiesN", { count: siteCookies.length }) : t("pv.siteCookiesHint")}>
            <button className="btn" onClick={refreshCookies}>{t("c.show")}</button>
            <button className="btn danger" disabled={busy === "cookies"} onClick={() => deleteCookies(currentSite)}>{t("c.delete")}</button>
          </Row>
          {siteCookies && siteCookies.length > 0 && (
            <div className="sub-list">
              {siteCookies.slice(0, 100).map((c, i) => (
                <div key={c.domain + c.path + c.name + i} className="list-row">
                  <span className="row-title mono">{c.name}</span>
                  <span className="muted small">{c.domain}{c.path} · {c.session ? t("pv.untilClose") : t("pv.until", { date: fmtDate(c.expires * 1000) })}</span>
                </div>
              ))}
            </div>
          )}
        </Group>
      )}

      <Group title={t("pv.clearTitle")} desc={t("pv.clearDesc")}>
        <div className="check-grid">
          {KINDS.map(([k, label, hint]) => (
            <label key={k} className="check-card"><input type="checkbox" checked={!!kinds[k]} onChange={e => setKinds(s => ({ ...s, [k]: e.target.checked }))} />
              <span><strong>{label}</strong><small>{hint}</small></span></label>
          ))}
          <label className="check-card"><input type="checkbox" checked={jtechHistory} onChange={e => setJtechHistory(e.target.checked)} />
            <span><strong>{t("page.history")}</strong><small>{t("pv.historyDesc")}</small></span></label>
        </div>
        <div className="row-end">
          <button className="btn danger" disabled={busy === "clear" || (!jtechHistory && !Object.values(kinds).some(Boolean))} onClick={clearData}>{busy === "clear" ? t("pv.deleting") : t("pv.deleteSel")}</button>
        </div>
        {opts && <>
          <Row title={t("set.delCookiesExit")} desc={t("set.onExitDesc")}>
            <Switch label={t("set.delCookiesExit")} checked={opts.clearCookiesOnExit} onChange={v => saveOpts({ ...opts, clearCookiesOnExit: v })} />
          </Row>
          <Row title={t("set.delCacheExit")}>
            <Switch label={t("set.delCacheExit")} checked={opts.clearCacheOnExit} onChange={v => saveOpts({ ...opts, clearCacheOnExit: v })} />
          </Row>
        </>}
      </Group>

      <Group title={t("pv.allCookies")} desc={cookieSites ? t("pv.allCookiesDesc", { n: cookieSites.reduce((a, c) => a + c.count, 0), sites: cookieSites.length }) : t("pv.needTab")}
        actions={<><button className="btn" onClick={refreshCookies}>{t("c.load")}</button>
          <button className="btn danger" disabled={busy === "cookies"} onClick={() => confirm(t("pv.delAllConfirm")) && deleteCookies(null)}>{t("pv.delAll")}</button></>}>
        {cookieSites && cookieSites.length > 0 && (
          <div className="sub-list">
            {cookieSites.slice(0, 200).map(c => (
              <div key={c.name} className="list-row">
                <Favicon url={`https://${c.name}`} />
                <span className="row-title">{c.name}</span>
                <span className="num">{c.count}</span>
                <button className="btn ghost sm" onClick={() => deleteCookies(c.name)}>{t("c.delete")}</button>
              </div>
            ))}
          </div>
        )}
      </Group>

      <div className="section-head">
        <h2>{t("pv.stats")}</h2>
        <button className="btn ghost sm" onClick={() => confirm(t("pv.resetStatsConfirm")) && call("privacy_reset_stats", undefined, b.setStatus).then(refreshStats)}>{t("c.reset")}</button>
      </div>
      <div className="grid-2">
        <section className="card list-card">
          <h2>{t("pv.openTabs")}</h2>
          {webTabs.length === 0 && <EmptyState compact title={t("pv.noWeb")} />}
          {webTabs.map(x => (
            <div key={x.id} className="list-row" onClick={() => b.switchTab(x.id)}>
              <Favicon url={x.url} internal={x.internal} />
              <span className="row-title">{x.title}</span>
              <span className="bar"><span style={{ width: `${(x.blocked / maxTab) * 100}%` }} /></span>
              <span className="num">{fmt(x.blocked)}</span>
            </div>
          ))}
        </section>
        <section className="card list-card">
          <h2>{t("pv.topSites")}</h2>
          <Bars items={stats?.topSites ?? []} empty={t("pv.nothing")} />
        </section>
        <section className="card list-card">
          <h2>{t("pv.topTrackers")}</h2>
          <Bars items={stats?.topDomains ?? []} empty={t("pv.nothing")} />
        </section>
        <section className="card list-card">
          <h2>{t("pv.sessionTrackers")}</h2>
          <Bars items={stats?.sessionTopDomains ?? []} empty={t("pv.sessionNothing")} />
        </section>
      </div>

      <Group title={t("ab.filterLists")} desc={fs ? <><span className={`status-pill ${fs.state}`}>{filterStateLabel(fs.state)}</span> {t("fs.rules", { count: fs.activeRules })}</> : t("fs.statusLoading")}
        actions={<button className="btn" disabled={fs?.state === "loading" || fs?.state === "building"} onClick={() => call("filter_update_now", undefined, b.setStatus)}>{t("c.updateNow")}</button>}>
        {lists.map(l => (
          <Row key={l.id} title={l.name} desc={l.error ? t("fs.failedAt", { date: fmtDate(l.lastAttempt), detail: localizeBackend(l.error) }) : `${l.note ? filterListNote(l.id, l.note) + " · " : ""}${l.lastUpdated ? t("fs.asOf", { date: fmtDate(l.lastUpdated) }) : t("fs.notLoaded")}`}>
            <Switch label={l.name} checked={l.enabled} onChange={v => call("filter_set_list", { id: l.id, enabled: v }, b.setStatus)} />
          </Row>
        ))}
        <Row title={t("fs.autoUpdate")} desc={t("fs.autoUpdateDesc")}>
          <select value={fs?.updateDays ?? 4} aria-label={t("fs.intervalAria")} onChange={e => fs && call("filter_set_options", { updateDays: Number(e.target.value), cosmetic: fs.cosmetic }, b.setStatus)}>
            {[1, 2, 4, 7, 14, 30].map(d => <option key={d} value={d}>{t("fs.everyDays", { count: d })}</option>)}
          </select>
        </Row>
        <Row title={t("ab.cosmetic")} desc={t("ab.cosmeticDesc")}>
          <Switch label={t("ab.cosmetic")} checked={fs?.cosmetic ?? true} onChange={v => fs && call("filter_set_options", { updateDays: fs.updateDays, cosmetic: v }, b.setStatus)} />
        </Row>
        <Row title={t("ab.exceptions")} desc={t("ab.exceptionsDescShort")} col>
          <div className="chips">
            {(fs?.allowlist ?? []).length === 0 && <span className="muted small">{t("ab.noExceptions")}</span>}
            {(fs?.allowlist ?? []).map(h => <span key={h} className="chip">{h}<button title={t("th.removeNamed", { name: h })} aria-label={t("th.removeNamed", { name: h })} onClick={() => setAllow(h, false)}>×</button></span>)}
          </div>
        </Row>
      </Group>

      <Disclosure summary={t("c.technical")}>
        <p className="muted small">{t("pv.tech1")} {fs ? `${t("pv.engineBuilt", { date: fs.engineBuiltAt ? fmtDate(fs.engineBuiltAt) : "—" })}${fs.fromCache ? t("pv.fromCache") : ""}${fs.message ? ` · ${localizeBackend(fs.message)}` : ""}. ` : ""}
          {lists.map(l => t("pv.listInfo", { name: l.name, rules: l.rules, kb: Math.round(l.bytes / 1024) })).join(" · ")}</p>
        <p className="muted small">{t("pv.tech2")}</p>
      </Disclosure>
    </PageShell>
  );
}
