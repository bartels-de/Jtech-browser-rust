import type { ReactNode } from "react";

/**
 * Shared frame of the internal jtech:// pages (all except the start page and the settings grid):
 * title and subtitle on the left, actions on the right (one line, never wrapping), then the sections.
 */
export function PageShell({ title, subtitle, actions, sticky, className, children }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; sticky?: boolean; className?: string; children?: ReactNode;
}) {
  return (
    <div className={`page doc-page${className ? ` ${className}` : ""}`}>
      <header className={`page-head${sticky ? " page-head-sticky" : ""}`}>
        <div className="page-title">
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
