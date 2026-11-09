import { useBrowser } from "../store/BrowserStore";
import { COMMANDS, COMMAND_BY_ID, categoryLabel, COMMAND_CATEGORIES } from "../lib/commands";
import { DEFAULT_LIMITS, DEFAULT_RADIAL, RADIAL_MAX, RADIAL_MIN, normalizeLimits, normalizeRadial, type LimitSettings, type RadialSettings } from "../store/types";
import { Group, Row, Switch } from "./SettingsUI";
import { CommandIcon } from "./CommandIcon";
import { useT } from "../i18n";

/** Settings › Radial menu */
export function RadialSettings() {
  const b = useBrowser();
  const { t } = useT();
  const r = normalizeRadial(b.settings.radial, id => COMMAND_BY_ID.has(id));
  const set = (p: Partial<RadialSettings>) => b.updateSettings({ radial: { ...r, ...p } });
  const key = b.keyHint("ui.radial");
  const setCount = (n: number) => {
    const slots = [...r.slots];
    while (slots.length < n) slots.push(DEFAULT_RADIAL.slots.find(s => !slots.includes(s)) ?? "tab.duplicate");
    set({ slots: slots.slice(0, n) });
  };
  const choices = COMMANDS.filter(c => !c.hidden && c.id !== "ui.radial");
  return <>
    <Group title={t("rs.group")} desc={t("rs.desc")}>
      <Row title={t("rs.enable")} keywords="Radial Menu Kreis Pie">
        <Switch label={t("rs.enable")} checked={r.enabled} onChange={v => set({ enabled: v })} />
      </Row>
      <Row title={t("rs.trigger")} desc={t("rs.triggerDesc", { key: key ?? "–" })}>
        <div className="segmented" role="radiogroup" aria-label={t("rs.trigger")}>
          {(["both", "mouse", "keyboard"] as const).map(x => (
            <button key={x} role="radio" aria-checked={r.trigger === x} className={r.trigger === x ? "on" : ""} onClick={() => set({ trigger: x })}>{t(`rs.t.${x}`)}</button>
          ))}
        </div>
      </Row>
      <Row title={t("rs.count")}>
        <input type="range" min={RADIAL_MIN} max={RADIAL_MAX} value={r.slots.length} aria-label={t("rs.count")} onChange={e => setCount(Number(e.target.value))} />
        <span className="mono small">{r.slots.length}</span>
      </Row>
    </Group>
    <Group title={t("rs.slots")} desc={t("rs.slotsDesc")} actions={<button className="btn ghost sm" onClick={() => b.updateSettings({ radial: DEFAULT_RADIAL })}>{t("rs.reset")}</button>}>
      <div className="radial-preview" aria-hidden>
        {r.slots.map((id, i) => {
          const a = (i / r.slots.length) * Math.PI * 2 - Math.PI / 2;
          return <span key={i} className="radial-slot mini" style={{ left: 60 + Math.cos(a) * 44 - 14, top: 60 + Math.sin(a) * 44 - 14 }}><CommandIcon id={id} size={14} /></span>;
        })}
      </div>
      <div className="rs-slots">
        {r.slots.map((id, i) => (
          <label key={i} className="rs-slot">
            <span className="rs-num">{i + 1}</span>
            <CommandIcon id={id} size={16} />
            <select value={id} aria-label={t("rs.slotN", { n: i + 1 })} onChange={e => { const s = [...r.slots]; s[i] = e.target.value; set({ slots: s }); }}>
              {COMMAND_CATEGORIES.map(cat => (
                <optgroup key={cat} label={categoryLabel(cat)}>
                  {choices.filter(c => c.category === cat).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        ))}
      </div>
    </Group>
    <Group title={t("peek.group")} desc={t("peek.desc")}>
      <Row title={t("peek.enable")} keywords="Peek Vorschau Preview Shift">
        <Switch label={t("peek.enable")} checked={b.settings.peekEnabled !== false} onChange={v => b.updateSettings({ peekEnabled: v })} />
      </Row>
    </Group>
    <Group title={t("cm.group")} desc={t("cm.desc")}>
      <Row title={t("cm.standard")} desc={t("cm.standardDesc")} keywords="Kontextmenü Rechtsklick Context menu right-click WebView2">
        <Switch label={t("cm.standard")} checked={b.settings.standardContextMenu === true} onChange={v => b.updateSettings({ standardContextMenu: v })} />
      </Row>
    </Group>
  </>;
}

/** Settings › Resource limits */
export function LimitSettingsSection() {
  const b = useBrowser();
  const { t } = useT();
  const l = normalizeLimits(b.settings.limits);
  const set = (p: Partial<LimitSettings>) => b.updateSettings({ limits: { ...l, ...p } });
  return <>
    <Group title={t("rl.group")} desc={t("rl.desc")}>
      <Row title={t("rl.enable")} keywords="Limit RAM CPU Speicher Memory Throttle">
        <Switch label={t("rl.enable")} checked={l.enabled} onChange={v => set({ enabled: v })} />
      </Row>
      <Row title={t("rl.low")} desc={t("rl.lowDesc")}>
        <Switch label={t("rl.low")} disabled={!l.enabled} checked={l.lowMemoryBackground} onChange={v => set({ lowMemoryBackground: v })} />
      </Row>
      <Row title={t("rl.suspend")} desc={t("rl.suspendDesc")}>
        <select value={l.suspendAfterMin} disabled={!l.enabled} aria-label={t("rl.suspend")} onChange={e => set({ suspendAfterMin: Number(e.target.value) })}>
          {[0, 2, 5, 10, 20, 30, 60].map(m => <option key={m} value={m}>{m === 0 ? t("c.off") : t("rl.minutes", { n: m })}</option>)}
        </select>
      </Row>
      <Row title={t("rl.mem")} desc={t("rl.memDesc")}>
        <select value={l.globalMemoryMb} disabled={!l.enabled} aria-label={t("rl.mem")} onChange={e => set({ globalMemoryMb: Number(e.target.value) })}>
          {[0, 1024, 1536, 2048, 3072, 4096, 6144, 8192].map(m => <option key={m} value={m}>{m === 0 ? t("c.off") : `${(m / 1024).toLocaleString()} GB`}</option>)}
        </select>
      </Row>
      <Row title={t("rl.cpu")} desc={t("rl.cpuDesc")}>
        <select value={l.cpuThreshold} disabled={!l.enabled} aria-label={t("rl.cpu")} onChange={e => set({ cpuThreshold: Number(e.target.value) })}>
          {[0, 25, 50, 75, 100, 150, 200].map(m => <option key={m} value={m}>{m === 0 ? t("c.off") : `${m} %`}</option>)}
        </select>
      </Row>
      <div className="row-end"><button className="btn ghost sm" onClick={() => b.updateSettings({ limits: { ...DEFAULT_LIMITS, enabled: l.enabled } })}>{t("rl.reset")}</button></div>
    </Group>
    <Group title={t("rl.honestTitle")}>
      <ul className="tips"><li>{t("rl.h1")}</li><li>{t("rl.h2")}</li><li>{t("rl.h3")}</li><li>{t("rl.h4")}</li></ul>
    </Group>
  </>;
}
