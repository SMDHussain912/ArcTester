import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./apiClient";
import type {
  PerformanceOverview,
  StudyRecommendation,
  StudyRecommendationsReport,
  TopicRow,
  WeakTopicsReport,
} from "./lib/api";
import Skeleton from "./components/Skeleton";

export interface StudentAnalyticsProps {
  setActivePage: (page: string) => void;
}

export default function StudentAnalytics({ setActivePage }: StudentAnalyticsProps) {
  const [overview, setOverview] = useState<PerformanceOverview | null>(null);
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
    ]);
    if (generation !== generationRef.current) return;
    const failures: string[] = [];
    if (results[0].status === "fulfilled") setOverview(results[0].value);
    else failures.push("Practice overview: " + (results[0].reason instanceof Error ? results[0].reason.message : "Could not load this section."));
    if (results[1].status === "fulfilled") setWeakTopics(results[1].value);
    else failures.push("Weak-topic analysis: " + (results[1].reason instanceof Error ? results[1].reason.message : "Could not load this section."));
    if (results[2].status === "fulfilled") setRecommendations(results[2].value);
    else failures.push("Study recommendations: " + (results[2].reason instanceof Error ? results[2].reason.message : "Could not load this section."));
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
      {loading && !overview && !weakTopics && !recommendations ? (
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

      {weakTopics && (
        <section className="panel" aria-labelledby="study-recommendations-title">
          <div className="panel-header">
            <h2 id="study-recommendations-title">Your next study steps</h2>
            {recommendations && <span className="pill">{recommendations.basedOnAttempts} attempts analyzed</span>}
          </div>
          {recommendations && (
            <>
              <p className="muted">
                Recommendations use completed practice answers only. A topic is prioritized only after at least {recommendations.minimumAnswers} answered questions and accuracy below {Math.round((recommendations.weakAccuracyThreshold as number) * 100)}%.
              </p>
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
                    <p className="muted">{item.reason}</p>
                    <p className="muted">
                      Suggested session: {item.questionCount} {item.mode === "mistakes" ? "mistake review" : item.mode === "mock" ? "mock test" : "practice"} questions
                      {item.subject ? ` in ${item.subject}` : ""}{item.topic ? ` · ${item.topic}` : ""}.
                    </p>
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
