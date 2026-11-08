import { useCallback, useEffect, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { call, PERMISSION_LABELS, type PermissionEntry } from "../lib/ipc";

/** Runde 4: gespeicherte Website-Berechtigungen verwalten (SQLite-Tabelle permissions). */
export function PermissionSettings() {
  const b = useBrowser();
  const [list, setList] = useState<PermissionEntry[]>([]);
  const refresh = useCallback(() => { call<PermissionEntry[]>("list_permissions", undefined, b.setStatus).then(l => l && setList(l)); }, [b.setStatus]);
  useEffect(refresh, [refresh]);
  const set = async (origin: string, kind: string | null, state: "allow" | "deny" | null) => {
    await call("set_permission", { origin, kind, state }, b.setStatus);
    refresh();
  };
  const origins = [...new Set(list.map(p => p.origin))];
  return (
    <section className="card">
      <h2>Website-Berechtigungen</h2>
      <p className="muted small">Kamera, Mikrofon, Standort usw. Ohne gespeicherte Entscheidung fragt JTech über eine Leiste oberhalb der Seite.</p>
      {origins.length === 0 && <span className="muted small">Keine gespeicherten Entscheidungen.</span>}
      {origins.map(o => (
        <div key={o} className="setting col">
          <div className="row"><strong className="mono">{o}</strong><span className="spacer" /><button className="btn ghost" onClick={() => set(o, null, null)}>Alle entfernen</button></div>
          {list.filter(p => p.origin === o).map(p => (
            <div key={p.kind} className="row">
              <span>{PERMISSION_LABELS[p.kind] ?? p.kind}</span>
              <span className="spacer" />
              <select value={p.state} onChange={e => set(o, p.kind, e.target.value as "allow" | "deny")}>
                <option value="allow">Erlauben</option>
                <option value="deny">Blockieren</option>
              </select>
              <button className="btn ghost" onClick={() => set(o, p.kind, null)}>Zurücksetzen</button>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
