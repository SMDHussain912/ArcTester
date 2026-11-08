"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, isAuthError, type TestResult } from "../../../lib/api";
import { RequireSession, useSession } from "../../../lib/session";

export default function ResultPage() {
  return (
    <RequireSession>
      <ResultLoader />
    </RequireSession>
  );
}

function ResultLoader() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useSession();
  const attemptId = Number(params.id);

  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      setError("That result link is not valid.");
      return;
    }
    api
      .result(attemptId)
      .then(setResult)
      .catch((e: unknown) => {
        if (isAuthError(e)) {
          // The session may have expired while the result page was open.
          void refresh();
          setError(e.message);
          return;
        }
        setError(e instanceof ApiError ? e.message : "Could not load the result.");
      });
  }, [attemptId, refresh]);

  if (error) {
    return (
      <>
        <h1>Result</h1>
        <p className="error">{error}</p>
        <button className="alt" onClick={() => router.push("/")}>
          Back to home
        </button>
      </>
    );
  }

  if (!result) return <p className="mute">Loading result…</p>;

  const percent = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
  const wrong = result.questions.filter((q) => !q.isCorrect);

  return (
    <div className="result-layout">
      <div className="page-intro">
        <p className="eyebrow">Exam report</p>
        <h1>Test result</h1>
        <p className="muted">Your performance summary and the questions worth reviewing.</p>
      </div>

      {result.expired ? <p className="warn">This test was submitted after the time limit and marked expired.</p> : null}

      <section className="panel result-summary">
        <div className="result-score">
          <span className="mute">Your score</span>
          <strong>{result.score} / {result.total}</strong>
          <span className="pill pill-accent">{percent}% correct</span>
        </div>
        <div className="result-breakdown">
          <div className="panel-header"><h2>Subject breakdown</h2></div>
          {result.breakdown.map((row) => {
            const accuracy = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0;
            return (
              <div className="breakdown-row" key={row.subject}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{row.subject}</strong>
                  <span className="mute">{row.correct}/{row.total} · {accuracy}%</span>
                </div>
                <div className="breakdown-track"><span style={{ width: `${accuracy}%` }} /></div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="section-heading">
        <div>
          <h2>Review ({wrong.length} to revise)</h2>
          <p>Incorrect and unanswered questions from this attempt.</p>
        </div>
      </div>
      {wrong.length === 0 ? (
        <div className="panel"><p>Nothing to revise — every answer was correct.</p></div>
      ) : (
        wrong.map((q, i) => (
          <article className="panel review-card" key={q.questionId}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="pill">Question {i + 1}</span>
              <span className="pill" style={{ color: "var(--danger)" }}>Review needed</span>
            </div>
            <p className="review-question"><strong>{q.text}</strong></p>
            <p className="mute">Subject: {q.subject}</p>
            <ul className="review-options">
              {q.options.map((option, optionIndex) => (
                <li key={optionIndex} className={optionIndex === q.correctIndex ? "correct-option" : optionIndex === q.selectedIndex ? "selected-option" : ""}>
                  <span>{option}</span>
                  <span>{optionIndex === q.correctIndex ? "Correct answer" : optionIndex === q.selectedIndex ? "Your answer" : ""}</span>
                </li>
              ))}
            </ul>
            {q.explanation ? <div className="exp"><strong>Explanation</strong><p>{q.explanation}</p></div> : null}
            {q.relatedConcepts.length > 0 ? (
              <div className="exp">
                <strong>Revise this concept</strong>
                <ul>{q.relatedConcepts.map((concept) => <li key={concept.slug}><Link href={`/learning#${concept.slug}`}>{concept.title}</Link></li>)}</ul>
              </div>
            ) : null}
          </article>
        ))
      )}

      <div className="result-footer">
        <button className="button button-primary" onClick={() => router.push("/")}>Back to dashboard</button>
      </div>
    </div>
  );
}
