import { useEffect, useState } from "react";
import { request } from "./apiClient";
import StudentPracticeResults, { type PracticeResult } from "./StudentPracticeResults";

type HistoryItem = {
  attemptId: number;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  score: number;
  total: number;
  expired: boolean;
};
type HistoryPage = { items: HistoryItem[]; page: number; limit: number; total: number; totalPages: number };

function modeLabel(mode: string) {
  if (mode === "mock") return "Full mock";
  if (mode === "mistakes") return "Review mistakes";
  if (mode === "dailyChallenge") return "Daily challenge";
  return "Practice";
}
function dateLabel(value: string | null) {
  if (!value) return "Not submitted";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function StudentPracticeHistory() {
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [selected, setSelected] = useState<PracticeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    request<HistoryPage>("/analytics/history?page=" + page + "&limit=10")
      .then((response) => { if (!cancelled) setHistory(response); })
      .catch((cause) => { if (!cancelled) setError((cause as Error).message || "Could not load practice history."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  async function openReview(attemptId: number) {
    setReviewingId(attemptId);
    setError("");
    try {
      const result = await request<PracticeResult>("/tests/" + attemptId + "/result");
      setSelected(result);
    } catch (cause) {
      setError((cause as Error).message || "Could not load this attempt's answer review.");
    } finally {
      setReviewingId(null);
    }
  }

  if (selected) return <StudentPracticeResults result={selected} onBack={() => setSelected(null)} />;

  return <section className="student-practice-history stack">
    <header className="page-intro">
      <p className="eyebrow">YOUR LEARNING RECORD</p>
      <h1>Practice history</h1>
      <p className="muted">Open any submitted practice session or full mock to review your answers and explanations.</p>
    </header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {loading && !history ? <div className="panel">Loading your previous attempts…</div> : null}
    {history && history.items.length ? <div className="stack">
      <p className="muted">{history.total} completed attempt{history.total === 1 ? "" : "s"}</p>
      {history.items.map((item) => {
        const accuracy = item.total > 0 ? Math.round(item.score / item.total * 100) : 0;
        return <article className="panel practice-history-row" key={item.attemptId}>
          <div className="practice-history-main">
            <span className="status status-used">{modeLabel(item.mode)}</span>
            <h2>{modeLabel(item.mode)} · Attempt #{item.attemptId}</h2>
            <p className="muted">Completed {dateLabel(item.finishedAt)}{item.expired ? " · Time expired" : ""}</p>
          </div>
          <div className="practice-history-score"><strong>{item.score}/{item.total}</strong><span>{accuracy}% correct</span></div>
          <button type="button" className="primary" disabled={reviewingId !== null} onClick={() => void openReview(item.attemptId)}>{reviewingId === item.attemptId ? "Loading review…" : "Review answers"}</button>
        </article>;
      })}
      <div className="row practice-history-pagination">
        <button type="button" className="button button-secondary" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
        <span className="muted">Page {history.page} of {Math.max(1, history.totalPages)}</span>
        <button type="button" className="button button-secondary" disabled={loading || page >= history.totalPages} onClick={() => setPage((value) => Math.min(history.totalPages, value + 1))}>Next</button>
      </div>
    </div> : history && !history.items.length && !loading ? <div className="panel empty-state"><h2>No completed practice attempts yet</h2><p>Your submitted practice sessions and full mocks will appear here.</p></div> : null}
  </section>;
}
