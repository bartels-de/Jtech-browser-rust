import { useEffect, useRef, useState } from "react";
import { useBrowser } from "../store/BrowserStore";
import { call } from "../lib/ipc";

interface Proc { pid: number; name: string; memoryBytes: number; cpuTime100ns: number; commandLine: string; }
interface PerfStats { totalMemoryBytes: number; processes: Proc[]; tabCount: number; }

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function PerformancePage() {
  const b = useBrowser();
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
          <h1>Performance</h1>
          <p className="muted">Speicher und CPU der Browser-Prozesse (WebView2){auto ? " · aktualisiert alle 2 Sekunden" : ""}</p>
        </div>
        <div className="row gap">
          <label className="switch-row small"><span>Live</span>
            <input type="checkbox" className="switch" aria-label="Automatisch aktualisieren" checked={auto} onChange={e => setAuto(e.target.checked)} /></label>
          <button className="btn" onClick={refresh}>Jetzt aktualisieren</button>
        </div>
      </header>

      <div className="kpi-row">
        <div className="kpi"><span className="kpi-num">{stats ? fmtBytes(stats.totalMemoryBytes) : "…"}</span><span className="kpi-label">Arbeitsspeicher gesamt</span></div>
        <div className="kpi"><span className="kpi-num">{totalCpu.toFixed(1)} %</span><span className="kpi-label">CPU (Summe)</span></div>
        <div className="kpi"><span className="kpi-num">{stats?.processes.length ?? 0}</span><span className="kpi-label">Prozesse</span></div>
        <div className="kpi"><span className="kpi-num">{stats?.tabCount ?? 0}</span><span className="kpi-label">Tabs, davon {sleeping} schlafend</span></div>
      </div>

      {heavy.length > 0 && (
        <div className="banner warn" role="status">
          <strong>{heavy.length} {heavy.length === 1 ? "Prozess braucht" : "Prozesse brauchen"} über 200 MB</strong>
          <span className="muted">Inaktive Tabs schlafen legen gibt Speicher frei.</span>
          <span className="spacer" />
          <button className="btn sm" onClick={b.sleepInactiveTabs}>Inaktive Tabs schlafen legen</button>
        </div>
      )}

      <section className="card">
        <h2>Speicherverlauf</h2>
        <div className="spark" role="img" aria-label={`Speicherverlauf der letzten ${history.length} Messungen`}>
          {history.map((v, i) => <span key={i} title={fmtBytes(v)} style={{ height: `${Math.max(4, (v / maxHist) * 100)}%` }} />)}
        </div>
        <small className="muted">Letzte {history.length} Messungen{top ? ` · größter Prozess: ${top.name} (${fmtBytes(top.memoryBytes)})` : ""}</small>
      </section>

      <section className="card">
        <h2>Prozesse nach Speicher</h2>
        <table className="data-table">
          <thead><tr><th>Name</th><th className="num-col">PID</th><th className="num-col">Speicher</th><th>Anteil</th><th className="num-col">CPU</th></tr></thead>
          <tbody>
            {(stats?.processes ?? []).map(p => {
              const share = stats && stats.totalMemoryBytes > 0 ? (p.memoryBytes / stats.totalMemoryBytes) * 100 : 0;
              return (
                <tr key={p.pid}>
                  <td>{p.name}</td>
                  <td className="num-col mono">{p.pid}</td>
                  <td className="num-col">{fmtBytes(p.memoryBytes)}</td>
                  <td><span className="share"><span className="bar"><span style={{ width: `${share}%` }} /></span><span className="muted small">{share.toFixed(1)} %</span></span></td>
                  <td className="num-col">{(cpuPct[p.pid] ?? 0).toFixed(1)} %</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!stats && <p className="muted">Daten werden geladen …</p>}
      </section>

      <section className="card">
        <h2>So sparst du Ressourcen</h2>
        <ul className="tips">
          <li>Inaktive Tabs automatisch schlafen legen: Einstellungen → Tabs.</li>
          <li>Der Werbeblocker verhindert viele Skripte und spart so Speicher und CPU.</li>
          <li>Hohe CPU-Last kommt meist von Videos oder aufwendigen Skripten einer Seite.</li>
        </ul>
      </section>
    </div>
  );
}
