import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBrowser } from "../../store/BrowserStore";
import { DownloadList } from "../../components/DownloadList";
import { call, filterStateLabel, type FilterStatus, type PrivacyOptions } from "../../lib/ipc";
import { Group, Row, Switch } from "../../components/SettingsUI";
import { t, useT, fmtDateTime, localizeBackend } from "../../i18n";
import { formatCombo } from "../../lib/keys";
export function TabsSec() {
  const b = useBrowser(); const s = b.settings;
  const { fmtPct } = useT();
  const zoom = Object.entries(b.zoomBySite).sort(([a], [c]) => a.localeCompare(c));
  const k = (id: string, f: string) => b.keyHint(id) ?? formatCombo(f);
  return <>
    <Group title={t("set.tabOpen")}>
      <Row title={t("set.newTabNext")} desc={t("set.newTabNextDesc")} keywords="new tab position neben">
        <Switch label={t("set.newTabNext")} checked={s.newTabNextToCurrent !== false} onChange={v => b.updateSettings({ newTabNextToCurrent: v })} />
      </Row>
      <Row title={t("set.returnOpener")} desc={t("set.returnOpenerDesc")} keywords="opener close schließen zurück">
        <Switch label={t("set.returnOpener")} checked={s.returnToOpener !== false} onChange={v => b.updateSettings({ returnToOpener: v })} />
      </Row>
    </Group>
    <Group title={t("set.saveMem")} desc={t("set.saveMemDesc")}>
      <Row title={t("set.autoSleep")} keywords="sleep">
        <select value={s.tabSleepMinutes} aria-label={t("set.autoSleepAria")} onChange={e => b.updateSettings({ tabSleepMinutes: Number(e.target.value) })}>
          {[0, 5, 10, 15, 30, 60, 120, 240].map(m => <option key={m} value={m}>{m === 0 ? t("set.never") : t("set.afterMin", { count: m })}</option>)}
        </select>
      </Row>
      <Row title={t("set.sleepNowTitle")} keywords="sleep" advanced>
        <button className="btn" onClick={b.sleepInactiveTabs}>{t("set.sleepNow")}</button>
      </Row>
    </Group>
    <Group title={t("set.groups")} desc={t("set.groupsDesc")}>
      <Row title={t("set.autoGroup")} desc={t("set.autoGroupDesc")} keywords="domain">
        <Switch label={t("set.autoGroup")} checked={s.autoGroupByDomain} onChange={v => b.updateSettings({ autoGroupByDomain: v })} />
      </Row>
      <Row title={t("set.groupNowTitle")} desc={t("set.groupNowDesc")} keywords="domain" advanced>
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

export function PrivacySec() {
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
export function AdblockSec() {
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
      <Row title={t("ab.cosmetic")} desc={t("ab.cosmeticDesc")} keywords="cosmetic" advanced>
        <Switch label={t("ab.cosmetic")} disabled={!fs} checked={fs?.cosmetic ?? true} onChange={v => fs && call("filter_set_options", { updateDays: fs.updateDays, cosmetic: v, scriptlets: fs.scriptlets }, b.setStatus)} />
      </Row>
      <Row title={t("ab.scriptlets")} desc={t("ab.scriptletsDesc")} keywords="scriptlets procedural ublock has-text" advanced>
        <Switch label={t("ab.scriptlets")} disabled={!fs} checked={fs?.scriptlets ?? true} onChange={v => fs && call("filter_set_options", { updateDays: fs.updateDays, cosmetic: fs.cosmetic, scriptlets: v }, b.setStatus)} />
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
      <Row title={t("fs.autoUpdate")} desc={t("fs.autoUpdateDesc")} keywords="interval" advanced>
        <select value={fs?.updateDays ?? 4} disabled={!fs} aria-label={t("fs.intervalAria")} onChange={e => fs && call("filter_set_options", { updateDays: Number(e.target.value), cosmetic: fs.cosmetic, scriptlets: fs.scriptlets }, b.setStatus)}>
          {[1, 2, 4, 7, 14, 30].map(d => <option key={d} value={d}>{t("fs.everyDays", { count: d })}</option>)}
        </select>
      </Row>
    </Group>
  </>;
}

export function DownloadsSec() {
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

