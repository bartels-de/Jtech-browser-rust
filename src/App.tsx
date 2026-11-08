import { useEffect, useRef } from "react";
import { BrowserProvider, useBrowser } from "./store/BrowserStore";
import { call } from "./lib/ipc";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { BookmarksBar } from "./components/BookmarksBar";
import { ContentArea } from "./components/ContentArea";
import { useShortcuts } from "./components/useShortcuts";
import { FindBar } from "./components/FindBar";
import { CommandPalette } from "./components/CommandPalette";
import { PermissionBar } from "./components/PermissionBar";
import { FxLayer } from "./components/FxLayer";
import { UpdateBar } from "./components/UpdateBar";
import { IconWarn } from "./components/Icons";
import "./styles/tokens.css";
import "./styles/app.css";

/**
 * Eine UI-Webview ueber das ganze Fenster. Rust legt die native Content-Webview
 * in das Rechteck rechts der Sidebar und unter dem Header (set_layout).
 */
function Shell() {
  const b = useBrowser();
  const sideRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  useShortcuts();

  useEffect(() => {
    const report = () => {
      const s = sideRef.current, h = headRef.current;
      if (!s || !h) return;
      const sidebarWidth = Math.ceil(s.getBoundingClientRect().width);
      const topHeight = Math.ceil(h.getBoundingClientRect().bottom);
      call("set_layout", { topHeight, sidebarWidth }, b.setStatus);
    };
    report();
    // Sidebar drag: rAF-throttled and final reports
    window.addEventListener("jtech:layout", report);
    const ro = new ResizeObserver(report);
    if (sideRef.current) ro.observe(sideRef.current);
    if (headRef.current) ro.observe(headRef.current);
    return () => { ro.disconnect(); window.removeEventListener("jtech:layout", report); };
  }, [b.setStatus]);

  const err = b.navError && b.navError.tabId === b.activeTab?.id && !b.activePage ? b.navError : null;

  return (
    <div className="shell">
      <FxLayer />
      <Sidebar ref={sideRef} />
      <div className="main-col">
        <div className="header" ref={headRef}>
          <Toolbar />
          <BookmarksBar />
          <FindBar />
          <PermissionBar />
          <UpdateBar />
          {err && (
            <div className="banner error" role="alert">
              <IconWarn size={16} className="banner-icon" />
              <strong>Seite konnte nicht geladen werden</strong>
              <span className="mono">{err.url}</span>
              <span className="muted">{err.message}</span>
              <span className="spacer" />
              <button className="btn" onClick={b.reload}>Neu laden</button>
              <button className="btn ghost" onClick={b.dismissError}>Schließen</button>
            </div>
          )}
          {b.status && !err && (
            <button type="button" className="banner info" onClick={() => b.setStatus("")} title="Klicken zum Ausblenden" role="status">{b.status}</button>
          )}
        </div>
        <ContentArea />
      </div>
      <CommandPalette />
    </div>
  );
}

export default function App() {
  return <BrowserProvider><Shell /></BrowserProvider>;
}
