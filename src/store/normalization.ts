import { load } from "./storage";
import { GROUP_COLORS, type TabGroup } from "./types";
import { t as tr } from "../i18n";
import type { ActivityEvent } from "./contracts";
/** Runde 3: Zoomstufen wie in Chromium. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
export function nextZoom(cur: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find(z => z > cur + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find(z => z < cur - 0.001) ?? ZOOM_STEPS[0];
}
export const validZoom = (z: unknown): z is number => typeof z === "number" && Number.isFinite(z) && z >= 0.25 && z <= 5;
export const ACTIVITY_LIMIT = 500;
export function normalizeActivity(raw: unknown): ActivityEvent[] {
  if (!Array.isArray(raw)) return [];
  const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
  return raw.slice(0, ACTIVITY_LIMIT).flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const rawTime = item.time;
    const time = typeof rawTime === "number" && Number.isFinite(rawTime)
      ? Math.max(0, Math.min(rawTime, 8_640_000_000_000_000))
      : 0;
    return [{
      id: text(item.id, 80) || `activity-${index}-${time}`,
      time,
      kind: text(item.kind, 64) || "unknown",
      tabId: text(item.tabId, 64),
      tabTitle: text(item.tabTitle, 300),
      url: text(item.url, 4096),
      detail: text(item.detail, 512),
      reason: text(item.reason, 64) || "unknown",
    }];
  });
}
export function loadZoom(): Record<string, number> {
  const raw = load<Record<string, unknown>>("zoom", {});
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) if (k.length < 256 && validZoom(v)) out[k] = v;
  return out;
}
export function normalizeGroups(raw: unknown): TabGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(g => g && typeof g === "object" && typeof g.id === "string").slice(0, 50).map(g => ({
    id: String(g.id).slice(0, 40),
    name: typeof g.name === "string" ? g.name.slice(0, 30) : tr("st.group"),
    color: GROUP_COLORS.includes(g.color) ? g.color : GROUP_COLORS[0],
    collapsed: !!g.collapsed,
  }));
}
