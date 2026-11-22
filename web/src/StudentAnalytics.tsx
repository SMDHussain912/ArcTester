import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./apiClient";
import type {
  PerformanceOverview,
  FullMockPerformanceReport,
  StudyRecommendation,
  StudyRecommendationsReport,
  TopicRow,
  WeakTopicsReport,
} from "./lib/api";
import Skeleton from "./components/Skeleton";

export interface StudentAnalyticsProps {
  setActivePage: (page: string) => void;
  onStartRecommendedPractice?: (item: StudyRecommendation) => void;
}

export default function StudentAnalytics({ setActivePage, onStartRecommendedPractice }: StudentAnalyticsProps) {
  const [overview, setOverview] = useState<PerformanceOverview | null>(null);
  const [fullMockPerformance, setFullMockPerformance] = useState<FullMockPerformanceReport | null>(null);
  const [weakTopics, setWeakTopics] = useState<WeakTopicsReport | null>(null);
  const [recommendations, setRecommendations] = useState<StudyRecommendationsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const generationRef = useRef(0);

  const loadAnalytics = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    setErrors([]);
    const results = await Promise.allSettled([
      request<PerformanceOverview>("/analytics/overview"),
      request<WeakTopicsReport>("/analytics/weak-topics"),
      request<StudyRecommendationsReport>("/analytics/recommendations"),
      request<FullMockPerformanceReport>("/analytics/full-mock-performance"),
    ]);
    if (generation !== generationRef.current) return;
    const failures: string[] = [];
    if (results[0].status === "fulfilled") {
      const raw = results[0].value as Partial<PerformanceOverview> | null;
      const practice = raw?.practice as Partial<PerformanceOverview["practice"]> | undefined;
      setOverview({
        practice: {
          completedAttempts: Number(practice?.completedAttempts ?? 0), questions: Number(practice?.questions ?? 0),
          correct: Number(practice?.correct ?? 0), incorrect: Number(practice?.incorrect ?? 0),
          unanswered: Number(practice?.unanswered ?? 0), accuracy: typeof practice?.accuracy === "number" ? practice.accuracy : null,
        },
        formalExams: {
          graded: Number(raw?.formalExams?.graded ?? 0),
          scorePercentage: typeof raw?.formalExams?.scorePercentage === "number" ? raw.formalExams.scorePercentage : null,
          score: Number(raw?.formalExams?.score ?? 0), maximumScore: Number(raw?.formalExams?.maximumScore ?? 0),
          reviewRequired: Number(raw?.formalExams?.reviewRequired ?? 0),
        },
      });
    }
    else failures.push("Practice overview: " + (results[0].reason instanceof Error ? results[0].reason.message : "Could not load this section."));
    if (results[1].status === "fulfilled") {
      const raw = results[1].value as Partial<WeakTopicsReport> | null;
      setWeakTopics({ subjects: Array.isArray(raw?.subjects) ? raw.subjects.filter(Boolean) : [], topics: Array.isArray(raw?.topics) ? raw.topics.filter(Boolean) : [], weakest: raw?.weakest ?? null });
    }
    else failures.push("Weak-topic analysis: " + (results[1].reason instanceof Error ? results[1].reason.message : "Could not load this section."));
    if (results[2].status === "fulfilled") {
      const raw = results[2].value as Partial<StudyRecommendationsReport> | null;
      setRecommendations({
        basedOnAttempts: Number(raw?.basedOnAttempts ?? 0), basedOnFullMocks: Number(raw?.basedOnFullMocks ?? 0),
        latestFullMockAt: raw?.latestFullMockAt ?? null, minimumAnswers: Number(raw?.minimumAnswers ?? 5),
        weakAccuracyThreshold: Number(raw?.weakAccuracyThreshold ?? 0.6),
        performanceExplanation: {
          headline: String(raw?.performanceExplanation?.headline ?? "Keep practicing to build a reliable performance baseline."),
          details: Array.isArray(raw?.performanceExplanation?.details) ? raw.performanceExplanation.details.filter((v): v is string => typeof v === "string") : [],
          answeredQuestions: Number(raw?.performanceExplanation?.answeredQuestions ?? 0),
          incorrectAnswers: Number(raw?.performanceExplanation?.incorrectAnswers ?? 0),
          evidenceThreshold: Number(raw?.performanceExplanation?.evidenceThreshold ?? 5),
          weakAccuracyThreshold: Number(raw?.performanceExplanation?.weakAccuracyThreshold ?? 0.6),
        },
        recommendations: Array.isArray(raw?.recommendations) ? raw.recommendations.filter(Boolean) : [],
      });
    }
    else failures.push("Study recommendations: " + (results[2].reason instanceof Error ? results[2].reason.message : "Could not load this section."));
    if (results[3].status === "fulfilled") {
      const raw = results[3].value as Partial<FullMockPerformanceReport> | null;
      setFullMockPerformance({
        generatedAt: String(raw?.generatedAt ?? new Date().toISOString()), completedFullMocks: Number(raw?.completedFullMocks ?? 0),
        latestMockAt: raw?.latestMockAt ?? null, questionCount: Number(raw?.questionCount ?? 0),
        answeredQuestions: Number(raw?.answeredQuestions ?? 0), correct: Number(raw?.correct ?? 0),
        incorrect: Number(raw?.incorrect ?? 0), unanswered: Number(raw?.unanswered ?? 0),
        accuracy: typeof raw?.accuracy === "number" ? raw.accuracy : null,
        subjects: Array.isArray(raw?.subjects) ? raw.subjects.filter(Boolean) : [],
        topics: Array.isArray(raw?.topics) ? raw.topics.filter(Boolean) : [],
      });
    }
    else failures.push("Full-mock analytics: " + (results[3].reason instanceof Error ? results[3].reason.message : "Could not load this section."));
    setErrors(failures);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAnalytics();
    return () => {
      generationRef.current += 1;
    };
  }, [loadAnalytics]);

  const accuracyPercent = (value: number | null) => (value === null ? "—" : Math.round(value * 100) + "%");

  return (
    <div className="stack student-analytics">
      <section className="page-intro">
        <p className="eyebrow">Your learning progress</p>
        <h1>Study analytics</h1>
        <p className="muted">A clear view of your practice history and the subjects that need more attention.</p>
      </section>

      <div className="row analytics-toolbar">
        <span className="muted" role="status">{loading ? "Updating analytics…" : "Analytics are up to date"}</span>
        <button type="button" className="button button-secondary" onClick={() => void loadAnalytics()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh analytics"}
        </button>
      </div>
      {errors.length ? (
        <div className="error analytics-errors" role="alert">
          <strong>Some analytics could not be loaded.</strong>
          <ul>{errors.map((message) => <li key={message}>{message}</li>)}</ul>
          <span>Other available sections remain visible. Use Refresh analytics to retry.</span>
        </div>
      ) : null}
      {loading && !overview && !weakTopics && !recommendations && !fullMockPerformance ? (
        <div className="stack" style={{ gap: 10 }}>
          <Skeleton variant="stat-tile" className="skeleton-stat" />
          <Skeleton variant="stat-tile" className="skeleton-stat" />
          <Skeleton variant="stat-tile" className="skeleton-stat" />
        </div>
      ) : null}

      {overview && (
        <>
          <section className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Completed attempts</div>
              <div className="stat-value">{overview.practice.completedAttempts}</div>
              <div className="stat-caption">Submitted practice sessions</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Question items</div>
              <div className="stat-value">{overview.practice.questions}</div>
              <div className="stat-caption">
                {overview.practice.correct} correct · {overview.practice.incorrect} incorrect · {overview.practice.unanswered} unanswered
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Overall accuracy</div>
              <div className="stat-value">{accuracyPercent(overview.practice.accuracy)}</div>
              <div className="stat-caption">Correct answers / answered questions</div>
            </div>
          </section>
        </>
      )}

      {fullMockPerformance && (
        <section className="panel" aria-labelledby="full-mock-performance-title">
          <div className="panel-header">
            <h2 id="full-mock-performance-title">Full-mock subject &amp; topic performance</h2>
            <span className="pill">{fullMockPerformance.completedFullMocks} completed mocks</span>
          </div>
          <p className="muted">
            Aggregated from completed 200-question mocks only{fullMockPerformance.latestMockAt ? `; latest: ${new Date(fullMockPerformance.latestMockAt).toLocaleDateString()}` : ""}.
            Accuracy is correct answers divided by answered questions. Unanswered questions are shown separately and remain part of the paper count.
          </p>
          {fullMockPerformance.completedFullMocks === 0 ? (
            <p className="muted">Complete a full 200-question mock to unlock subject and topic breakdowns.</p>
          ) : (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-label">Full-mock accuracy</div>
                  <div className="stat-value">{accuracyPercent(fullMockPerformance.accuracy)}</div>
                  <div className="stat-caption">{fullMockPerformance.correct} correct / {fullMockPerformance.answeredQuestions} answered</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Questions across mocks</div>
                  <div className="stat-value">{fullMockPerformance.questionCount}</div>
                  <div className="stat-caption">{fullMockPerformance.completedFullMocks} × 200-question papers</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Unanswered</div>
                  <div className="stat-value">{fullMockPerformance.unanswered}</div>
                  <div className="stat-caption">Not counted as incorrect</div>
                </div>
              </div>
              <div className="stack">
                <h3>Subject breakdown</h3>
                {fullMockPerformance.subjects.map((subject) => {
                  const subjectTopics = fullMockPerformance.topics.filter((topic) => topic.subject === subject.subject);
                  return (
                    <article className="panel" key={subject.subject}>
                      <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                        <strong>{subject.subject}</strong>
                        <span className="pill">{accuracyPercent(subject.accuracy)} · {subject.answeredQuestions}/{subject.questionCount} answered</span>
                      </div>
                      <p className="muted">{subject.correct} correct · {subject.incorrect} incorrect · {subject.unanswered} unanswered</p>
                      <details className="analytics-topic-details">
                        <summary>Topic breakdown ({subjectTopics.length})</summary>
                        <div className="table-wrap">
                          <table className="analytics-table">
                            <thead>
                              <tr><th scope="col">Topic</th><th scope="col">Accuracy</th><th scope="col">Correct</th><th scope="col">Incorrect</th><th scope="col">Unanswered</th><th scope="col">Paper items</th></tr>
                            </thead>
                            <tbody>
                              {subjectTopics.map((topic, index) => (
                                <tr key={topic.topic ?? `untagged-${index}`}>
                                  <th scope="row">{topic.topic || "Uncategorized"}</th>
                                  <td>{accuracyPercent(topic.accuracy)} ({topic.answeredQuestions} answered)</td>
                                  <td>{topic.correct}</td><td>{topic.incorrect}</td><td>{topic.unanswered}</td><td>{topic.questionCount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {weakTopics && (
        <section className="panel" aria-labelledby="study-recommendations-title">
          <div className="panel-header">
            <h2 id="study-recommendations-title">Your next study steps</h2>
            {recommendations && <span className="pill">{recommendations.basedOnAttempts} attempts analyzed</span>}
          </div>
          {recommendations && (
            <>
              <p className="muted">
                Recommendations use completed answers and verified full-mock results. A weak area is prioritized only after at least {recommendations.minimumAnswers} answered questions and accuracy below {Math.round((recommendations.weakAccuracyThreshold as number) * 100)}%. Unanswered questions do not count as incorrect.
              </p>
              {recommendations.latestFullMockAt ? <p className="muted">Full-mock evidence: {new Date(recommendations.latestFullMockAt).toLocaleDateString()} · {recommendations.basedOnFullMocks ?? 0} completed full mocks.</p> : null}
              <div className="performance-explanation">
                <strong>{recommendations.performanceExplanation.headline}</strong>
                <ul>
                  {recommendations.performanceExplanation.details.map((detail: string, index: number) => <li key={index}>{detail}</li>)}
                </ul>
              </div>
              <div className="stack">
                {recommendations.recommendations.map((item: StudyRecommendation) => (
                  <article key={item.id} className="panel">
                    <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                      <strong>{item.title}</strong>
                      <span className="pill">{item.priority} priority</span>
                    </div>
                    <p className="muted">{item.reason}</p>{item.evidence?.source === "completed-full-mock" ? <p className="muted">Evidence: latest completed 200-question mock · {item.evidence.answeredQuestions} answered · {Math.round((item.evidence.accuracy ?? 0) * 100)}% accuracy</p> : null}
                    <p className="muted">
                      Suggested session: {item.questionCount} {item.mode === "mistakes" ? "mistake review" : item.mode === "mock" ? "mock test" : "practice"} questions
                      {item.subject ? ` in ${item.subject}` : ""}{item.topic ? ` · ${item.topic}` : ""}.
                    </p>
                    {onStartRecommendedPractice && item.subject ? <button type="button" className="button button-secondary" onClick={() => onStartRecommendedPractice(item)}>Start focused practice</button> : null}
                  </article>
                ))}
              </div>
            </>
          )}
          <div className="stack">
            <h3>Subjects to revise</h3>
            {weakTopics.weakest ? (
              <p className="warn">
                Focus next on <strong>{weakTopics.weakest.topic || weakTopics.weakest.subject}</strong>{" "}
                in {weakTopics.weakest.subject} — {weakTopics.weakest.accuracy === null ? "not enough answered questions" : Math.round(weakTopics.weakest.accuracy * 100) + "% accuracy"} across {weakTopics.weakest.seen} answered questions.
              </p>
            ) : null}
            {(weakTopics.subjects ?? []).map((item: TopicRow) => (
              <div key={item.subject}>
                <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                  <strong>{item.subject}</strong>
                  <span className="pill">{item.accuracy === null ? "No answered questions" : Math.round(item.accuracy * 100) + "%"} · {item.seen} answered</span>
                </div>
                <p className="muted">{item.wrong} incorrect answers</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && !weakTopics ? <section className="panel" aria-live="polite"><h2>Study recommendations unavailable</h2><p className="muted">Weak-topic analysis could not be loaded. Refresh analytics to try again.</p></section> : null}

      <div className="row">
        <button className="button button-secondary" onClick={() => setActivePage("learning")}>Open concept library</button>
        <button className="button button-secondary" onClick={() => setActivePage("materials")}>Study resources</button>
        <button className="button button-secondary" onClick={() => setActivePage("dashboard")}>Back to study dashboard</button>
      </div>
    </div>
  );
}
