import { useBrowser } from "../store/BrowserStore";
import { Favicon } from "./Favicon";

export function BookmarksBar() {
  const b = useBrowser();
  if (!b.settings.showBookmarksBar) return null;
  return (
    <div className="bookmarks-bar">
      {b.bookmarks.length === 0 && <span className="muted small">Lesezeichen mit dem Stern oder Strg+D hinzufügen</span>}
      {b.bookmarks.map(bm => (
        <button key={bm.id} className="bm-chip" title={bm.url}
          onClick={e => (e.ctrlKey ? b.newTab(bm.url) : b.navigate(bm.url))}
          onAuxClick={e => { if (e.button === 1) b.newTab(bm.url); }}>
          <Favicon url={bm.url} size={14} /><span>{bm.title}</span>
        </button>
      ))}
      <span className="spacer" />
      <button className="bm-chip subtle" onClick={() => b.openPage("bookmarks")}>Alle Lesezeichen</button>
    </div>
  );
}
