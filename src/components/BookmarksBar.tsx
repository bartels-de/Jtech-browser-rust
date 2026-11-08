import { useBrowser } from "../store/BrowserStore";
import { Favicon } from "./Favicon";
import { IconBookmarks } from "./Icons";

/** Slim bookmarks row. Hidden when empty, switched off, or (optionally) outside the start page. */
export function BookmarksBar() {
  const b = useBrowser();
  const s = b.settings;
  if (!s.showBookmarksBar || b.bookmarks.length === 0) return null;
  if (s.bookmarksBarOnlyNewTab && b.activePage !== "newtab") return null;
  return (
    <div className="bookmarks-bar" role="toolbar" aria-label="Lesezeichenleiste">
      {b.bookmarks.map(bm => (
        <button key={bm.id} className="bm-chip" title={bm.url}
          onClick={e => (e.ctrlKey ? b.newTab(bm.url) : b.navigate(bm.url))}
          onAuxClick={e => { if (e.button === 1) b.newTab(bm.url); }}>
          <Favicon url={bm.url} size={14} /><span>{bm.title}</span>
        </button>
      ))}
      <span className="spacer" data-tauri-drag-region />
      <button className="bm-chip subtle" onClick={() => b.openPage("bookmarks")} title="Alle Lesezeichen"><IconBookmarks size={14} /><span>Alle</span></button>
    </div>
  );
}
