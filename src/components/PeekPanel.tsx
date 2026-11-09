import { useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBrowser } from "../store/BrowserStore";
import { call } from "../lib/ipc";
import { peekStore } from "../lib/bridge";
import { hostOf } from "../lib/urls";
import { IconClose, IconForward, IconGlobe } from "./Icons";
import { useT } from "../i18n";

const HEAD = 46;

/** Opens a link in the peek panel (page bridge Shift+click, context menus). */
export function openPeek(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  peekStore.set({ open: true, url, title: "" });
}

/** Rectangle of the peek webview (logical px) inside the content area; the frame header sits above it. */
function peekRect() {
  const main = document.querySelector(".main-col")?.getBoundingClientRect();
  const head = document.querySelector(".main-col .header")?.getBoundingClientRect();
  const left = main?.left ?? 0, top = head?.bottom ?? 72;
  const w = (main?.width ?? window.innerWidth), h = window.innerHeight - top;
  const pw = Math.min(1180, Math.max(320, w * 0.84)), ph = Math.max(200, h - HEAD - 48);
  return { x: Math.round(left + (w - pw) / 2), y: Math.round(top + 16 + HEAD), w: Math.round(pw), h: Math.round(ph) };
}

/**
 * Peek panel: a second native WebView2 (Rust peek.rs) centered over the content area. While it is
 * open the page underneath is hidden (native webviews cannot be dimmed with CSS) and React draws a
 * dimmed backdrop plus the frame header above the peek rectangle.
 */
export function PeekPanel() {
  const b = useBrowser();
  const { t } = useT();
  const peek = peekStore.use();
  const setOverlay = b.setOverlay;
  const openedUrl = useRef("");

  const close = useCallback(() => {
    openedUrl.current = "";
    peekStore.set({ open: false, url: "", title: "" });
    call("peek_close");
  }, []);

  // open / navigate
  useEffect(() => {
    if (!peek.open) { setOverlay(false); return; }
    setOverlay(true);
    if (openedUrl.current === peek.url) return;
    openedUrl.current = peek.url;
    const r = peekRect();
    call("peek_open", { url: peek.url, ...r }, b.setStatus);
  }, [peek.open, peek.url, setOverlay, b.setStatus]);

  // follow layout changes and menus (popover = menu over the content -> hide the native peek)
  const visible = peek.open && b.popover === null && !b.fullscreen;
  useEffect(() => {
    if (!peek.open) return;
    const upd = () => call("peek_bounds", { ...peekRect(), visible });
    upd();
    window.addEventListener("resize", upd);
    window.addEventListener("jtech:layout", upd);
    return () => { window.removeEventListener("resize", upd); window.removeEventListener("jtech:layout", upd); };
  }, [peek.open, visible]);

  // events from the peek webview
  useEffect(() => {
    const un = listen<{ kind: string; value?: string | null }>("peek-event", ({ payload }) => {
      if (payload.kind === "escape") close();
      else if (payload.kind === "title") peekStore.set(p => ({ ...p, title: payload.value ?? "" }));
      else if (payload.kind === "url" && payload.value) { openedUrl.current = payload.value; peekStore.set(p => ({ ...p, url: payload.value! })); }
      else if (payload.kind === "open-tab" && payload.value) b.newTab(payload.value);
    });
    return () => { un.then(f => f()); };
  }, [close, b.newTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // tab switch closes the panel
  const activeId = b.activeTab?.id;
  useEffect(() => { if (peekStore.get().open) close(); }, [activeId, close]);

  useEffect(() => {
    if (!peek.open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [peek.open, close]);

  if (!peek.open) return null;
  const r = peekRect();
  const promote = () => { const u = peek.url; close(); b.newTab(u); };
  return (
    <div className="peek-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="peek-frame" style={{ left: r.x - 1, top: r.y - HEAD, width: r.w + 2, height: r.h + HEAD + 1 }} role="dialog" aria-label={t("peek.title")}>
        <header className="peek-head">
          <IconGlobe size={15} />
          <div className="peek-titles">
            <strong title={peek.title || peek.url}>{peek.title || hostOf(peek.url)}</strong>
            <small className="mono" title={peek.url}>{peek.url}</small>
          </div>
          <button className="btn sm" onClick={promote}><IconForward size={14} /> {t("peek.promote")}</button>
          <button className="icon-btn" onClick={close} title={t("peek.close")} aria-label={t("peek.close")}><IconClose size={15} /></button>
        </header>
      </div>
    </div>
  );
}
