import { AnalyticsBarChart } from "./AnalyticsCharts";

export type AdminExamResult = { id: string; status: string; score: number | null; maximumScore: number | null; submittedAt: string; receivedAt: string; student: { id: number; email: string }; exam: { id: string; title: string }; version: number };
type AdminResultsAnalyticsProps = { results: AdminExamResult[]; onRefresh: () => void };

function percentage(result: AdminExamResult): number | null {
  if (result.status !== "GRADED" || result.score === null || !result.maximumScore || result.maximumScore <= 0) return null;
  return Math.max(0, Math.min(100, (result.score / result.maximumScore) * 100));
}

export default function AdminResultsAnalytics({ results, onRefresh }: AdminResultsAnalyticsProps) {
  const graded = results.filter((result) => result.status === "GRADED").length;
  const reviewRequired = results.filter((result) => result.status === "REVIEW_REQUIRED").length;
  const scoreValues = results.map(percentage).filter((value): value is number => value !== null);
  const averageScore = scoreValues.length ? Math.round(scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length) : null;
  const today = new Date();
  const activity = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const value = results.filter((result) => {
      const submitted = new Date(result.submittedAt).getTime();
      return Number.isFinite(submitted) && submitted >= date.getTime() && submitted < next.getTime();
    }).length;
    return { label: date.toLocaleDateString(undefined, { weekday: "short" }), value, detail: date.toLocaleDateString() };
  });
  const scoreBands = [
    { label: "0–39%", min: 0, max: 40 },
    { label: "40–59%", min: 40, max: 60 },
    { label: "60–79%", min: 60, max: 80 },
    { label: "80–100%", min: 80, max: 101 },
  ].map((band) => ({ label: band.label, value: scoreValues.filter((value) => value >= band.min && value < band.max).length }));
  const statusItems = ["GRADED", "REVIEW_REQUIRED", "SUBMITTED", "IN_PROGRESS"].map((status) => ({
    label: status.replaceAll("_", " "),
    value: results.filter((result) => result.status === status).length,
  })).filter((item) => item.value > 0);

  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">PERFORMANCE MONITORING</p><h1>Results &amp; analytics</h1><p>Score trends, submission activity and grading status from the latest 200 records.</p></div><button className="ghost" onClick={onRefresh}>Refresh results</button></div>
      <div className="admin-stat-grid">
        <article><span>Submissions</span><b>{results.length}</b><small>Latest 200 records</small></article>
        <article><span>Graded</span><b>{graded}</b><small>Graded submissions</small></article>
        <article><span>Review required</span><b>{reviewRequired}</b><small>Timing or integrity flags</small></article>
        <article><span>Average graded score</span><b>{averageScore === null ? "—" : averageScore + "%"}</b><small>Normalized by each paper’s maximum score</small></article>
      </div>
      <div className="analytics-chart-grid">
        <AnalyticsBarChart title="Submission activity" description="Submissions received each day over the last 7 days." items={activity} formatValue={(value) => value.toLocaleString()} />
        <AnalyticsBarChart title="Graded score bands" description="Distribution of graded submissions by percentage score." items={scoreBands} formatValue={(value) => value.toLocaleString()} />
        <AnalyticsBarChart title="Submission status" description="Current status of the latest records." items={statusItems} formatValue={(value) => value.toLocaleString()} />
      </div>
      <div className="admin-panel results-table"><div className="table-top"><span>Recent submissions</span><span>Sorted newest first</span></div>{results.length ? results.map((result) => <article className="result-row" key={result.id}><div><b>{result.student.email}</b><small>{result.exam.title} · Version {result.version}</small></div><strong>{result.score ?? "—"} / {result.maximumScore ?? "—"}</strong><span className={result.status === "GRADED" ? "status status-used" : "status status-revoked"}>{result.status.replaceAll("_", " ")}</span><small>{new Date(result.submittedAt).toLocaleString()}</small></article>) : <div className="empty-state">No submissions have been received yet.</div>}</div>
    </>
  );
}
