import { useCallback, useEffect, useRef, useState } from "react";
import { API, request } from "./apiClient";
import type { OfflineLearningPackage } from "./lib/api";

type PublishedMaterial = {
  id: string; title: string; description: string; subject: string; topic: string;
  fileName: string; mimeType: string; sizeBytes: number; createdAt: string;
};

export interface StudentMaterialsProps {
  setActivePage: (page: string) => void;
}

export default function StudentMaterials({ setActivePage }: StudentMaterialsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<PublishedMaterial[]>([]);
  const [query, setQuery] = useState("");
  const [downloaded, setDownloaded] = useState<OfflineLearningPackage | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const cancelledRef = useRef<number>(0);

  const loadMaterials = useCallback(async () => {
    const generation = ++cancelledRef.current;
    setLoading(true); setError(null);
    try {
      const result = await request<{ materials: PublishedMaterial[] }>("/study-materials");
      if (generation === cancelledRef.current) setMaterials(result.materials ?? []);
    } catch (cause) {
      if (generation === cancelledRef.current) setError(cause instanceof Error ? cause.message : "Could not load study materials.");
    } finally {
      if (generation === cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMaterials();
    return () => { cancelledRef.current += 1; };
  }, [loadMaterials]);

  const downloadMaterial = useCallback(async (material: PublishedMaterial) => {
    setDownloadingId(material.id); setError(null);
    try {
      const response = await fetch(`${API}/study-materials/${encodeURIComponent(material.id)}/download`, { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Could not download this material.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = material.fileName;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not download this material.");
    } finally { setDownloadingId(null); }
  }, []);

  const downloadPackage = useCallback(async () => {
    cancelledRef.current += 1;
    setLoading(true); setError(null);
    try {
      const studyPackage = await request<OfflineLearningPackage>("/learning/package");
      const blob = new Blob([JSON.stringify(studyPackage, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `arctester-study-pack-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(studyPackage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not download the study package.");
    } finally { setLoading(false); }
  }, []);

  const filtered = materials.filter((item) => [item.title, item.description, item.subject, item.topic].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const sizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";

  return (
    <div className="stack student-materials-page">
      <section className="page-intro">
        <p className="eyebrow">Study anywhere</p>
        <h1>Study materials</h1>
        <p className="muted">Download subject-wise notes, reference documents and revision resources published by your administrator.</p>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>Published library</h2><p className="muted">Only administrator-published files appear here.</p></div><button className="button button-secondary" onClick={() => void loadMaterials()} disabled={loading}>Refresh</button></div>
        <input aria-label="Search study materials" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, subject or topic" />
        {error && <p className="error" role="alert">{error}</p>}
        {loading && <p className="muted">Loading study materials…</p>}
        {!loading && filtered.length === 0 && <div className="empty-state"><h3>{materials.length ? "No matching materials" : "No materials published yet"}</h3><p className="muted">{materials.length ? "Try another search term." : "Your administrator has not published any study files yet."}</p></div>}
        <div className="student-material-list">
          {filtered.map((item) => <article className="student-material-card" key={item.id}>
            <div className="student-material-icon" aria-hidden="true">{item.mimeType === "application/pdf" ? "PDF" : "DOC"}</div>
            <div className="student-material-copy"><strong>{item.title}</strong><p className="muted">{item.subject}{item.topic ? " · " + item.topic : ""} · {sizeLabel(item.sizeBytes)}</p><p>{item.description}</p><small className="muted">{item.fileName}</small></div>
            <button className="button button-primary" disabled={downloadingId === item.id} onClick={() => void downloadMaterial(item)}>{downloadingId === item.id ? "Downloading…" : "Download"}</button>
          </article>)}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><h2>Offline question bank</h2><span className="pill">JSON · Version 1</span></div>
        <p className="muted">Download a portable copy of the question bank with answer keys, explanations, topics and difficulty levels. This package contains answers and must not be used as a secure exam paper.</p>
        <button className="button button-primary" onClick={() => void downloadPackage()} disabled={loading}>{loading ? "Preparing download…" : "Download offline question bank"}</button>
        {downloaded && <div className="exp" role="status"><strong>Question bank downloaded.</strong><p className="muted">{downloaded.total.toLocaleString()} questions across {downloaded.subjects.length} subjects. Exported {new Date(downloaded.exportedAt).toLocaleString()}.</p></div>}
      </section>
      <div className="row"><button className="button button-secondary" onClick={() => setActivePage("dashboard")}>Back to dashboard</button><button className="button button-secondary" onClick={() => setActivePage("analytics")}>Study analytics</button></div>
    </div>
  );
}
