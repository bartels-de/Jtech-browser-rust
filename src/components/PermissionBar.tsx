import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBrowser } from "../store/BrowserStore";
import { IconLock } from "./Icons";
import { call, PERMISSION_LABELS, type PermissionRequest } from "../lib/ipc";

/**
 * Runde 4: Abfrage fuer Website-Berechtigungen (WebView2 PermissionRequested mit Deferral).
 * Liegt im Header – also ausserhalb des Content-Rechtecks; die Webseite rutscht nach unten.
 */
export function PermissionBar() {
  const b = useBrowser();
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
    <div className="perm-bar" role="alertdialog" aria-label="Berechtigungsanfrage">
      <span className="perm-icon" aria-hidden><IconLock size={14} /></span>
      <div className="perm-text">
        <strong>{host}</strong> fragt nach Zugriff: <strong>{PERMISSION_LABELS[req.kind] ?? req.kind}</strong>
        {tab && tab.id !== b.activeTab?.id && <small className="muted"> (Tab „{tab.title}“)</small>}
        {queue.length > 1 && <small className="muted"> · {queue.length - 1} weitere</small>}
      </div>
      <label className="perm-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Für diese Seite merken</label>
      <button className="btn" onClick={() => answer("deny")}>Blockieren</button>
      <button className="btn primary" onClick={() => answer("allow")}>Erlauben</button>
    </div>
  );
}
