/**
 * Runde 5: Tastenkombinationen in kanonischer Schreibweise, z. B. "ctrl+shift+t", "alt+left", "f5".
 * Reihenfolge der Modifier: ctrl, alt, shift. Muss zu combo_name()/valid_combo() in src-tauri/src/lib.rs passen.
 */
export const KEY_NAMES = [
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  ..."0123456789".split(""),
  ...Array.from({ length: 24 }, (_, i) => `f${i + 1}`),
  "tab", "left", "right", "up", "down", "comma", "period", "plus", "minus",
  "home", "end", "pageup", "pagedown", "insert", "delete", "space", "enter", "backspace",
] as const;
const KEY_SET = new Set<string>(KEY_NAMES);

/** Kombinationen, die nie belegt werden duerfen (Kopieren/Einfuegen in Seiten, Fenster schliessen). */
export const RESERVED = new Set(["ctrl+c", "ctrl+v", "ctrl+x", "ctrl+a", "ctrl+z", "ctrl+y", "alt+f4", "ctrl+alt+delete"]);

export function parseCombo(s: string): { ctrl: boolean; alt: boolean; shift: boolean; key: string } | null {
  if (typeof s !== "string" || s.length > 40) return null;
  const parts = s.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  if (!KEY_SET.has(key)) return null;
  const mods = new Set(parts);
  if (mods.size !== parts.length || [...mods].some(m => m !== "ctrl" && m !== "alt" && m !== "shift")) return null;
  return { ctrl: mods.has("ctrl"), alt: mods.has("alt"), shift: mods.has("shift"), key };
}

export function buildCombo(c: { ctrl: boolean; alt: boolean; shift: boolean; key: string }): string {
  return [c.ctrl && "ctrl", c.alt && "alt", c.shift && "shift", c.key].filter(Boolean).join("+");
}

/** Gueltig = bekannte Taste + (Strg oder Alt) oder Funktionstaste; nicht reserviert; kanonische Reihenfolge. */
export function validCombo(s: string): boolean {
  const c = parseCombo(s);
  if (!c) return false;
  if (!(c.ctrl || c.alt || /^f\d+$/.test(c.key))) return false;
  if (RESERVED.has(s)) return false;
  return buildCombo(c) === s;
}

/** Tastendruck in der UI-Webview -> kanonischer Name (oder null bei reinen Modifier-Tasten). */
export function comboFromEvent(e: KeyboardEvent): string | null {
  const k = e.key;
  let key: string | null = null;
  if (/^F([1-9]|1\d|2[0-4])$/.test(k)) key = k.toLowerCase();
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code)) key = e.code.slice(6);
  else if (e.code === "NumpadAdd" || k === "+" || k === "=") key = "plus";
  else if (e.code === "NumpadSubtract" || k === "-" || k === "_") key = "minus";
  else if (k === "," || k === ";" || e.code === "Comma") key = "comma";
  else if (k === "." || k === ":" || e.code === "Period") key = "period";
  else if (k.length === 1 && /[a-z]/i.test(k)) key = k.toLowerCase();
  else if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else {
    const map: Record<string, string> = {
      Tab: "tab", ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Home: "home", End: "end",
      PageUp: "pageup", PageDown: "pagedown", Insert: "insert", Delete: "delete", " ": "space", Enter: "enter", Backspace: "backspace",
    };
    key = map[k] ?? null;
  }
  if (!key) return null;
  return buildCombo({ ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, key });
}

const KEY_LABEL: Record<string, string> = {
  left: "←", right: "→", up: "↑", down: "↓", comma: ",", period: ".", plus: "+", minus: "−", tab: "Tab",
  home: "Pos1", end: "Ende", pageup: "Bild↑", pagedown: "Bild↓", insert: "Einfg", delete: "Entf", space: "Leertaste", enter: "Enter", backspace: "Rücktaste",
};
/** Anzeige auf Deutsch, z. B. "Strg+Umschalt+T". */
export function formatCombo(s: string): string {
  const c = parseCombo(s);
  if (!c) return s;
  const key = KEY_LABEL[c.key] ?? c.key.toUpperCase();
  return [c.ctrl && "Strg", c.alt && "Alt", c.shift && "Umschalt", key].filter(Boolean).join("+");
}
