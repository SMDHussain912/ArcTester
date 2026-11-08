"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ApiError, type AdminSubmission } from "../../../../lib/api";
import { useSession } from "../../../../lib/session";

function SubmissionDetail() {
  const params = useParams<{ id: string }>();
  const { status, user } = useSession();
  const [submission, setSubmission] = useState<AdminSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || user?.role !== "ADMIN") return;
    api.adminSubmission(params.id)
      .then((response) => setSubmission(response.submission))
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.message : "Could not load this submission.");
      });
  }, [params.id, status, user?.role]);

  if (status === "loading") return <p className="mute">Checking administrator access…</p>;
  if (status !== "authenticated") {
    return <section className="panel"><h1>Submission review</h1><p>Sign in to continue.</p><Link className="button button-primary" href="/login">Sign in</Link></section>;
  }
  if (user?.role !== "ADMIN") {
    return <section className="panel"><h1>Access restricted</h1><p className="muted">Administrator access is required.</p><Link className="button button-secondary" href="/">Back to dashboard</Link></section>;
  }
  if (error) {
    return <section className="panel"><h1>Submission unavailable</h1><p className="error">{error}</p><Link className="button button-secondary" href="/admin/submissions">Back to submissions</Link></section>;
  }
  if (!submission) return <p className="mute">Loading submission…</p>;

  const percentage = submission.maximumScore && submission.score !== null
    ? Math.round((submission.score / submission.maximumScore) * 100)
    : null;

  return (
    <div className="result-layout">
      <div className="page-intro">
        <p className="eyebrow">Administrator review · {submission.status.replaceAll("_", " ")}</p>
        <h1>{submission.exam.title}</h1>
        <p className="muted">Version {submission.exam.version} · {submission.exam.durationMinutes} minutes</p>
      </div>
      {submission.status === "REVIEW_REQUIRED" ? (
        <p className="warn">This submission was flagged for manual review. Check the timing and answer record before taking further action.</p>
      ) : null}
      <section className="panel result-summary">
        <div className="result-score">
          <span className="mute">Score</span>
          <strong>{submission.score ?? "—"} <span>/ {submission.maximumScore ?? "—"}</span></strong>
          <span className="pill pill-accent">{percentage === null ? "Pending" : percentage + "%"}</span>
        </div>
        <div className="result-breakdown">
          <h2>Student</h2>
          <p>{submission.student.email}</p>
          <p className="muted">Started: {new Date(submission.startedAt).toLocaleString()}</p>
          <p className="muted">Submitted: {new Date(submission.submittedAt).toLocaleString()}</p>
          <p className="muted">Received: {new Date(submission.receivedAt).toLocaleString()}</p>
          <p className="muted">Availability: {submission.availableFrom ? new Date(submission.availableFrom).toLocaleString() : "Any time"}</p>
          <p className="muted">Deadline: {submission.dueAt ? new Date(submission.dueAt).toLocaleString() : "No deadline"}</p>
        </div>
      </section>
      <div className="section-heading">
        <div><h2>Answer record</h2><p>Compare each student's selection with the answer key.</p></div>
      </div>
      {submission.questions.map((question, index) => (
        <article className="panel review-card" key={question.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="pill">Question {index + 1} · {question.subject}</span>
            <span className="pill">{question.awardedMarks} / {question.marks} marks</span>
          </div>
          <p className="review-question"><strong>{question.text}</strong></p>
          <ul className="review-options">
            {question.options.map((option, optionIndex) => (
              <li
                key={optionIndex}
                className={optionIndex === question.correctIndex ? "correct-option" : optionIndex === question.selectedIndex ? "selected-option" : ""}
              >
                <span>{option}</span>
                <span>{optionIndex === question.correctIndex ? "Correct answer" : optionIndex === question.selectedIndex ? "Student selection" : ""}</span>
              </li>
            ))}
          </ul>
          {question.selectedIndex === null ? <p className="mute">No answer selected</p> : null}
          {question.explanation ? <div className="exp"><strong>Explanation</strong><p>{question.explanation}</p></div> : null}
        </article>
      ))}
      <div className="result-footer">
        <Link className="button button-primary" href="/admin/submissions">Back to submissions</Link>
      </div>
    </div>
  );
}

export default function AdminSubmissionDetailPage() {
  return <SubmissionDetail />;
}
