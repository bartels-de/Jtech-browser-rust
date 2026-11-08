import { useBrowser } from "../store/BrowserStore";
import { DownloadList } from "../components/DownloadList";

/** Runde 3: echte Download-Verwaltung (WebView2 DownloadStarting, siehe docs/ROUND3.md). */
export function DownloadsPage() {
  const b = useBrowser();
  const running = b.downloads.filter(d => d.live && d.state === "progressing").length;
  return (
    <div className="page doc-page">
      <header className="page-head row">
        <div><h1>Downloads</h1><p className="muted">{running ? `${running} laufend` : "Alle Downloads landen im Windows-Download-Ordner."}</p></div>
        <button className="btn ghost" disabled={!b.downloads.some(d => d.state !== "progressing")} onClick={b.clearDownloads}>Liste leeren</button>
      </header>
      <section className="card list-card"><DownloadList /></section>
      <p className="muted small">Programme und Skripte (.exe, .msi, .bat, .ps1 …) werden nicht per Klick gestartet – „Im Ordner zeigen“ öffnet den Explorer. Downloads früherer Sitzungen können nur noch angezeigt werden.</p>
    </div>
  );
}
