import type { ReactNode } from "react";
import { PermissionSettings } from "../../components/PermissionSettings";
import { ShortcutEditor } from "../../components/ShortcutEditor";
import { StartEditor } from "../../components/StartEditor";
import { LimitSettingsSection, RadialSettings } from "../../components/FeatureSettings";
import { IconDownload, IconGlobe, IconInfo, IconKeyboard, IconSearch, IconSettings, IconShield, IconSidebar, IconPalette, IconLock, IconHome, IconCommand, IconGauge } from "../../components/Icons";
import { t, type TKey } from "../../i18n";
import { matches } from "../../lib/suggest";
import { COMMANDS } from "../../lib/commands";
import { General, Appearance, SearchSec } from "./SettingsGeneral";
import { TabsSec, PrivacySec, AdblockSec, DownloadsSec } from "./SettingsPrivacy";
import { About } from "./SettingsAbout";
export type SectionId = "general" | "appearance" | "startpage" | "radial" | "search" | "tabs" | "resources" | "privacy" | "adblock" | "permissions" | "downloads" | "shortcuts" | "about";
interface Section { id: SectionId; title: string; icon: ReactNode; keywords: string }
const SECTION_ICONS: [SectionId, ReactNode][] = [
  ["general", <IconSettings size={16} />],
  ["appearance", <IconPalette size={16} />],
  ["startpage", <IconHome size={16} />],
  ["radial", <IconCommand size={16} />],
  ["search", <IconSearch size={16} />],
  ["tabs", <IconSidebar size={16} />],
  ["resources", <IconGauge size={16} />],
  ["privacy", <IconLock size={16} />],
  ["adblock", <IconShield size={16} />],
  ["permissions", <IconGlobe size={16} />],
  ["downloads", <IconDownload size={16} />],
  ["shortcuts", <IconKeyboard size={16} />],
  ["about", <IconInfo size={16} />],
];
export const sections = (): Section[] => SECTION_ICONS.map(([id, icon]) => ({
  id, icon, title: t(`set.s.${id}` as TKey),
  keywords: t(`set.kw.${id}` as TKey) + (id === "shortcuts" ? " " + COMMANDS.map(c => c.title).join(" ") : ""),
}));

export function SectionBody({ id, q }: { id: SectionId; q: string }) {
  switch (id) {
    case "general": return <General />;
    case "appearance": return <Appearance />;
    case "startpage": return <div className="card"><StartEditor /></div>;
    case "radial": return <RadialSettings />;
    case "resources": return <LimitSettingsSection />;
    case "search": return <SearchSec />;
    case "tabs": return <TabsSec />;
    case "privacy": return <PrivacySec />;
    case "adblock": return <AdblockSec />;
    case "permissions": return <PermissionSettings />;
    case "downloads": return <DownloadsSec />;
    case "shortcuts": return <div className="card"><ShortcutEditor query={matches(q, t("set.kw.shortcuts")) ? "" : q} /></div>;
    case "about": return <About />;
  }
  return null;
}

