import { useEffect, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { useT } from "../i18n";
import { call, siteOf } from "../lib/ipc";

/** Runde 4: Schutz fuer die aktuelle Seite an/aus (Allowlist in Rust). */
export function SiteShieldToggle({ url }: { url?: string }) {
  const b = useBrowser();
  const { t } = useT();
  const site = siteOf(url);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { if (url && site) call<boolean>("allowlist_check", { url }).then(v => setAllowed(v ?? null)); }, [url, site]);
  if (!site || allowed === null) return null;
  return (
    <label className="switch-row">
      <span>{t("shield.onSite", { site })}</span>
      <input type="checkbox" className="switch" checked={!allowed} onChange={async e => {
        const off = !e.target.checked;
        const r = await call<string[]>("allowlist_set", { host: site, allowed: off }, b.setStatus);
        if (r) { setAllowed(off); b.reload(); }
      }} />
    </label>
  );
}
