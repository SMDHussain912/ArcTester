import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./apiClient";
import type {
  PerformanceOverview,
  StudentScorePrediction,
  StudentReadinessEstimate,
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
  const [prediction, setPrediction] = useState<StudentScorePrediction | null>(null);
  const [readiness, setReadiness] = useState<StudentReadinessEstimate | null>(null);
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
      request<StudentScorePrediction>("/analytics/score-prediction"),
      request<StudentReadinessEstimate>("/analytics/readiness"),
    ]);
    if (generation !== generationRef.current) return;
    const failures: string[] = [];
    if (results[0].status === "fulfilled") setOverview(results[0].value);
    else failures.push("Practice overview: " + (results[0].reason instanceof Error ? results[0].reason.message : "Could not load this section."));
    if (results[1].status === "fulfilled") setWeakTopics(results[1].value);
    else failures.push("Weak-topic analysis: " + (results[1].reason instanceof Error ? results[1].reason.message : "Could not load this section."));
    if (results[2].status === "fulfilled") setRecommendations(results[2].value);
    else failures.push("Study recommendations: " + (results[2].reason instanceof Error ? results[2].reason.message : "Could not load this section."));
    if (results[3].status === "fulfilled") setPrediction(results[3].value);
    else failures.push("Score prediction: " + (results[3].reason instanceof Error ? results[3].reason.message : "Could not load this section."));
    if (results[4].status === "fulfilled") setReadiness(results[4].value);
    else failures.push("Exam readiness: " + (results[4].reason instanceof Error ? results[4].reason.message : "Could not load this section."));
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
      {loading && !overview && !weakTopics && !recommendations && !prediction && !readiness ? (
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

          <section className="panel" aria-labelledby="score-prediction-title">
            <div className="panel-header">
              <h2 id="score-prediction-title">Next practice score estimate</h2>
            </div>
            {prediction === null && loading ? <Skeleton variant="stat-tile" className="skeleton-stat" /> : null}
            {prediction === null && !loading ? <p className="muted">Score prediction is unavailable. Refresh to try again.</p> : null}
            {prediction && prediction.status === "ready" && (
              <div>
                <div className="big">{prediction.predictedScorePercent}%</div>
                <p className="muted">Estimated accuracy on your next practice attempt. This is an estimate, not a guaranteed exam score.</p>
                <p className="muted">Prediction range: <strong>{prediction.predictionInterval.lowerPercent}%–{prediction.predictionInterval.upperPercent}%</strong> (walk-forward RMSE {prediction.predictionInterval.estimatedErrorPercent} points).</p>
                <p className="muted">{prediction.completedAttempts} completed attempts · {prediction.trainingSamples} samples · validation MAE {prediction.modelMae.toFixed(3)} vs baseline {prediction.baselineMae.toFixed(3)}.</p>
              </div>
            )}
            {prediction && prediction.status === "insufficient_data" && (
              <div>
                <p className="muted">{prediction.message}</p>
                <p><strong>{prediction.completedAttempts} / {prediction.requiredCompletedAttempts}</strong> completed practice attempts</p>
                <p className="muted">{prediction.availableSamples} of {prediction.requiredSamples} required prediction samples available.</p>
              </div>
            )}
            {prediction && prediction.status === "baseline_not_beaten" && (
              <div>
                <p className="muted">{prediction.message}</p>
                <p className="muted">{prediction.completedAttempts} attempts analyzed · validation MAE {prediction.modelMae.toFixed(3)} vs baseline {prediction.baselineMae.toFixed(3)}. No score estimate is shown until the model demonstrates useful predictive value.</p>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="readiness-estimate-title">
            <div className="panel-header">
              <h2 id="readiness-estimate-title">Exam readiness estimate</h2>
            </div>
            {readiness === null && loading ? <Skeleton variant="stat-tile" className="skeleton-stat" /> : null}
            {readiness === null && !loading ? <p className="muted">Readiness estimation is unavailable. Refresh to try again.</p> : null}
            {readiness?.status === "ready" && (
              <div>
                <div className="big">{readiness.category.replace("_", " ")}</div>
                <p className="muted">{readiness.message}</p>
                <p className="muted">
                  Confidence {Math.round(readiness.confidence * 100)}% · {readiness.completedAttempts} completed attempts · model v{readiness.modelVersion}
                </p>
                <ul className="readiness-probabilities">
                  <li>Not ready: {Math.round(readiness.probabilities.NOT_READY * 100)}%</li>
                  <li>Developing: {Math.round(readiness.probabilities.DEVELOPING * 100)}%</li>
                  <li>Ready: {Math.round(readiness.probabilities.READY * 100)}%</li>
                </ul>
              </div>
            )}
            {readiness?.status === "insufficient_data" && (
              <div>
                <p className="muted">{readiness.message}</p>
                <p><strong>{readiness.completedAttempts} / {readiness.requiredCompletedAttempts}</strong> completed practice attempts</p>
              </div>
            )}
            {readiness?.status === "fallback" && (
              <p className="muted">{readiness.message} No readiness category is shown.</p>
            )}
            {readiness?.status === "unavailable" && (
              <p className="muted">{readiness.message}</p>
            )}
          </section>

          <section className="panel" aria-labelledby="formal-performance-title">
            <div className="panel-header">
              <h2 id="formal-performance-title">Formal exam performance</h2>
            </div>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Verified graded exams</div>
                <div className="stat-value">{overview.formalExams.graded}</div>
                <div className="stat-caption">Review-required exams are excluded</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Score percentage</div>
                <div className="stat-value">{overview.formalExams.scorePercentage === null ? "—" : overview.formalExams.scorePercentage.toFixed(1) + "%"}</div>
                <div className="stat-caption">{overview.formalExams.score?.toFixed(2) ?? "—"} / {overview.formalExams.maximumScore?.toFixed(2) ?? "—"} marks</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Needs review</div>
                <div className="stat-value">{overview.formalExams.reviewRequired}</div>
                <div className="stat-caption">Not included in verified score totals</div>
              </div>
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
        <button className="button button-secondary" onClick={() => setActivePage("materials")}>Offline study materials</button>
        <button className="button button-secondary" onClick={() => setActivePage("dashboard")}>Back to study dashboard</button>
      </div>
    </div>
  );
}
