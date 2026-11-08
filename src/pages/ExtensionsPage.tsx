import { useCallback, useEffect, useMemo, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { ExtIcon } from "../components/ExtIcon";
import { IconInfo, IconStore, IconWarn } from "../components/Icons";
import { Switch } from "../components/SettingsUI";
import { extList, extMatchesHost, extOffOn, extSiteToggle, extToggle } from "../lib/extensions";
import { siteOf, type ExtInfo } from "../lib/ipc";
import { useT } from "../i18n";

/**
 * jtech://extensions - installed (bundled) extensions: on/off switch, per-site pause for an open website,
 * blocked-request counter. Off = uninstalled (docs/EXTENSIONS.md); changes apply on the next page load.
 */
export function ExtensionsPage() {
  const b = useBrowser();
  const { t, lang, fmtNum } = useT();
  const [list, setList] = useState<ExtInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => { extList(b.setStatus).then(l => l && setList(l)); }, [b.setStatus]);
  useEffect(() => { refresh(); const i = setInterval(refresh, 5000); return () => clearInterval(i); }, [refresh, lang]);

  // This page is itself the active tab, so "current site" = an open web tab (active one first).
  const sites = useMemo(() => {
    const out: string[] = [];
    for (const x of [...b.tabs].sort((a, c) => Number(c.active) - Number(a.active))) {
      const s = !x.internal ? siteOf(x.url) : null;
      if (s && !out.includes(s)) out.push(s);
    }
    return out;
  }, [b.tabs]);
  const [site, setSite] = useState<string>("");
  const cur = sites.includes(site) ? site : sites[0] ?? "";

  // Installed = enabled (bundled extensions that are switched off are "available" in the market).
  const shown = (list ?? []).filter(e => e.enabled);
  const totalBlocked = (list ?? []).reduce((a, e) => a + e.blocked, 0);

  const toggle = async (e: ExtInfo, v: boolean) => {
    setBusy(e.id);
    const r = await extToggle(e.id, v, b.setStatus);
    setBusy(null);
    if (r) { setList(r); b.setStatus(t(v ? "mk.installed" : "mk.uninstalled", { name: e.name })); }
  };
  const siteToggle = async (e: ExtInfo, host: string, v: boolean) => {
    setBusy(e.id);
    const r = await extSiteToggle(e.id, host, v, b.setStatus);
    setBusy(null);
    if (r) { setList(r); b.setStatus(t(v ? "ext.resumedSite" : "ext.pausedSite", { name: e.name, site: host })); }
  };

  return (
    <div className="page doc-page ext-page">
      <header className="page-head row">
        <div><h1>{t("page.extensions")}</h1><p className="muted">{t("ext.lead")}</p></div>
        <button className="btn" onClick={() => b.openPage("market")}><IconStore size={15} /> {t("ext.toMarket")}</button>
      </header>

      <div className="kpi-row">
        <div className="kpi"><span className="kpi-num">{list ? fmtNum(shown.length) : <span className="skeleton skel-num" aria-label={t("c.loading")} />}</span><span className="kpi-label">{t("ext.active")}</span></div>
        <div className="kpi"><span className="kpi-num">{fmtNum(list?.length ?? 0)}</span><span className="kpi-label">{t("ext.source.bundled")}</span></div>
        <div className="kpi"><span className="kpi-num">{fmtNum(totalBlocked)}</span><span className="kpi-label">{t("ext.blockedTotal")}</span></div>
      </div>

      {sites.length > 1 && (
        <label className="ext-site-pick small"><span className="muted">{t("ext.sitePick")}</span>
          <select value={cur} onChange={e => setSite(e.target.value)} aria-label={t("ext.sitePick")}>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}

      {list && shown.length === 0 && (
        <div className="empty-state card">
          <h2>{t("ext.empty")}</h2><p>{t("ext.emptyText")}</p>
          <button className="btn primary" onClick={() => b.openPage("market")}>{t("ext.toMarket")}</button>
        </div>
      )}

      {shown.map(e => {
        const runs = !!cur && extMatchesHost(e, cur);
        const pausedHere = !!cur && extOffOn(e, cur);
        return (
          <section key={e.id} className={`card ext-card${e.enabled ? "" : " is-off"}`}>
            <div className="ext-card-head">
              <ExtIcon svg={e.iconSvg} size={44} name={e.name} />
              <div className="ext-card-title">
                <strong>{e.name}</strong>
                <small className="muted">{e.author} · {t("mk.version", { v: e.version })}{e.source === "bundled" ? ` · ${t("ext.source.bundled")}` : ""}</small>
              </div>
              <span className={`status-pill${e.enabled ? " ready" : ""}`}>{e.enabled ? t("ext.enabled") : t("ext.disabled")}</span>
              <Switch label={t("ext.enableLabel", { name: e.name })} checked={e.enabled} disabled={busy === e.id || !e.compatible} onChange={v => toggle(e, v)} />
            </div>
            <p className="ext-desc">{e.description}</p>
            <div className="ext-meta small">
              <span className="ext-blocked">{t("ext.blocked", { count: e.blocked })}</span>
              {!e.compatible && <span className="status-pill error">{t("ext.incompatible", { v: e.minBrowser ?? "?" })}</span>}
              {e.updateVersion && <span className="status-pill">{t("ext.update", { v: e.updateVersion })}</span>}
              <span className="spacer" />
              <button className="btn ghost sm" onClick={() => b.openPage("market")}>{t("mk.details")}</button>
            </div>
            {e.error && <div className="banner warn" role="alert"><IconWarn size={14} /><span>{t("ext.error", { detail: e.error })}</span></div>}

            {e.enabled && (
              <div className="ext-site">
                {!cur && <p className="muted small">{t("ext.siteNone")}</p>}
                {cur && runs && (
                  <label className="switch-row">
                    <span><strong>{t("ext.site", { site: cur })}</strong><small className="muted"> · {t("ext.siteDesc")}</small></span>
                    <input type="checkbox" role="switch" className="switch" aria-label={t("ext.site", { site: cur })} checked={!pausedHere} disabled={busy === e.id}
                      onChange={ev => siteToggle(e, cur, ev.target.checked)} />
                  </label>
                )}
                {cur && !runs && <p className="muted small">{t("ext.siteNoMatch", { site: cur })}</p>}
                {e.siteOff.length > 0 && (
                  <div className="ext-paused">
                    <span className="muted small">{t("ext.paused")}</span>
                    <div className="chips">
                      {e.siteOff.map(h => <span key={h} className="chip">{h}<button title={t("ext.resume", { site: h })} aria-label={t("ext.resume", { site: h })} disabled={busy === e.id} onClick={() => siteToggle(e, h, true)}>×</button></span>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      <p className="market-note small"><IconInfo size={14} /> <span>{t("ext.reloadHint")} {t("ext.uninstallHint")}</span></p>
    </div>
  );
}
