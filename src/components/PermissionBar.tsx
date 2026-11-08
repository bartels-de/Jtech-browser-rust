import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBrowser } from "../store/BrowserStore";
import { IconLock } from "./Icons";
import { useT } from "../i18n";
import { call, permissionLabel, type PermissionRequest } from "../lib/ipc";

/**
 * Runde 4: Abfrage fuer Website-Berechtigungen (WebView2 PermissionRequested mit Deferral).
 * Liegt im Header – also ausserhalb des Content-Rechtecks; die Webseite rutscht nach unten.
 */
export function PermissionBar() {
  const b = useBrowser();
  const { t } = useT();
  const [queue, setQueue] = useState<PermissionRequest[]>([]);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    const un1 = listen<PermissionRequest>("permission-request", ({ payload }) => setQueue(q => q.some(x => x.id === payload.id) ? q : [...q, payload]));
    const un2 = listen<number>("permission-cancel", ({ payload }) => setQueue(q => q.filter(x => x.id !== payload)));
    return () => { un1.then(f => f()); un2.then(f => f()); };
  }, []);

  // Anfragen geschlossener Tabs verwerfen
  useEffect(() => { setQueue(q => q.filter(x => b.tabs.some(t => t.id === x.tabId))); }, [b.tabs]);

  const req = queue.find(r => r.tabId === b.activeTab?.id) ?? queue[0];
  if (!req) return null;
  const tab = b.tabs.find(t => t.id === req.tabId);
  const answer = (decision: "allow" | "deny") => {
    call("resolve_permission", { id: req.id, decision, remember }, b.setStatus);
    setQueue(q => q.filter(x => x.id !== req.id));
  };
  let host = req.origin;
  try { host = new URL(req.origin).host; } catch { /* Origin roh anzeigen */ }
  return (
    <div className="perm-bar" role="alertdialog" aria-label={t("pb.label")}>
      <span className="perm-icon" aria-hidden><IconLock size={14} /></span>
      <div className="perm-text">
        <strong>{host}</strong> {t("pb.asks")} <strong>{permissionLabel(req.kind)}</strong>
        {tab && tab.id !== b.activeTab?.id && <small className="muted"> {t("pb.tab", { title: tab.title })}</small>}
        {queue.length > 1 && <small className="muted"> · {t("pb.more", { count: queue.length - 1 })}</small>}
      </div>
      <label className="perm-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> {t("pb.remember")}</label>
      <button className="btn" onClick={() => answer("deny")}>{t("c.block")}</button>
      <button className="btn primary" onClick={() => answer("allow")}>{t("c.allow")}</button>
    </div>
  );
}
