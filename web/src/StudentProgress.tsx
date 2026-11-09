import { useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");

type TopicPerformance = {
  subject: string;
  topic: string | null;
  seen: number;
  correct: number;
  wrong: number;
  unanswered: number;
  accuracy: number | null;
};

type PerformanceOverview = {
  generatedAt: string;
  practice: {
    completedAttempts: number;
    questions: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number | null;
    subjects: TopicPerformance[];
    difficulty: { difficulty: string; correct: number; incorrect: number; unanswered: number; accuracy: number | null; answered: number }[];
    trend: { attemptId: number; finishedAt: string; accuracy: number | null; correct: number; total: number }[];
  };
  formalExams: {
    submissions: number;
    graded: number;
    reviewRequired: number;
    score: number;
    maximumScore: number;
    scorePercentage: number | null;
    correct: number;
    incorrect: number;
    unanswered: number;
    subjects: { subject: string; correct: number; incorrect: number; unanswered: number; accuracy: number | null; awardedMarks: number; maximumMarks: number }[];
  };
};

async function loadOverview(): Promise<PerformanceOverview> {
  const response = await fetch(`${API}/analytics/overview`, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Unable to load your progress.");
  return body as PerformanceOverview;
}

function percentage(value: number | null): string {
  return value === null ? "Not enough data" : `${Math.round(value * 100)}%`;
}

export default function StudentProgress() {
  const [overview, setOverview] = useState<PerformanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setOverview(await loadOverview());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <section className="student-progress">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LEARNING ANALYTICS</p>
          <h1>Your progress</h1>
          <p className="muted">Practice performance and official exam results, kept separate.</p>
        </div>
        <button className="ghost" disabled={loading} onClick={() => void refresh()}>{loading ? "Refreshing…" : "Refresh progress"}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loading && !overview ? <div className="panel empty-state">Loading your progress…</div> : null}
      {overview ? (
        <>
          <div className="stats-row">
            <article className="panel stat"><span className="muted">Completed practice tests</span><strong>{overview.practice.completedAttempts}</strong><span className="muted">Saved attempts</span></article>
            <article className="panel stat"><span className="muted">Practice accuracy</span><strong>{percentage(overview.practice.accuracy)}</strong><span className="muted">{overview.practice.correct} correct · {overview.practice.incorrect} incorrect</span></article>
            <article className="panel stat"><span className="muted">Official submissions</span><strong>{overview.formalExams.submissions}</strong><span className="muted">{overview.formalExams.graded} graded · {overview.formalExams.reviewRequired} under review</span></article>
            <article className="panel stat"><span className="muted">Official exam score</span><strong>{percentage(overview.formalExams.scorePercentage)}</strong><span className="muted">{overview.formalExams.score} / {overview.formalExams.maximumScore} marks</span></article>
          </div>
          <div className="grid two">
            <section className="panel">
              <div className="section-head"><div><p className="eyebrow">PRACTICE</p><h2>Subject performance</h2></div></div>
              {overview.practice.subjects.length ? overview.practice.subjects.map((subject) => (
                <article className="coverage-row" key={subject.subject}>
                  <span>{subject.subject}</span>
                  <b>{percentage(subject.accuracy)}</b>
                  <div><i style={{ width: `${subject.accuracy === null ? 0 : Math.round(subject.accuracy * 100)}%` }} /></div>
                  <small className="muted">{subject.correct} correct · {subject.wrong} incorrect · {subject.unanswered} unanswered</small>
                </article>
              )) : <p className="muted">Complete a practice test to see subject-level accuracy.</p>}
            </section>
            <section className="panel">
              <div className="section-head"><div><p className="eyebrow">OFFICIAL EXAMS</p><h2>Subject marks</h2></div></div>
              {overview.formalExams.subjects.length ? overview.formalExams.subjects.map((subject) => (
                <article className="coverage-row" key={subject.subject}>
                  <span>{subject.subject}</span>
                  <b>{percentage(subject.accuracy)}</b>
                  <div><i style={{ width: `${subject.accuracy === null ? 0 : Math.round(subject.accuracy * 100)}%` }} /></div>
                  <small className="muted">{subject.awardedMarks} / {subject.maximumMarks} marks · {subject.correct} correct</small>
                </article>
              )) : <p className="muted">Graded assigned exams will appear here.</p>}
            </section>
          </div>
          <section className="panel">
            <div className="section-head"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Practice trend</h2></div></div>
            {overview.practice.trend.length ? <div className="grid two">
              {overview.practice.trend.map((attempt) => (
                <article className="question-review-row" key={attempt.attemptId}>
                  <strong>Practice #{attempt.attemptId}</strong>
                  <p>{new Date(attempt.finishedAt).toLocaleString()}</p>
                  <p>{percentage(attempt.accuracy)} accuracy · {attempt.correct} / {attempt.total} correct</p>
                </article>
              ))}
            </div> : <p className="muted">Your completed practice tests will appear here.</p>}
          </section>
        </>
      ) : null}
    </section>
  );
}
