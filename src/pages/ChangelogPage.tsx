import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { CHANGELOG, cmpVersion } from "../data/changelog";
import { useT } from "../i18n";

/** jtech://changelog – release notes per version (src/data/changelog.ts). */
export function ChangelogPage() {
  const { t, lang, fmtDate } = useT();
  const [current, setCurrent] = useState<string>("");
  useEffect(() => { getVersion().then(setCurrent).catch(() => {}); }, []);
  return (
    <div className="page doc-page changelog-page">
      <header className="page-head"><h1>{t("page.changelog")}</h1><p className="muted">{t("cl.lead")}</p></header>
      {CHANGELOG.map(e => {
        const isCur = current && cmpVersion(e.version, current) === 0;
        const upcoming = current ? cmpVersion(e.version, current) > 0 : !e.date;
        return (
          <section key={e.version} className={`card cl-entry${isCur ? " current" : ""}`} aria-labelledby={`cl-${e.version}`}>
            <header className="cl-head">
              <h2 id={`cl-${e.version}`}>{t("cl.version", { v: e.version })}</h2>
              {isCur && <span className="status-pill ready">{t("cl.installed")}</span>}
              {upcoming && <span className="status-pill">{t("cl.upcoming")}</span>}
              {e.date && <span className="muted small">{fmtDate(new Date(e.date), { day: "numeric", month: "long", year: "numeric" })}</span>}
            </header>
            <ul className="cl-list">{e.notes[lang].map((n, i) => <li key={i}>{n}</li>)}</ul>
          </section>
        );
      })}
    </div>
  );
}
