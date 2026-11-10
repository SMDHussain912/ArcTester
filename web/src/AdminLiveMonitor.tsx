export type LiveSession = {
  id: string;
  status: string;
  student: { id: number; email: string };
  exam: { id: string; title: string };
  assignmentId: string;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  connectivity: "CONNECTED" | "STALE";
  heartbeatCount: number;
  focusLossCount: number;
  disconnectCount: number;
  submission: { id: string; status: string } | null;
  events: { id: string; type: string; detail: string; createdAt: string; actor: { email: string; role: string } | null }[];
};

type AdminLiveMonitorProps = {
  sessions: LiveSession[];
  total: number;
  loading: boolean;
  updatedAt: string | null;
  selectedSessionId: string | null;
  onSelectSession: (id: string | null | ((current: string | null) => string | null)) => void;
  onRefresh: () => void;
};

export default function AdminLiveMonitor({ sessions, total, loading, updatedAt, selectedSessionId, onSelectSession, onRefresh }: AdminLiveMonitorProps) {
  return (
    <>
      <div className="admin-page-title">
        <div><p className="eyebrow">EXAM OPERATIONS</p><h1>Live invigilation</h1><p>Monitor active, paused and interrupted candidate sessions. Connectivity refreshes every 15 seconds while this page is open.</p></div>
        <button className="ghost" disabled={loading} onClick={onRefresh}>{loading ? "Refreshing…" : "Refresh sessions"}</button>
      </div>
      <div className="admin-stat-grid">
        <article><span>Open sessions</span><b>{total}</b><small>Active, paused or interrupted</small></article>
        <article><span>Connected</span><b>{sessions.filter((session) => session.connectivity === "CONNECTED").length}</b><small>Heartbeat received recently</small></article>
        <article><span>Stale connections</span><b>{sessions.filter((session) => session.connectivity !== "CONNECTED").length}</b><small>Check candidate connectivity</small></article>
        <article><span>Integrity signals</span><b>{sessions.reduce((count, session) => count + session.focusLossCount + session.disconnectCount, 0)}</b><small>Focus losses + disconnects</small></article>
      </div>
      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">CANDIDATE SESSIONS</p><h2>{sessions.length} of {total} sessions</h2></div><small>{updatedAt ? "Updated " + new Date(updatedAt).toLocaleTimeString() : "Waiting for first refresh"}</small></div>
        {loading && !sessions.length ? <div className="empty-state" role="status">Loading live sessions…</div> : sessions.length ? sessions.map((session) => (
          <article className="result-row" key={session.id}>
            <div><b>{session.student.email}</b><small>{session.exam.title} · Started {session.startedAt ? new Date(session.startedAt).toLocaleString() : "—"}</small><small>Last heartbeat: {session.lastHeartbeatAt ? new Date(session.lastHeartbeatAt).toLocaleString() : "Never"}</small></div>
            <div><span className={session.connectivity === "CONNECTED" ? "status status-used" : "status status-revoked"}>{session.connectivity}</span><small>{session.status}</small></div>
            <div><b>{session.focusLossCount}</b><small>Focus losses</small></div><div><b>{session.disconnectCount}</b><small>Disconnects</small></div><div><b>{session.heartbeatCount}</b><small>Heartbeats</small></div>
            <div><small>{session.submission ? "Submission: " + session.submission.status : "Not submitted"}</small>{session.events.slice(0, 3).map((event) => <small key={event.id}>{event.type.replaceAll("_", " ")} · {new Date(event.createdAt).toLocaleTimeString()}</small>)}<button className="text-button" type="button" aria-expanded={selectedSessionId === session.id} onClick={() => onSelectSession((current) => current === session.id ? null : session.id)}>{selectedSessionId === session.id ? "Hide inspection" : "Inspect session →"}</button></div>
            {selectedSessionId === session.id && <div className="session-inspector"><div className="admin-panel-head"><div><p className="eyebrow">SESSION INSPECTION</p><h3>Event timeline</h3></div><small>{session.events.length} recent events</small></div>{session.events.length ? session.events.map((event) => <div className="question-review-row" key={event.id}><strong>{event.type.replaceAll("_", " ")}</strong><p>{event.detail || "No additional details recorded."}</p><small>{new Date(event.createdAt).toLocaleString()} · {event.actor ? `${event.actor.email} (${event.actor.role})` : "System"}</small></div>) : <div className="empty-state">No recorded events for this session.</div>}</div>}
          </article>
        )) : <div className="empty-state">No active or interrupted exam sessions right now.</div>}
      </section>
    </>
  );
}
