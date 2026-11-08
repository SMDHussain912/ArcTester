"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type AssignedExam } from "../../lib/api";
import { RequireSession } from "../../lib/session";

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "No limit";
}

function AssignmentList() {
  const [assignments, setAssignments] = useState<AssignedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .assignedExams()
      .then((response) => setAssignments(response.assignments))
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.message : "Could not load your assigned exams.");
      })
      .finally(() => setLoading(false));
  }, []);

  const now = Date.now();

  return (
    <div>
      <div className="page-intro">
        <p className="eyebrow">Student workspace</p>
        <h1>My assigned exams</h1>
        <p className="muted">
          Exams assigned by your administrator appear here. Open an available exam to begin.
        </p>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="mute">Loading assigned exams…</p> : null}
      {!loading && !error && assignments.length === 0 ? (
        <section className="panel">
          <h2>No exams assigned yet</h2>
          <p className="muted">
            When an administrator assigns an exam to your account, it will show up here.
          </p>
          <Link className="button button-secondary" href="/">
            Back to dashboard
          </Link>
        </section>
      ) : null}
      <div className="stack">
        {assignments.map((assignment) => {
          const submitted = Boolean(assignment.submission);
          const notYetAvailable = Boolean(
            assignment.availableFrom && new Date(assignment.availableFrom).getTime() > now
          );
          const expired = Boolean(assignment.dueAt && new Date(assignment.dueAt).getTime() < now);
          const canStart = !submitted && !notYetAvailable && !expired;
          const status = submitted
            ? assignment.submission?.status === "REVIEW_REQUIRED"
              ? "Submitted · review pending"
              : "Submitted"
            : notYetAvailable
              ? "Not available yet"
              : expired
                ? "Deadline passed"
                : "Ready";
          return (
            <article className="panel" key={assignment.id}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Version {assignment.version}</p>
                  <h2>{assignment.exam.title}</h2>
                </div>
                <span className="pill">{status}</span>
              </div>
              {assignment.exam.description ? (
                <p className="muted">{assignment.exam.description}</p>
              ) : null}
              <div className="row muted">
                <span>{assignment.questionCount} questions</span>
                <span>·</span>
                <span>{assignment.durationMinutes} minutes</span>
                <span>·</span>
                <span>Assigned {new Date(assignment.assignedAt).toLocaleDateString()}</span>
              </div>
              <div className="row muted" style={{ marginTop: 8 }}>
                <span>Available: {dateLabel(assignment.availableFrom)}</span>
                <span>Due: {dateLabel(assignment.dueAt)}</span>
              </div>
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
                {submitted ? (
                  <Link
                    className="button button-secondary"
                    href={"/assignments/" + assignment.id + "/result"}
                  >
                    View result
                  </Link>
                ) : canStart ? (
                  <Link className="button button-primary" href={"/assignments/" + assignment.id}>
                    Open exam →
                  </Link>
                ) : (
                  <button className="button button-secondary" disabled>
                    {notYetAvailable ? "Not available yet" : "Unavailable"}
                  </button>
                )}
              </div>
              {assignment.submission?.score !== null && assignment.submission?.maximumScore ? (
                <p className="mute" style={{ marginTop: 10, marginBottom: 0 }}>
                  Score: {assignment.submission.score} / {assignment.submission.maximumScore}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function AssignmentsPage() {
  return (
    <RequireSession>
      <AssignmentList />
    </RequireSession>
  );
}
