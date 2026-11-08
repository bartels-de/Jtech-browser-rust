import { useState } from "react";
import { faviconUrl, hostOf } from "../lib/urls";
import { IconGlobe, JTechLogo } from "./Icons";

export function Favicon({ url, internal, size = 16 }: { url: string; internal?: boolean; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (internal) return <span className="favicon"><JTechLogo size={size} /></span>;
  const src = faviconUrl(url);
  if (!src || failed === src) {
    const letter = hostOf(url).replace(/^www\./, "").charAt(0).toUpperCase();
    return letter
      ? <span className="favicon favicon-letter" style={{ width: size, height: size, fontSize: size * 0.62 }}>{letter}</span>
      : <span className="favicon"><IconGlobe size={size} /></span>;
  }
  return <img className="favicon" src={src} width={size} height={size} alt="" onError={() => setFailed(src)} />;
}
