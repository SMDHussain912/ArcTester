import { useEffect, useState } from "react";

type ServerMetric = {
  instanceId: string; hostname: string; version: string; buildSha: string;
  startedAt: string; lastSeenAt: string; ageSeconds: number;
  status: "healthy" | "stale" | "offline";
  cpuPercent: number; rssBytes: number; heapUsedBytes: number;
  uptimeSeconds: number; activeRequests: number; requestsTotal: number;
  errorsTotal: number; requestRatePerMinute: number;
  p50LatencyMs: number; p95LatencyMs: number; dbLatencyMs: number | null;
};
type Snapshot = { ok: true; databaseStatus: "ready" | "unavailable"; serverTime: string; servers: ServerMetric[] };

const API = (import.meta.env.VITE_API_URL || "https://arctester.onrender.com").replace(/\/+$/, "");
const number = (value: number) => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";
const bytes = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = value, unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return number(size) + " " + units[unit];
};
const duration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export default function AdminSystemMonitor() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(API + "/admin/ops/servers", { credentials: "include", headers: { accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 403 ? "Administrator access is required." : "Server metrics could not be loaded.");
      setSnapshot(body as Snapshot);
      setLastRefresh(new Date().toISOString());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Server metrics could not be loaded.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const healthy = snapshot?.servers.filter(server => server.status === "healthy").length ?? 0;
  const stale = snapshot?.servers.filter(server => server.status === "stale").length ?? 0;
  const offline = snapshot?.servers.filter(server => server.status === "offline").length ?? 0;

  return <>
    <div className="admin-page-title">
      <div><p className="eyebrow">SYSTEM OPERATIONS</p><h1>Server monitor</h1><p>Live API instance snapshots from shared PostgreSQL. Instances are marked stale after 30 seconds and offline after 120 seconds without a heartbeat.</p></div>
      <button className="ghost" type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "Refreshing…" : "Refresh metrics"}</button>
    </div>
    <div className="admin-stat-grid">
      <article><span>Healthy instances</span><b>{number(healthy)}</b><small>Heartbeat within 30 seconds</small></article>
      <article><span>Stale instances</span><b>{number(stale)}</b><small>Heartbeat 31–120 seconds ago</small></article>
      <article><span>Offline instances</span><b>{number(offline)}</b><small>No heartbeat for over 120 seconds</small></article>
      <article><span>Database</span><b>{snapshot?.databaseStatus === "ready" ? "Ready" : snapshot?.databaseStatus === "unavailable" ? "Unavailable" : "—"}</b><small>{snapshot?.servers[0]?.dbLatencyMs == null ? "Probe latency unavailable" : number(snapshot.servers[0].dbLatencyMs) + " ms probe"}</small></article>
    </div>
    {error && <div className="admin-alert error" role="alert">{error}</div>}
    <section className="admin-panel">
      <div className="admin-panel-head"><div><p className="eyebrow">API FLEET</p><h2>{snapshot?.servers.length ?? 0} instance snapshot(s)</h2></div><small>{lastRefresh ? "Updated " + new Date(lastRefresh).toLocaleTimeString() : "Waiting for metrics"}</small></div>
      {!snapshot?.servers.length ? <div className="empty-state" role="status">{loading ? "Loading server metrics…" : "No instance heartbeat has been recorded yet. The API will appear after it handles a request."}</div> : snapshot.servers.map(server => (
        <article className="result-row" key={server.instanceId}>
          <div><b>{server.hostname}</b><small>{server.instanceId}</small><small>Version {server.version} · Build {server.buildSha === "unknown" ? "not configured" : server.buildSha.slice(0, 12)}</small><small>Uptime {duration(server.uptimeSeconds)} · Seen {server.ageSeconds}s ago</small></div>
          <div><span className={"status " + (server.status === "healthy" ? "status-used" : server.status === "stale" ? "status-pending" : "status-revoked")}>{server.status.toUpperCase()}</span><small>Started {new Date(server.startedAt).toLocaleString()}</small></div>
          <div><b>{number(server.cpuPercent)}%</b><small>CPU</small></div>
          <div><b>{bytes(server.rssBytes)}</b><small>RSS memory</small><small>Heap {bytes(server.heapUsedBytes)}</small></div>
          <div><b>{number(server.requestRatePerMinute)}</b><small>Requests/min</small><small>{number(server.activeRequests)} in flight</small></div>
          <div><b>{number(server.p95LatencyMs)} ms</b><small>p95 latency · p50 {number(server.p50LatencyMs)} ms</small><small>{number(server.requestsTotal)} requests total · {number(server.errorsTotal)} server errors</small></div>
        </article>
      ))}
    </section>
    <p className="admin-muted">Metrics are process-level aggregates. This view does not expose request URLs, student IDs, raw IP addresses, or environment secrets. {snapshot?.serverTime ? "Server snapshot time: " + new Date(snapshot.serverTime).toLocaleString() + "." : ""}</p>
  </>;
}
