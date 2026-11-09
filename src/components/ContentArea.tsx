import { useBrowser } from "../store/BrowserStore";
import { StartPage } from "../pages/StartPage";
import { SettingsPage } from "../pages/SettingsPage";
import { HistoryPage } from "../pages/HistoryPage";
import { BookmarksPage } from "../pages/BookmarksPage";
import { PrivacyPage } from "../pages/PrivacyPage";
import { DownloadsPage } from "../pages/DownloadsPage";
import { ThemesPage } from "../pages/ThemesPage";
import { AudioPage } from "../pages/AudioPage";
import { PerformancePage } from "../pages/PerformancePage";
import { MarketPage } from "../pages/MarketPage";
import { useT } from "../i18n";
import { ExtensionsPage } from "../pages/ExtensionsPage";
import { SplitContent } from "./SplitView";
import type { InternalPage } from "../lib/urls";

/** Internal page component (also used inside a split-view pane). */
export function renderInternal(page: InternalPage): React.ReactNode | null {
  switch (page) {
    case "newtab": return <StartPage />;
    case "settings": return <SettingsPage />;
    case "history": return <HistoryPage />;
    case "bookmarks": return <BookmarksPage />;
    case "privacy": return <PrivacyPage />;
    case "downloads": return <DownloadsPage />;
    case "themes": return <ThemesPage />;
    case "audio": return <AudioPage />;
    case "performance": return <PerformancePage />;
    case "market": return <MarketPage />;
    case "extensions": return <ExtensionsPage />;
    default: return null;
  }
}

/**
 * Bereich unter der Toolbar. Bei Webseiten liegt hier die native WebView2 DARUEBER.
 * Interne Seiten werden nur gerendert, wenn Rust die Content-Webview versteckt hat.
 */
export function ContentArea() {
  const b = useBrowser();
  const page = b.activePage;
  const { t } = useT();
  if (b.splitActive && !b.fullscreen) return <SplitContent renderPage={tab => <div className="split-page" key={tab.internal ?? "web"}>{tab.internal ? renderInternal(tab.internal) : null}</div>} />;
  // Web page: visible only while a menu briefly hides the webview
  const body = (page ? renderInternal(page) : null)
    ?? <div className="content-placeholder"><span>{b.activeTab?.sleeping ? t("ca.waking", { title: b.activeTab.title }) : b.activeTab?.title}</span></div>;
  return <main className="content" key={page ?? "web"}>{body}</main>;
}
