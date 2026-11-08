import { useEffect, useMemo, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { COMMANDS, COMMAND_BY_ID, type CommandCategory } from "../lib/commands";
import { RESERVED, comboFromEvent, formatCombo, parseCombo, validCombo } from "../lib/keys";
import { matches } from "../lib/suggest";
import { shortcutRecorder } from "./useShortcuts";

const CATS: CommandCategory[] = ["Tabs", "Navigation", "Seite", "Öffnen", "Ansicht"];

/**
 * Runde 5: Editor fuer eigene Tastenkuerzel. Jeder Befehl der zentralen Liste kann bis zu 4 Kombinationen
 * haben. Aufnahme per Tastendruck, Konflikterkennung, Zuruecksetzen; gespeichert in settings.shortcuts.
 */
export function ShortcutEditor({ query }: { query: string }) {
  const b = useBrowser();
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
      if (RESERVED.has(combo)) { setMsg({ id: rec, text: `${formatCombo(combo)} ist reserviert (Kopieren/Einfügen/Fenster).` }); setRec(null); return; }
      if (!validCombo(combo)) { setMsg({ id: rec, text: `${formatCombo(combo)} geht nicht – Kürzel brauchen Strg oder Alt (oder eine F-Taste), sonst würde normales Tippen auf Webseiten gestört.` }); setRec(null); return; }
      const cur = b.keysFor(rec);
      if (cur.includes(combo)) { setRec(null); return; }
      const other = b.bindings.get(combo);
      if (other && other !== rec) { setConflict({ id: rec, combo, other }); setRec(null); return; }
      if (cur.length >= 4) { setMsg({ id: rec, text: "Höchstens 4 Kürzel je Befehl." }); setRec(null); return; }
      b.setShortcut(rec, [...cur, combo]);
      const p = parseCombo(combo);
      setMsg(p && p.ctrl && p.alt ? { id: rec, text: "Hinweis: Strg+Alt entspricht AltGr – auf deutschen Tastaturen kann das Zeichen wie @ oder € auf Webseiten blockieren." } : null);
      setRec(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { shortcutRecorder.active = false; window.removeEventListener("keydown", onKey, true); };
  }, [rec, b]);

  const resolveConflict = () => {
    if (!conflict) return;
    b.setShortcut(conflict.other, b.keysFor(conflict.other).filter(k => k !== conflict.combo));
    b.setShortcut(conflict.id, [...b.keysFor(conflict.id), conflict.combo].slice(0, 4));
    setConflict(null);
  };

  const q = query.trim();
  const list = useMemo(() => COMMANDS.filter(c => !q || matches(q, c.title, c.category, ...b.keysFor(c.id).map(formatCombo))), [q, b]);
  const changed = Object.keys(b.settings.shortcuts).length;

  return (
    <>
      <div className="setting">
        <div><strong>Eigene Tastenkürzel</strong><small>Klick auf „+“ und gewünschte Tasten drücken (Esc bricht ab). Gilt in der Oberfläche und auf Webseiten; nur belegte Kombinationen werden der Webseite weggenommen.</small></div>
        <button className="btn ghost" disabled={!changed} onClick={() => { if (confirm("Alle Tastenkürzel auf Standard zurücksetzen?")) b.updateSettings({ shortcuts: {} }); }}>Alle zurücksetzen</button>
      </div>
      {conflict && (
        <div className="banner info sc-conflict" role="alert">
          <span><strong>{formatCombo(conflict.combo)}</strong> ist bereits „{COMMAND_BY_ID.get(conflict.other)?.title}“ zugewiesen.</span>
          <span className="spacer" />
          <button className="btn sm primary" onClick={resolveConflict}>Für „{COMMAND_BY_ID.get(conflict.id)?.title}“ übernehmen</button>
          <button className="btn sm ghost" onClick={() => setConflict(null)}>Abbrechen</button>
        </div>
      )}
      {CATS.map(cat => {
        const rows = list.filter(c => c.category === cat);
        if (!rows.length) return null;
        return (
          <div key={cat} className="sc-group">
            <h3>{cat}</h3>
            {rows.map(c => {
              const keys = b.keysFor(c.id);
              const custom = c.id in b.settings.shortcuts;
              return (
                <div key={c.id} className={`sc-row${rec === c.id ? " recording" : ""}`}>
                  <span className="sc-title">{c.title}{custom && <span className="sc-mod" title="geändert">•</span>}</span>
                  <span className="sc-keys">
                    {keys.map(k => (
                      <span key={k} className="kbd-chip"><kbd>{formatCombo(k)}</kbd>
                        <button title="Kürzel entfernen" onClick={() => b.setShortcut(c.id, keys.filter(x => x !== k))}>×</button></span>
                    ))}
                    {keys.length === 0 && rec !== c.id && <span className="muted small">–</span>}
                    {rec === c.id
                      ? <span className="kbd-chip rec">Tasten drücken …</span>
                      : <button className="btn sm ghost" title="Kürzel aufnehmen" disabled={keys.length >= 4} onClick={() => { setMsg(null); setConflict(null); setRec(c.id); }}>+</button>}
                    {custom && <button className="btn sm ghost" title="Standard wiederherstellen" onClick={() => b.setShortcut(c.id, null)}>Standard</button>}
                  </span>
                  {msg?.id === c.id && <span className="sc-msg small">{msg.text}</span>}
                </div>
              );
            })}
          </div>
        );
      })}
      {list.length === 0 && <div className="empty">Kein Befehl passt zur Suche.</div>}
    </>
  );
}
