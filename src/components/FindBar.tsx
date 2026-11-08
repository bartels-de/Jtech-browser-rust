import { useEffect, useRef, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { IconChevronDown, IconChevronUp, IconClose, IconSearch } from "./Icons";

/** Runde 3: Suchleiste (Strg+F). Liegt im Header – also ausserhalb des Content-Rechtecks. */
export function FindBar() {
  const b = useBrowser();
  const [q, setQ] = useState(b.find.query);
  const ref = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { if (b.find.open) { ref.current?.focus(); ref.current?.select(); } }, [b.find.open, b.find.tick]);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!b.find.open) return null;
  const run = (v: string) => { clearTimeout(timer.current); timer.current = setTimeout(() => b.findRun(v), 160); };
  return (
    <div className="find-bar" role="search">
      <IconSearch size={14} />
      <input ref={ref} value={q} maxLength={300} placeholder="Auf Seite suchen" aria-label="Auf Seite suchen" spellCheck={false}
        onChange={e => { setQ(e.target.value); run(e.target.value); }}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer.current); b.findRun(q, e.shiftKey); }
          else if (e.key === "Escape") { e.preventDefault(); b.closeFind(); }
        }} />
      <span className={`find-count${q && !b.find.count ? " none" : ""}`}>{q ? (b.find.count ? `${b.find.count >= 9999 ? "9999+" : b.find.count} Treffer` : "Keine Treffer") : ""}</span>
      <button className="icon-btn sm" title="Vorheriger (Umschalt+Enter / Umschalt+F3)" aria-label="Vorheriger Treffer" disabled={!q} onClick={() => b.findRun(q, true)}><IconChevronUp size={15} /></button>
      <button className="icon-btn sm" title="Nächster (Enter / F3)" aria-label="Nächster Treffer" disabled={!q} onClick={() => b.findRun(q, false)}><IconChevronDown size={15} /></button>
      <button className="icon-btn sm" title="Schließen (Esc)" aria-label="Suche schließen" onClick={b.closeFind}><IconClose size={13} /></button>
    </div>
  );
}
