import { useCallback, useEffect, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { Group, Row } from "./SettingsUI";
import { useT } from "../i18n";
import { call, permissionLabel, type PermissionEntry } from "../lib/ipc";

/** Runde 4: gespeicherte Website-Berechtigungen verwalten (SQLite-Tabelle permissions). */
export function PermissionSettings() {
  const b = useBrowser();
  const { t } = useT();
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
    <Group title={t("ps.title")} desc={t("ps.desc")}>
      {origins.length === 0 && <p className="muted small s-empty">{t("ps.empty")}</p>}
      {origins.map(o => (
        <div key={o} className="perm-site">
          <div className="perm-site-head"><strong title={o}>{pretty(o)}</strong>
            <button className="btn ghost sm" onClick={() => set(o, null, null)}>{t("ps.resetAll")}</button></div>
          {list.filter(p => p.origin === o).map(p => (
            <Row key={p.kind} title={permissionLabel(p.kind)} keywords={pretty(o)}>
              <div className="segmented" role="radiogroup" aria-label={t("ps.forSite", { perm: permissionLabel(p.kind), site: pretty(o) })}>
                <button role="radio" aria-checked={p.state === "allow"} className={p.state === "allow" ? "on" : ""} onClick={() => set(o, p.kind, "allow")}>{t("c.allow")}</button>
                <button role="radio" aria-checked={p.state === "deny"} className={p.state === "deny" ? "on" : ""} onClick={() => set(o, p.kind, "deny")}>{t("c.block")}</button>
              </div>
              <button className="btn ghost sm" title={t("ps.askTitle")} onClick={() => set(o, p.kind, null)}>{t("ps.ask")}</button>
            </Row>
          ))}
        </div>
      ))}
    </Group>
  );
}
