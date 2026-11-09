import { useRef } from "react";
import { useBrowser } from "../store/BrowserStore";
import { SPLIT_GAP, type UiTab } from "../store/types";
import { Favicon } from "./Favicon";
import { IconClose, IconSplit, IconSplitRows, IconSwap } from "./Icons";
import { useT } from "../i18n";

/**
 * Split view: two tabs, each a native WebView2 (Rust split_bounds) or an internal page rendered
 * by React in the same rectangle. The divider lies in the gap between both webviews.
 */

/** Header strip while split view is shown: pane labels (focus), swap, orientation, end. */
export function SplitBar() {
  const b = useBrowser();
  const { t } = useT();
  if (!b.splitActive || !b.split) return null;
  const tabA = b.tabs.find(x => x.id === b.split!.a), tabB = b.tabs.find(x => x.id === b.split!.b);
  if (!tabA || !tabB) return null;
  const pane = (tab: UiTab, side: "a" | "b") => (
    <button type="button" className={`split-pane-label${tab.active ? " focused" : ""}`} aria-pressed={tab.active}
      style={b.splitVertical ? undefined : { flex: `0 0 calc((100% - ${SPLIT_GAP}px) * ${side === "a" ? b.splitRatio : 1 - b.splitRatio})` }}
      title={tab.active ? t("split.focused") : t("split.focus")} onClick={() => { if (!tab.active) b.switchTab(tab.id); }}>
      <Favicon url={tab.url} internal={!!tab.internal} size={14} />
      <span className="split-pane-title">{tab.title || t("c.newTab")}</span>
      {b.splitVertical && <span className="split-pane-pos">{side === "a" ? t("split.top") : t("split.bottom")}</span>}
    </button>
  );
  return (
    <div className="split-bar" role="toolbar" aria-label={t("split.title")}>
      <div className={`split-panes${b.splitVertical ? " vertical" : ""}`}>
        {pane(tabA, "a")}
        {!b.splitVertical && <span className="split-bar-gap" style={{ flex: `0 0 ${SPLIT_GAP}px` }} />}
        {pane(tabB, "b")}
      </div>
      <div className="split-actions">
        <button type="button" className="icon-btn sm" title={t("split.swap")} aria-label={t("split.swap")} onClick={b.swapSplit}><IconSwap size={15} /></button>
        <button type="button" className="icon-btn sm" title={b.splitVertical ? t("split.sideBySide") : t("split.stacked")} aria-label={b.splitVertical ? t("split.sideBySide") : t("split.stacked")}
          onClick={b.toggleSplitOrientation}>{b.splitVertical ? <IconSplit size={15} /> : <IconSplitRows size={15} />}</button>
        <button type="button" className="icon-btn sm" title={`${t("split.end")}${b.keyHint("view.split") ? ` (${b.keyHint("view.split")})` : ""}`} aria-label={t("split.end")} onClick={b.closeSplit}><IconClose size={15} /></button>
      </div>
    </div>
  );
}

/** Content area in split view: two pane rectangles plus the draggable divider in the gap. */
export function SplitContent({ renderPage }: { renderPage: (tab: UiTab) => React.ReactNode }) {
  const b = useBrowser();
  const { t } = useT();
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ raf: number; ratio: number } | null>(null);
  const tabA = b.tabs.find(x => x.id === b.split?.a), tabB = b.tabs.find(x => x.id === b.split?.b);
  if (!tabA || !tabB) return null;
  const vertical = b.splitVertical;

  const ratioAt = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return vertical ? (e.clientY - r.top - SPLIT_GAP / 2) / Math.max(1, r.height - SPLIT_GAP) : (e.clientX - r.left - SPLIT_GAP / 2) / Math.max(1, r.width - SPLIT_GAP);
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { raf: 0, ratio: b.splitRatio };
    // Native webviews are hidden while dragging so pointer events keep reaching the UI.
    b.setSplitDragging(true);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.ratio = ratioAt(e);
    if (d.raf) return;
    d.raf = requestAnimationFrame(() => { if (drag.current) { drag.current.raf = 0; b.setSplitRatio(drag.current.ratio, true); } });
  };
  const onEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.raf) cancelAnimationFrame(d.raf);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    b.setSplitRatio(d.ratio);
    b.setSplitDragging(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === (vertical ? "ArrowUp" : "ArrowLeft")) { e.preventDefault(); b.setSplitRatio(b.splitRatio - step); }
    else if (e.key === (vertical ? "ArrowDown" : "ArrowRight")) { e.preventDefault(); b.setSplitRatio(b.splitRatio + step); }
    else if (e.key === "Home" || e.key === "Enter") { e.preventDefault(); b.setSplitRatio(0.5); }
  };

  const pane = (tab: UiTab, share: number) => (
    <section className={`split-pane${tab.active ? " focused" : ""}`} aria-label={tab.title}
      style={{ flex: `0 0 calc((100% - ${SPLIT_GAP}px) * ${share})` }}
      onMouseDownCapture={() => { if (!tab.active) b.switchTab(tab.id); }}>
      {tab.internal && !b.splitDragging ? renderPage(tab)
        : <div className="content-placeholder"><span>{tab.sleeping ? t("ca.waking", { title: tab.title }) : tab.title}</span></div>}
    </section>
  );
  return (
    <main ref={ref} className={`content split${vertical ? " vertical" : ""}${b.splitDragging ? " dragging" : ""}`}>
      {pane(tabA, b.splitRatio)}
      <div className="split-divider" role="separator" tabIndex={0} aria-orientation={vertical ? "horizontal" : "vertical"}
        aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(b.splitRatio * 100)} aria-label={t("split.divider")} title={t("split.dividerTitle")}
        style={{ flex: `0 0 ${SPLIT_GAP}px` }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} onLostPointerCapture={onEnd}
        onDoubleClick={() => b.setSplitRatio(0.5)} onKeyDown={onKey} />
      {pane(tabB, 1 - b.splitRatio)}
    </main>
  );
}
