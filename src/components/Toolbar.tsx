import { useEffect, useMemo, useRef, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { internalUrl, isWebUrl, securityOf } from "../lib/urls";
import { IconBack, IconBookmarks, IconDownload, IconForward, IconHistory, IconHome, IconLock, IconMenu, IconPlus, IconReload, IconSettings, IconShield, IconStar, IconStop, IconWarn, IconGlobe, IconPuzzle, IconSearch, IconSidebar, JTechLogo } from "./Icons";
import { MenuItem, Popover } from "./Popover";
import { DownloadList } from "./DownloadList";
import { addressSuggestions, type Suggestion } from "../lib/suggest";
import { SiteShieldToggle } from "./SiteShieldToggle";

export function Toolbar() {
  const b = useBrowser();
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
  const bookmark = tab && !page ? b.isBookmarked(tab.url) : undefined;
  const canBookmark = !!tab && !page;
  const close = () => b.setPopover(null);
  const toggle = (p: Exclude<typeof b.popover, null>) => b.setPopover(b.popover === p ? null : p);

  return (
    <div className="toolbar">
      <div className="nav-group">
        <button className="icon-btn" title="Zurück (Alt+←)" onClick={b.back} disabled={!tab || (!tab.canGoBack && !(page && isWebUrl(tab.url)))}><IconBack /></button>
        <button className="icon-btn" title="Vorwärts (Alt+→)" onClick={b.forward} disabled={!tab || !!page || !tab.canGoForward}><IconForward /></button>
        {tab?.loading
          ? <button className="icon-btn" title="Laden stoppen" onClick={b.stop}><IconStop /></button>
          : <button className="icon-btn" title="Neu laden (Strg+R / F5)" onClick={b.reload} disabled={!tab || !!page}><IconReload /></button>}
        <button className="icon-btn" title="Startseite" onClick={b.home}><IconHome /></button>
      </div>

      <div className="omni-wrap">
      <form className={`omnibox${editing ? " focused" : ""}${tab?.loading ? " loading" : ""}${b.popover === "suggest" ? " open" : ""}`} onSubmit={e => {
        e.preventDefault();
        if (sel >= 0 && suggestions[sel]) { choose(suggestions[sel]); return; }
        setEditing(false); setTyped(false); inputRef.current?.blur(); b.navigate(text);
      }}>
        <span className={`sec sec-${sec}`} title={
          sec === "secure" ? "Verbindung ist verschlüsselt (HTTPS)" :
          sec === "insecure" ? "Nicht sicher: unverschlüsselte Verbindung (HTTP)" :
          sec === "internal" ? "Interne JTech-Seite" : ""}>
          {sec === "secure" ? <IconLock size={14} /> : sec === "insecure" ? <><IconWarn size={14} /><span className="sec-label">Nicht sicher</span></> : sec === "internal" ? <JTechLogo size={15} /> : <IconGlobe size={14} />}
        </span>
        <input
          ref={inputRef}
          value={text}
          spellCheck={false}
          placeholder="Suchen oder Adresse eingeben"
          onFocus={e => { setEditing(true); e.currentTarget.select(); }}
          onBlur={() => { setEditing(false); setTyped(false); }}
          onChange={e => { setEditing(true); setTyped(true); setText(e.target.value); }}
          onKeyDown={e => {
            if (e.key === "Escape") { if (wantSuggest) { setTyped(false); return; } setText(shownUrl); e.currentTarget.blur(); }
            else if (e.key === "ArrowDown" && wantSuggest) { e.preventDefault(); setSel(s => Math.min(suggestions.length - 1, s + 1)); }
            else if (e.key === "ArrowUp" && wantSuggest) { e.preventDefault(); setSel(s => Math.max(-1, s - 1)); }
          }}
          aria-label="Adressleiste"
        />
        {tab && !page && Math.abs(tab.zoom - 1) > 0.001 && (
          <button type="button" className="zoom-chip" title="Zoom zurücksetzen (Strg+0)" onClick={() => b.zoomStep(0)}>{Math.round(tab.zoom * 100)} %</button>
        )}
        <button type="button" data-pop-toggle="bookmark" className={`icon-btn star${bookmark ? " on" : ""}`} disabled={!canBookmark}
          title={bookmark ? "Lesezeichen bearbeiten (Strg+D)" : "Lesezeichen hinzufügen (Strg+D)"}
          onClick={() => { if (tab && !bookmark) b.addBookmark(tab.url, tab.title); toggle("bookmark"); }}>
          <IconStar size={15} />
        </button>
        <span className="load-bar" />
      </form>
      {b.popover === "suggest" && (
        <div className="suggest glass" role="listbox" onMouseDown={e => e.preventDefault()}>
          {suggestions.map((sg, i) => (
            <button key={sg.key} type="button" role="option" aria-selected={i === sel} className={`suggest-item${i === sel ? " on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => choose(sg)}>
              <span className={`palette-kind k-${sg.kind}`}>{({ go: "↵", bang: "Bang", page: "Seite", bookmark: "★", history: "Verlauf", tab: "Tab", command: "" } as Record<string, string>)[sg.kind]}</span>
              <span className="palette-title">{sg.title}</span>
              {sg.hint && <span className="palette-hint">{sg.hint}</span>}
            </button>
          ))}
        </div>
      )}
      </div>

      <div className="nav-group">
        <button data-pop-toggle="shield" className={`icon-btn shield${b.settings.adblock ? "" : " off"}${b.popover === "shield" ? " on" : ""}`} title="Tracker- und Werbeblocker" aria-expanded={b.popover === "shield"} onClick={() => toggle("shield")}>
          <IconShield />
          {b.settings.adblock && (tab?.blocked ?? 0) > 0 && <span className="count-badge">{(tab?.blocked ?? 0) > 99 ? "99+" : tab?.blocked}</span>}
        </button>
        <button data-pop-toggle="downloads" className={`icon-btn${b.popover === "downloads" ? " on" : ""}`} title="Downloads" aria-expanded={b.popover === "downloads"} onClick={() => toggle("downloads")}><IconDownload />{running > 0 && <span className="count-badge">{running}</span>}</button>
        <button data-pop-toggle="menu" className={`icon-btn${b.popover === "menu" ? " on" : ""}`} title="Menü" aria-expanded={b.popover === "menu"} onClick={() => toggle("menu")}><IconMenu /></button>
      </div>

      <Popover open={b.popover === "bookmark"} onClose={close} className="pop-right pop-bookmark">
        {bookmark && <BookmarkEditor id={bookmark.id} title={bookmark.title} onDone={close} />}
      </Popover>

      <Popover open={b.popover === "shield"} onClose={close} className="pop-right">
        <div className="pop-head"><IconShield size={18} /><div><strong>JTech Shield</strong><small>{b.settings.adblock ? "Werbung & Tracker werden blockiert" : "Schutz ist ausgeschaltet"}</small></div></div>
        <div className="stat-row">
          <div className="stat"><span className="stat-num">{page ? "–" : tab?.blocked ?? 0}</span><span className="stat-label">auf dieser Seite</span></div>
          <div className="stat"><span className="stat-num">{b.totalBlocked}</span><span className="stat-label">seit dem Start</span></div>
        </div>
        <label className="switch-row">
          <span>Blocker aktiv</span>
          <input type="checkbox" className="switch" checked={b.settings.adblock} onChange={e => b.updateSettings({ adblock: e.target.checked })} />
        </label>
        {!page && b.popover === "shield" && <SiteShieldToggle url={tab?.url} />}
        <button className="btn ghost full" onClick={() => b.openPage("privacy")}>Datenschutz-Übersicht öffnen</button>
      </Popover>

      <Popover open={b.popover === "downloads"} onClose={close} className="pop-right">
        <div className="pop-head"><IconDownload size={18} /><div><strong>Downloads</strong><small>{running ? `${running} laufend` : "Zuletzt heruntergeladen"}</small></div></div>
        <DownloadList compact limit={5} />
        <button className="btn ghost full" onClick={() => b.openPage("downloads")}>Alle Downloads (jtech://downloads)</button>
      </Popover>

      <Popover open={b.popover === "menu"} onClose={close} className="pop-right pop-menu">
        <MenuItem icon={<IconPlus size={15} />} label="Neuer Tab" hint={b.keyHint("tab.new")} onClick={() => b.newTab()} />
        <MenuItem icon={<IconMenu size={15} />} label="Befehlspalette" hint={b.keyHint("ui.palette")} onClick={() => b.openPalette("all")} />
        <div className="menu-sep" />
        <div className="menu-zoom">
          <span>Zoom</span>
          <button className="icon-btn sm" title="Verkleinern (Strg −)" disabled={!tab || !!page} onClick={() => b.zoomStep(-1)}>−</button>
          <button className="zoom-val" title="Zurücksetzen (Strg 0)" disabled={!tab || !!page} onClick={() => b.zoomStep(0)}>{Math.round((tab && !page ? tab.zoom : 1) * 100)} %</button>
          <button className="icon-btn sm" title="Vergrößern (Strg +)" disabled={!tab || !!page} onClick={() => b.zoomStep(1)}>+</button>
        </div>
        <MenuItem icon={<IconSearch size={15} />} label="Auf Seite suchen" hint={b.keyHint("page.find")} onClick={() => { close(); b.openFind(); }} />
        <MenuItem icon={<IconGlobe size={15} />} label="Drucken…" hint={b.keyHint("page.print")} onClick={() => { close(); b.print(); }} />
        <MenuItem icon={<IconSidebar size={15} />} label="Inaktive Tabs schlafen legen" onClick={() => { close(); b.sleepInactiveTabs(); }} />
        <div className="menu-sep" />
        <MenuItem icon={<IconBookmarks size={15} />} label="Lesezeichen" hint={b.keyHint("open.bookmarks")} onClick={() => b.openPage("bookmarks")} />
        <MenuItem icon={<IconHistory size={15} />} label="Verlauf" hint={b.keyHint("open.history")} onClick={() => b.openPage("history")} />
        <MenuItem icon={<IconDownload size={15} />} label="Downloads" hint={b.keyHint("open.downloads")} onClick={() => b.openPage("downloads")} />
        <MenuItem icon={<IconShield size={15} />} label="Datenschutz" onClick={() => b.openPage("privacy")} />
        <MenuItem icon={<IconSettings size={15} />} label="Design-Studio" onClick={() => b.openPage("themes")} />
        <MenuItem icon={<IconGlobe size={15} />} label={`Audio-Hub${b.tabs.some(t => t.playingAudio) ? " (♪)" : ""}`} onClick={() => b.openPage("audio")} />
        <MenuItem icon={<IconMenu size={15} />} label="Tastenkürzel" onClick={() => b.openPage("settings", { section: "shortcuts" })} />
        <MenuItem icon={<IconPuzzle size={15} />} label="Erweiterungen (geplant)" onClick={() => b.setStatus("Erweiterungen sind noch nicht implementiert.")} />
        <div className="menu-sep" />
        <MenuItem icon={<IconSettings size={15} />} label="Einstellungen" hint={b.keyHint("open.settings")} onClick={() => b.openPage("settings")} />
      </Popover>
    </div>
  );
}

function BookmarkEditor({ id, title, onDone }: { id: string; title: string; onDone(): void }) {
  const b = useBrowser();
  const [t, setT] = useState(title);
  return (
    <div className="bm-editor">
      <div className="pop-head"><IconStar size={18} /><div><strong>Lesezeichen gespeichert</strong><small>Erscheint in der Lesezeichenleiste</small></div></div>
      <label className="field"><span>Name</span><input autoFocus value={t} onChange={e => setT(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { b.updateBookmark(id, { title: t }); onDone(); } }} /></label>
      <div className="row-end">
        <button className="btn ghost" onClick={() => { b.removeBookmark(id); onDone(); }}>Entfernen</button>
        <button className="btn primary" onClick={() => { b.updateBookmark(id, { title: t }); onDone(); }}>Fertig</button>
      </div>
    </div>
  );
}
