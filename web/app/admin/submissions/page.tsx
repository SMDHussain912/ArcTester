"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type AdminOverview } from "../../../lib/api";
import { useSession } from "../../../lib/session";

type RecentSubmission = AdminOverview["recentSubmissions"][number];

function SubmissionQueue() {
  const { status, user } = useSession();
  const [items, setItems] = useState<RecentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || user?.role !== "ADMIN") return;
    api.adminOverview()
      .then((overview) => setItems(overview.recentSubmissions))
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.message : "Could not load submissions.");
      })
      .finally(() => setLoading(false));
  }, [status, user?.role]);

  if (status === "loading") return <p className="mute">Checking administrator access…</p>;
  if (status !== "authenticated") {
    return <section className="panel"><h1>Submission review</h1><p>Sign in to continue.</p><Link className="button button-primary" href="/login">Sign in</Link></section>;
  }
  if (user?.role !== "ADMIN") {
    return <section className="panel"><h1>Access restricted</h1><p className="muted">Administrator access is required.</p><Link className="button button-secondary" href="/">Back to dashboard</Link></section>;
  }

  return (
    <div>
      <div className="page-intro">
        <p className="eyebrow">Administrator tools</p>
        <h1>Submission review</h1>
        <p className="muted">Review recent student attempts, answer selections and submissions flagged for manual review.</p>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="panel">
        <div className="panel-header">
          <h2>Recent submissions</h2>
          <span className="pill">{items.length} shown</span>
        </div>
        {loading ? <p className="mute">Loading submissions…</p> : null}
        {!loading && items.length === 0 ? <p className="mute">No submissions have been received yet.</p> : null}
        {!loading && items.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr><th>Student</th><th>Exam</th><th>Score</th><th>Submitted</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.submissionId}>
                    <td>{item.studentEmail}</td>
                    <td>{item.examTitle}</td>
                    <td>{item.score === null || item.maximumScore === null ? "Pending" : item.score + " / " + item.maximumScore}</td>
                    <td>{new Date(item.submittedAt).toLocaleString()}</td>
                    <td><span className="pill">{item.status.replaceAll("_", " ")}</span></td>
                    <td><Link className="button button-secondary button-small" href={"/admin/submissions/" + item.submissionId}>Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <div className="row" style={{ marginTop: 16 }}>
        <Link className="button button-secondary" href="/admin">Back to admin workspace</Link>
      </div>
    </div>
  );
}

export default function AdminSubmissionsPage() {
  return <SubmissionQueue />;
}
