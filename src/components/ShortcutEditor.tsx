import { useEffect, useMemo, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { COMMANDS, COMMAND_BY_ID, COMMAND_CATEGORIES, categoryLabel } from "../lib/commands";
import { RESERVED, comboFromEvent, formatCombo, parseCombo, validCombo } from "../lib/keys";
import { matches } from "../lib/suggest";
import { useT } from "../i18n";
import { shortcutRecorder } from "./useShortcuts";


/**
 * Runde 5: Editor fuer eigene Tastenkuerzel. Jeder Befehl der zentralen Liste kann bis zu 4 Kombinationen
 * haben. Aufnahme per Tastendruck, Konflikterkennung, Zuruecksetzen; gespeichert in settings.shortcuts.
 */
export function ShortcutEditor({ query }: { query: string }) {
  const b = useBrowser();
  const { t, lang } = useT();
  const [rec, setRec] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null);
  const [conflict, setConflict] = useState<{ id: string; combo: string; other: string } | null>(null);

  useEffect(() => {
    if (!rec) return;
    shortcutRecorder.active = true;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setRec(null); return; }
      const combo = comboFromEvent(e);
      if (!combo) return; // nur Modifier gedrueckt – weiter warten
      if (RESERVED.has(combo)) { setMsg({ id: rec, text: t("sc.reserved", { combo: formatCombo(combo) }) }); setRec(null); return; }
      if (!validCombo(combo)) { setMsg({ id: rec, text: t("sc.invalid", { combo: formatCombo(combo) }) }); setRec(null); return; }
      const cur = b.keysFor(rec);
      if (cur.includes(combo)) { setRec(null); return; }
      const other = b.bindings.get(combo);
      if (other && other !== rec) { setConflict({ id: rec, combo, other }); setRec(null); return; }
      if (cur.length >= 4) { setMsg({ id: rec, text: t("sc.max") }); setRec(null); return; }
      b.setShortcut(rec, [...cur, combo]);
      const p = parseCombo(combo);
      setMsg(p && p.ctrl && p.alt ? { id: rec, text: t("sc.altgr") } : null);
      setRec(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { shortcutRecorder.active = false; window.removeEventListener("keydown", onKey, true); };
  }, [rec, b, t]);

  const resolveConflict = () => {
    if (!conflict) return;
    b.setShortcut(conflict.other, b.keysFor(conflict.other).filter(k => k !== conflict.combo));
    b.setShortcut(conflict.id, [...b.keysFor(conflict.id), conflict.combo].slice(0, 4));
    setConflict(null);
  };

  const q = query.trim();
  const list = useMemo(() => COMMANDS.filter(c => !q || matches(q, c.title, categoryLabel(c.category), ...b.keysFor(c.id).map(formatCombo))), [q, b, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = Object.keys(b.settings.shortcuts).length;

  return (
    <>
      <div className="setting">
        <div><strong>{t("sc.title")}</strong><small>{t("sc.desc")}</small></div>
        <button className="btn ghost" disabled={!changed} onClick={() => { if (confirm(t("sc.resetAllConfirm"))) b.updateSettings({ shortcuts: {} }); }}>{t("ps.resetAll")}</button>
      </div>
      {conflict && (
        <div className="banner info sc-conflict" role="alert">
          <span><strong>{formatCombo(conflict.combo)}</strong> {t("sc.conflict", { cmd: COMMAND_BY_ID.get(conflict.other)?.title ?? "" })}</span>
          <span className="spacer" />
          <button className="btn sm primary" onClick={resolveConflict}>{t("sc.takeOver", { cmd: COMMAND_BY_ID.get(conflict.id)?.title ?? "" })}</button>
          <button className="btn sm ghost" onClick={() => setConflict(null)}>{t("c.cancel")}</button>
        </div>
      )}
      {COMMAND_CATEGORIES.map(cat => {
        const rows = list.filter(c => c.category === cat);
        if (!rows.length) return null;
        return (
          <div key={cat} className="sc-group">
            <h3>{categoryLabel(cat)}</h3>
            {rows.map(c => {
              const keys = b.keysFor(c.id);
              const custom = c.id in b.settings.shortcuts;
              return (
                <div key={c.id} className={`sc-row${rec === c.id ? " recording" : ""}`}>
                  <span className="sc-title">{c.title}{custom && <span className="sc-mod" title={t("sc.changed")}>•</span>}</span>
                  <span className="sc-keys">
                    {keys.map(k => (
                      <span key={k} className="kbd-chip"><kbd>{formatCombo(k)}</kbd>
                        <button title={t("sc.removeKey")} aria-label={t("sc.removeKey")} onClick={() => b.setShortcut(c.id, keys.filter(x => x !== k))}>×</button></span>
                    ))}
                    {keys.length === 0 && rec !== c.id && <span className="muted small">–</span>}
                    {rec === c.id
                      ? <span className="kbd-chip rec">{t("sc.pressKeys")}</span>
                      : <button className="btn sm ghost" title={t("sc.record")} aria-label={t("sc.record")} disabled={keys.length >= 4} onClick={() => { setMsg(null); setConflict(null); setRec(c.id); }}>+</button>}
                    {custom && <button className="btn sm ghost" title={t("sc.restore")} onClick={() => b.setShortcut(c.id, null)}>{t("sc.default")}</button>}
                  </span>
                  {msg?.id === c.id && <span className="sc-msg small">{msg.text}</span>}
                </div>
              );
            })}
          </div>
        );
      })}
      {list.length === 0 && <div className="empty">{t("sc.noMatch")}</div>}
    </>
  );
}
