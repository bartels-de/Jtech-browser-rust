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

  return (
    <div className="page">
      <div className="page-head">
        <h1>Performance</h1>
        <p className="muted">Speicher- und CPU-Auslastung der Browser-Prozesse (WebView2). Werte werden alle 2 Sekunden aktualisiert.</p>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
          <div><strong>Gesamt-Speicher:</strong> {stats ? fmtBytes(stats.totalMemoryBytes) : "…"}</div>
          <div><strong>Prozesse:</strong> {stats?.processes.length ?? 0}</div>
          <div><strong>Tabs:</strong> {stats?.tabCount ?? 0} (davon {sleeping} schlafend)</div>
          <div><strong>CPU (Summe):</strong> {totalCpu.toFixed(1)} %</div>
          <span className="spacer" />
          <label className="row"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Auto-Aktualisierung</label>
          <button className="btn" onClick={refresh}>Jetzt aktualisieren</button>
        </div>
        {heavy.length > 0 && (
          <div className="banner warn" role="alert" style={{ marginTop: 8 }}>
            <strong>Speicherintensive Prozesse erkannt</strong>
            <span className="muted"> {heavy.length} Prozess(e) über 200 MB – eventuell Tabs schlafen legen.</span>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Speicher-Trend (letzte {history.length} Messungen)</h3>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60 }}>
          {history.map((v, i) => {
            const max = Math.max(...history, 1);
            const h = (v / max) * 56;
            return <div key={i} title={fmtBytes(v)} style={{ flex: 1, height: h, background: "var(--accent, #2cc5c9)", borderRadius: 2, minWidth: 4 }} />;
          })}
        </div>
      </div>

      <div className="card">
        <h3>Prozesse (nach Speicher)</h3>
        <table className="data-table">
          <thead><tr><th>PID</th><th>Name</th><th>Speicher</th><th>Anteil</th><th>CPU</th></tr></thead>
          <tbody>
            {(stats?.processes ?? []).map(p => {
              const share = stats && stats.totalMemoryBytes > 0 ? (p.memoryBytes / stats.totalMemoryBytes) * 100 : 0;
              return (
                <tr key={p.pid}>
                  <td className="mono">{p.pid}</td>
                  <td>{p.name}</td>
                  <td>{fmtBytes(p.memoryBytes)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 80, height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${share}%`, height: "100%", background: "var(--accent, #2cc5c9)" }} />
                      </div>
                      <span className="muted small">{share.toFixed(1)} %</span>
                    </div>
                  </td>
                  <td>{(cpuPct[p.pid] ?? 0).toFixed(1)} %</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!stats && <p className="muted">Lade Daten…</p>}
      </div>

      {top && (
        <div className="card">
          <h3>Größter Prozess</h3>
          <p><strong>{top.name}</strong> (PID {top.pid}) – {fmtBytes(top.memoryBytes)} ({((top.memoryBytes / (stats?.totalMemoryBytes || 1)) * 100).toFixed(1)} %)</p>
        </div>
      )}

      <div className="card">
        <h3>Tipps</h3>
        <ul className="muted small">
          <li>Inaktive Tabs schlafen legen (Einstellungen → Tabs) gibt Speicher frei.</li>
          <li>Weniger gleichzeitig offene Tabs reduzieren den Speicherverbrauch.</li>
          <li>Der Werbeblocker reduziert Skripte und damit Speicher/CPU.</li>
          <li>Tabs mit hoher CPU-Auslastung sind oft durch Skripte oder Videos verursacht.</li>
        </ul>
      </div>
    </div>
  );
}