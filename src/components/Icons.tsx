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

/** JTech logo (raster asset, 256 px source, scaled down for every use). */
export function JTechLogo({ size = 28 }: { size?: number }) {
  return (
    <img className="jtech-logo" src={jtechLogoUrl} width={size} height={size} alt="JTech"
      style={{ borderRadius: Math.max(3, Math.round(size * 0.22)) }} draggable={false} />
  );
}
