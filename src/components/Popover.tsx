import { useEffect, useRef, type ReactNode } from "react";

/** Schwebendes Panel. Solange es offen ist, ist die native Content-Webview versteckt (siehe Store). */
export function Popover({ open, onClose, children, className = "", style }: {
  open: boolean; onClose(): void; children: ReactNode; className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
  return <div ref={ref} className={`popover glass ${className}`} style={style} role="dialog">{children}</div>;
}

export function MenuItem({ icon, label, hint, onClick, danger }: { icon?: ReactNode; label: string; hint?: string; onClick(): void; danger?: boolean }) {
  return (
    <button className={`menu-item${danger ? " danger" : ""}`} onClick={onClick}>
      <span className="menu-icon">{icon}</span>
      <span className="menu-label">{label}</span>
      {hint && <kbd className="menu-hint">{hint}</kbd>}
    </button>
  );
}
