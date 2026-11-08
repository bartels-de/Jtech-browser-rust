import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { GROUP_COLORS, SIDEBAR_COMPACT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, type TabGroup, type UiTab } from "../store/types";
import { Favicon } from "./Favicon";
import { IconClose, IconDownload, IconPin, IconPlus, IconSidebar, IconStar, IconHistory, IconSettings, IconShield, IconMenu, JTechLogo } from "./Icons";
import type { InternalPage } from "../lib/urls";
import { MenuItem, Popover } from "./Popover";

const FOOT: [InternalPage, string, string, (p: { size?: number }) => React.ReactElement][] = [
  ["bookmarks", "Lesezeichen", "open.bookmarks", IconStar],
  ["history", "Verlauf", "open.history", IconHistory],
  ["downloads", "Downloads", "open.downloads", IconDownload],
  ["privacy", "Datenschutz", "open.privacy", IconShield],
  ["settings", "Einstellungen", "open.settings", IconSettings],
];

export const Sidebar = forwardRef<HTMLElement>(function Sidebar(_p, ref) {
  const b = useBrowser();
  const expandedSetting = b.settings.sidebarExpanded;
  const [menu, setMenu] = useState<{ tab: UiTab; x: number; y: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  /** Runde 3: Kontextmenue einer Tab-Gruppe */
  const [gmenu, setGmenu] = useState<{ group: TabGroup; x: number; y: number } | null>(null);
  const [footMenu, setFootMenu] = useState(false);
  useEffect(() => {
    if (!footMenu) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t && typeof t.closest === "function" && t.closest(".sidebar-foot")) return;
      setFootMenu(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", down), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", down); };
  }, [footMenu]);
  const closeGmenu = useCallback(() => { setGmenu(null); b.setPopover(null); }, [b]);

  const closeMenu = useCallback(() => { setMenu(null); b.setPopover(null); }, [b]);

  // ---- Resize via drag handle on the right edge ----
  /** Live width during a drag (null = use settings) */
  const [dragWidth, setDragWidth] = useState<{ expanded: boolean; width: number } | null>(null);
  const drag = useRef<{ left: number; raf: number; expanded: boolean; width: number } | null>(null);
  /** Below this width the sidebar snaps to compact mode */
  const SNAP = (SIDEBAR_COMPACT_WIDTH + SIDEBAR_MIN_WIDTH) / 2;
  const reportLayout = () => window.dispatchEvent(new Event("jtech:layout"));

  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const aside = e.currentTarget.parentElement as HTMLElement;
    drag.current = { left: aside.getBoundingClientRect().left, raf: 0, expanded, width: b.settings.sidebarWidth };
    b.setSidebarResizing(true);
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const raw = e.clientX - d.left;
    d.expanded = raw >= SNAP;
    d.width = Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, raw)));
    if (d.raf) return;
    d.raf = requestAnimationFrame(() => {
      const cur = drag.current;
      if (!cur) return;
      cur.raf = 0;
      setDragWidth({ expanded: cur.expanded, width: cur.width });
      requestAnimationFrame(reportLayout);
    });
  };
  const onResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.raf) cancelAnimationFrame(d.raf);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    b.updateSettings(d.expanded ? { sidebarExpanded: true, sidebarWidth: d.width } : { sidebarExpanded: false });
    setDragWidth(null);
    b.setSidebarResizing(false);
    // Final bounds once the new width has been rendered
    requestAnimationFrame(() => requestAnimationFrame(reportLayout));
  };

  const expanded = dragWidth ? dragWidth.expanded : expandedSetting;
  const width = dragWidth ? dragWidth.width : b.settings.sidebarWidth;

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = b.tabs.map(t => t.id);
    const from = ids.indexOf(dragId), to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    // Angepinnte bleiben oben
    const pinned = new Set(b.tabs.filter(t => t.pinned).map(t => t.id));
    b.reorder([...ids.filter(i => pinned.has(i)), ...ids.filter(i => !pinned.has(i))]);
  };

  const pinnedTabs = b.tabs.filter(t => t.pinned);
  const newTabKey = b.keyHint("tab.new");
  const normalTabs = b.tabs.filter(t => !t.pinned);

  const renderTab = (t: UiTab) => (
    <div
      key={t.id}
      className={`tab-item${t.active ? " active" : ""}${t.pinned ? " pinned" : ""}${t.sleeping ? " sleeping" : ""}${t.groupId && !t.pinned ? " grouped" : ""}${overId === t.id && dragId !== t.id ? " drop-target" : ""}${dragId === t.id ? " dragging" : ""}`}
      title={(t.internal ? t.title : `${t.title}\n${t.url}`) + (t.sleeping ? "\n(schläft – wird beim Anklicken neu geladen)" : "")}
      draggable
      onDragStart={e => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={e => { e.preventDefault(); setOverId(t.id); }}
      onDragLeave={() => setOverId(o => (o === t.id ? null : o))}
      onDrop={e => { e.preventDefault(); drop(t.id); setDragId(null); setOverId(null); }}
      onDragEnd={() => { setDragId(null); setOverId(null); }}
      onClick={() => b.switchTab(t.id)}
      onAuxClick={e => { if (e.button === 1 && !t.pinned) b.closeTab(t.id); }}
      onContextMenu={e => { e.preventDefault(); setMenu({ tab: t, x: e.clientX, y: e.clientY }); b.setPopover("tabmenu"); }}
      role="tab"
      aria-selected={t.active}
    >
      <span className="tab-icon">
        {t.loading ? <span className="spinner" aria-label="lädt" /> : <Favicon url={t.url} internal={!!t.internal} />}
        {t.blocked > 0 && !expanded && <span className="tab-badge" />}
      </span>
      {expanded && <span className="tab-title">{t.title || "Neuer Tab"}</span>}
      {expanded && t.sleeping && <span className="tab-zz" aria-label="schläft">z</span>}
      {expanded && (t.playingAudio || t.muted) && (
        <button className={`tab-audio${t.muted ? " muted" : ""}`} title={t.muted ? "Ton einschalten" : "Tab stummschalten"}
          onClick={e => { e.stopPropagation(); b.setTabMuted(t.id, !t.muted); }}>{t.muted ? "🔇" : "🔊"}</button>
      )}
      {expanded && t.pinned && <IconPin size={13} className="tab-pin" />}
      {expanded && !t.pinned && (
        <button className="tab-close" title="Tab schließen (Strg+W)" onClick={e => { e.stopPropagation(); b.closeTab(t.id); }}>
          <IconClose size={13} />
        </button>
      )}
    </div>
  );

  // Runde 3: Tabs einer Gruppe erscheinen gesammelt an der Position ihres ersten Tabs.
  const groupById = new Map(b.groups.map(g => [g.id, g]));
  const renderNormal = () => {
    const out: React.ReactNode[] = [];
    const done = new Set<string>();
    for (const t of normalTabs) {
      const g = t.groupId ? groupById.get(t.groupId) : undefined;
      if (!g) { out.push(renderTab(t)); continue; }
      if (done.has(g.id)) continue;
      done.add(g.id);
      const members = normalTabs.filter(x => x.groupId === g.id);
      const visible = g.collapsed ? members.filter(x => x.active) : members;
      out.push(
        <div key={"g:" + g.id} className={`tab-group-block${g.collapsed ? " collapsed" : ""}`} style={{ "--group-color": g.color } as React.CSSProperties}>
          <button className="group-head" title={`${g.name} (${members.length}) – Klick: ein-/ausklappen, Rechtsklick: Optionen`}
            onClick={() => b.updateGroup(g.id, { collapsed: !g.collapsed })}
            onContextMenu={e => { e.preventDefault(); setGmenu({ group: g, x: e.clientX, y: e.clientY }); b.setPopover("groupmenu"); }}>
            <span className="group-dot" />
            {expanded && <span className="group-name">{g.name}</span>}
            {expanded && <span className="group-count">{members.length}</span>}
            {expanded && <span className="group-chev">{g.collapsed ? "▸" : "▾"}</span>}
          </button>
          {visible.map(renderTab)}
        </div>
      );
    }
    return out;
  };

  return (
    <aside ref={ref} className={`sidebar${expanded ? " expanded" : " compact"}${dragWidth ? " resizing" : ""}`}
      style={expanded ? { width } : undefined}>
      <div className="sidebar-resize" role="separator" aria-orientation="vertical" aria-label="Seitenleistenbreite"
        title="Ziehen: Breite ändern · Doppelklick: ein-/ausklappen"
        onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} onPointerCancel={onResizeEnd}
        onLostPointerCapture={onResizeEnd}
        onDoubleClick={() => b.updateSettings({ sidebarExpanded: !expandedSetting })} />
      <div className="sidebar-head">
        <div className="brand"><JTechLogo size={26} />{expanded && <span className="brand-name">JTech<span>Browser</span></span>}</div>
        <button className="icon-btn" title={expanded ? "Seitenleiste einklappen" : "Seitenleiste ausklappen"} onClick={() => b.updateSettings({ sidebarExpanded: !expanded })}>
          <IconSidebar />
        </button>
      </div>

      <div className="tab-list" role="tablist" aria-orientation="vertical">
        {pinnedTabs.length > 0 && <div className={`tab-group pinned-group${expanded ? "" : " compact"}`}>{pinnedTabs.map(renderTab)}</div>}
        {pinnedTabs.length > 0 && <div className="tab-sep" />}
        {renderNormal()}
        {/* Runde 5: "Neuer Tab" direkt unter dem letzten Tab (scrollt mit der Liste) */}
        <button className="new-tab-btn" onClick={() => b.newTab()} title={`Neuer Tab${newTabKey ? ` (${newTabKey})` : ""}`}
          onDragOver={e => e.preventDefault()}>
          <IconPlus size={16} />{expanded && <span>Neuer Tab</span>}{expanded && newTabKey && <kbd>{newTabKey}</kbd>}
        </button>
      </div>

      {/* Runde 5: kompaktes Menue statt 5 einzelner Icons */}
      <nav className="sidebar-foot" style={{ position: "relative" }}>
        <button className={`icon-btn${FOOT.some(([p]) => b.activeTab?.internal === p) ? " on" : ""}`} title="Seitenmenü"
          onClick={e => { e.stopPropagation(); setFootMenu(v => !v); }}>
          <IconMenu />
        </button>
        {footMenu && (
          <div className="popover glass context-menu foot-menu" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 50, minWidth: 200 }}>
            {FOOT.map(([page, label, cmd, Icon]) => (
              <button key={page} className={`menu-item${b.activeTab?.internal === page ? " on" : ""}`}
                onClick={() => { b.openPage(page); setFootMenu(false); }}>
                <Icon size={15} /><span>{label}</span>
                {b.keyHint(cmd) && <kbd className="menu-hint">{b.keyHint(cmd)}</kbd>}
              </button>
            ))}
          </div>
        )}
      </nav>

      <Popover open={!!menu} onClose={closeMenu} className="context-menu" style={menu ? { left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 240) } : undefined}>
        {menu && <>
          <MenuItem icon={<IconPin size={15} />} label={menu.tab.pinned ? "Lösen" : "Anheften"} onClick={() => { b.togglePin(menu.tab.id); closeMenu(); }} />
          {(!menu.tab.internal || menu.tab.internal === "newtab") &&
            <MenuItem icon={<IconPlus size={15} />} label="Tab duplizieren" onClick={() => { b.newTab(menu.tab.internal ? undefined : menu.tab.url); closeMenu(); }} />}
          {!menu.tab.internal && <MenuItem icon={<IconStar size={15} />} label="Als Lesezeichen speichern" onClick={() => { b.addBookmark(menu.tab.url, menu.tab.title); closeMenu(); }} />}
          {!menu.tab.active && !menu.tab.pinned && !menu.tab.sleeping && !menu.tab.playingAudio && !menu.tab.internal &&
            <MenuItem icon={<IconSidebar size={15} />} label="Tab schlafen legen" onClick={() => { b.sleepTab(menu.tab.id); closeMenu(); }} />}
          {!menu.tab.pinned && <>
            <div className="menu-sep" />
            <MenuItem icon={<IconPlus size={15} />} label="Neue Gruppe mit diesem Tab" onClick={() => { b.createGroup(menu.tab.id); closeMenu(); }} />
            {b.groups.filter(g => g.id !== menu.tab.groupId).map(g => (
              <MenuItem key={g.id} icon={<span className="group-dot" style={{ background: g.color }} />} label={`Zu „${g.name}“`} onClick={() => { b.setTabGroup(menu.tab.id, g.id); closeMenu(); }} />
            ))}
            {menu.tab.groupId && <MenuItem icon={<IconClose size={15} />} label="Aus Gruppe entfernen" onClick={() => { b.setTabGroup(menu.tab.id, null); closeMenu(); }} />}
          </>}
          <div className="menu-sep" />
          <MenuItem icon={<IconClose size={15} />} label="Andere Tabs schließen" onClick={() => { b.closeOtherTabs(menu.tab.id); closeMenu(); }} />
          <MenuItem icon={<IconClose size={15} />} label="Tab schließen" hint={b.keyHint("tab.close")} danger onClick={() => { b.closeTab(menu.tab.id); closeMenu(); }} />
        </>}
      </Popover>

      <Popover open={!!gmenu} onClose={closeGmenu} className="context-menu" style={gmenu ? { left: Math.min(gmenu.x, window.innerWidth - 240), top: Math.min(gmenu.y, window.innerHeight - 260) } : undefined}>
        {gmenu && <>
          <div className="group-edit">
            <input defaultValue={gmenu.group.name} maxLength={30} autoFocus aria-label="Gruppenname"
              onKeyDown={e => { if (e.key === "Enter") { b.updateGroup(gmenu.group.id, { name: e.currentTarget.value }); closeGmenu(); } }}
              onBlur={e => b.updateGroup(gmenu.group.id, { name: e.currentTarget.value })} />
            <div className="group-colors">
              {GROUP_COLORS.map(c => (
                <button key={c} className={`group-color${c === gmenu.group.color ? " on" : ""}`} style={{ background: c }} title={c}
                  onClick={() => { b.updateGroup(gmenu.group.id, { color: c }); setGmenu(m => (m ? { ...m, group: { ...m.group, color: c } } : m)); }} />
              ))}
            </div>
          </div>
          <MenuItem label={gmenu.group.collapsed ? "Ausklappen" : "Einklappen"} onClick={() => { b.updateGroup(gmenu.group.id, { collapsed: !gmenu.group.collapsed }); closeGmenu(); }} />
          <MenuItem label="Gruppe auflösen" onClick={() => { b.removeGroup(gmenu.group.id); closeGmenu(); }} />
          <MenuItem label="Gruppe und Tabs schließen" danger onClick={() => { b.removeGroup(gmenu.group.id, true); closeGmenu(); }} />
        </>}
      </Popover>
    </aside>
  );
});
