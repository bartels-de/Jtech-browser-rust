import { useState } from "react";
import { faviconUrl, hostOf, type InternalPage } from "../lib/urls";
import { IconBookmarks, IconDownload, IconGauge, IconGlobe, IconHistory, IconInfo, IconMusic, IconPalette, IconPuzzle, IconSettings, IconShield, IconStore, JTechLogo } from "./Icons";

/** Icon per internal page (sidebar, address bar); the start page keeps the JTech logo. */
const PAGE_ICON: Record<Exclude<InternalPage, "newtab">, (p: { size?: number }) => React.ReactElement> = {
  settings: IconSettings, history: IconHistory, bookmarks: IconBookmarks, downloads: IconDownload, privacy: IconShield, themes: IconPalette,
  audio: IconMusic, performance: IconGauge, market: IconStore, extensions: IconPuzzle, changelog: IconInfo,
};

export function PageIcon({ page, size = 16 }: { page: InternalPage; size?: number }) {
  if (page === "newtab") return <JTechLogo size={size} />;
  const Icon = PAGE_ICON[page];
  return <Icon size={size} />;
}

/** `internal`: true (generic JTech logo) or the internal page id (page icon). */
export function Favicon({ url, internal, size = 16 }: { url: string; internal?: boolean | InternalPage | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (internal === true || internal === "newtab") return <span className="favicon"><JTechLogo size={size} /></span>;
  if (internal) return <span className="favicon favicon-page"><PageIcon page={internal} size={size} /></span>;
  const src = faviconUrl(url);
  if (!src || failed === src) {
    const letter = hostOf(url).replace(/^www\./, "").charAt(0).toUpperCase();
    return letter
      ? <span className="favicon favicon-letter" style={{ width: size, height: size, fontSize: size * 0.62 }}>{letter}</span>
      : <span className="favicon"><IconGlobe size={size} /></span>;
  }
  return <img className="favicon" src={src} width={size} height={size} alt="" onError={() => setFailed(src)} />;
}
