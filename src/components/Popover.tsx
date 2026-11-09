import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Schwebendes Panel. Solange es offen ist, ist die native Content-Webview versteckt (siehe Store). */
const EDGE = 8;

/**
 * `at`: Kontextmenue an Mausposition. Wird nach dem Rendern vermessen und bei Platzmangel
 * nach links/oben gespiegelt bzw. in das Fenster geklemmt. Die Content-Webview ist waehrend
 * jedes Popovers versteckt (Store), das Menue liegt also nie darunter.
 */
export function Popover({ open, onClose, children, className = "", style, at, label }: {
  open: boolean; onClose(): void; children: ReactNode; className?: string; style?: React.CSSProperties;
  at?: { x: number; y: number }; label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !at || !ref.current) { setPos(null); return; }
    const r = ref.current.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    let left = at.x + r.width + EDGE > W ? at.x - r.width : at.x;
    let top = at.y + r.height + EDGE > H ? at.y - r.height : at.y;
    left = Math.max(EDGE, Math.min(left, W - r.width - EDGE));
    top = Math.max(EDGE, Math.min(top, H - r.height - EDGE));
    setPos({ left, top });
  }, [open, at?.x, at?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tastatur: erstes Element fokussieren, Pfeiltasten wandern durch die Eintraege.
  useEffect(() => {
    if (!open || !ref.current) return;
    const first = ref.current.querySelector<HTMLElement>("input, .menu-item");
    if (first && !ref.current.contains(document.activeElement)) first.focus({ preventScroll: true });
  }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(".menu-item:not(:disabled)") ?? [])];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const n = e.key === "ArrowDown" ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
    items[n].focus();
  };
  useEffect(() => {
    if (!open) return;
    // Runde 5: Klick auf den eigenen Umschalt-Knopf (data-pop-toggle) schliesst NICHT hier – der Knopf
    // schaltet selbst um. Sonst wuerde mousedown schliessen und der folgende click sofort wieder oeffnen.
    const down = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!ref.current || ref.current.contains(t as Node)) return;
      if (t && typeof t.closest === "function" && t.closest("[data-pop-toggle]")) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const t = setTimeout(() => document.addEventListener("mousedown", down), 0);
    document.addEventListener("keydown", key);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open, onClose]);
  if (!open) return null;
  const placed: React.CSSProperties | undefined = at
    ? { ...style, left: pos?.left ?? at.x, top: pos?.top ?? at.y, visibility: pos ? undefined : "hidden" }
    : style;
  return <div ref={ref} className={`popover glass ${className}`} style={placed} role={at ? "menu" : "dialog"} aria-label={label} onKeyDown={onKey}>{children}</div>;
}

export function MenuItem({ icon, label, hint, onClick, danger, disabled }: { icon?: ReactNode; label: string; hint?: string; onClick(): void; danger?: boolean; disabled?: boolean }) {
  return (
    <button className={`menu-item${danger ? " danger" : ""}`} role="menuitem" onClick={onClick} disabled={disabled}>
      <span className="menu-icon">{icon}</span>
      <span className="menu-label">{label}</span>
      {hint && <kbd className="menu-hint">{hint}</kbd>}
    </button>
  );
}
