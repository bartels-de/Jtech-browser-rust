import { createContext, useContext, type ReactNode } from "react";
import { matches } from "../lib/suggest";

/**
 * Gemeinsame Bausteine fuer Einstellungs-artige Seiten (Einstellungen, Datenschutz, Design-Studio):
 * Gruppe = Karte mit Titel/Beschreibung, Row = Bezeichnung + Hilfetext + Bedienelement.
 * Bei aktiver Suche (SearchCtx) werden nicht passende Zeilen ausgeblendet und Treffer markiert.
 */
export const SearchCtx = createContext<{ q: string; all: boolean }>({ q: "", all: true });

/** Markiert Vorkommen des Suchbegriffs im Text. */
export function Hl({ text }: { text: string }) {
  const { q } = useContext(SearchCtx);
  const needle = q.trim().toLowerCase();
  if (!needle || needle.length < 2) return <>{text}</>;
  const out: ReactNode[] = [];
  const low = text.toLowerCase();
  let i = 0, k = 0;
  for (;;) {
    const j = low.indexOf(needle, i);
    if (j < 0) break;
    if (j > i) out.push(text.slice(i, j));
    out.push(<mark key={k++} className="hl">{text.slice(j, j + needle.length)}</mark>);
    i = j + needle.length;
  }
  if (!out.length) return <>{text}</>;
  out.push(text.slice(i));
  return <>{out}</>;
}

export function Group({ title, desc, children, id, actions }: { title?: string; desc?: ReactNode; children: ReactNode; id?: string; actions?: ReactNode }) {
  return (
    <section className="card s-group" id={id}>
      {(title || actions) && (
        <header className="s-group-head">
          <div>{title && <h2><Hl text={title} /></h2>}{desc && <p className="s-group-desc">{desc}</p>}</div>
          {actions && <div className="s-group-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Row({ title, desc, keywords = "", col, children, htmlFor }: {
  title: string; desc?: ReactNode; keywords?: string; col?: boolean; children?: ReactNode; htmlFor?: string;
}) {
  const { q, all } = useContext(SearchCtx);
  if (q && !all && !matches(q, title, typeof desc === "string" ? desc : "", keywords)) return null;
  const Label = htmlFor ? "label" : "div";
  return (
    <div className={`setting${col ? " col" : ""}`}>
      <Label className="setting-text" {...(htmlFor ? { htmlFor } : {})}>
        <strong><Hl text={title} /></strong>
        {desc && <small>{typeof desc === "string" ? <Hl text={desc} /> : desc}</small>}
      </Label>
      {children && <div className="setting-ctl">{children}</div>}
    </div>
  );
}

export const Switch = ({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) =>
  <input type="checkbox" role="switch" className="switch" aria-label={label} checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />;

/** Aufklappbarer Bereich fuer technische Details. */
export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="disclosure">
      <summary>{summary}</summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
