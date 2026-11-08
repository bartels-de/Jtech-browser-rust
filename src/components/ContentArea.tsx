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

/**
 * Bereich unter der Toolbar. Bei Webseiten liegt hier die native WebView2 DARUEBER.
 * Interne Seiten werden nur gerendert, wenn Rust die Content-Webview versteckt hat.
 */
export function ContentArea() {
  const b = useBrowser();
  const page = b.activePage;
  const { t } = useT();
  let body: React.ReactNode;
  switch (page) {
    case "newtab": body = <StartPage />; break;
    case "settings": body = <SettingsPage />; break;
    case "history": body = <HistoryPage />; break;
    case "bookmarks": body = <BookmarksPage />; break;
    case "privacy": body = <PrivacyPage />; break;
    case "downloads": body = <DownloadsPage />; break;
    case "themes": body = <ThemesPage />; break;
    case "audio": body = <AudioPage />; break;
    case "performance": body = <PerformancePage />; break;
    case "market": body = <MarketPage />; break;
    case "extensions": body = <ExtensionsPage />; break;
    default:
      // Webseite: sichtbar nur, wenn ein Menue die Webview kurz ausblendet
      body = <div className="content-placeholder"><span>{b.activeTab?.sleeping ? t("ca.waking", { title: b.activeTab.title }) : b.activeTab?.title}</span></div>;
  }
  return <main className="content" key={page ?? "web"}>{body}</main>;
}
