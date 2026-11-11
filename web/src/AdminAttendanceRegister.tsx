export type AttendanceRow = {
  assignmentId: string;
  candidate: { id: number; email: string };
  exam: { id: string; title: string };
  version: number;
  questionCount: number;
  assignedAt: string;
  availableFrom: string | null;
  dueAt: string | null;
  attendanceStatus: string;
  connectivity: string;
  session: { id: string; status: string; startedAt: string | null; lastHeartbeatAt: string | null; endedAt: string | null; heartbeatCount: number; focusLossCount: number; disconnectCount: number } | null;
  submission: { id: string; status: string; submittedAt: string | null; score: number | null; maximumScore: number | null } | null;
};

type Props = {
  rows: AttendanceRow[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  updatedAt: string | null;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function AdminAttendanceRegister({ rows, total, page, pageSize, loading, updatedAt, onPageChange, onRefresh }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <>
      <div className="admin-page-title">
        <div><p className="eyebrow">EXAM OPERATIONS</p><h1>Attendance register</h1><p>Every assigned candidate appears here, including students who have not started their exam.</p></div>
        <button className="ghost" type="button" disabled={loading} onClick={onRefresh}>{loading ? "Refreshing…" : "Refresh attendance"}</button>
      </div>
      <section className="admin-panel attendance-register">
        <div className="admin-panel-head"><div><p className="eyebrow">ASSIGNMENT ATTENDANCE</p><h2>{rows.length} of {total} assignments</h2></div><small>{updatedAt ? "Updated " + new Date(updatedAt).toLocaleTimeString() : "Waiting for first refresh"}</small></div>
        {loading && !rows.length ? <div className="empty-state" role="status">Loading attendance…</div> : rows.length ? <div className="attendance-list">
          {rows.map((row) => (
            <article className="attendance-row" key={row.assignmentId}>
              <div className="attendance-candidate"><b>{row.candidate.email}</b><small>{row.exam.title} · Version {row.version} · {row.questionCount} questions</small><small>Assigned {formatDate(row.assignedAt)}</small></div>
              <div><span className={row.attendanceStatus === "SUBMITTED" ? "status status-used" : row.attendanceStatus === "NOT_STARTED" ? "status" : "status status-revoked"}>{row.attendanceStatus.replaceAll("_", " ")}</span><small>{row.connectivity.replaceAll("_", " ")}</small></div>
              <div><small>Available: {formatDate(row.availableFrom)}</small><small>Due: {formatDate(row.dueAt)}</small></div>
              <div>{row.submission ? <><b>{row.submission.score ?? "—"} / {row.submission.maximumScore ?? "—"}</b><small>{row.submission.status.replaceAll("_", " ")}</small></> : <small>{row.session ? "Session " + row.session.status.toLowerCase() : "No session started"}</small>}</div>
            </article>
          ))}
        </div> : <div className="empty-state">No exam assignments have been created yet.</div>}
        <div className="attendance-pagination"><small>Page {page} of {pages}</small><div><button className="ghost" type="button" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button><button className="ghost" type="button" disabled={loading || page >= pages} onClick={() => onPageChange(page + 1)}>Next</button></div></div>
      </section>
    </>
  );
}
