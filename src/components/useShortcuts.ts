import { useEffect, useRef } from "react";
import { useBrowser } from "../store/BrowserStore";
import { comboFromEvent } from "../lib/keys";

/** Runde 5: solange der Kuerzel-Editor eine Taste aufnimmt, werden Kuerzel nicht ausgefuehrt. */
export const shortcutRecorder = { active: false };
const UI_BLOCK = new Set(["f5", "ctrl+r", "ctrl+shift+r", "shift+f5", "ctrl+f5", "ctrl+p", "ctrl+shift+p", "ctrl+f", "f3", "shift+f3", "ctrl+g", "ctrl+plus", "ctrl+minus", "ctrl+0", "ctrl+u", "ctrl+s", "ctrl+o", "ctrl+n", "ctrl+shift+n", "ctrl+j", "ctrl+h", "ctrl+d", "alt+left", "alt+right", "f7", "ctrl+w", "ctrl+t"]);

/**
 * Tastenkuerzel der UI-Webview. Hat die Webseite (native WebView2) den Fokus, erreichen die Tasten
 * React nicht – dann leitet Rust die belegten Kombinationen per AcceleratorKeyPressed als
 * "shortcut"-Event weiter. Beide Wege laufen ueber b.runShortcut -> zentrale Befehlsliste (lib/commands.ts).
 * Nicht belegte Kombinationen (z. B. Strg+A im Eingabefeld) bleiben unberuehrt.
 */
export function useShortcuts() {
  const b = useBrowser();
  const ref = useRef(b);
  ref.current = b;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutRecorder.active) return;
      const key = comboFromEvent(e);
      if (!key) return;
      const bound = ref.current.bindings.has(key) || (key.endsWith("+shift+plus") && ref.current.bindings.has(key.replace("+shift+plus", "+plus")));
      if (!bound) {
        // Browser-Standardkuerzel der UI-Webview nie durchlassen (sonst laedt z. B. F5 die ganze Oberflaeche neu),
        // auch wenn der Nutzer das Kuerzel entfernt hat. Eingabefelder behalten Strg+A/C/V usw.
        if (UI_BLOCK.has(key)) e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      ref.current.runShortcut(key);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
