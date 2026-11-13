import { useCallback, useRef, useState } from "react";
import { request } from "./apiClient";
import type { OfflineLearningPackage } from "./lib/api";

export interface StudentMaterialsProps {
  setActivePage: (page: string) => void;
}

export default function StudentMaterials({ setActivePage }: StudentMaterialsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<OfflineLearningPackage | null>(null);
  const cancelledRef = useRef(false);

  const downloadPackage = useCallback(async () => {
    cancelledRef.current = true;
    const generation = ++cancelledRef.current;
    setLoading(true);
    setError(null);
    try {
      const studyPackage = await request<OfflineLearningPackage>("/learning/package");
      if (generation !== cancelledRef.current) return;
      const blob = new Blob([JSON.stringify(studyPackage, null, 2)], { type: "application/json" });
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
      if (generation !== cancelledRef.current) return;
      setError(cause instanceof Error ? cause.message : "Could not download the study package.");
    } finally {
      if (generation === cancelledRef.current) setLoading(false);
    }
  }, []);

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
        <button className="button button-secondary" onClick={() => setActivePage("dashboard")}>Back to dashboard</button>
        <button className="button button-secondary" onClick={() => setActivePage("analytics")}>Study analytics</button>
      </div>
    </div>
  );
}
