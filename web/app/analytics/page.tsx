"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type StudyHistoryItem, type WeakTopicsReport } from "../../lib/api";
import { useSession } from "../../lib/session";

function AnalyticsDashboard() {
  const { status, user } = useSession();
  const [weakTopics, setWeakTopics] = useState<WeakTopicsReport | null>(null);
  const [history, setHistory] = useState<StudyHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    Promise.all([api.weakTopics(), api.studyHistory()])
      .then(([weak, attempts]) => {
        if (cancelled) return;
        setWeakTopics(weak);
        setHistory(attempts);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof ApiError ? cause.message : "Could not load your study analytics.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "loading") return <p className="mute">Checking your session…</p>;
  if (status !== "authenticated") {
    return (
      <section className="panel">
        <h1>Study analytics</h1>
        <p className="muted">Sign in to see your progress, recent attempts and areas to revise.</p>
        <Link className="button button-primary" href="/login">Sign in</Link>
      </section>
    );
  }

  const completed = history.filter((item) => item.total > 0);
  const totalCorrect = completed.reduce((sum, item) => sum + item.score, 0);
  const totalQuestions = completed.reduce((sum, item) => sum + item.total, 0);
  const averageAccuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : null;

  return (
    <div className="stack">
      <section className="page-intro">
        <p className="eyebrow">Your learning progress</p>
        <h1>Study analytics</h1>
        <p className="muted">A clear view of your practice history and the subjects that need more attention.</p>
      </section>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <section className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Completed attempts</div>
          <div className="stat-value">{loading ? "—" : completed.length}</div>
          <div className="stat-caption">Submitted practice sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Questions answered</div>
          <div className="stat-value">{loading ? "—" : totalQuestions}</div>
          <div className="stat-caption">Across your recorded attempts</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overall accuracy</div>
          <div className="stat-value">{loading ? "—" : averageAccuracy === null ? "—" : averageAccuracy + "%"}</div>
          <div className="stat-caption">Correct answers / answered questions</div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Subjects to revise</h2>
          {weakTopics?.weakest ? <span className="pill pill-accent">Top priority</span> : null}
        </div>
        {loading ? <p className="mute">Calculating your topic performance…</p> : null}
        {!loading && weakTopics?.subjects.length === 0 ? (
          <p className="muted">Complete a practice session to unlock your subject performance breakdown.</p>
        ) : null}
        {weakTopics?.weakest ? (
          <p className="warn">
            Focus next on <strong>{weakTopics.weakest.topic || weakTopics.weakest.subject}</strong>
            {" "}in {weakTopics.weakest.subject} — {Math.round(weakTopics.weakest.accuracy * 100)}% accuracy across {weakTopics.weakest.seen} attempts.
          </p>
        ) : null}
        <div className="stack">
          {(weakTopics?.subjects ?? []).map((item) => (
            <div key={item.subject}>
              <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                <strong>{item.subject}</strong>
                <span className="pill">{Math.round(item.accuracy * 100)}% · {item.seen} questions</span>
              </div>
              <div
                role="progressbar"
                aria-label={item.subject + " accuracy"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(item.accuracy * 100)}
                style={{ height: 9, background: "var(--line)", borderRadius: 99, overflow: "hidden", marginTop: 8 }}
              >
                <div style={{ width: Math.max(0, Math.min(100, item.accuracy * 100)) + "%", height: "100%", background: "var(--accent, #2563eb)", borderRadius: 99 }} />
              </div>
              <p className="mute">{item.wrong} incorrect answers</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Recent practice history</h2>
          <span className="pill">{history.length} attempts</span>
        </div>
        {loading ? <p className="mute">Loading your attempts…</p> : null}
        {!loading && history.length === 0 ? (
          <div>
            <p className="muted">Your practice history will appear here after your first submitted test.</p>
            <Link className="button button-primary" href="/">Start practicing</Link>
          </div>
        ) : null}
        {history.slice(0, 10).map((item) => {
          const accuracy = item.total ? Math.round((item.score / item.total) * 100) : 0;
          return (
            <div key={item.attemptId} className="row" style={{ justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
              <div>
                <strong>{item.mode.replaceAll("_", " ")} practice</strong>
                <p className="mute">{item.finishedAt ? new Date(item.finishedAt).toLocaleString() : "Not submitted"}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>{item.score} / {item.total}</strong>
                <p className="mute">{accuracy}% accuracy{item.expired ? " · Time expired" : ""}</p>
              </div>
            </div>
          );
        })}
      </section>
      <div className="row">
        <Link className="button button-secondary" href="/">Back to study dashboard</Link>
        {user?.role === "ADMIN" ? <Link className="button button-secondary" href="/admin">Admin workspace</Link> : null}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
