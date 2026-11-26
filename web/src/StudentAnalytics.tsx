import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./apiClient";
import type { PerformanceOverview, FullMockPerformanceReport } from "./lib/api";
import Skeleton from "./components/Skeleton";
import { AnalyticsBarChart, AnalyticsDonutChart, AnalyticsLineChart, AnalyticsProgressRing } from "./AnalyticsCharts";

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
  }, [loadAnalytics]);

  const ratioPercent = (value: number | null | undefined) => value == null ? null : Math.max(0, Math.min(100, value * 100));
  const formalAccuracy = overview?.formalExams.scorePercentage ?? null;

  return (
    <div className="stack performance-analytics student-analytics">
      <section className="analytics-page-heading">
        <div>
          <p className="eyebrow">YOUR EXAM INSIGHTS</p>
          <h1>Performance</h1>
          <p className="muted">A clear view of your practice, mock tests and assigned exam results.</p>
        </div>
        <button type="button" className="button button-secondary analytics-refresh" onClick={() => void loadAnalytics()} disabled={loading}>
          {loading ? "Updating…" : "↻ Refresh"}
        </button>
      </section>

      <div className="analytics-status-line" role="status">
        <span className={"analytics-status-dot" + (loading ? " updating" : "")} />
        {loading ? "Updating performance data" : "Latest results loaded"}
      </div>

      {errors.length ? (
        <div className="error analytics-errors" role="alert">
          <strong>Some performance data could not be loaded.</strong>
          <ul>{errors.map((message) => <li key={message}>{message}</li>)}</ul>
          <span>Other available sections remain visible. Refresh to retry.</span>
        </div>
      ) : null}

      {loading && !overview && !fullMock ? (
        <div className="analytics-loading-grid"><Skeleton variant="stat-tile" className="skeleton-stat" /><Skeleton variant="stat-tile" className="skeleton-stat" /></div>
      ) : null}

      {overview ? (
        <section className="analytics-section panel" aria-labelledby="practice-exam-analytics-title">
          <header className="analytics-section-heading">
            <div><span className="analytics-section-kicker">01 · PRACTICE</span><h2 id="practice-exam-analytics-title">Practice performance</h2><p>Completed practice sessions only.</p></div>
            <span className="analytics-section-count">{overview.practice.completedAttempts} attempts</span>
          </header>
          <div className="analytics-hero-grid">
            <AnalyticsProgressRing value={ratioPercent(overview.practice.accuracy)} label="Practice accuracy" detail={overview.practice.correct + " correct of " + (overview.practice.correct + overview.practice.incorrect) + " answered"} />
            <div className="analytics-kpi-grid">
              <article className="analytics-kpi"><span>Questions answered</span><strong>{(overview.practice.correct + overview.practice.incorrect).toLocaleString()}</strong><small>{overview.practice.questions.toLocaleString()} total in completed sessions</small></article>
              <article className="analytics-kpi"><span>Correct answers</span><strong className="analytics-kpi-positive">{overview.practice.correct.toLocaleString()}</strong><small>{overview.practice.incorrect.toLocaleString()} incorrect · {overview.practice.unanswered.toLocaleString()} skipped</small></article>
              <article className="analytics-kpi"><span>Completed attempts</span><strong>{overview.practice.completedAttempts.toLocaleString()}</strong><small>Practice sessions submitted</small></article>
            </div>
          </div>
          <div className="analytics-chart-grid analytics-practice-charts">
            <AnalyticsLineChart title="Accuracy trend" description="Your recent practice attempts, in order." items={(overview.practice.trend ?? []).filter((attempt) => attempt.accuracy !== null).map((attempt,index)=>({label:"Attempt "+(index+1),value:Math.round((attempt.accuracy??0)*100),detail:new Date(attempt.finishedAt).toLocaleDateString()}))} maxValue={100} formatValue={(value)=>value+"%"} emptyMessage="Finish more practice attempts to build your trend." />
            <AnalyticsDonutChart title="Answer mix" segments={[{label:"Correct",value:overview.practice.correct,color:"var(--analytics-correct,#16a34a)"},{label:"Incorrect",value:overview.practice.incorrect,color:"var(--analytics-incorrect,#dc2626)"},{label:"Unanswered",value:overview.practice.unanswered,color:"var(--analytics-unanswered,#94a3b8)"}]} />
          </div>
        </section>
      ) : <section className="analytics-section panel"><h2>Practice performance</h2><p className="muted">Practice exam performance is unavailable right now.</p></section>}

      {fullMock ? (
        <section className="analytics-section panel" aria-labelledby="mock-test-analytics-title">
          <header className="analytics-section-heading">
            <div><span className="analytics-section-kicker">02 · MOCK TESTS</span><h2 id="mock-test-analytics-title">Full mock results</h2><p>Completed full-length mock tests. Unanswered questions stay separate from incorrect answers.</p></div>
            <span className="analytics-section-count">{fullMock.completedFullMocks} completed</span>
          </header>
          <div className="analytics-hero-grid">
            <AnalyticsProgressRing value={ratioPercent(fullMock.accuracy)} label="Mock accuracy" detail={fullMock.correct + " correct of " + fullMock.answeredQuestions + " answered"} />
            <div className="analytics-kpi-grid">
              <article className="analytics-kpi"><span>Questions in papers</span><strong>{fullMock.questionCount.toLocaleString()}</strong><small>Across completed mock papers</small></article>
              <article className="analytics-kpi"><span>Answered</span><strong>{fullMock.answeredQuestions.toLocaleString()}</strong><small>{fullMock.unanswered.toLocaleString()} unanswered</small></article>
              <article className="analytics-kpi"><span>Incorrect</span><strong className="analytics-kpi-negative">{fullMock.incorrect.toLocaleString()}</strong><small>Questions answered incorrectly</small></article>
            </div>
          </div>
          <div className="analytics-chart-grid">
            <AnalyticsBarChart title="Subject accuracy" description="Accuracy from answered questions in completed full mocks." items={fullMock.subjects.filter(subject=>subject.accuracy!==null).map(subject=>({label:subject.subject,value:Math.round((subject.accuracy??0)*100),detail:subject.answeredQuestions+" answered"})).sort((a,b)=>a.value-b.value)} maxValue={100} formatValue={(value)=>value+"%"} emptyMessage="Subject results appear after you complete a full mock." />
            <AnalyticsDonutChart title="Mock answer mix" segments={[{label:"Correct",value:fullMock.correct,color:"var(--analytics-correct,#16a34a)"},{label:"Incorrect",value:fullMock.incorrect,color:"var(--analytics-incorrect,#dc2626)"},{label:"Unanswered",value:fullMock.unanswered,color:"var(--analytics-unanswered,#94a3b8)"}]} />
          </div>
          {fullMock.latestMockAt ? <p className="analytics-last-updated">Latest completed mock: {new Date(fullMock.latestMockAt).toLocaleDateString()}</p> : null}
        </section>
      ) : <section className="analytics-section panel"><h2>Full mock results</h2><p className="muted">Mock test performance is unavailable right now.</p></section>}

      {overview ? (
        <section className="analytics-section panel" aria-labelledby="assigned-exam-performance-title">
          <header className="analytics-section-heading">
            <div><span className="analytics-section-kicker">03 · ASSIGNED EXAMS</span><h2 id="assigned-exam-performance-title">Assigned / real exam results</h2><p>Finalized results from exams assigned through your exam system.</p></div>
            <span className="analytics-section-count">{overview.formalExams.graded} graded</span>
          </header>
          <div className="analytics-hero-grid">
            <AnalyticsProgressRing value={formalAccuracy} label="Average exam score" detail={(overview.formalExams.score ?? "—") + " of " + (overview.formalExams.maximumScore ?? "—") + " points"} />
            <div className="analytics-kpi-grid">
              <article className="analytics-kpi"><span>Graded exams</span><strong>{overview.formalExams.graded.toLocaleString()}</strong><small>Results finalized</small></article>
              <article className="analytics-kpi"><span>Awaiting review</span><strong>{overview.formalExams.reviewRequired.toLocaleString()}</strong><small>Pending manual marking</small></article>
              <article className="analytics-kpi"><span>Exam submissions</span><strong>{(overview.formalExams.submissions ?? 0).toLocaleString()}</strong><small>Assigned / real exams submitted</small></article>
            </div>
          </div>
          <div className="analytics-chart-grid">
            <AnalyticsBarChart title="Subject score" description="Accuracy from graded assigned exams, by subject." items={(overview.formalExams.subjects??[]).filter(subject=>subject.accuracy!==null).map(subject=>({label:subject.subject,value:Math.round((subject.accuracy??0)*100),detail:subject.correct+" correct · "+subject.incorrect+" incorrect"})).sort((a,b)=>a.value-b.value)} maxValue={100} formatValue={(value)=>value+"%"} emptyMessage="Subject scores will appear after assigned exams are graded." />
            <AnalyticsDonutChart title="Exam answer mix" segments={[{label:"Correct",value:overview.formalExams.correct??0,color:"var(--analytics-correct,#16a34a)"},{label:"Incorrect",value:overview.formalExams.incorrect??0,color:"var(--analytics-incorrect,#dc2626)"},{label:"Unanswered",value:overview.formalExams.unanswered??0,color:"var(--analytics-unanswered,#94a3b8)"}]} />
          </div>
        </section>
      ) : <section className="analytics-section panel"><h2>Assigned / real exam results</h2><p className="muted">Assigned exam results are unavailable right now.</p></section>}

      <div className="analytics-footer-action">
        <button className="button button-secondary" onClick={() => setActivePage("assignments")}>View assigned exams <span aria-hidden="true">→</span></button>
      </div>
    </div>
  );
}
