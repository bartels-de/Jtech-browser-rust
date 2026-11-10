import { useBrowser } from "../../store/BrowserStore";
import { storageBackend } from "../../store/storage";
import { checkForUpdate, downloadUpdate, fmtBytes, installAndRestart, useUpdater } from "../../lib/updater";
import { Disclosure, Group, Row, Switch } from "../../components/SettingsUI";
import { JTechLogo } from "../../components/Icons";
import { LANGS, fmtDate, fmtTime, t, useT } from "../../i18n";
export function About() {
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
      <Row title={t("page.changelog")} desc={t("cl.aboutDesc")} keywords="changelog what's new neu">
        <button className="btn" onClick={() => b.openPage("changelog")}>{t("cl.show")}</button>
      </Row>
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
      <Row title={t("ab.extra")} desc={t("ab.extraDesc")} keywords="interval update" advanced>
        <select value={s.updateIntervalHours} disabled={!s.autoUpdateCheck} onChange={e => b.updateSettings({ updateIntervalHours: Number(e.target.value) })} aria-label={t("ab.intervalAria")}>
          <option value={0}>{t("ab.onlyStart")}</option>
          <option value={6}>{t("ab.every6")}</option>
          <option value={12}>{t("ab.every12")}</option>
          <option value={24}>{t("ab.daily")}</option>
          <option value={72}>{t("ab.every3d")}</option>
        </select>
      </Row>
    </Group>
    <Group title={t("ab.adv")} desc={t("ab.advDesc")} advanced>
      <Row title={t("ab.devtools")} desc={t("ab.devtoolsDesc")} keywords="devtools developer f12 inspect console entwicklertools untersuchen konsole" advanced>
        <Switch label={t("ab.devtools")} checked={s.devTools === true} onChange={x => b.updateSettings({ devTools: x })} />
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
