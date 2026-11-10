import { PageShell } from "../components/PageShell";
import { IconInfo, IconWarn } from "../components/Icons";
import { useBrowser } from "../store/BrowserStore";
import { useT } from "../i18n";

export function ActivityPage() {
  const b = useBrowser();
  const { t, fmtDate } = useT();
  return (
    <PageShell title={t("page.activity")} subtitle={t("activity.subtitle")}
      actions={<button className="btn ghost" disabled={!b.activity.length} onClick={b.clearActivity}>{t("activity.clear")}</button>}>
      {!b.activity.length ? <section className="card"><div className="empty"><IconInfo size={28} /><p>{t("activity.empty")}</p></div></section> :
        <section className="card activity-list" aria-live="polite">
          {b.activity.map(event => <article className="activity-row" key={event.id}>
            <span className="activity-icon"><IconWarn size={17} /></span>
            <div className="activity-main">
              <strong>{event.kind === "popup-blocked" ? t("activity.popupBlocked") : t("activity.unknownEvent")}</strong>
              <span>{reasonDescription(event.reason, t)}</span>
              {event.detail && <span className="muted">{event.detail}</span>}
              {event.tabTitle && <span className="muted">{t("activity.source", { title: event.tabTitle })}</span>}
              {event.url && <code className="activity-url" title={event.url}>{event.url}</code>}
            </div>
            <time className="muted small" dateTime={new Date(event.time).toISOString()}>{fmtDate(event.time, { hour: "2-digit", minute: "2-digit" })}</time>
            <button className="btn ghost sm" disabled={!b.tabs.some(tab => tab.id === event.tabId)} onClick={() => b.switchTab(event.tabId)}>{t("activity.openTab")}</button>
          </article>)}
        </section>}
    </PageShell>
  );
}

function reasonDescription(reason: string, t: ReturnType<typeof useT>["t"]): string {
  switch (reason) {
    case "non-user-initiated": return t("activity.popupReason.gesture");
    case "unsupported-scheme": return t("activity.popupReason.scheme");
    case "invalid-popup-url": return t("activity.popupReason.invalid");
    case "popup-window-failed": return t("activity.popupReason.window");
    default: return t("activity.popupReason.unknown");
  }
}
