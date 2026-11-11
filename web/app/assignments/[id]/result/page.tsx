"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ApiError, type AssignedExamResult } from "../../../../lib/api";
import { RequireSession } from "../../../../lib/session";

function AssignmentResult() {
  const params = useParams<{ id: string }>();
  const [result, setResult] = useState<AssignedExamResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .assignedExamResult(params.id)
      .then((response) => setResult(response.result))
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.message : "Could not load this result.");
      });
  }, [params.id]);

  if (error)
    return (
      <>
        <h1>Exam result</h1>
        <p className="error">{error}</p>
        <Link className="button button-secondary" href="/assignments">
          Back to my exams
        </Link>
      </>
    );
  if (!result) return <p className="mute">Loading result…</p>;

  const percentage =
    result.maximumScore && result.score !== null
      ? Math.round((result.score / result.maximumScore) * 100)
      : 0;

  return (
    <div className="result-layout">
      <div className="page-intro">
        <p className="eyebrow">Assigned exam report</p>
        <h1>Submission result</h1>
        <p className="muted">Submitted {new Date(result.submittedAt).toLocaleString()}</p>
      </div>
      {result.status === "REVIEW_REQUIRED" ? (
        <p className="warn" role="status">
          Submitted - awaiting invigilator review
        </p>
      ) : null}
      <section className="panel result-summary">
        <div className="result-score">
          {result.status === "REVIEW_REQUIRED" ? (
            <strong>Submitted - awaiting invigilator review</strong>
          ) : (
            <>
              <span className="mute">Your score</span>
              <strong>
                {result.score ?? "—"} <span>/ {result.maximumScore ?? "—"}</span>
              </strong>
              <span className="pill pill-accent">{percentage}%</span>
            </>
          )}
        </div>
        <div className="result-breakdown">
          <h2>Submission details</h2>
          <p className="muted">Status: {result.status.replaceAll("_", " ")}</p>
          <p className="muted">
            Received by server: {new Date(result.receivedAt).toLocaleString()}
          </p>
          <p className="muted">{result.questions.length} questions evaluated</p>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <h2>Answer review</h2>
          <p>Correct answers, your selections and explanations.</p>
        </div>
      </div>
      {result.questions.map((question, index) => (
        <article className="panel review-card" key={question.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="pill">
              Question {index + 1} · {question.subject}
            </span>
            <span className="pill">
              {question.awardedMarks} / {question.marks} marks
            </span>
          </div>
          <p className="review-question">
            <strong>{question.text}</strong>
          </p>
          <ul className="review-options">
            {question.options.map((option, optionIndex) => (
              <li
                key={optionIndex}
                className={
                  optionIndex === question.correctIndex
                    ? "correct-option"
                    : optionIndex === question.selectedIndex
                      ? "selected-option"
                      : ""
                }
              >
                <span>{option}</span>
                <span>
                  {optionIndex === question.correctIndex
                    ? "Correct answer"
                    : optionIndex === question.selectedIndex
                      ? "Your answer"
                      : ""}
                </span>
              </li>
            ))}
          </ul>
          {question.selectedIndex === null ? <p className="mute">Not answered</p> : null}
          {question.explanation ? (
            <div className="exp">
              <strong>Explanation</strong>
              <p>{question.explanation}</p>
            </div>
          ) : null}
          {question.relatedConcepts.length > 0 ? (
            <div className="exp">
              <strong>Revise this concept</strong>
              <ul>{question.relatedConcepts.map((concept) => <li key={concept.slug}><Link href={`/learning#${concept.slug}`}>{concept.title}</Link></li>)}</ul>
            </div>
          ) : null}
        </article>
      ))}
      <div className="result-footer">
        <Link className="button button-primary" href="/assignments">
          Back to my exams
        </Link>
      </div>
    </div>
  );
}

export default function AssignedExamResultPage() {
  return (
    <RequireSession>
      <AssignmentResult />
    </RequireSession>
  );
}
