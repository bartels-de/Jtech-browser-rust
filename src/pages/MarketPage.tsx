import { useCallback, useEffect, useMemo, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { ExtIcon } from "../components/ExtIcon";
import { IconBack, IconInfo, IconPuzzle, IconReload, IconStore, IconWarn } from "../components/Icons";
import { Group } from "../components/SettingsUI";
import { ThemeGallery } from "../components/ThemeGallery";
import { TWITCH_ID, explainPermission, extList, extToggle, marketFetch, matchHost } from "../lib/extensions";
import type { ExtInfo, MarketEntry, MarketResult } from "../lib/ipc";
import { useT, type TKey } from "../i18n";

type Status = MarketEntry["status"];
/** One card = market entry merged with the bundled extension (icon, permissions, matches). */
interface Item { entry: MarketEntry; ext?: ExtInfo }

/** Offline fallback: build entries from the bundled extensions. */
function entryFromExt(e: ExtInfo): MarketEntry {
  const status: Status = !e.compatible ? "incompatible" : e.updateVersion ? "update-in-next-release" : e.enabled ? "installed" : "available";
  return { id: e.id, version: e.updateVersion ?? e.version, installedVersion: e.version, minBrowser: e.minBrowser, name: e.name, description: e.description, author: e.author, license: e.license, status, enabled: e.enabled };
}

/**
 * jtech://market - JTech Market. Lists the index (market_fetch) merged with the bundled extensions (ext_list).
 * Install = enable, uninstall = disable (bundled extensions ship with every release; see docs/EXTENSIONS.md).
 */
export function MarketPage() {
  const b = useBrowser();
  const { t, lang, fmtDateTime } = useT();
  const [market, setMarket] = useState<MarketResult | null>(null);
  const [exts, setExts] = useState<ExtInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"extensions" | "themes">("extensions");

  const load = useCallback(async () => {
    setLoading(true);
    const [m, e] = await Promise.all([marketFetch(), extList(b.setStatus)]);
    setMarket(m.result ?? null);
    setError(m.result ? null : m.error ?? "?");
    if (e) setExts(e);
    setLoading(false);
  }, [b.setStatus]);
  // Reload on language change so names/descriptions come back in the new language.
  useEffect(() => { load(); }, [load, lang]);

  const items: Item[] = useMemo(() => {
    const byId = new Map((exts ?? []).map(e => [e.id, e]));
    const entries = market ? market.entries : (exts ?? []).map(entryFromExt);
    const out = entries.map(entry => ({ entry, ext: byId.get(entry.id) }));
    // Bundled extensions missing from the index are still listed.
    if (market) for (const e of exts ?? []) if (!market.entries.some(x => x.id === e.id)) out.push({ entry: entryFromExt(e), ext: e });
    return out;
  }, [market, exts]);

  const toggle = async (it: Item, enabled: boolean) => {
    setBusy(it.entry.id);
    const r = await extToggle(it.entry.id, enabled, b.setStatus);
    setBusy(null);
    if (!r) return;
    setExts(r);
    setMarket(m => m && { ...m, entries: m.entries.map(x => x.id !== it.entry.id ? x : { ...x, enabled, status: x.status === "installed" || x.status === "available" ? (enabled ? "installed" : "available") : x.status }) });
    b.setStatus(t(enabled ? "mk.installed" : "mk.uninstalled", { name: it.entry.name }));
  };

  const cur = sel ? items.find(i => i.entry.id === sel) : undefined;
  if (cur) return <MarketDetail it={cur} busy={busy === cur.entry.id} onBack={() => setSel(null)} onToggle={v => toggle(cur, v)} />;

  return (
    <div className="page doc-page market-page">
      <section className="market-hero card">
        <span className="market-hero-icon"><IconStore size={30} /></span>
        <div className="market-hero-text">
          <h1>{t("page.market")}</h1>
          <p className="muted">{t("mk.hero")}</p>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => b.openPage("extensions")}><IconPuzzle size={15} /> {t("page.extensions")}</button>
          <button className="btn" disabled={loading} onClick={load} title={t("mk.refresh")}><IconReload size={15} /> {t("mk.refresh")}</button>
        </div>
      </section>

      <div className="segmented market-tabs" role="tablist" aria-label={t("page.market")}>
        <button role="tab" aria-selected={tab === "extensions"} className={tab === "extensions" ? "on" : ""} onClick={() => setTab("extensions")}>{t("mk.tabExt")}</button>
        <button role="tab" aria-selected={tab === "themes"} className={tab === "themes" ? "on" : ""} onClick={() => setTab("themes")}>{t("mk.tabThemes")}</button>
      </div>
      {tab === "themes" ? <><p className="muted small">{t("mk.themesLead")}</p><ThemeGallery /></> : <>
      <p className="market-note small"><IconInfo size={14} /> <span>{t("mk.honest")}</span></p>
      {error && !loading && <div className="banner warn" role="status"><IconWarn size={15} /><span>{t("mk.offline", { detail: error })}</span></div>}

      <div className="market-meta muted small">
        <span>{t("mk.count", { count: items.length })}</span>
        {market && <span>{t("mk.fetchedAt", { time: fmtDateTime(market.fetchedAt) })}</span>}
      </div>

      {loading && !items.length && <div className="market-grid" role="status" aria-label={t("mk.loading")}>{[0, 1, 2].map(i => <span key={i} className="skeleton market-skel" />)}</div>}
      {!loading && !items.length && <div className="empty-state card"><h2>{t("mk.empty")}</h2></div>}

      <div className="market-grid">
        {items.map(it => {
          const e = it.entry;
          const canToggle = !!it.ext && it.ext.compatible && e.status !== "not-bundled";
          return (
            <article key={e.id} className="card market-card">
              <button className="market-card-main" onClick={() => setSel(e.id)} aria-label={t("mk.openDetails", { name: e.name })}>
                <ExtIcon svg={it.ext?.iconSvg} size={48} name={e.name} />
                <span className="market-card-text">
                  <strong>{e.name}</strong>
                  <small className="muted">{t("mk.byAuthor", { author: e.author })} · {t("mk.version", { v: e.installedVersion ?? e.version })}</small>
                </span>
              </button>
              <p className="market-desc">{e.description}</p>
              <div className="market-card-foot">
                <StatusBadge status={e.status} enabled={it.ext?.enabled ?? e.enabled} />
                <span className="spacer" />
                <button className="btn ghost sm" onClick={() => setSel(e.id)}>{t("mk.details")}</button>
                {canToggle && (it.ext!.enabled
                  ? <button className="btn sm" disabled={busy === e.id} onClick={() => toggle(it, false)}>{t("mk.uninstall")}</button>
                  : <button className="btn primary sm" disabled={busy === e.id} onClick={() => toggle(it, true)}>{t("mk.install")}</button>)}
              </div>
            </article>
          );
        })}
      </div>
      </>}
    </div>
  );
}

