import { useCallback, useEffect, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { Group, Row } from "./SettingsUI";
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
  const pretty = (o: string) => { try { return new URL(o).host; } catch { return o; } };
  return (
    <Group title="Gespeicherte Entscheidungen" desc="Ohne gespeicherte Entscheidung fragt JTech über eine Leiste oberhalb der Seite.">
      {origins.length === 0 && <p className="muted small s-empty">Noch keine Website hat nach Kamera, Mikrofon, Standort o. Ä. gefragt.</p>}
      {origins.map(o => (
        <div key={o} className="perm-site">
          <div className="perm-site-head"><strong title={o}>{pretty(o)}</strong>
            <button className="btn ghost sm" onClick={() => set(o, null, null)}>Alle zurücksetzen</button></div>
          {list.filter(p => p.origin === o).map(p => (
            <Row key={p.kind} title={PERMISSION_LABELS[p.kind] ?? p.kind} keywords={pretty(o)}>
              <div className="segmented" role="radiogroup" aria-label={`${PERMISSION_LABELS[p.kind] ?? p.kind} für ${pretty(o)}`}>
                <button role="radio" aria-checked={p.state === "allow"} className={p.state === "allow" ? "on" : ""} onClick={() => set(o, p.kind, "allow")}>Erlauben</button>
                <button role="radio" aria-checked={p.state === "deny"} className={p.state === "deny" ? "on" : ""} onClick={() => set(o, p.kind, "deny")}>Blockieren</button>
              </div>
              <button className="btn ghost sm" title="Beim nächsten Mal wieder fragen" onClick={() => set(o, p.kind, null)}>Fragen</button>
            </Row>
          ))}
        </div>
      ))}
    </Group>
  );
}
