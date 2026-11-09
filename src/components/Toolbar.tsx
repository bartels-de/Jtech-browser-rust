import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBrowser } from "../store/BrowserStore";
import { SEARCH_ENGINES, hostOf, internalTitle, internalUrl, isWebUrl, securityOf } from "../lib/urls";
import { PageIcon } from "./Favicon";
import { IconBack, IconBookmarks, IconDownload, IconForward, IconHistory, IconHome, IconLock, IconMenu, IconPlus, IconReload, IconSettings, IconShield, IconStar, IconStop, IconWarn, IconGlobe, IconSearch, IconPalette, IconMusic, IconGauge, IconPrint, IconMoon, IconCommand, IconKeyboard, IconPuzzle, IconStore, IconSplit, IconVolume, IconMute, IconLayers, IconInfo, IconClose, JTechLogo } from "./Icons";
import { MenuItem, Popover } from "./Popover";
import { DownloadList } from "./DownloadList";
import { addressSuggestions, looksLikeUrl, matches, withRemote, type Suggestion } from "../lib/suggest";
import { SiteShieldToggle } from "./SiteShieldToggle";
import { useT, t as tr, type TKey } from "../i18n";
import { formatCombo } from "../lib/keys";
import { call } from "../lib/ipc";
import { WindowControls } from "./WindowControls";
import { DEFAULT_TOOLBAR, TOOLBAR_ITEMS, TOOLBAR_LEFT, normalizeToolbar, type ToolbarItem } from "../store/types";

/** Hosts where "Picture-in-picture" is offered in the address bar (also shown whenever the tab plays audio). */
const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|twitch\.tv|vimeo\.com|dailymotion\.com|netflix\.com|primevideo\.com|disneyplus\.com|joyn\.de|ardmediathek\.de|zdf\.de)$/;

const ITEM_ICON: Record<ToolbarItem, ReactNode> = {
  back: <IconBack />, forward: <IconForward />, reload: <IconReload />, home: <IconHome />, split: <IconSplit />, radial: <IconCommand />,
  audio: <IconMusic />, extensions: <IconPuzzle />, bookmarks: <IconBookmarks />, shield: <IconShield />, downloads: <IconDownload />, hub: <IconMenu />,
};
export const toolbarItemLabel = (id: ToolbarItem) => tr(`tbi.${id}` as TKey);

