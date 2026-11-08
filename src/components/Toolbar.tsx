import { useEffect, useMemo, useRef, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { hostOf, internalUrl, isWebUrl, securityOf } from "../lib/urls";
import { IconBack, IconBookmarks, IconDownload, IconForward, IconHistory, IconHome, IconLock, IconMenu, IconPlus, IconReload, IconSettings, IconShield, IconStar, IconStop, IconWarn, IconGlobe, IconSearch, IconPalette, IconMusic, IconGauge, IconPrint, IconMoon, IconCommand, IconKeyboard, IconPuzzle, IconStore, JTechLogo } from "./Icons";
import { MenuItem, Popover } from "./Popover";
import { DownloadList } from "./DownloadList";
import { addressSuggestions, type Suggestion } from "../lib/suggest";
import { SiteShieldToggle } from "./SiteShieldToggle";
import { useT } from "../i18n";
import { formatCombo } from "../lib/keys";
import { WindowControls } from "./WindowControls";

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
  const suggestions = useMemo(() => (editing && typed ? addressSuggestions(text, { history: b.history, bookmarks: b.bookmarks, bangs: b.settings.bangs, tabs: b.tabs }) : []),
    [editing, typed, text, b.history, b.bookmarks, b.settings.bangs, b.tabs]);
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
  const bookmark = tab && !page ? b.isBookmarked(tab.url) : undefined;
  const canBookmark = !!tab && !page;
  const close = () => b.setPopover(null);
  const toggle = (p: Exclude<typeof b.popover, null>) => b.setPopover(b.popover === p ? null : p);

  return (
    <div className="toolbar" data-tauri-drag-region>
      <div className="nav-group">
        <button className="icon-btn" title={t("tb.backTitle")} aria-label={t("cmd.nav.back")} onClick={b.back} disabled={!tab || (!tab.canGoBack && !(page && isWebUrl(tab.url)))}><IconBack /></button>
        <button className="icon-btn" title={t("tb.forwardTitle")} aria-label={t("cmd.nav.forward")} onClick={b.forward} disabled={!tab || !!page || !tab.canGoForward}><IconForward /></button>
        {tab?.loading
          ? <button className="icon-btn" title={t("tb.stopTitle")} aria-label={t("cmd.nav.stop")} onClick={b.stop}><IconStop /></button>
          : <button className="icon-btn" title={t("tb.reloadTitle", { keys: b.keysFor("nav.reload").map(formatCombo).join(" / ") || "F5" })} aria-label={t("cmd.nav.reload")} onClick={b.reload} disabled={!tab || !!page}><IconReload /></button>}
        <button className="icon-btn" title={t("tb.homeTitle")} aria-label={t("cmd.nav.home")} onClick={b.home}><IconHome /></button>
      </div>

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
          {sec === "secure" ? <IconLock size={14} /> : sec === "insecure" ? <><IconWarn size={14} /><span className="sec-label">{t("tb.notSecure")}</span></> : sec === "internal" ? <JTechLogo size={15} /> : <IconGlobe size={14} />}
        </span>
        {pretty && (
          <span className="omni-display" aria-hidden onMouseDown={e => { e.preventDefault(); inputRef.current?.focus(); }}>
            <span className="omni-host">{pretty.host}</span><span className="omni-rest">{pretty.rest}</span>
          </span>
        )}
        <input
          ref={inputRef}
          className={pretty ? "is-pretty" : undefined}
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
          }}
          aria-label={t("tb.address")}
        />
        {tab && !page && Math.abs(tab.zoom - 1) > 0.001 && (
          <button type="button" className="zoom-chip" title={t("tb.zoomReset", { keys: b.keyHint("page.zoomReset") ?? "" })} onClick={() => b.zoomStep(0)}>{fmtPct(Math.round(tab.zoom * 100))}</button>
        )}
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
          {suggestions.map((sg, i) => (
            <button key={sg.key} type="button" role="option" aria-selected={i === sel} className={`suggest-item${i === sel ? " on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => choose(sg)}>
              <span className={`palette-kind k-${sg.kind}`}>{({ go: "↵", bang: t("tb.kind.bang"), page: t("tb.kind.page"), bookmark: "★", history: t("tb.kind.history"), tab: t("tb.kind.tab"), command: "" } as Record<string, string>)[sg.kind]}</span>
              <span className="palette-title">{sg.title}</span>
              {sg.hint && <span className="palette-hint">{sg.hint}</span>}
            </button>
          ))}
        </div>
      )}
      </div>

      <div className="nav-group">
        <button data-pop-toggle="shield" className={`icon-btn shield${b.settings.adblock ? "" : " off"}${b.popover === "shield" ? " on" : ""}`} title={b.settings.adblock ? t("tb.shieldOn") : t("tb.shieldOff")} aria-label="JTech Shield" aria-expanded={b.popover === "shield"} onClick={() => toggle("shield")}>
          <IconShield />
          {b.settings.adblock && (tab?.blocked ?? 0) > 0 && <span className="count-badge">{(tab?.blocked ?? 0) > 99 ? "99+" : tab?.blocked}</span>}
        </button>
        <button data-pop-toggle="downloads" className={`icon-btn${b.popover === "downloads" ? " on" : ""}`} title={t("page.downloads")} aria-label={t("page.downloads")} aria-expanded={b.popover === "downloads"} onClick={() => toggle("downloads")}><IconDownload />{running > 0 && <span className="count-badge">{running}</span>}</button>
        <button data-pop-toggle="menu" className={`icon-btn${b.popover === "menu" ? " on" : ""}`} title={t("tb.menu")} aria-label={t("tb.menu")} aria-haspopup="menu" aria-expanded={b.popover === "menu"} onClick={() => toggle("menu")}><IconMenu /></button>
      </div>
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

      <Popover open={b.popover === "menu"} onClose={close} className="pop-right pop-menu">
        <MenuItem icon={<IconPlus size={15} />} label={t("c.newTab")} hint={b.keyHint("tab.new")} onClick={() => b.newTab()} />
        <MenuItem icon={<IconCommand size={15} />} label={t("cmd.ui.palette")} hint={b.keyHint("ui.palette")} onClick={() => b.openPalette("all")} />
        <div className="menu-sep" />
        <div className="menu-zoom">
          <span className="menu-icon"><IconSearch size={15} /></span><span>{t("tb.zoom")}</span>
          <button className="icon-btn sm" title={t("tb.zoomOutTitle", { keys: b.keyHint("page.zoomOut") ?? "" })} aria-label={t("cmd.page.zoomOut")} disabled={!tab || !!page} onClick={() => b.zoomStep(-1)}>−</button>
          <button className="zoom-val" title={t("tb.zoomResetTitle", { keys: b.keyHint("page.zoomReset") ?? "" })} disabled={!tab || !!page} onClick={() => b.zoomStep(0)}>{fmtPct(Math.round((tab && !page ? tab.zoom : 1) * 100))}</button>
          <button className="icon-btn sm" title={t("tb.zoomInTitle", { keys: b.keyHint("page.zoomIn") ?? "" })} aria-label={t("cmd.page.zoomIn")} disabled={!tab || !!page} onClick={() => b.zoomStep(1)}>+</button>
        </div>
        <MenuItem icon={<IconSearch size={15} />} label={t("tb.findDots")} hint={b.keyHint("page.find")} onClick={() => { close(); b.openFind(); }} />
        <MenuItem icon={<IconPrint size={15} />} label={t("tb.printDots")} hint={b.keyHint("page.print")} onClick={() => { close(); b.print(); }} />
        <MenuItem icon={<IconMoon size={15} />} label={t("cmd.tab.sleepInactive")} onClick={() => { close(); b.sleepInactiveTabs(); }} />
        <div className="menu-sep" />
        <MenuItem icon={<IconBookmarks size={15} />} label={t("page.bookmarks")} hint={b.keyHint("open.bookmarks")} onClick={() => b.openPage("bookmarks")} />
        <MenuItem icon={<IconHistory size={15} />} label={t("page.history")} hint={b.keyHint("open.history")} onClick={() => b.openPage("history")} />
        <MenuItem icon={<IconDownload size={15} />} label={t("page.downloads")} hint={b.keyHint("open.downloads")} onClick={() => b.openPage("downloads")} />
        <MenuItem icon={<IconShield size={15} />} label={t("page.privacy")} onClick={() => b.openPage("privacy")} />
        <div className="menu-sep" />
        <MenuItem icon={<IconStore size={15} />} label={t("page.market")} onClick={() => b.openPage("market")} />
        <MenuItem icon={<IconPuzzle size={15} />} label={t("page.extensions")} onClick={() => b.openPage("extensions")} />
        <div className="menu-sep" />
        <MenuItem icon={<IconPalette size={15} />} label={t("page.themes")} onClick={() => b.openPage("themes")} />
        <MenuItem icon={<IconMusic size={15} />} label={b.tabs.some(x => x.playingAudio) ? t("tb.audioPlaying") : t("page.audio")} onClick={() => b.openPage("audio")} />
        <MenuItem icon={<IconGauge size={15} />} label={t("page.performance")} onClick={() => b.openPage("performance")} />
        <MenuItem icon={<IconKeyboard size={15} />} label={t("tb.shortcuts")} onClick={() => b.openPage("settings", { section: "shortcuts" })} />
        <div className="menu-sep" />
        <MenuItem icon={<IconSettings size={15} />} label={t("page.settings")} hint={b.keyHint("open.settings")} onClick={() => b.openPage("settings")} />
      </Popover>
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
