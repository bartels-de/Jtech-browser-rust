import { useEffect, useRef, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { COMMAND_BY_ID } from "../lib/commands";
import { normalizeRadial } from "../store/types";
import { CommandIcon } from "./CommandIcon";
import { useT } from "../i18n";
import { peekStore } from "../lib/bridge";

const R = 92;        // slot ring radius
const DEAD = 28;     // no selection inside this radius
const SIZE = 264;

/** Opens the radial menu at a window position (logical px). Used by the page bridge and the shortcut. */
export function openRadialAt(x: number, y: number, source: "mouse" | "keyboard") {
  window.dispatchEvent(new CustomEvent("jtech:radial-open", { detail: { x, y, source } }));
}

/**
 * Radial menu. Native content webviews are drawn above React, so the menu hides them while open
 * (store.overlay) and renders over the whole window. Choose by direction + release, click, or
 * 1-8 keys; Esc or a click outside cancels.
 */
export function RadialMenu() {
  const b = useBrowser();
  const { t } = useT();
  const cfg = normalizeRadial(b.settings.radial, id => COMMAND_BY_ID.has(id));
  const [pos, setPos] = useState<{ x: number; y: number; at: number } | null>(null);
  const [hover, setHover] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const setOverlay = b.setOverlay;
  const doneRef = useRef(false);

  useEffect(() => {
    const open = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number; source: "mouse" | "keyboard" }>).detail;
      const c = cfgRef.current;
      if (!c.enabled) return;
      if (d.source === "mouse" && c.trigger === "keyboard") return;
      if (d.source === "keyboard" && c.trigger === "mouse") return;
      const m = SIZE / 2 + 8;
      const x = Math.min(window.innerWidth - m, Math.max(m, d.x)), y = Math.min(window.innerHeight - m, Math.max(m, d.y));
      setHover(-1);
      doneRef.current = false;
      setPos({ x, y, at: Date.now() });
      setOverlay(true);
    };
    const kb = () => {
      const el = document.querySelector(".main-col .content, .main-col .split-wrap") ?? document.querySelector(".main-col");
      const r = el?.getBoundingClientRect();
      openRadialAt(r ? r.left + r.width / 2 : window.innerWidth / 2, r ? r.top + r.height / 2 : window.innerHeight / 2, "keyboard");
    };
    window.addEventListener("jtech:radial-open", open);
    window.addEventListener("jtech:radial", kb);
    return () => { window.removeEventListener("jtech:radial-open", open); window.removeEventListener("jtech:radial", kb); };
  }, [setOverlay]);

  useEffect(() => { if (pos) boxRef.current?.focus(); }, [pos]);

  if (!pos) return null;
  const slots = cfg.slots;
  const n = slots.length;
  const close = () => { setPos(null); setOverlay(peekStore.get().open); };
  const choose = (i: number) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const id = slots[i];
    close();
    // let the webview come back first, then run the command
    if (id) setTimeout(() => b.runCommand(id), 30);
  };
  const angleOf = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const pick = (cx: number, cy: number) => {
    const dx = cx - pos.x, dy = cy - pos.y;
    if (Math.hypot(dx, dy) < DEAD) return -1;
    let a = Math.atan2(dy, dx) + Math.PI / 2;
    if (a < 0) a += Math.PI * 2;
    return Math.round(a / (Math.PI * 2 / n)) % n;
  };

  return (
    <div className="radial-backdrop" ref={boxRef} tabIndex={-1} role="menu" aria-label={t("rad.title")}
      onMouseMove={e => setHover(pick(e.clientX, e.clientY))}
      onMouseUp={e => { if (Date.now() - pos.at > 180 && e.button !== 2) { const i = pick(e.clientX, e.clientY); if (i >= 0) choose(i); } }}
      onMouseDown={e => { if (e.button === 0 && pick(e.clientX, e.clientY) < 0 && Math.hypot(e.clientX - pos.x, e.clientY - pos.y) > SIZE / 2) close(); }}
      onContextMenu={e => { e.preventDefault(); close(); }}
      onKeyDown={e => {
        if (e.key === "Escape") { e.preventDefault(); close(); return; }
        const k = Number(e.key);
        if (k >= 1 && k <= n) { e.preventDefault(); choose(k - 1); }
        if (e.key === "Enter" && hover >= 0) choose(hover);
      }}>
      <div className="radial" style={{ left: pos.x - SIZE / 2, top: pos.y - SIZE / 2, width: SIZE, height: SIZE }}>
        <div className="radial-center">{hover >= 0 ? COMMAND_BY_ID.get(slots[hover])?.title : t("rad.hint")}</div>
        {slots.map((id, i) => {
          const a = angleOf(i);
          const c = COMMAND_BY_ID.get(id);
          const enabled = !c?.when || c.when(b);
          return (
            <button key={id + i} role="menuitem" className={`radial-slot${hover === i ? " on" : ""}${enabled ? "" : " off"}`}
              style={{ left: SIZE / 2 + Math.cos(a) * R - 26, top: SIZE / 2 + Math.sin(a) * R - 26 }}
              title={c?.title} aria-label={c?.title} onClick={() => choose(i)}>
              <CommandIcon id={id} size={20} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
