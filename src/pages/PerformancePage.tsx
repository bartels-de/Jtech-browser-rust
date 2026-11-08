import { useEffect, useRef, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { fmtBytes as fmtB, useT } from "../i18n";
import { call } from "../lib/ipc";

interface Proc { pid: number; name: string; memoryBytes: number; cpuTime100ns: number; commandLine: string; }
interface PerfStats { totalMemoryBytes: number; processes: Proc[]; tabCount: number; }

const fmtBytes = (n: number) => fmtB(n, n >= 1024 ** 3 ? 2 : 1);

export function PerformancePage() {
  const b = useBrowser();
  const { t, fmtPct } = useT();
  const [stats, setStats] = useState<PerfStats | null>(null);
  const [auto, setAuto] = useState(true);
  const [cpuPct, setCpuPct] = useState<Record<number, number>>({});
  const [history, setHistory] = useState<number[]>([]);
  const prevRef = useRef<{ time: number; cpu: Record<number, number> } | null>(null);

  const refresh = async () => {
    const s = await call<PerfStats>("get_performance_stats", undefined, b.setStatus);
    if (!s) return;
    const now = performance.now();
    const prev = prevRef.current;
    const nextCpu: Record<number, number> = {};
    if (prev) {
      const dt = (now - prev.time) * 10000; // ms -> 100ns
      for (const p of s.processes) {
        const prevCpu = prev.cpu[p.pid];
        if (prevCpu !== undefined && dt > 0) {
          const delta = p.cpuTime100ns - prevCpu;
          nextCpu[p.pid] = Math.max(0, Math.min(100, (delta / dt) * 100));
        } else {
          nextCpu[p.pid] = 0;
        }
      }
    }
    prevRef.current = { time: now, cpu: Object.fromEntries(s.processes.map(p => [p.pid, p.cpuTime100ns])) };
    setCpuPct(nextCpu);
    setStats(s);
    setHistory(h => [...h, s.totalMemoryBytes].slice(-30));
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!auto) return;
    const i = setInterval(refresh, 2000);
    return () => clearInterval(i);
  }, [auto]);

  const sleeping = b.tabs.filter(t => t.sleeping).length;
  const heavy = stats?.processes.filter(p => p.memoryBytes > 200 * 1024 * 1024) ?? [];
  const top = stats?.processes[0];
  const totalCpu = Object.values(cpuPct).reduce((a, c) => a + c, 0);

  const maxHist = Math.max(...history, 1);
  return (
    <div className="page doc-page perf-page">
      <header className="page-head row">
        <div>
          <h1>{t("page.performance")}</h1>
          <p className="muted">{t("pf.lead")}{auto ? t("pf.every2") : ""}</p>
        </div>
        <div className="row gap">
          <label className="switch-row small"><span>{t("pf.live")}</span>
            <input type="checkbox" className="switch" aria-label={t("pf.auto")} checked={auto} onChange={e => setAuto(e.target.checked)} /></label>
          <button className="btn" onClick={refresh}>{t("c.updateNow")}</button>
        </div>
      </header>

      <div className="kpi-row">
        <div className="kpi"><span className="kpi-num">{stats ? fmtBytes(stats.totalMemoryBytes) : <span className="skeleton skel-num" aria-label={t("c.loading")} />}</span><span className="kpi-label">{t("pf.memTotal")}</span></div>
        <div className="kpi"><span className="kpi-num">{fmtPct(totalCpu, 1)}</span><span className="kpi-label">{t("pf.cpuSum")}</span></div>
        <div className="kpi"><span className="kpi-num">{stats?.processes.length ?? 0}</span><span className="kpi-label">{t("pf.procs")}</span></div>
        <div className="kpi"><span className="kpi-num">{stats?.tabCount ?? 0}</span><span className="kpi-label">{t("pf.tabsSleeping", { n: sleeping })}</span></div>
      </div>

      {heavy.length > 0 && (
        <div className="banner warn" role="status">
          <strong>{t("pf.heavy", { count: heavy.length })}</strong>
          <span className="muted">{t("pf.heavyHint")}</span>
          <span className="spacer" />
          <button className="btn sm" onClick={b.sleepInactiveTabs}>{t("cmd.tab.sleepInactive")}</button>
        </div>
      )}

      <section className="card">
        <h2>{t("pf.memHistory")}</h2>
        {history.length === 0 && <div className="skeleton skel-chart" aria-hidden="true" />}
        <div className="spark" role="img" aria-label={t("pf.memHistoryAria", { count: history.length })}>
          {history.map((v, i) => <span key={i} title={fmtBytes(v)} style={{ height: `${Math.max(4, (v / maxHist) * 100)}%` }} />)}
        </div>
        <small className="muted">{t("pf.lastN", { count: history.length })}{top ? t("pf.biggest", { name: top.name, size: fmtBytes(top.memoryBytes) }) : ""}</small>
      </section>

      <section className="card">
        <h2>{t("pf.byMem")}</h2>
        <table className="data-table">
          <thead><tr><th>{t("pf.colName")}</th><th className="num-col">PID</th><th className="num-col">{t("pf.colMem")}</th><th>{t("pf.colShare")}</th><th className="num-col">CPU</th></tr></thead>
          <tbody>
            {(stats?.processes ?? []).map(p => {
              const share = stats && stats.totalMemoryBytes > 0 ? (p.memoryBytes / stats.totalMemoryBytes) * 100 : 0;
              return (
                <tr key={p.pid}>
                  <td>{p.name}</td>
                  <td className="num-col mono">{p.pid}</td>
                  <td className="num-col">{fmtBytes(p.memoryBytes)}</td>
                  <td><span className="share"><span className="bar"><span style={{ width: `${share}%` }} /></span><span className="muted small">{fmtPct(share, 1)}</span></span></td>
                  <td className="num-col">{fmtPct(cpuPct[p.pid] ?? 0, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!stats && <div className="skel-rows" role="status" aria-label={t("pf.dataLoading")}>{[0, 1, 2, 3].map(i => <span key={i} className="skeleton skel-row" />)}</div>}
      </section>

      <section className="card">
        <h2>{t("pf.tipsTitle")}</h2>
        <ul className="tips">
          <li>{t("pf.tip1")}</li>
          <li>{t("pf.tip2")}</li>
          <li>{t("pf.tip3")}</li>
        </ul>
      </section>
    </div>
  );
}
