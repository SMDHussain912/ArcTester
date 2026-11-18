import { useState } from "react";

export type StudyMaterial = {
  id: string;
  title: string;
  description: string;
  subject: string;
  topic: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdAt: string;
};

type Props = {
  materials: StudyMaterial[];
  busy: boolean;
  onUpload: (payload: { title: string; description: string; subject: string; topic: string; fileName: string; mimeType: string; contentBase64: string }) => Promise<boolean> | void;
  onStatusChange: (id: string, status: StudyMaterial["status"]) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
};

const ACCEPTED: Record<string, string> = {
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
};
const MAX_BYTES = 8 * 1024 * 1024;

export default function AdminStudyMaterials({ materials, busy, onUpload, onStatusChange, onDelete, onRefresh }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("Computer Science");
  const [topic, setTopic] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!file) return setError("Choose a PDF, TXT or Markdown file.");
    if (!title.trim() || !subject.trim()) return setError("Title and subject are required.");
    if (file.size < 1 || file.size > MAX_BYTES) return setError("File must be between 1 byte and 8 MB.");
    if (!ACCEPTED[file.type]) return setError("Only PDF, plain text and Markdown files are supported.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    const uploaded = await onUpload({ title: title.trim(), description: description.trim(), subject: subject.trim(), topic: topic.trim(), fileName: file.name, mimeType: file.type, contentBase64: btoa(binary) });
    if (uploaded === false) return;
    setTitle(""); setDescription(""); setTopic(""); setFile(null);
    const input = document.getElementById("study-material-file") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  function sizeLabel(bytes: number) {
    return bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  return (
    <div className="admin-study-materials stack">
      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">CONTENT MANAGEMENT</p><h1>Study materials</h1><p className="muted">Upload revision notes and reference documents for the student workspace.</p></div><button className="ghost" disabled={busy} onClick={onRefresh}>Refresh</button></div>
        <div className="admin-two-col">
          <label>Material title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Data Structures — Unit 1 Notes" /></label>
          <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Computer Science" /></label>
          <label>Topic<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Arrays and linked lists" /></label>
          <label>File (PDF, TXT, Markdown · max 8 MB)<input id="study-material-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        </div>
        <label>Description<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What students will learn from this material." /></label>
        {file && <p className="muted">Selected: {file.name} · {sizeLabel(file.size)}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="editor-actions"><button className="primary" disabled={busy || !file} onClick={() => void submit()}>Upload as draft</button></div>
        <p className="muted">Files are private until published. Upload only materials you have permission to distribute. Files are stored in the application database; keep database backups enabled.</p>
      </section>
      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">LIBRARY</p><h2>Uploaded materials ({materials.length})</h2></div></div>
        {materials.length === 0 ? <p className="muted">No study materials uploaded yet.</p> : <div className="study-material-admin-list">
          {materials.map((item) => <article className="study-material-admin-card" key={item.id}>
            <div className="study-material-admin-main"><div><strong>{item.title}</strong><p className="muted">{item.subject}{item.topic ? " · " + item.topic : ""} · {item.fileName} · {sizeLabel(item.sizeBytes)}</p><p className="muted">{item.description || "No description"}</p></div><span className={"status " + (item.status === "PUBLISHED" ? "status-used" : item.status === "ARCHIVED" ? "status-expired" : "status-pending")}>{item.status}</span></div>
            <div className="row wrap">
              {item.status !== "PUBLISHED" && <button className="button button-primary" disabled={busy} onClick={() => onStatusChange(item.id, "PUBLISHED")}>Publish</button>}
              {item.status === "PUBLISHED" && <button className="button button-secondary" disabled={busy} onClick={() => onStatusChange(item.id, "DRAFT")}>Unpublish</button>}
              {item.status !== "ARCHIVED" && <button className="button button-secondary" disabled={busy} onClick={() => onStatusChange(item.id, "ARCHIVED")}>Archive</button>}
              <button className="button button-danger" disabled={busy} onClick={() => { if (window.confirm("Permanently delete this study material?")) onDelete(item.id); }}>Delete</button>
            </div>
          </article>)}
        </div>}
      </section>
    </div>
  );
}
