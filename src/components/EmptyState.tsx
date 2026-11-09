import type { ReactNode } from "react";

/** Empty or "nothing found" state: icon, title, short text and an optional button. `compact` for use inside a section. */
export function EmptyState({ icon, title, text, action, compact, card }: {
  icon?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode; compact?: boolean; card?: boolean;
}) {
  return (
    <div className={`empty-state${compact ? " compact" : ""}${card ? " card" : ""}`} role="status">
      {icon && <span className="empty-state-icon" aria-hidden>{icon}</span>}
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