/** Status from market_fetch; "update-in-next-release" still shows whether it is installed. */
function StatusBadge({ status, enabled }: { status: Status; enabled: boolean }) {
  const { t } = useT();
  return (
    <span className="badge-row">
      {status === "update-in-next-release" && enabled && <span className="status-pill ready">{t("mk.st.installed")}</span>}
      <span className={`status-pill mk-${status}${status === "installed" ? " ready" : ""}`}>{t(`mk.st.${status}` as TKey)}</span>
    </span>
  );
}

function MarketDetail({ it, busy, onBack, onToggle }: { it: Item; busy: boolean; onBack(): void; onToggle(v: boolean): void }) {
  const b = useBrowser();
  const { t } = useT();
  const e = it.entry, x = it.ext;
  const enabled = x?.enabled ?? e.enabled;
  const canToggle = !!x && x.compatible && e.status !== "not-bundled";
  const hosts = x ? x.matches.map(p => (p === "<all_urls>" ? { host: t("mk.d.allUrls"), sub: false } : matchHost(p) ?? { host: p, sub: false })) : [];
  return (
    <div className="page doc-page market-page">
      <button className="btn ghost sm market-back" onClick={onBack}><IconBack size={14} /> {t("mk.back")}</button>
      <section className="card market-detail-head">
        <ExtIcon svg={x?.iconSvg} size={72} name={e.name} />
        <div className="market-detail-title">
          <h1>{e.name}</h1>
          <p className="muted">{t("mk.byAuthor", { author: e.author })} · {t("mk.version", { v: x?.version ?? e.version })}</p>
          <StatusBadge status={e.status} enabled={enabled} />
        </div>
        <div className="row gap">
          {canToggle && (enabled
            ? <button className="btn" disabled={busy} onClick={() => onToggle(false)}>{t("mk.uninstall")}</button>
            : <button className="btn primary" disabled={busy} onClick={() => onToggle(true)}>{t("mk.install")}</button>)}
          {x && enabled && <button className="btn ghost" onClick={() => b.openPage("extensions")}>{t("mk.d.manage")}</button>}
        </div>
      </section>

      {e.status === "update-in-next-release" && <div className="banner info market-banner" role="status"><IconInfo size={15} /><span>{t("mk.d.updateNext", { v: e.version })}</span></div>}
      {e.status === "incompatible" && <div className="banner warn" role="status"><IconWarn size={15} /><span>{t("mk.d.incompatible", { v: e.minBrowser ?? x?.minBrowser ?? "?" })}</span></div>}
      {e.status === "not-bundled" && <div className="banner info market-banner" role="status"><IconInfo size={15} /><span>{t("mk.d.notBundled")}</span></div>}
      {x?.error && <div className="banner warn" role="alert"><IconWarn size={15} /><span>{t("ext.error", { detail: x.error })}</span></div>}

      <Group title={t("mk.d.about")}><p className="market-long">{e.description}</p></Group>

      <Group title={t("mk.d.perms")}>
        {x && x.permissions.length === 0 && <p className="muted small">{t("mk.d.permsNone")}</p>}
        {!x && <p className="muted small">{t("mk.d.hostsUnknown")}</p>}
        {x && x.permissions.length > 0 && (
          <ul className="perm-list">
            {x.permissions.map(p => { const ex = explainPermission(p); return (
              <li key={p}><strong>{ex.title}</strong>{ex.text && <span className="muted"> – {ex.text}</span>} <code className="mono small">{p}</code></li>
            ); })}
          </ul>
        )}
      </Group>

      <Group title={t("mk.d.hosts")}>
        {x ? (
          <div className="chips">{hosts.map((h, i) => <span key={i} className="chip chip-static">{h.sub ? `*.${h.host}` : h.host}</span>)}</div>
        ) : <p className="muted small">{t("mk.d.hostsUnknown")}</p>}
      </Group>

      {e.id === TWITCH_ID && (
        <Group title={t("mk.d.limits")}>
          <ul className="tips">
            <li>{t("mk.tw.1")}</li><li>{t("mk.tw.2")}</li><li>{t("mk.tw.3")}</li><li>{t("mk.tw.4")}</li>
          </ul>
        </Group>
      )}

      <Group title={t("mk.d.info")}>
        <dl className="tech-list">
          <dt>{t("mk.d.author")}</dt><dd>{e.author}</dd>
          <dt>{t("mk.d.license")}</dt><dd>{e.license || "–"}</dd>
          <dt>{t("mk.d.version")}</dt><dd>{e.version}</dd>
          {(x?.version ?? e.installedVersion) && <><dt>{t("mk.d.installedVersion")}</dt><dd>{x?.version ?? e.installedVersion}</dd></>}
          {(e.minBrowser ?? x?.minBrowser) && <><dt>{t("mk.d.minBrowser")}</dt><dd>{e.minBrowser ?? x?.minBrowser}</dd></>}
          <dt>{t("mk.d.id")}</dt><dd className="mono">{e.id}</dd>
        </dl>
      </Group>
      <p className="market-note small"><IconInfo size={14} /> <span>{t("mk.honest")}</span></p>
    </div>
  );
}
