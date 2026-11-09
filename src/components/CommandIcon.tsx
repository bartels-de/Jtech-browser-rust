import type { ReactNode } from "react";
import { COMMAND_BY_ID } from "../lib/commands";
import {
  IconBack, IconForward, IconReload, IconPlus, IconClose, IconHistory, IconCopy, IconSplit, IconSettings, IconStar, IconSearch,
  IconPrint, IconHome, IconPin, IconMute, IconMoon, IconDownload, IconShield, IconPalette, IconMusic, IconGauge, IconStore,
  IconPuzzle, IconKeyboard, IconCommand, IconSidebar, IconLayers, IconStop, IconSwap, IconSplitRows, IconInfo, IconGlobe, IconBookmarks,
} from "./Icons";

type IconC = (p: { size?: number }) => ReactNode;
const BY_ID: Record<string, IconC> = {
  "nav.back": IconBack, "nav.forward": IconForward, "nav.reload": IconReload, "nav.stop": IconStop, "nav.home": IconHome, "nav.address": IconGlobe,
  "tab.new": IconPlus, "tab.close": IconClose, "tab.reopen": IconHistory, "tab.duplicate": IconCopy, "tab.pin": IconPin, "tab.mute": IconMute,
  "tab.sleepInactive": IconMoon, "tab.group": IconLayers, "tab.groupByDomain": IconLayers, "tab.groupInternal": IconLayers, "tab.closeOthers": IconClose,
  "tab.next": IconForward, "tab.prev": IconBack,
  "page.bookmark": IconStar, "page.find": IconSearch, "page.findNext": IconSearch, "page.findPrev": IconSearch, "page.print": IconPrint,
  "page.zoomIn": IconPlus, "page.zoomOut": IconClose, "page.zoomReset": IconSearch,
  "open.settings": IconSettings, "open.history": IconHistory, "open.bookmarks": IconBookmarks, "open.downloads": IconDownload, "open.privacy": IconShield,
  "open.themes": IconPalette, "open.audio": IconMusic, "open.performance": IconGauge, "open.market": IconStore, "open.extensions": IconPuzzle,
  "open.shortcuts": IconKeyboard, "open.changelog": IconInfo,
  "view.split": IconSplit, "view.splitSwap": IconSwap, "view.splitOrientation": IconSplitRows,
  "ui.palette": IconCommand, "ui.commands": IconCommand, "ui.sidebar": IconSidebar, "ui.bookmarksBar": IconStar, "ui.adblock": IconShield,
  "ui.theme": IconMoon, "ui.effects": IconPalette, "ui.fullscreen": IconLayers, "ui.radial": IconCommand,
};
const BY_CAT: Record<string, IconC> = { tabs: IconLayers, nav: IconGlobe, page: IconGlobe, open: IconSettings, view: IconSidebar };

/** Icon of a command (radial menu, slot picker). */
export function CommandIcon({ id, size = 18 }: { id: string; size?: number }) {
  const I = BY_ID[id] ?? BY_CAT[COMMAND_BY_ID.get(id)?.category ?? ""] ?? IconCommand;
  return <>{I({ size })}</>;
}
