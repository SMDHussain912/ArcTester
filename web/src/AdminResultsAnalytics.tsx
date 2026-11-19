export type AdminExamResult = { id: string; status: string; score: number | null; maximumScore: number | null; submittedAt: string; receivedAt: string; student: { id: number; email: string }; exam: { id: string; title: string }; version: number };
type AdminResultsAnalyticsProps = { results: AdminExamResult[]; onRefresh: () => void };

export default function AdminResultsAnalytics({ results, onRefresh }: AdminResultsAnalyticsProps) {
  const graded = results.filter((result) => result.status === "GRADED").length;
  const reviewRequired = results.filter((result) => result.status === "REVIEW_REQUIRED").length;
  const averageScore = results.length ? Math.round(results.reduce((sum, result) => sum + (result.score ?? 0), 0) / results.length) : 0;
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">PERFORMANCE MONITORING</p><h1>Results &amp; analytics</h1><p>Review submitted papers, student scores and grading status.</p></div><button className="ghost" onClick={onRefresh}>Refresh results</button></div>
      <div className="admin-stat-grid"><article><span>Submissions</span><b>{results.length}</b><small>Latest 200 records</small></article><article><span>Graded</span><b>{graded}</b><small>Ready for review</small></article><article><span>Review required</span><b>{reviewRequired}</b><small>Timing or integrity flags</small></article><article><span>Average score</span><b>{averageScore}</b><small>Raw average points</small></article></div>
      <div className="admin-panel results-table"><div className="table-top"><span>Recent submissions</span><span>Sorted newest first</span></div>{results.length ? results.map((result) => <article className="result-row" key={result.id}><div><b>{result.student.email}</b><small>{result.exam.title} · Version {result.version}</small></div><strong>{result.score ?? "—"} / {result.maximumScore ?? "—"}</strong><span className={result.status === "GRADED" ? "status status-used" : "status status-revoked"}>{result.status.replace("_", " ")}</span><small>{new Date(result.submittedAt).toLocaleString()}</small></article>) : <div className="empty-state">No submissions have been received yet.</div>}</div>
    </>
  );
}
