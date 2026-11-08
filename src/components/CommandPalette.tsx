import { useEffect, useMemo, useRef, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { INTERNAL_PAGES, INTERNAL_TITLES, hostOf, internalUrl } from "../lib/urls";
import { matches, rankHistory, type Suggestion } from "../lib/suggest";
import { COMMANDS } from "../lib/commands";
import { IconSearch } from "./Icons";

/** Runde 3: Befehlspalette (Strg+K: alles, Strg+Umschalt+P oder ">" am Anfang: nur Befehle). */
export function CommandPalette() {
  const b = useBrowser();
  const open = b.popover === "palette";
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(b.paletteMode === "commands" ? "> " : ""); setSel(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open, b.paletteMode]);

  // Runde 5: Befehle kommen aus der zentralen Liste (gleiche Quelle wie die Tastenkuerzel).
  const commands = useMemo(() => COMMANDS.filter(c => !c.hidden && (!c.when || c.when(b))).map(c => ({ id: c.id, title: c.title, hint: b.keyHint(c.id), run: () => b.runCommand(c.id) })), [b]);

  const cmdOnly = q.trimStart().startsWith(">");
  const query = cmdOnly ? q.trimStart().slice(1).trim() : q.trim();
  const items: (Suggestion & { run(): void })[] = useMemo(() => {
    const out: (Suggestion & { run(): void })[] = [];
    for (const c of commands) if (matches(query, c.title, c.id)) out.push({ key: "c:" + c.id, kind: "command", title: c.title, hint: c.hint, run: c.run });
    if (cmdOnly) return out;
    for (const p of INTERNAL_PAGES) if (matches(query, INTERNAL_TITLES[p], internalUrl(p))) out.push({ key: "p:" + p, kind: "page", title: INTERNAL_TITLES[p], hint: internalUrl(p), run: () => b.openPage(p) });
    for (const x of b.tabs.filter(x => matches(query, x.title, x.url)).slice(0, 12)) out.push({ key: "t:" + x.id, kind: "tab", title: x.title || "Neuer Tab", hint: x.sleeping ? "schläft" : x.active ? "aktiv" : hostOf(x.url), run: () => b.switchTab(x.id) });
    if (query) {
      for (const m of b.bookmarks.filter(m => matches(query, m.title, m.url)).slice(0, 8)) out.push({ key: "b:" + m.id, kind: "bookmark", title: m.title, hint: hostOf(m.url), run: () => b.navigate(m.url) });
      for (const h of rankHistory(b.history, query, 10)) out.push({ key: "h:" + h.url, kind: "history", title: h.title || h.url, hint: hostOf(h.url), run: () => b.navigate(h.url) });
      out.push({ key: "go", kind: "go", title: `„${query}“ suchen oder öffnen`, run: () => b.navigate(query) });
    }
    return out.slice(0, 60);
  }, [commands, query, cmdOnly, b]);

  useEffect(() => { setSel(0); }, [q]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(".palette-item.on")?.scrollIntoView({ block: "nearest" }); }, [sel]);
  if (!open) return null;
  const close = () => b.setPopover(null);
  const pick = (i: number) => { const it = items[i]; if (!it) return; close(); it.run(); };
  const LABEL: Record<string, string> = { command: "Befehl", page: "Seite", tab: "Tab", bookmark: "Lesezeichen", history: "Verlauf", go: "", bang: "Bang" };

  return (
    <div className="palette-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="palette glass" role="dialog" aria-label="Befehlspalette">
        <div className="palette-input">
        <IconSearch size={17} />
        <input ref={inputRef} value={q} spellCheck={false} placeholder="Tabs, Lesezeichen, Verlauf oder Befehle suchen"
          role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={items[sel] ? `pal-${sel}` : undefined} aria-label="Befehlspalette durchsuchen"
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); pick(sel); }
            else if (e.key === "Escape") { e.preventDefault(); close(); }
          }} />
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.length === 0 && <div className="empty">Nichts gefunden. Mit „&gt;“ am Anfang werden nur Befehle durchsucht.</div>}
          {items.map((it, i) => (
            <button key={it.key} id={`pal-${i}`} role="option" aria-selected={i === sel} className={`palette-item${i === sel ? " on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => pick(i)}>
              <span className={`palette-kind k-${it.kind}`}>{LABEL[it.kind]}</span>
              <span className="palette-title">{it.title}</span>
              {it.hint && (it.kind === "command" ? <kbd className="palette-hint">{it.hint}</kbd> : <span className="palette-hint">{it.hint}</span>)}
            </button>
          ))}
        </div>
        <div className="palette-foot" aria-hidden>
          <span><kbd>↑</kbd><kbd>↓</kbd> auswählen</span>
          <span><kbd>Enter</kbd> öffnen</span>
          <span><kbd>&gt;</kbd> nur Befehle</span>
          <span><kbd>Esc</kbd> schließen</span>
        </div>
      </div>
    </div>
  );
}