export function Toolbar() {
  const b = useBrowser();
  const { t, fmtPct, fmtNum } = useT();
  const tab = b.activeTab;
  const page = b.activePage;
  const shownUrl = page ? (page === "newtab" ? "" : internalUrl(page)) : tab?.url ?? "";
  const [text, setText] = useState(shownUrl);
  const [editing, setEditing] = useState(false);
  /** Runde 3: Nutzer hat getippt -> Vorschlaege zeigen */
  const [typed, setTyped] = useState(false);
  const [sel, setSel] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const layout = normalizeToolbar(b.settings.toolbar);
  const has = (id: ToolbarItem) => layout.includes(id);

  // ---- Live search suggestions (debounced 150 ms, stale answers dropped) ----
  const engine = b.settings.searchEngine;
  const liveOn = b.settings.liveSuggest !== false && editing && typed;
  const [remote, setRemote] = useState<{ q: string; list: string[] }>({ q: "", list: [] });
  useEffect(() => {
    const q = text.trim();
    if (!liveOn || !q || q.length > 200 || q.startsWith("!") || looksLikeUrl(q)) { setRemote(r => (r.list.length ? { q: "", list: [] } : r)); return; }
    let alive = true;
    const h = setTimeout(() => {
      call<string[]>("search_suggest", { engine, query: q }).then(list => { if (alive && Array.isArray(list)) setRemote({ q, list }); });
    }, 150);
    return () => { alive = false; clearTimeout(h); };
  }, [liveOn, text, engine]);
  const suggestions = useMemo(() => {
    if (!(editing && typed)) return [];
    const local = addressSuggestions(text, { history: b.history, bookmarks: b.bookmarks, bangs: b.settings.bangs, tabs: b.tabs });
    return liveOn && remote.q === text.trim() && remote.list.length ? withRemote(local, remote.list, text) : local;
  }, [editing, typed, text, b.history, b.bookmarks, b.settings.bangs, b.tabs, liveOn, remote]);
  const wantSuggest = suggestions.length > 1;
  const { popover, setPopover } = b;
  // Dropdown versteckt die native Content-Webview (wie Popover), sonst laege sie darueber.
  useEffect(() => {
    if (wantSuggest && popover === null) setPopover("suggest");
    else if (!wantSuggest && popover === "suggest") setPopover(null);
  }, [wantSuggest, popover, setPopover]);
  useEffect(() => { setSel(-1); }, [text]);
  const choose = (sg: Suggestion) => {
    if (sg.fill && sg.value) { setText(sg.value); inputRef.current?.focus(); return; }
    setEditing(false); setTyped(false); inputRef.current?.blur();
    if (sg.tabId) b.switchTab(sg.tabId);
    else if (sg.value) b.navigate(sg.value);
  };
  const running = b.downloads.filter(d => d.live && d.state === "progressing").length;

  useEffect(() => { if (!editing) setText(shownUrl); }, [shownUrl, editing]);
  useEffect(() => {
    if (b.focusTick === 0) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [b.focusTick]);

  const sec = securityOf(tab?.url ?? "", !!page);
  /** Calm URL display (host emphasised, scheme hidden) while the field is not being edited */
  const pretty = useMemo(() => {
    if (editing || !tab || page || !tab.url.startsWith("https://") || Math.abs(tab.zoom - 1) > 0.001) return null;
    const host = hostOf(tab.url);
    if (!host) return null;
    const i = tab.url.indexOf(host);
    let rest = i >= 0 ? tab.url.slice(i + host.length) : "";
    if (rest === "/") rest = "";
    return { host: host.replace(/^www\./, ""), rest };
  }, [editing, tab, page]);
  /** Internal pages read as "JTech · Settings" until the field is focused (then the jtech:// address is editable) */
  const pageChip = !editing && !!page && page !== "newtab";
  const bookmark = tab && !page ? b.isBookmarked(tab.url) : undefined;
  const canBookmark = !!tab && !page;
  const close = () => b.setPopover(null);
  const toggle = (p: Exclude<typeof b.popover, null>) => b.setPopover(b.popover === p ? null : p);

  // ---- Contextual quick actions in the address bar ----
  const web = !!tab && !page && !tab.sleeping && isWebUrl(tab.url);
  const showPip = web && !editing && (VIDEO_HOSTS.test(hostOf(tab!.url)) || tab!.playingAudio);
  const showMute = web && !editing && (tab!.playingAudio || tab!.muted);
  const showShieldChip = web && !editing && !has("shield") && b.settings.adblock && tab!.blocked > 0;

  const renderItem = (id: ToolbarItem): ReactNode => {
    switch (id) {
      case "back": return <button key={id} className="icon-btn" title={t("tb.backTitle")} aria-label={t("cmd.nav.back")} onClick={b.back} disabled={!tab || (!tab.canGoBack && !(page && isWebUrl(tab.url)))}><IconBack /></button>;
      case "forward": return <button key={id} className="icon-btn" title={t("tb.forwardTitle")} aria-label={t("cmd.nav.forward")} onClick={b.forward} disabled={!tab || !!page || !tab.canGoForward}><IconForward /></button>;
      case "reload": return tab?.loading
        ? <button key={id} className="icon-btn" title={t("tb.stopTitle")} aria-label={t("cmd.nav.stop")} onClick={b.stop}><IconStop /></button>
        : <button key={id} className="icon-btn" title={t("tb.reloadTitle", { keys: b.keysFor("nav.reload").map(formatCombo).join(" / ") || "F5" })} aria-label={t("cmd.nav.reload")} onClick={b.reload} disabled={!tab || !!page}><IconReload /></button>;
      case "home": return <button key={id} className="icon-btn" title={t("tb.homeTitle")} aria-label={t("cmd.nav.home")} onClick={b.home}><IconHome /></button>;
      case "split": return <button key={id} className={`icon-btn${b.splitActive ? " on" : ""}`} title={toolbarItemLabel(id)} aria-label={toolbarItemLabel(id)} aria-pressed={b.splitActive} onClick={b.toggleSplit} disabled={!tab}><IconSplit /></button>;
      case "radial": return <button key={id} className="icon-btn" title={toolbarItemLabel(id)} aria-label={toolbarItemLabel(id)} onClick={() => b.runCommand("ui.radial")}><IconCommand /></button>;
      case "audio": return <button key={id} className={`icon-btn${b.tabs.some(x => x.playingAudio) ? " playing" : ""}`} title={toolbarItemLabel(id)} aria-label={toolbarItemLabel(id)} onClick={() => b.openPage("audio")}><IconMusic /></button>;
      case "extensions": return <button key={id} className="icon-btn" title={toolbarItemLabel(id)} aria-label={toolbarItemLabel(id)} onClick={() => b.openPage("extensions")}><IconPuzzle /></button>;
      case "bookmarks": return <button key={id} className="icon-btn" title={toolbarItemLabel(id)} aria-label={toolbarItemLabel(id)} onClick={() => b.openPage("bookmarks")}><IconBookmarks /></button>;
      case "shield": return (
        <button key={id} data-pop-toggle="shield" className={`icon-btn shield${b.settings.adblock ? "" : " off"}${b.popover === "shield" ? " on" : ""}`} title={b.settings.adblock ? t("tb.shieldOn") : t("tb.shieldOff")} aria-label="JTech Shield" aria-expanded={b.popover === "shield"} onClick={() => toggle("shield")}>
          <IconShield />
          {b.settings.adblock && (tab?.blocked ?? 0) > 0 && <span className="count-badge">{(tab?.blocked ?? 0) > 99 ? "99+" : tab?.blocked}</span>}
        </button>);
      case "downloads": return <button key={id} data-pop-toggle="downloads" className={`icon-btn${b.popover === "downloads" ? " on" : ""}`} title={t("page.downloads")} aria-label={t("page.downloads")} aria-expanded={b.popover === "downloads"} onClick={() => toggle("downloads")}><IconDownload />{running > 0 && <span className="count-badge">{running}</span>}</button>;
      case "hub": return <button key={id} data-pop-toggle="menu" className={`icon-btn${b.popover === "menu" ? " on" : ""}`} title={t("hub.title")} aria-label={t("hub.title")} aria-haspopup="menu" aria-expanded={b.popover === "menu"} onClick={() => toggle("menu")}><IconMenu /></button>;
    }
  };
  const leftItems = layout.filter(x => TOOLBAR_LEFT.includes(x));
  const rightItems = layout.filter(x => !TOOLBAR_LEFT.includes(x));

  return (
    <div className="toolbar" data-tauri-drag-region onContextMenu={e => { if ((e.target as HTMLElement).closest("input, form")) return; e.preventDefault(); b.setPopover("toolbar"); }}>
      {leftItems.length > 0 && <div className="nav-group">{leftItems.map(renderItem)}</div>}

      <div className="omni-wrap">
      <form className={`omnibox${editing ? " focused" : ""}${tab?.loading ? " loading" : ""}${b.popover === "suggest" ? " open" : ""}`} onSubmit={e => {
        e.preventDefault();
        if (sel >= 0 && suggestions[sel]) { choose(suggestions[sel]); return; }
        setEditing(false); setTyped(false); inputRef.current?.blur(); b.navigate(text);
      }}>
        <span className={`sec sec-${sec}`} title={
          sec === "secure" ? t("tb.secure") :
          sec === "insecure" ? t("tb.insecure") :
          sec === "internal" ? t("tb.internal") : t("c.address")}>
          {sec === "secure" ? <IconLock size={14} /> : sec === "insecure" ? <><IconWarn size={14} /><span className="sec-label">{t("tb.notSecure")}</span></> : sec === "internal" ? (page ? <PageIcon page={page} size={15} /> : <JTechLogo size={15} />) : <IconGlobe size={14} />}
        </span>
        {pretty && (
          <span className="omni-display" aria-hidden onMouseDown={e => { e.preventDefault(); inputRef.current?.focus(); }}>
            <span className="omni-host">{pretty.host}</span><span className="omni-rest">{pretty.rest}</span>
          </span>
        )}
        {pageChip && page && (
          <span className="omni-display omni-page" aria-hidden onMouseDown={e => { e.preventDefault(); inputRef.current?.focus(); }}>
            <span className="omni-brand">JTech</span><span className="omni-dot">·</span><span className="omni-host">{internalTitle(page)}</span>
          </span>
        )}
        <input
          ref={inputRef}
          className={pretty || pageChip ? "is-pretty" : undefined}
          value={text}
          spellCheck={false}
          placeholder={t("tb.placeholder")}
          onFocus={e => { setEditing(true); e.currentTarget.select(); }}
          onBlur={() => { setEditing(false); setTyped(false); }}
          onChange={e => { setEditing(true); setTyped(true); setText(e.target.value); }}
          onKeyDown={e => {
            if (e.key === "Escape") { if (wantSuggest) { setTyped(false); return; } setText(shownUrl); e.currentTarget.blur(); }
            else if (e.key === "ArrowDown" && wantSuggest) { e.preventDefault(); setSel(s => Math.min(suggestions.length - 1, s + 1)); }
            else if (e.key === "ArrowUp" && wantSuggest) { e.preventDefault(); setSel(s => Math.max(-1, s - 1)); }
            else if (e.key === "Tab" && wantSuggest && sel >= 0 && suggestions[sel]?.kind === "search") { e.preventDefault(); setText(suggestions[sel].value ?? text); }
          }}
          aria-label={t("tb.address")}
          aria-autocomplete="list"
          aria-expanded={b.popover === "suggest"}
        />
        <span className="omni-actions">
          {showPip && <button type="button" className="omni-chip" title={t("qa.pipTitle")} aria-label={t("qa.pip")} onClick={() => b.runCommand("page.pip")}><IconLayers size={13} /><span>{t("qa.pip")}</span></button>}
          {showMute && <button type="button" className={`omni-chip icon-only${tab!.muted ? " on" : ""}`} title={tab!.muted ? t("qa.unmute") : t("qa.mute")} aria-label={tab!.muted ? t("qa.unmute") : t("qa.mute")} aria-pressed={tab!.muted} onClick={() => b.setTabMuted(tab!.id, !tab!.muted)}>{tab!.muted ? <IconMute size={14} /> : <IconVolume size={14} />}</button>}
          {showShieldChip && <button type="button" className="omni-chip" title={t("qa.blocked", { count: tab!.blocked })} onClick={() => b.setPopover("shield")}><IconShield size={13} /><span>{fmtNum(tab!.blocked)}</span></button>}
          {tab && !page && Math.abs(tab.zoom - 1) > 0.001 && (
            <button type="button" className="zoom-chip" title={t("tb.zoomReset", { keys: b.keyHint("page.zoomReset") ?? "" })} onClick={() => b.zoomStep(0)}>{fmtPct(Math.round(tab.zoom * 100))}</button>
          )}
        </span>
        <button type="button" data-pop-toggle="bookmark" className={`icon-btn star${bookmark ? " on" : ""}`} disabled={!canBookmark}
          title={`${bookmark ? t("tb.bmEdit") : t("tb.bmAdd")}${b.keyHint("page.bookmark") ? ` (${b.keyHint("page.bookmark")})` : ""}`} aria-label={bookmark ? t("tb.bmEdit") : t("tb.bmAdd")}
          onClick={() => { if (tab && !bookmark) b.addBookmark(tab.url, tab.title); toggle("bookmark"); }}>
          <IconStar size={15} />
        </button>
        {!editing && !text && <kbd className="omni-hint" aria-hidden>{b.keyHint("nav.address") || formatCombo("ctrl+l")}</kbd>}
        <span className="load-bar" />
      </form>
      {b.popover === "suggest" && (
        <div className="suggest glass" role="listbox" onMouseDown={e => e.preventDefault()}>
          {suggestions.map((sg, i) => {
            const prev = suggestions[i - 1];
            const head = sg.kind === "search" && prev?.kind !== "search"
              ? t("sug.engineHead", { engine: SEARCH_ENGINES[engine].name })
              : i > 0 && sg.kind !== "search" && prev?.kind === "go" ? t("sug.localHead") : null;
            return (
              <div key={sg.key} className="suggest-row">
                {head && <div className="suggest-head" role="presentation">{head}</div>}
                <button type="button" role="option" aria-selected={i === sel} className={`suggest-item${i === sel ? " on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => choose(sg)}>
                  <span className={`palette-kind k-${sg.kind}`}>{sg.kind === "search" ? <IconSearch size={12} /> : ({ go: "↵", bang: t("tb.kind.bang"), page: t("tb.kind.page"), bookmark: "★", history: t("tb.kind.history"), tab: t("tb.kind.tab"), command: "" } as Record<string, string>)[sg.kind]}</span>
                  <span className="palette-title">{sg.title}</span>
                  {sg.hint && <span className="palette-hint">{sg.hint}</span>}
                </button>
              </div>
            );
          })}
          {liveOn && remote.list.length > 0 && <div className="suggest-foot">{t("sug.privacyNote")}</div>}
        </div>
      )}
      </div>

      {rightItems.length > 0 && <div className="nav-group">{rightItems.map(renderItem)}</div>}
      <span className="drag-gap" data-tauri-drag-region aria-hidden />
      <WindowControls />

      <Popover open={b.popover === "bookmark"} onClose={close} className="pop-right pop-bookmark">
        {bookmark && <BookmarkEditor id={bookmark.id} title={bookmark.title} onDone={close} />}
      </Popover>

      <Popover open={b.popover === "shield"} onClose={close} className="pop-right">
        <div className="pop-head"><IconShield size={18} /><div><strong>JTech Shield</strong><small>{b.settings.adblock ? t("tb.shieldBlocking") : t("tb.shieldDisabled")}</small></div></div>
        <div className="stat-row">
          <div className="stat"><span className="stat-num">{page ? "–" : fmtNum(tab?.blocked ?? 0)}</span><span className="stat-label">{t("tb.onThisPage")}</span></div>
          <div className="stat"><span className="stat-num">{fmtNum(b.totalBlocked)}</span><span className="stat-label">{t("tb.sinceStart")}</span></div>
        </div>
        <label className="switch-row">
          <span>{t("tb.blockerActive")}</span>
          <input type="checkbox" className="switch" checked={b.settings.adblock} onChange={e => b.updateSettings({ adblock: e.target.checked })} />
        </label>
        {!page && b.popover === "shield" && <SiteShieldToggle url={tab?.url} />}
        <button className="btn ghost full" onClick={() => b.openPage("privacy")}>{t("tb.openPrivacy")}</button>
      </Popover>

      <Popover open={b.popover === "downloads"} onClose={close} className="pop-right">
        <div className="pop-head"><IconDownload size={18} /><div><strong>{t("page.downloads")}</strong><small>{running ? t("c.running", { count: running }) : t("tb.recentDl")}</small></div></div>
        <DownloadList compact limit={5} />
        <button className="btn ghost full" onClick={() => b.openPage("downloads")}>{t("tb.allDl")}</button>
      </Popover>

      <Popover open={b.popover === "menu"} onClose={close} className="pop-right pop-menu pop-hub" label={t("hub.title")}>
        {b.popover === "menu" && <Hub />}
      </Popover>

      <Popover open={b.popover === "toolbar"} onClose={close} className="pop-right pop-toolbar" label={t("tbc.title")}>
        {b.popover === "toolbar" && <ToolbarCustomizer />}
      </Popover>
    </div>
  );
}

/** One entry point for everything: pages, tools and settings, with a filter field. */
function Hub() {
  const b = useBrowser();
  const { t, fmtPct } = useT();
  const [q, setQ] = useState("");
  const tab = b.activeTab, page = b.activePage;
  const close = () => b.setPopover(null);
  const audio = b.tabs.some(x => x.playingAudio);
  const web = !!tab && !page && isWebUrl(tab.url);
  /** Eight tiles in two rows of four, short single-line labels (full page name in the tooltip and the filter) */
  const tiles: { id: string; icon: ReactNode; label: string; full: string; hint?: string; run(): void; live?: boolean }[] = [
    { id: "bookmarks", icon: <IconBookmarks size={18} />, label: t("page.bookmarks"), full: t("page.bookmarks"), hint: b.keyHint("open.bookmarks"), run: () => b.openPage("bookmarks") },
    { id: "history", icon: <IconHistory size={18} />, label: t("page.history"), full: t("page.history"), hint: b.keyHint("open.history"), run: () => b.openPage("history") },
    { id: "downloads", icon: <IconDownload size={18} />, label: t("page.downloads"), full: t("page.downloads"), hint: b.keyHint("open.downloads"), run: () => b.openPage("downloads") },
    { id: "extensions", icon: <IconPuzzle size={18} />, label: t("page.extensions"), full: t("page.extensions"), run: () => b.openPage("extensions") },
    { id: "themes", icon: <IconPalette size={18} />, label: t("hub.short.themes"), full: t("page.themes"), run: () => b.openPage("themes") },
    { id: "audio", icon: <IconMusic size={18} />, label: t("hub.short.audio"), full: audio ? t("tb.audioPlaying") : t("page.audio"), run: () => b.openPage("audio"), live: audio },
    { id: "privacy", icon: <IconShield size={18} />, label: t("page.privacy"), full: t("page.privacy"), run: () => b.openPage("privacy") },
    { id: "settings", icon: <IconSettings size={18} />, label: t("page.settings"), full: t("page.settings"), hint: b.keyHint("open.settings"), run: () => b.openPage("settings") },
  ];
  /** Less frequent pages: plain menu items under "More" */
  const more: { id: string; icon: ReactNode; label: string; run(): void }[] = [
    { id: "performance", icon: <IconGauge size={15} />, label: t("page.performance"), run: () => b.openPage("performance") },
    { id: "market", icon: <IconStore size={15} />, label: t("page.market"), run: () => b.openPage("market") },
    { id: "changelog", icon: <IconInfo size={15} />, label: t("page.changelog"), run: () => b.openPage("changelog") },
  ];
  const actions: { id: string; icon: ReactNode; label: string; hint?: string; run(): void }[] = [
    { id: "newtab", icon: <IconPlus size={15} />, label: t("c.newTab"), hint: b.keyHint("tab.new"), run: () => b.newTab() },
    { id: "palette", icon: <IconCommand size={15} />, label: t("cmd.ui.palette"), hint: b.keyHint("ui.palette"), run: () => b.openPalette("all") },
    { id: "find", icon: <IconSearch size={15} />, label: t("tb.findDots"), hint: b.keyHint("page.find"), run: () => { close(); b.openFind(); } },
    { id: "print", icon: <IconPrint size={15} />, label: t("tb.printDots"), hint: b.keyHint("page.print"), run: () => { close(); b.print(); } },
    { id: "sleep", icon: <IconMoon size={15} />, label: t("cmd.tab.sleepInactive"), run: () => { close(); b.sleepInactiveTabs(); } },
    { id: "split", icon: <IconSplit size={15} />, label: t("tbi.split"), hint: b.keyHint("view.split"), run: () => { close(); b.toggleSplit(); } },
    { id: "shortcuts", icon: <IconKeyboard size={15} />, label: t("tb.shortcuts"), run: () => b.openPage("settings", { section: "shortcuts" }) },
    { id: "toolbar", icon: <IconMenu size={15} />, label: t("tbc.title"), run: () => b.setPopover("toolbar") },
  ];
  const fq = q.trim();
  const tShown = tiles.filter(x => !fq || matches(fq, x.label, x.id, x.full));
  const aShown = actions.filter(x => !fq || matches(fq, x.label, x.id));
  const mShown = more.filter(x => !fq || matches(fq, x.label, x.id));
  return (
    <div className="hub">
      <label className="search-field hub-search">
        <IconSearch size={14} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("hub.search")} aria-label={t("hub.search")} spellCheck={false}
          onKeyDown={e => { if (e.key === "Enter") { const f = tShown[0] ?? aShown[0] ?? mShown[0]; if (f) f.run(); } }} />
      </label>
      {tShown.length > 0 && (
        <div className="hub-grid">
          {tShown.map(x => (
            <button key={x.id} className={`hub-tile${tab?.internal === x.id ? " on" : ""}${x.live ? " live" : ""}`} onClick={x.run} title={x.hint ? `${x.full} (${x.hint})` : x.full}>
              {x.icon}<span>{x.label}</span>
            </button>
          ))}
        </div>
      )}
      {!fq && web && (
        <div className="menu-zoom">
          <span className="menu-icon"><IconSearch size={15} /></span><span>{t("tb.zoom")}</span>
          <button className="icon-btn sm" title={t("tb.zoomOutTitle", { keys: b.keyHint("page.zoomOut") ?? "" })} aria-label={t("cmd.page.zoomOut")} disabled={!tab || !!page} onClick={() => b.zoomStep(-1)}>−</button>
          <button className="zoom-val" title={t("tb.zoomResetTitle", { keys: b.keyHint("page.zoomReset") ?? "" })} disabled={!tab || !!page} onClick={() => b.zoomStep(0)}>{fmtPct(Math.round((tab && !page ? tab.zoom : 1) * 100))}</button>
          <button className="icon-btn sm" title={t("tb.zoomInTitle", { keys: b.keyHint("page.zoomIn") ?? "" })} aria-label={t("cmd.page.zoomIn")} disabled={!tab || !!page} onClick={() => b.zoomStep(1)}>+</button>
        </div>
      )}
      {aShown.length > 0 && <div className="menu-sep" />}
      {aShown.map(x => <MenuItem key={x.id} icon={x.icon} label={x.label} hint={x.hint} onClick={x.run} />)}
      {mShown.length > 0 && <div className="menu-sep labeled" role="separator"><span>{t("hub.more")}</span></div>}
      {mShown.map(x => <MenuItem key={x.id} icon={x.icon} label={x.label} onClick={x.run} />)}
      {tShown.length + aShown.length + mShown.length === 0 && <p className="muted small hub-empty">{t("hub.nothing")}</p>}
    </div>
  );
}

/** "Customize toolbar": drag & drop between the current layout and the palette of available buttons. */
function ToolbarCustomizer() {
  const b = useBrowser();
  const { t } = useT();
  const layout = normalizeToolbar(b.settings.toolbar);
  const avail = TOOLBAR_ITEMS.filter(x => !layout.includes(x));
  const [drag, setDrag] = useState<ToolbarItem | null>(null);
  const set = (l: ToolbarItem[]) => b.updateSettings({ toolbar: l });
  const dropAt = (target: ToolbarItem | null) => {
    if (!drag) return;
    const l = layout.filter(x => x !== drag);
    const i = target ? l.indexOf(target) : -1;
    if (i < 0) l.push(drag); else l.splice(i, 0, drag);
    set(l); setDrag(null);
  };
  const move = (id: ToolbarItem, dir: -1 | 1) => {
    const l = [...layout]; const i = l.indexOf(id); const j = i + dir;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]]; set(l);
  };
  return (
    <div className="tbc">
      <div className="pop-head"><IconMenu size={18} /><div><strong>{t("tbc.title")}</strong><small>{t("tbc.hint")}</small></div></div>
      <div className="tbc-label">{t("tbc.current")}</div>
      <div className="tbc-list" onDragOver={e => e.preventDefault()} onDrop={() => dropAt(null)}>
        {layout.map(id => (
          <div key={id} className={`tbc-item${drag === id ? " dragging" : ""}`} draggable onDragStart={() => setDrag(id)} onDragEnd={() => setDrag(null)}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); dropAt(id); }}
            tabIndex={0} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(id, -1); else if (e.key === "ArrowRight" || e.key === "ArrowDown") move(id, 1); else if ((e.key === "Delete" || e.key === "Backspace") && id !== "hub") set(layout.filter(x => x !== id)); }}
            title={toolbarItemLabel(id)}>
            <span className="tbc-icon">{ITEM_ICON[id]}</span><span className="tbc-name">{toolbarItemLabel(id)}</span>
            {id !== "hub" && <button className="icon-btn sm" title={t("c.remove")} aria-label={t("tbc.removeNamed", { name: toolbarItemLabel(id) })} onClick={() => set(layout.filter(x => x !== id))}><IconClose size={12} /></button>}
          </div>
        ))}
      </div>
      <div className="tbc-label">{t("tbc.available")}</div>
      <div className="tbc-list avail" onDragOver={e => e.preventDefault()} onDrop={() => { if (drag && drag !== "hub") { set(layout.filter(x => x !== drag)); setDrag(null); } }}>
        {avail.length === 0 && <span className="muted small">{t("tbc.allUsed")}</span>}
        {avail.map(id => (
          <button key={id} className="tbc-item" draggable onDragStart={() => setDrag(id)} onDragEnd={() => setDrag(null)} onClick={() => set([...layout, id])} title={t("tbc.add")}>
            <span className="tbc-icon">{ITEM_ICON[id]}</span><span className="tbc-name">{toolbarItemLabel(id)}</span><IconPlus size={12} />
          </button>
        ))}
      </div>
      <div className="row-end">
        <button className="btn ghost" disabled={layout.join() === DEFAULT_TOOLBAR.join()} onClick={() => b.updateSettingsUndoable({ toolbar: DEFAULT_TOOLBAR }, t("undo.toolbarReset"))}>{t("c.reset")}</button>
        <button className="btn primary" onClick={() => b.setPopover(null)}>{t("c.done")}</button>
      </div>
    </div>
  );
}

function BookmarkEditor({ id, title, onDone }: { id: string; title: string; onDone(): void }) {
  const b = useBrowser();
  const { t: tr } = useT();
  const [t, setT] = useState(title);
  return (
    <div className="bm-editor">
      <div className="pop-head"><IconStar size={18} /><div><strong>{tr("tb.bmSaved")}</strong><small>{tr("tb.bmSavedHint")}</small></div></div>
      <label className="field"><span>{tr("c.name")}</span><input autoFocus value={t} onChange={e => setT(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { b.updateBookmark(id, { title: t }); onDone(); } }} /></label>
      <div className="row-end">
        <button className="btn ghost" onClick={() => { b.removeBookmark(id); onDone(); }}>{tr("c.remove")}</button>
        <button className="btn primary" onClick={() => { b.updateBookmark(id, { title: t }); onDone(); }}>{tr("c.done")}</button>
      </div>
    </div>
  );
}
