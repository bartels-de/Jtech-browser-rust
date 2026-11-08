import type { SVGProps } from "react";
import jtechLogoUrl from "../assets/jtech-logo.png";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 16): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
});
const mk = (d: React.ReactNode) => ({ size, ...p }: P) => <svg {...base(size)} {...p}>{d}</svg>;

export const IconBack = mk(<path d="M15 18l-6-6 6-6" />);
export const IconForward = mk(<path d="M9 18l6-6-6-6" />);
export const IconReload = mk(<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>);
export const IconStop = mk(<path d="M6 6l12 12M18 6L6 18" />);
export const IconClose = mk(<path d="M7 7l10 10M17 7L7 17" />);
export const IconHome = mk(<><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></>);
export const IconPlus = mk(<path d="M12 5v14M5 12h14" />);
export const IconLock = mk(<><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const IconWarn = mk(<><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.01" /></>);
export const IconGlobe = mk(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></>);
export const IconStar = mk(<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />);
export const IconDownload = mk(<><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>);
export const IconShield = mk(<><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>);
export const IconMenu = mk(<><circle cx="12" cy="5.5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="18.5" r="1.2" fill="currentColor" /></>);
export const IconSidebar = mk(<><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M9.5 4.5v15" /></>);
export const IconPin = mk(<><path d="M9 4h6l-1 6 3 3H7l3-3z" /><path d="M12 13v7" /></>);
export const IconSettings = mk(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
export const IconHistory = mk(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>);
export const IconBookmarks = mk(<path d="M6 3.5h12v17l-6-4-6 4z" />);
export const IconSearch = mk(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>);
export const IconTrash = mk(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>);
export const IconEdit = mk(<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />);
export const IconPuzzle = mk(<path d="M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4h2a2 2 0 1 0 0-4H6V6h4z" />);

export const IconVolume = mk(<><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>);
export const IconMute = mk(<><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>);
export const IconChevronDown = mk(<path d="M6 9l6 6 6-6" />);
export const IconChevronRight = mk(<path d="M9 6l6 6-6 6" />);
export const IconChevronUp = mk(<path d="M6 15l6-6 6 6" />);
export const IconPalette = mk(<><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.6 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" /><circle cx="7.5" cy="11" r="1" fill="currentColor" /><circle cx="10" cy="7" r="1" fill="currentColor" /><circle cx="15" cy="7.5" r="1" fill="currentColor" /></>);
export const IconGauge = mk(<><path d="M4.5 18a9 9 0 1 1 15 0" /><path d="M12 13l4-5" /><circle cx="12" cy="13.5" r="1.3" fill="currentColor" /></>);
export const IconMusic = mk(<><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>);
export const IconPrint = mk(<><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="8" rx="2" /><path d="M7 14h10v6.5H7z" /></>);
export const IconMoon = mk(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />);
export const IconCommand = mk(<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />);
export const IconKeyboard = mk(<><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8" /></>);
export const IconFolder = mk(<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />);
/** Market / store bag */
export const IconStore = mk(<><path d="M4 8.5h16l-1.2 10.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z" /><path d="M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5" /></>);
export const IconCheck = mk(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconInfo = mk(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></>);
export const IconCopy = mk(<><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" /><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></>);
export const IconLayers = mk(<><path d="M12 3.5l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>);

/** JTech logo (raster asset, 256 px source, scaled down for every use). */
export function JTechLogo({ size = 28 }: { size?: number }) {
  return (
    <img className="jtech-logo" src={jtechLogoUrl} width={size} height={size} alt="JTech"
      style={{ borderRadius: Math.max(3, Math.round(size * 0.22)) }} draggable={false} />
  );
}

/* Window controls (Windows 11 caption glyphs, 10px drawn on a 24 grid) */
const cap = (d: React.ReactNode) => ({ size = 10, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1} aria-hidden {...p}>{d}</svg>
);
export const IconWinMin = cap(<path d="M0 5h10" />);
export const IconWinMax = cap(<rect x="0.5" y="0.5" width="9" height="9" rx="1.2" />);
export const IconWinRestore = cap(<><rect x="0.5" y="2.5" width="7" height="7" rx="1.2" /><path d="M2.5 2.5V1.7c0-.7.5-1.2 1.2-1.2h4.6c.7 0 1.2.5 1.2 1.2v4.6c0 .7-.5 1.2-1.2 1.2h-.8" /></>);
export const IconWinClose = cap(<path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />);
export const IconLibrary = mk(<><path d="M5 4v16M9.5 4v16" /><path d="M14 4.8l4.6 14.4" /></>);
