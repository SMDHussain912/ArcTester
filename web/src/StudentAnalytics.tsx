import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./apiClient";
import type {
  PerformanceOverview,
  StudentScorePrediction,
  StudyRecommendationsReport,
  WeakTopicsReport,
} from "./lib/api";

export interface StudentAnalyticsProps {
  setActivePage: (page: string) => void;
}

export default function StudentAnalytics({ setActivePage }: StudentAnalyticsProps) {
  const [overview, setOverview] = useState<PerformanceOverview | null>(null);
  const [weakTopics, setWeakTopics] = useState<WeakTopicsReport | null>(null);
  const [recommendations, setRecommendations] = useState<StudyRecommendationsReport | null>(null);
  const [prediction, setPrediction] = useState<StudentScorePrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const loadAnalytics = useCallback(async () => {
    cancelledRef.current = true;
    const generation = ++cancelledRef.current;
    setLoading(true);
    setError(null);
    try {
      await Promise.allSettled([
        request<PerformanceOverview>("/analytics/overview").then((value) => {
          if (generation === cancelledRef.current) setOverview(value);
        }),
        request<WeakTopicsReport>("/analytics/weak-topics").then((value) => {
          if (generation === cancelledRef.current) setWeakTopics(value);
        }),
        request<StudyRecommendationsReport>("/analytics/recommendations").then((value) => {
          if (generation === cancelledRef.current) setRecommendations(value);
        }),
        request<StudentScorePrediction>("/analytics/score-prediction").then((value) => {
          if (generation === cancelledRef.current) setPrediction(value);
        }),
      ]);
    } catch (cause) {
      if (generation === cancelledRef.current) setError(cause instanceof Error ? cause.message : "Could not load your analytics.");
    } finally {
      if (generation === cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadAnalytics]);

  const accuracyPercent = (value: number | null) => (value === null ? "—" : Math.round(value * 100) + "%");

  return (
    <div className="stack">
      <section className="page-intro">
        <p className="eyebrow">Your learning progress</p>
        <h1>Study analytics</h1>
        <p className="muted">A clear view of your practice history and the subjects that need more attention.</p>
      </section>

      {error ? <p className="error" role="alert">{error}</p> : null}
      {loading ? <p className="mute" role="status">Loading your analytics…</p> : null}

      {!loading && overview && (
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
            {prediction === null ? <p className="mute">Analyzing your completed practice history…</p> : null}
            {prediction && prediction.status === "ready" && (
              <div>
                <div className="big">{prediction.predictedScorePercent}%</div>
                <p className="muted">Estimated accuracy on your next practice attempt. This is an estimate, not a guaranteed exam score.</p>
                <p className="muted">Prediction range: <strong>{prediction.predictionInterval.lowerPercent}%–{prediction.predictionInterval.upperPercent}%</strong> (walk-forward RMSE {prediction.predictionInterval.estimatedErrorPercent} points).</p>
                <p className="mute">{prediction.completedAttempts} completed attempts · {prediction.trainingSamples} samples · validation MAE {prediction.modelMae.toFixed(3)} vs baseline {prediction.baselineMae.toFixed(3)}.</p>
              </div>
            )}
            {prediction && prediction.status === "insufficient_data" && (
              <div>
                <p className="muted">{prediction.message}</p>
                <p><strong>{prediction.completedAttempts} / {prediction.requiredCompletedAttempts}</strong> completed practice attempts</p>
                <p className="mute">{prediction.availableSamples} of {prediction.requiredSamples} required prediction samples available.</p>
              </div>
            )}
            {prediction && prediction.status === "baseline_not_beaten" && (
              <div>
                <p className="muted">{prediction.message}</p>
                <p className="mute">{prediction.completedAttempts} attempts analyzed · validation MAE {prediction.modelMae.toFixed(3)} vs baseline {prediction.baselineMae.toFixed(3)}. No score estimate is shown until the model demonstrates useful predictive value.</p>
              </div>
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
                <div className="stat-caption">{overview.formalExams.score.toFixed(2)} / {overview.formalExams.maximumScore.toFixed(2)} marks</div>
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

      {!loading && weakTopics && (
        <section className="panel" aria-labelledby="study-recommendations-title">
          <div className="panel-header">
            <h2 id="study-recommendations-title">Your next study steps</h2>
            {recommendations && <span className="pill">{recommendations.basedOnAttempts} attempts analyzed</span>}
          </div>
          {recommendations && (
            <>
              <p className="mute">
                Recommendations use completed practice answers only. A topic is prioritized only after at least {recommendations.minimumAnswers} answered questions and accuracy below {Math.round(recommendations.weakAccuracyThreshold * 100)}%.
              </p>
              <div className="performance-explanation">
                <strong>{recommendations.performanceExplanation.headline}</strong>
                <ul>
                  {recommendations.performanceExplanation.details.map((detail, index) => <li key={index}>{detail}</li>)}
                </ul>
              </div>
              <div className="stack">
                {recommendations.recommendations.map((item) => (
                  <article key={item.id} className="panel">
                    <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                      <strong>{item.title}</strong>
                      <span className="pill">{item.priority} priority</span>
                    </div>
                    <p className="muted">{item.reason}</p>
                    <p className="mute">
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
            {(weakTopics.subjects ?? []).map((item) => (
              <div key={item.subject}>
                <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                  <strong>{item.subject}</strong>
                  <span className="pill">{item.accuracy === null ? "No answered questions" : Math.round(item.accuracy * 100) + "%"} · {item.seen} answered</span>
                </div>
                <p className="mute">{item.wrong} incorrect answers</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="row">
        <button className="button button-secondary" onClick={() => setActivePage("learning")}>Open concept library</button>
        <button className="button button-secondary" onClick={() => setActivePage("materials")}>Offline study materials</button>
        <button className="button button-secondary" onClick={() => setActivePage("dashboard")}>Back to study dashboard</button>
      </div>
    </div>
  );
}
