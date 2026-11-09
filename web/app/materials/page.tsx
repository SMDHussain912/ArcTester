"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError, type OfflineLearningPackage } from "../../lib/api";
import { useSession } from "../../lib/session";

export default function MaterialsPage() {
  const { status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<OfflineLearningPackage | null>(null);

  async function downloadPackage() {
    setLoading(true);
    setError(null);
    try {
      const studyPackage = await api.offlineLearningPackage();
      const blob = new Blob([JSON.stringify(studyPackage, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `arctester-study-pack-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setDownloaded(studyPackage);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not download the study package.");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") return <p className="mute">Checking your session…</p>;
  if (status !== "authenticated") {
    return (
      <section className="panel">
        <h1>Offline study materials</h1>
        <p className="muted">Sign in to download the question bank and its explanations for offline revision.</p>
        <Link className="button button-primary" href="/login">Sign in</Link>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="page-intro">
        <p className="eyebrow">Study anywhere</p>
        <h1>Offline study materials</h1>
        <p className="muted">
          Download a portable copy of the current question bank, including answer keys,
          explanations, topics and difficulty levels. You can keep the JSON file and
          revise without an active connection.
        </p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Complete question bank</h2>
          <span className="pill">JSON · Version 1</span>
        </div>
        <p className="muted">
          This is a study-only package. It intentionally includes correct answers and
          explanations, so do not use it as a secure exam paper.
        </p>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="button button-primary" onClick={downloadPackage} disabled={loading}>
          {loading ? "Preparing download…" : "Download offline study pack"}
        </button>
        {downloaded ? (
          <div className="exp" role="status">
            <strong>Study pack downloaded.</strong>
            <p className="muted">
              {downloaded.total.toLocaleString()} questions across {downloaded.subjects.length} subjects.
              Exported {new Date(downloaded.exportedAt).toLocaleString()}.
            </p>
          </div>
        ) : null}
      </section>
      <div className="row">
        <Link className="button button-secondary" href="/">Back to dashboard</Link>
        <Link className="button button-secondary" href="/analytics">Study analytics</Link>
      </div>
    </div>
  );
}
