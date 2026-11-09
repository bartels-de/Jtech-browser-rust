import { useEffect, useRef } from "react";
import { BrowserProvider, useBrowser } from "./store/BrowserStore";
import { call } from "./lib/ipc";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { BookmarksBar } from "./components/BookmarksBar";
import { ContentArea } from "./components/ContentArea";
import { SplitBar } from "./components/SplitView";
import { useShortcuts } from "./components/useShortcuts";
import { FindBar } from "./components/FindBar";
import { CommandPalette } from "./components/CommandPalette";
import { PermissionBar } from "./components/PermissionBar";
import { FxLayer } from "./components/FxLayer";
import { UpdateBar } from "./components/UpdateBar";
import { IconWarn } from "./components/Icons";
import { useT } from "./i18n";
import "./styles/tokens.css";
import "./styles/app.css";

/**
 * Eine UI-Webview ueber das ganze Fenster. Rust legt die native Content-Webview
 * in das Rechteck rechts der Sidebar und unter dem Header (set_layout).
 */
function Shell() {
  const b = useBrowser();
  const { t } = useT();
  const sideRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  useShortcuts();
  // Vollbild: keine set_layout-Meldungen (versteckte Chrome wuerde 0-Masse melden); danach frisch melden.
  const fsRef = useRef(b.fullscreen);
  fsRef.current = b.fullscreen;
  // Split view payload for set_layout (Rust validates ids and clamps the ratio)
  const paneShown = (id: string) => { const t = b.tabs.find(x => x.id === id); return !!t && !t.internal && !t.sleeping; };
  const split = b.splitActive && b.split ? { a: b.split.a, b: b.split.b, ratio: b.splitRatio, vertical: b.splitVertical, showA: paneShown(b.split.a), showB: paneShown(b.split.b) } : null;
  const splitRef = useRef(split);
  splitRef.current = split;
  const splitSig = JSON.stringify(split);

  useEffect(() => {
    const report = () => {
      const s = sideRef.current, h = headRef.current;
      if (!s || !h || fsRef.current) return;
      const sidebarWidth = Math.ceil(s.getBoundingClientRect().width);
      const topHeight = Math.ceil(h.getBoundingClientRect().bottom);
      call("set_layout", { topHeight, sidebarWidth, split: splitRef.current }, b.setStatus);
    };
    report();
    // Sidebar drag: rAF-throttled and final reports
    window.addEventListener("jtech:layout", report);
    const ro = new ResizeObserver(report);
    if (sideRef.current) ro.observe(sideRef.current);
    if (headRef.current) ro.observe(headRef.current);
    return () => { ro.disconnect(); window.removeEventListener("jtech:layout", report); };
  }, [b.setStatus]);
  useEffect(() => { if (!b.fullscreen) window.dispatchEvent(new Event("jtech:layout")); }, [b.fullscreen]);
  useEffect(() => { window.dispatchEvent(new Event("jtech:layout")); }, [splitSig]);

  const err = b.navError && b.navError.tabId === b.activeTab?.id && !b.activePage ? b.navError : null;

  return (
    <div className={b.fullscreen ? "shell is-fullscreen" : "shell"}>
      <FxLayer />
      <Sidebar ref={sideRef} />
      <div className="main-col">
        <div className="header" ref={headRef}>
          <Toolbar />
          <SplitBar />
          <BookmarksBar />
          <FindBar />
          <PermissionBar />
          <UpdateBar />
          {err && (
            <div className="banner error" role="alert">
              <IconWarn size={16} className="banner-icon" />
              <strong>{t("app.loadFailed")}</strong>
              <span className="mono">{err.url}</span>
              <span className="muted">{err.message}</span>
              <span className="spacer" />
              <button className="btn" onClick={b.reload}>{t("app.reload")}</button>
              <button className="btn ghost" onClick={b.dismissError}>{t("c.close")}</button>
            </div>
          )}
          {b.status && !err && (
            <button type="button" className="banner info" onClick={() => b.setStatus("")} title={t("app.clickToHide")} role="status">{b.status}</button>
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
