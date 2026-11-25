import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./apiClient";
import type { PerformanceOverview, FullMockPerformanceReport } from "./lib/api";
import Skeleton from "./components/Skeleton";
import { AnalyticsBarChart, AnalyticsStackedBar } from "./AnalyticsCharts";

export interface StudentAnalyticsProps {
  setActivePage: (page: string) => void;
}

export default function StudentAnalytics({ setActivePage }: StudentAnalyticsProps) {
  const [overview, setOverview] = useState<PerformanceOverview | null>(null);
  const [fullMock, setFullMock] = useState<FullMockPerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const generationRef = useRef(0);

  const loadAnalytics = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    setErrors([]);
    const results = await Promise.allSettled([
      request<PerformanceOverview>("/analytics/overview"),
      request<FullMockPerformanceReport>("/analytics/full-mock-performance"),
    ]);
    if (generation !== generationRef.current) return;

    const failures: string[] = [];
    if (results[0].status === "fulfilled") {
      const raw = results[0].value as Partial<PerformanceOverview> | null;
      const practice = raw?.practice as Partial<PerformanceOverview["practice"]> | undefined;
      const formal = raw?.formalExams as Partial<PerformanceOverview["formalExams"]> | undefined;
      setOverview({
        practice: {
          completedAttempts: Number(practice?.completedAttempts ?? 0),
          questions: Number(practice?.questions ?? 0),
          correct: Number(practice?.correct ?? 0),
          incorrect: Number(practice?.incorrect ?? 0),
          unanswered: Number(practice?.unanswered ?? 0),
          accuracy: typeof practice?.accuracy === "number" ? practice.accuracy : null,
          trend: Array.isArray(practice?.trend) ? practice.trend.filter(Boolean) : [],
        },
        formalExams: {
          submissions: Number(formal?.submissions ?? 0),
          graded: Number(formal?.graded ?? 0),
          scorePercentage: typeof formal?.scorePercentage === "number" ? formal.scorePercentage : null,
          score: typeof formal?.score === "number" ? formal.score : null,
          maximumScore: typeof formal?.maximumScore === "number" ? formal.maximumScore : null,
          reviewRequired: Number(formal?.reviewRequired ?? 0),
          correct: Number(formal?.correct ?? 0),
          incorrect: Number(formal?.incorrect ?? 0),
          unanswered: Number(formal?.unanswered ?? 0),
          subjects: Array.isArray(formal?.subjects) ? formal.subjects.filter(Boolean) : [],
        },
      });
    } else {
      failures.push("Practice and assigned exam results: " + (results[0].reason instanceof Error ? results[0].reason.message : "Could not load this section."));
    }

    if (results[1].status === "fulfilled") {
      const raw = results[1].value as Partial<FullMockPerformanceReport> | null;
      setFullMock({
        generatedAt: String(raw?.generatedAt ?? new Date().toISOString()),
        completedFullMocks: Number(raw?.completedFullMocks ?? 0),
        latestMockAt: raw?.latestMockAt ?? null,
        questionCount: Number(raw?.questionCount ?? 0),
        answeredQuestions: Number(raw?.answeredQuestions ?? 0),
        correct: Number(raw?.correct ?? 0),
        incorrect: Number(raw?.incorrect ?? 0),
        unanswered: Number(raw?.unanswered ?? 0),
        accuracy: typeof raw?.accuracy === "number" ? raw.accuracy : null,
        subjects: Array.isArray(raw?.subjects) ? raw.subjects.filter(Boolean) : [],
        topics: [],
      });
    } else {
      failures.push("Mock test results: " + (results[1].reason instanceof Error ? results[1].reason.message : "Could not load this section."));
    }
    setErrors(failures);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAnalytics();
    return () => { generationRef.current += 1; };
  }, [loadAnalytics]);

  const percent = (value: number | null | undefined) => value == null ? "—" : Math.round(value * 100) + "%";

  return (
    <div className="stack performance-analytics">
      <section className="page-intro">
        <p className="eyebrow">EXAM PERFORMANCE</p>
        <h1>Performance Analytics</h1>
        <p className="muted">Compare results from practice attempts, full mock tests and assigned exams.</p>
      </section>

      <div className="row analytics-toolbar">
        <span className="muted" role="status">{loading ? "Updating performance…" : "Performance data is up to date"}</span>
        <button type="button" className="button button-secondary" onClick={() => void loadAnalytics()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh performance"}
        </button>
      </div>

      {errors.length ? (
        <div className="error analytics-errors" role="alert">
          <strong>Some performance data could not be loaded.</strong>
          <ul>{errors.map((message) => <li key={message}>{message}</li>)}</ul>
          <span>Available sections remain visible. Refresh to retry.</span>
        </div>
      ) : null}

      {loading && !overview && !fullMock ? (
        <div className="stack" style={{ gap: 10 }}>
          <Skeleton variant="stat-tile" className="skeleton-stat" />
          <Skeleton variant="stat-tile" className="skeleton-stat" />
        </div>
      ) : null}

      <section className="panel" aria-labelledby="practice-exam-analytics-title">
        <div className="panel-header"><h2 id="practice-exam-analytics-title">Practice Exam Analytics</h2></div>
        <p className="muted">Performance from completed practice sessions only.</p>
        {overview ? (
          <>
            <div className="stat-grid">
              <article className="stat-card"><div className="stat-label">Practice attempts</div><div className="stat-value">{overview.practice.completedAttempts}</div><div className="stat-caption">Completed practice sessions</div></article>
              <article className="stat-card"><div className="stat-label">Questions answered</div><div className="stat-value">{overview.practice.correct + overview.practice.incorrect}</div><div className="stat-caption">{overview.practice.correct} correct · {overview.practice.incorrect} incorrect</div></article>
              <article className="stat-card"><div className="stat-label">Practice accuracy</div><div className="stat-value">{percent(overview.practice.accuracy)}</div><div className="stat-caption">Correct / answered questions</div></article>
            </div>
            <div className="analytics-chart-grid">
              <AnalyticsStackedBar
                title="Practice answer breakdown"
                segments={[
                  { label: "Correct", value: overview.practice.correct, color: "var(--analytics-correct, #16a34a)" },
                  { label: "Incorrect", value: overview.practice.incorrect, color: "var(--analytics-incorrect, #dc2626)" },
                  { label: "Unanswered", value: overview.practice.unanswered, color: "var(--analytics-unanswered, #94a3b8)" },
                ]}
              />
              <AnalyticsBarChart
                title="Practice accuracy by attempt"
                description="Recent completed practice attempts, shown in chronological order."
                items={(overview.practice.trend ?? []).filter((attempt) => attempt.accuracy !== null).map((attempt, index) => ({
                  label: "Attempt " + (index + 1),
                  value: Math.round((attempt.accuracy ?? 0) * 100),
                  detail: new Date(attempt.finishedAt).toLocaleDateString() + " · " + attempt.correct + "/" + attempt.total + " correct",
                }))}
                maxValue={100}
                formatValue={(value) => value + "%"}
                emptyMessage="Complete practice attempts with answered questions to see your accuracy trend."
              />
            </div>
          </>
        ) : <p className="muted">Practice exam performance is unavailable right now.</p>}
      </section>

      <section className="panel" aria-labelledby="mock-test-analytics-title">
        <div className="panel-header"><h2 id="mock-test-analytics-title">Mock Test Analytics</h2><span className="pill">{fullMock?.completedFullMocks ?? 0} completed</span></div>
        <p className="muted">Results from completed full-length mock tests. Unanswered questions are tracked separately and are not counted as incorrect.</p>
        {fullMock ? (
          <>
            <div className="stat-grid">
              <article className="stat-card"><div className="stat-label">Full mock accuracy</div><div className="stat-value">{percent(fullMock.accuracy)}</div><div className="stat-caption">{fullMock.correct} correct / {fullMock.answeredQuestions} answered</div></article>
              <article className="stat-card"><div className="stat-label">Mock papers</div><div className="stat-value">{fullMock.completedFullMocks}</div><div className="stat-caption">{fullMock.questionCount} paper questions total</div></article>
              <article className="stat-card"><div className="stat-label">Unanswered</div><div className="stat-value">{fullMock.unanswered}</div><div className="stat-caption">Shown separately from incorrect</div></article>
            </div>
            <div className="analytics-chart-grid">
              <AnalyticsStackedBar
                title="Mock test answer breakdown"
                segments={[
                  { label: "Correct", value: fullMock.correct, color: "var(--analytics-correct, #16a34a)" },
                  { label: "Incorrect", value: fullMock.incorrect, color: "var(--analytics-incorrect, #dc2626)" },
                  { label: "Unanswered", value: fullMock.unanswered, color: "var(--analytics-unanswered, #94a3b8)" },
                ]}
              />
              <AnalyticsBarChart
                title="Subject-wise mock accuracy"
                description="Accuracy is based on answered questions in completed full mocks."
                items={fullMock.subjects.filter((subject) => subject.accuracy !== null).map((subject) => ({
                  label: subject.subject,
                  value: Math.round((subject.accuracy ?? 0) * 100),
                  detail: subject.answeredQuestions + " answered",
                })).sort((a, b) => a.value - b.value)}
                maxValue={100}
                formatValue={(value) => value + "%"}
                emptyMessage="Complete a full mock with answered questions to see subject results."
              />
            </div>
            {fullMock.latestMockAt ? <p className="muted">Most recent completed mock: {new Date(fullMock.latestMockAt).toLocaleDateString()}</p> : null}
          </>
        ) : <p className="muted">Mock test performance is unavailable right now.</p>}
      </section>

      <section className="panel" aria-labelledby="assigned-exam-performance-title">
        <div className="panel-header"><h2 id="assigned-exam-performance-title">Assigned / Real Exam Results</h2></div>
        <p className="muted">Graded results from exams assigned through the exam system. This is exam performance data, not a learning-progress score.</p>
        {overview ? (
          <div className="stat-grid">
            <article className="stat-card"><div className="stat-label">Graded exams</div><div className="stat-value">{overview.formalExams.graded}</div><div className="stat-caption">Results finalized</div></article>
            <article className="stat-card"><div className="stat-label">Average exam score</div><div className="stat-value">{overview.formalExams.scorePercentage === null ? "—" : Math.round(overview.formalExams.scorePercentage) + "%"}</div><div className="stat-caption">{overview.formalExams.score ?? "—"} / {overview.formalExams.maximumScore ?? "—"} total points</div></article>
            <article className="stat-card"><div className="stat-label">Review required</div><div className="stat-value">{overview.formalExams.reviewRequired}</div><div className="stat-caption">Awaiting manual review</div></article>
          </div>
          <div className="analytics-chart-grid">
            <AnalyticsStackedBar
              title="Assigned exam answer breakdown"
              segments={[
                { label: "Correct", value: overview.formalExams.correct ?? 0, color: "var(--analytics-correct, #16a34a)" },
                { label: "Incorrect", value: overview.formalExams.incorrect ?? 0, color: "var(--analytics-incorrect, #dc2626)" },
                { label: "Unanswered", value: overview.formalExams.unanswered ?? 0, color: "var(--analytics-unanswered, #94a3b8)" },
              ]}
            />
            <AnalyticsBarChart
              title="Assigned exam subject accuracy"
              description="Accuracy from graded assigned exams, by subject."
              items={(overview.formalExams.subjects ?? []).filter((subject) => subject.accuracy !== null).map((subject) => ({
                label: subject.subject,
                value: Math.round((subject.accuracy ?? 0) * 100),
                detail: subject.correct + " correct · " + subject.incorrect + " incorrect",
              })).sort((a, b) => a.value - b.value)}
              maxValue={100}
              formatValue={(value) => value + "%"}
              emptyMessage="Graded subject results will appear here when available."
            />
          </div>
        ) : <p className="muted">Assigned exam results are unavailable right now.</p>}
      </section>

      <div className="row">
        <button className="button button-secondary" onClick={() => setActivePage("assignments")}>View assigned exams</button>
        <button className="button button-secondary" onClick={() => setActivePage("dashboard")}>Back to dashboard</button>
      </div>
    </div>
  );
}
