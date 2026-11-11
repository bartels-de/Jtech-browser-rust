import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { GROUP_COLORS, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_COMPACT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, type TabGroup, type UiTab } from "../store/types";
import { Favicon, PageIcon } from "./Favicon";
import { IconClose, IconPin, IconPlus, IconSidebar, IconStar, IconSettings, IconVolume, IconMute, IconChevronDown, IconChevronRight, IconGauge, IconMoon, IconCopy, JTechLogo, IconLibrary, IconSplit } from "./Icons";
import { throttleStore } from "../lib/bridge";
import { MiniPlayer } from "./MediaControls";
import { internalTitle, type InternalPage } from "../lib/urls";
import { t as tr, useT } from "../i18n";
import { MenuItem, Popover } from "./Popover";

/** Library menu in three groups (collections, media and system, customisation); labels come from internalTitle. */
const LIBRARY: InternalPage[][] = [
  ["bookmarks", "history", "downloads"],
  ["audio", "performance"],
  ["extensions", "market", "themes", "privacy", "activity"],
];
const LIBRARY_PAGES = LIBRARY.flat();

export const Sidebar = forwardRef<HTMLElement>(function Sidebar(_p, ref) {
  const b = useBrowser();
  const { t } = useT();
  const expandedSetting = b.settings.sidebarExpanded;
  const [menu, setMenu] = useState<{ tab: UiTab; x: number; y: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  /** Runde 3: Kontextmenue einer Tab-Gruppe */
  const [gmenu, setGmenu] = useState<{ group: TabGroup; x: number; y: number } | null>(null);
  const [footMenu, setFootMenu] = useState(false);
  // Das Menue ragt in kompakter Ansicht ueber das Content-Rechteck -> Webview solange verstecken.
  const { setPopover } = b;
  useEffect(() => {
    if (!footMenu) return;
    setPopover("tabmenu");
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setFootMenu(false); };
    document.addEventListener("keydown", key);
    const down = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t && typeof t.closest === "function" && t.closest(".foot-menu, .foot-lib")) return;
      setFootMenu(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", down), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); setPopover(null); };
  }, [footMenu, setPopover]);
  const closeGmenu = useCallback(() => { setGmenu(null); b.setPopover(null); }, [b]);

  const closeMenu = useCallback(() => { setMenu(null); b.setPopover(null); }, [b]);
  /** Right-click on empty sidebar space: sidebar options right where they apply */
  const [smenu, setSmenu] = useState<{ x: number; y: number } | null>(null);
  const closeSmenu = useCallback(() => { setSmenu(null); b.setPopover(null); }, [b]);
  const onSidebarContext = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("[role=tab], button, input, a, .group-head, .popover, .context-menu")) return;
    e.preventDefault();
    setSmenu({ x: e.clientX, y: e.clientY });
    b.setPopover("sidebarmenu");
  };

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
    // Dropping onto a grouped tab joins that group (web and internal tabs alike)
    const target = b.tabs.find(t => t.id === targetId), dragged = b.tabs.find(t => t.id === dragId);
    if (target?.groupId && dragged && !dragged.pinned && !target.pinned && dragged.groupId !== target.groupId) b.setTabGroup(dragId, target.groupId);
  };

  const pinnedTabs = b.tabs.filter(t => t.pinned);
  const newTabKey = b.keyHint("tab.new");
  const normalTabs = b.tabs.filter(t => !t.pinned);
  const throttle = throttleStore.use();
  const running = b.downloads.filter(d => d.live && d.state === "progressing").length;

  const renderTab = (t: UiTab, tile = false) => (
    <div
      key={t.id}
      className={`tab-item${tile ? " pin-tile" : ""}${t.active ? " active" : ""}${t.pinned ? " pinned" : ""}${t.sleeping ? " sleeping" : ""}${t.groupId && !t.pinned ? " grouped" : ""}${overId === t.id && dragId !== t.id ? " drop-target" : ""}${dragId === t.id ? " dragging" : ""}${b.settings.sidebarTabStyle !== "classic" ? ` tab-style-${b.settings.sidebarTabStyle}` : ""}`}
      title={(t.internal ? t.title : `${t.title}\n${t.url}`) + (t.sleeping ? "\n" + tr("sb.sleepingHint") : "")}
      aria-label={t.title || tr("c.newTab")}
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
        {t.loading ? <span className="spinner" aria-label={tr("sb.loading")} /> : <Favicon url={t.url} internal={t.internal} />}
      </span>
      {expanded && !tile && <span className="tab-title">{t.title || tr("c.newTab")}</span>}
      {expanded && !tile && !t.sleeping && !t.active && (throttle[t.id]?.suspended || throttle[t.id]?.low) && (
        <span className={`tab-throttle${throttle[t.id]?.suspended ? " suspended" : ""}`} title={tr(throttle[t.id]?.suspended ? "rl.badgeSuspended" : "rl.badgeLow")}
          aria-label={tr(throttle[t.id]?.suspended ? "rl.badgeSuspended" : "rl.badgeLow")}><IconGauge size={11} /></span>
      )}
      {expanded && !tile && t.sleeping && <span className="tab-zz" title={tr("sb.sleeping")} aria-label={tr("sb.sleeping")}><IconMoon size={12} /></span>}
      {expanded && !tile && (t.playingAudio || t.muted) && (
        <button className={`tab-audio${t.muted ? " muted" : ""}`} title={t.muted ? tr("sb.unmute") : tr("sb.mute")} aria-label={t.muted ? tr("sb.unmute") : tr("sb.mute")}
          onClick={e => { e.stopPropagation(); b.setTabMuted(t.id, !t.muted); }}>{t.muted ? <IconMute size={14} /> : <IconVolume size={14} />}</button>
      )}
      {expanded && !tile && t.pinned && <IconPin size={13} className="tab-pin" />}
      {expanded && !t.pinned && (
        <button className="tab-close" title={`${tr("sb.closeTab")}${b.keyHint("tab.close") ? ` (${b.keyHint("tab.close")})` : ""}`} aria-label={tr("sb.closeTab")} onClick={e => { e.stopPropagation(); b.closeTab(t.id); }}>
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
    const sp = b.split;
    const pairIds = sp && normalTabs.some(x => x.id === sp.a) && normalTabs.some(x => x.id === sp.b) ? [sp.a, sp.b] : null;
    for (const t of normalTabs) {
      if (pairIds && pairIds.includes(t.id)) {
        if (done.has("split")) continue;
        done.add("split");
        const pair = pairIds.map(i => normalTabs.find(x => x.id === i)!);
        out.push(
          <div key="split-pair" className={`split-pair${b.splitActive ? " on" : ""}`} role="group" aria-label={tr("split.pair")} title={tr("split.pair")}>
            {pair.map(x => renderTab(x))}
          </div>
        );
        continue;
      }
      const g = t.groupId ? groupById.get(t.groupId) : undefined;
      if (!g) { out.push(renderTab(t)); continue; }
      if (done.has(g.id)) continue;
      done.add(g.id);
      const members = normalTabs.filter(x => x.groupId === g.id && !(pairIds && pairIds.includes(x.id)));
      const visible = g.collapsed ? members.filter(x => x.active) : members;
      out.push(
        <div key={"g:" + g.id} className={`tab-group-block${g.collapsed ? " collapsed" : ""}`} style={{ "--group-color": g.color } as React.CSSProperties}>
          <button className={`group-head${overId === "g:" + g.id ? " drop-target" : ""}`} aria-expanded={!g.collapsed}
            onDragOver={e => { if (dragId) { e.preventDefault(); setOverId("g:" + g.id); } }}
            onDragLeave={() => setOverId(o => (o === "g:" + g.id ? null : o))}
            onDrop={e => { e.preventDefault(); const d = b.tabs.find(x => x.id === dragId); if (d && !d.pinned) b.setTabGroup(d.id, g.id); setDragId(null); setOverId(null); }} title={tr("sb.groupTitle", { name: g.name, count: members.length })}
            onClick={() => b.updateGroup(g.id, { collapsed: !g.collapsed })}
            onContextMenu={e => { e.preventDefault(); setGmenu({ group: g, x: e.clientX, y: e.clientY }); b.setPopover("groupmenu"); }}>
            <span className="group-dot" />
            {expanded && <span className="group-name">{g.name}</span>}
            {expanded && <span className="group-count">{members.length}</span>}
            {expanded && <span className="group-chev">{g.collapsed ? <IconChevronRight size={13} /> : <IconChevronDown size={13} />}</span>}
          </button>
          {visible.map(t => renderTab(t))}
        </div>
      );
    }
    return out;
  };

  return (
    <aside ref={ref} className={`sidebar${expanded ? " expanded" : " compact"}${dragWidth ? " resizing" : ""}`}
      style={expanded ? { width } : undefined} onContextMenu={onSidebarContext}>
      <div className="sidebar-resize" role="separator" aria-orientation="vertical" aria-label={t("sb.resize")}
        title={t("sb.resizeTitle")}
        onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} onPointerCancel={onResizeEnd}
        onLostPointerCapture={onResizeEnd}
        onDoubleClick={() => b.updateSettings({ sidebarExpanded: !expandedSetting })} />
      <div className="sidebar-head" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region title="JTech Browser"><JTechLogo size={22} /></div>
        {expanded && <span className="head-drag" data-tauri-drag-region aria-hidden />}
        <button className="icon-btn" aria-label={expanded ? t("sb.collapse") : t("sb.expand")} title={expanded ? t("sb.collapse") : t("sb.expand")} onClick={() => b.updateSettings({ sidebarExpanded: !expanded })}>
          <IconSidebar />
        </button>
      </div>

      {pinnedTabs.length > 0 && (
        <div className={`pin-grid${expanded ? "" : " compact"}`} role="tablist" aria-label={t("sb.pinned")}>
          {pinnedTabs.map(t => renderTab(t, expanded))}
        </div>
      )}

      {/* A single new-tab affordance at the top of the list (Arc/Edge-like) */}
      <button className="new-tab-btn" aria-label={t("c.newTab")} onClick={() => b.newTab()} title={`${t("c.newTab")}${newTabKey ? ` (${newTabKey})` : ""}`}
        onDragOver={e => e.preventDefault()}>
        <IconPlus size={16} />{expanded && <span>{t("c.newTab")}</span>}{expanded && newTabKey && <kbd>{newTabKey}</kbd>}
      </button>

      <div className="tab-list" role="tablist" aria-orientation="vertical">
        {renderNormal()}
      </div>

      {/* Bottom: mini player (only with media) above one footer row; the library menu opens above both */}
      <div className="sidebar-bottom">
        {footMenu && (
          <div className="popover glass foot-menu" role="menu" aria-label={t("sb.library")}>
            {LIBRARY.map((group, gi) => (
              <div key={gi} className="foot-menu-group" role="group">
                {gi > 0 && <div className="menu-sep" role="separator" />}
                {group.map(page => (
                  <button key={page} role="menuitem" className={`menu-item${b.activeTab?.internal === page ? " on" : ""}`}
                    onClick={() => { b.openPage(page); setFootMenu(false); }}>
                    <span className="menu-icon"><PageIcon page={page} size={15} /></span><span className="menu-label">{internalTitle(page)}</span>
                    {page === "downloads" && running > 0 && <span className="menu-count">{running}</span>}
                    {b.keyHint("open." + page) && <kbd className="menu-hint">{b.keyHint("open." + page)}</kbd>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <MiniPlayer expanded={expanded} />
        <nav className="sidebar-foot" aria-label={t("sb.pages")}>
          <button className={`foot-lib${LIBRARY_PAGES.some(p => b.activeTab?.internal === p) ? " on" : ""}${footMenu ? " open" : ""}`}
            title={t("sb.libraryTitle")} aria-label={t("sb.library")}
            aria-haspopup="menu" aria-expanded={footMenu}
            onClick={e => { e.stopPropagation(); setFootMenu(v => !v); }}>
            <IconLibrary size={16} />{expanded && <span className="foot-label">{t("sb.library")}</span>}
            {running > 0 && <span className="count-badge">{running}</span>}
          </button>
          {expanded && <span className="foot-drag" aria-hidden />}
          <button className={`foot-icon${b.activeTab?.internal === "settings" ? " on" : ""}`} aria-label={t("page.settings")}
            title={`${t("page.settings")}${b.keyHint("open.settings") ? ` (${b.keyHint("open.settings")})` : ""}`}
            onClick={() => b.openPage("settings")}><IconSettings size={16} /></button>
        </nav>
      </div>

      <Popover open={!!menu} onClose={closeMenu} className="context-menu" at={menu ? { x: menu.x, y: menu.y } : undefined} label={t("sb.tabOptions")}>
        {menu && <>
          <MenuItem icon={<IconPin size={15} />} label={menu.tab.pinned ? t("sb.unpin") : t("sb.pin")} onClick={() => { b.togglePin(menu.tab.id); closeMenu(); }} />
          {(!menu.tab.internal || menu.tab.internal === "newtab") &&
            <MenuItem icon={<IconCopy size={15} />} label={t("sb.duplicate")} onClick={() => { b.newTab(menu.tab.internal ? undefined : menu.tab.url); closeMenu(); }} />}
          {!menu.tab.internal && <MenuItem icon={<IconStar size={15} />} label={t("sb.saveBm")} onClick={() => { b.addBookmark(menu.tab.url, menu.tab.title); closeMenu(); }} />}
          {!menu.tab.active && !menu.tab.pinned && !menu.tab.sleeping && !menu.tab.playingAudio && !menu.tab.internal &&
            <MenuItem icon={<IconMoon size={15} />} label={t("sb.sleepTab")} onClick={() => { b.sleepTab(menu.tab.id); closeMenu(); }} />}
          <div className="menu-sep" />
          {b.split && (b.split.a === menu.tab.id || b.split.b === menu.tab.id)
            ? <MenuItem icon={<IconSplit size={15} />} label={t("split.end")} onClick={() => { b.closeSplit(); closeMenu(); }} />
            : <MenuItem icon={<IconSplit size={15} />} label={t("split.openWith")} onClick={() => { const id = menu.tab.id; closeMenu(); void b.openSplit(menu.tab.active ? undefined : id); }} />}
          {!menu.tab.pinned && <>
            <div className="menu-sep" />
            <MenuItem icon={<IconPlus size={15} />} label={t("sb.newGroup")} onClick={() => { b.createGroup(menu.tab.id); closeMenu(); }} />
            {b.groups.filter(g => g.id !== menu.tab.groupId).map(g => (
              <MenuItem key={g.id} icon={<span className="group-dot" style={{ background: g.color }} />} label={t("sb.toGroup", { name: g.name })} onClick={() => { b.setTabGroup(menu.tab.id, g.id); closeMenu(); }} />
            ))}
            {menu.tab.groupId && <MenuItem icon={<IconClose size={15} />} label={t("sb.ungroup")} onClick={() => { b.setTabGroup(menu.tab.id, null); closeMenu(); }} />}
          </>}
          <div className="menu-sep" />
          <MenuItem icon={<IconClose size={15} />} label={t("sb.closeOthers")} onClick={() => { b.closeOtherTabs(menu.tab.id); closeMenu(); }} />
          <MenuItem icon={<IconClose size={15} />} label={t("sb.closeTab")} hint={b.keyHint("tab.close")} danger onClick={() => { b.closeTab(menu.tab.id); closeMenu(); }} />
        </>}
      </Popover>

      <Popover open={!!smenu && b.popover === "sidebarmenu"} onClose={closeSmenu} className="context-menu sb-options" at={smenu ?? undefined} label={t("sbo.title")}>
        {smenu && <>
          <div className="menu-title">{t("sbo.title")}</div>
          <label className="switch-row"><span>{t("set.sidebarTitles")}</span>
            <input type="checkbox" className="switch" checked={b.settings.sidebarExpanded} onChange={e => b.updateSettings({ sidebarExpanded: e.target.checked })} /></label>
          <label className="switch-row"><span>{t("set.autoGroup")}</span>
            <input type="checkbox" className="switch" checked={b.settings.autoGroupByDomain} onChange={e => b.updateSettings({ autoGroupByDomain: e.target.checked })} /></label>
          <label className="switch-row"><span>{t("set.newTabNext")}</span>
            <input type="checkbox" className="switch" checked={b.settings.newTabNextToCurrent !== false} onChange={e => b.updateSettings({ newTabNextToCurrent: e.target.checked })} /></label>
          <label className="switch-row"><span>{t("set.returnOpener")}</span>
            <input type="checkbox" className="switch" checked={b.settings.returnToOpener !== false} onChange={e => b.updateSettings({ returnToOpener: e.target.checked })} /></label>
          <div className="menu-sep" />
          <MenuItem icon={<IconSidebar size={15} />} label={t("sbo.resetWidth")} disabled={b.settings.sidebarWidth === SIDEBAR_DEFAULT_WIDTH} onClick={() => { b.updateSettingsUndoable({ sidebarWidth: SIDEBAR_DEFAULT_WIDTH, sidebarExpanded: true }, t("undo.sidebarReset")); closeSmenu(); }} />
          <MenuItem icon={<IconPlus size={15} />} label={t("set.groupNow")} onClick={() => { b.groupTabsByDomain(); closeSmenu(); }} />
          <MenuItem icon={<IconMoon size={15} />} label={t("cmd.tab.sleepInactive")} onClick={() => { b.sleepInactiveTabs(); closeSmenu(); }} />
          <MenuItem icon={<IconSettings size={15} />} label={t("sbo.more")} onClick={() => { closeSmenu(); b.openPage("settings", { section: "tabs" }); }} />
        </>}
      </Popover>

      <Popover open={!!gmenu} onClose={closeGmenu} className="context-menu" at={gmenu ? { x: gmenu.x, y: gmenu.y } : undefined} label={t("sb.groupOptions")}>
        {gmenu && <>
          <div className="group-edit">
            <input defaultValue={gmenu.group.name} maxLength={30} autoFocus aria-label={t("sb.groupName")}
              onKeyDown={e => { if (e.key === "Enter") { b.updateGroup(gmenu.group.id, { name: e.currentTarget.value }); closeGmenu(); } }}
              onBlur={e => b.updateGroup(gmenu.group.id, { name: e.currentTarget.value })} />
            <div className="group-colors">
              {GROUP_COLORS.map(c => (
                <button key={c} className={`group-color${c === gmenu.group.color ? " on" : ""}`} style={{ background: c }} title={c}
                  onClick={() => { b.updateGroup(gmenu.group.id, { color: c }); setGmenu(m => (m ? { ...m, group: { ...m.group, color: c } } : m)); }} />
              ))}
            </div>
          </div>
          <MenuItem label={gmenu.group.collapsed ? t("sb.expandGroup") : t("sb.collapseGroup")} onClick={() => { b.updateGroup(gmenu.group.id, { collapsed: !gmenu.group.collapsed }); closeGmenu(); }} />
          <MenuItem label={t("sb.dissolve")} onClick={() => { b.removeGroup(gmenu.group.id); closeGmenu(); }} />
          <MenuItem label={t("sb.closeGroup")} danger onClick={() => { b.removeGroup(gmenu.group.id, true); closeGmenu(); }} />
        </>}
      </Popover>
    </aside>
  );
});
