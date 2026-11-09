import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useBrowser } from "../store/BrowserStore";
import { CHANGELOG, cmpVersion } from "../data/changelog";
import { IconClose, IconInfo } from "./Icons";
import { useT } from "../i18n";

/** "What's new" notice after an update: compares settings.lastSeenVersion with the app version. */
export function WhatsNew() {
  const b = useBrowser();
  const { t, lang } = useT();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);
  const last = b.settings.lastSeenVersion;
  // first start: remember the version silently
  useEffect(() => { if (version && !last) b.updateSettings({ lastSeenVersion: version }); }, [version, last]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!version || !last || cmpVersion(version, last) <= 0) return null;
  const entry = CHANGELOG.find(e => cmpVersion(e.version, version) === 0);
  const dismiss = () => b.updateSettings({ lastSeenVersion: version });
  return (
    <div className="whats-new card" role="status">
      <IconInfo size={18} />
      <div className="whats-new-text">
        <strong>{t("cl.newTitle", { v: version })}</strong>
        {entry && <small className="muted">{entry.notes[lang].slice(0, 2).join(" ")}</small>}
      </div>
      <button className="btn primary sm" onClick={() => { dismiss(); b.openPage("changelog"); }}>{t("cl.show")}</button>
      <button className="icon-btn sm" onClick={dismiss} title={t("c.close")} aria-label={t("c.close")}><IconClose size={14} /></button>
    </div>
  );
}
