import { useState } from "react";
import { AP_DIPLOMA_BRANCHES } from "./polytechnicCatalog";

export type StudyMaterial = {
  id: string; title: string; description: string; subject: string; topic: string; url: string;
  audienceScope?: "ALL" | "COLLEGE" | "BRANCH"; targetCollegeCode?: string | null; targetCollegeName?: string | null; targetBranchCode?: string | null; targetBranchName?: string | null;
  fileName?: string; mimeType?: string; sizeBytes?: number; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; createdAt: string;
};
type Fields = { title: string; description: string; subject: string; topic: string; url: string; audienceScope: "ALL" | "COLLEGE" | "BRANCH"; targetCollegeCode: string; targetCollegeName: string; targetBranchCode: string; targetBranchName: string };
type Props = {
  materials: StudyMaterial[];
  busy: boolean;
  onUpload: (payload: Fields) => Promise<boolean> | void;
  onUpdate: (id: string, payload: Fields) => Promise<boolean> | void;
  onFileUpload?: (payload: Fields, file: File) => Promise<boolean> | void;
  onFileReplace?: (id: string, payload: Fields, file: File) => Promise<boolean> | void;
  onStatusChange: (id: string, status: StudyMaterial["status"]) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
};
const API = (import.meta.env.VITE_API_URL || "https://arctester.onrender.com").replace(/\/+$/, "");
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ".pdf,.txt,.md,.docx,.pptx,.xlsx,.png,.jpg,.jpeg";
type Mode = "link" | "file";

export default function AdminStudyMaterials({ materials, busy, onUpload, onUpdate, onFileUpload, onFileReplace, onStatusChange, onDelete, onRefresh }: Props) {
  const empty: Fields = { title: "", description: "", subject: "Computer Science", topic: "", url: "", audienceScope: "ALL", targetCollegeCode: "", targetCollegeName: "", targetBranchCode: "", targetBranchName: "" };
  const [form, setForm] = useState<Fields>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("link");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const set = (key: keyof Fields, value: string) => setForm((old) => ({ ...old, [key]: value }));

  function edit(item: StudyMaterial) {
    setEditingId(item.id);
    setMode(item.fileName ? "file" : "link");
    setFile(null);
    setForm({ title: item.title, description: item.description, subject: item.subject, topic: item.topic, url: item.url, audienceScope: item.audienceScope ?? "ALL", targetCollegeCode: item.targetCollegeCode ?? "", targetCollegeName: item.targetCollegeName ?? "", targetBranchCode: item.targetBranchCode ?? "", targetBranchName: item.targetBranchName ?? "" });
    setError("");
  }
  function reset() { setEditingId(null); setForm(empty); setMode("link"); setFile(null); setError(""); }

  async function submit() {
    setError("");
    if (!form.title.trim() || !form.subject.trim()) return setError("Title and subject are required.");
    const metadata = { ...form, title: form.title.trim(), description: form.description.trim(), subject: form.subject.trim(), topic: form.topic.trim(), targetCollegeCode: form.targetCollegeCode.trim(), targetCollegeName: form.targetCollegeName.trim(), targetBranchCode: form.targetBranchCode.trim(), targetBranchName: form.targetBranchName.trim() };
    if (mode === "file") {
      if (!file) {
        if (!editingId) return setError("Choose a file to upload.");
        const existing = materials.find((item) => item.id === editingId);
        if (!existing?.fileName) return setError("Choose a file to upload, or switch back to the link option to keep this resource.");
        const saved = await onUpdate(editingId, { ...metadata, url: "" });
        if (saved !== false) reset();
        return;
      }
      if (file.size <= 0) return setError("Choose a non-empty file.");
      if (file.size > MAX_FILE_BYTES) return setError("Study files must be 10 MB or smaller.");
      const ext = file.name.toLowerCase().split(".").pop();
      if (!["pdf", "txt", "md", "docx", "pptx", "xlsx", "png", "jpg", "jpeg"].includes(ext || "")) return setError("Supported files: PDF, TXT, Markdown, DOCX, PPTX, XLSX, PNG or JPG.");
      if (editingId) {
        if (!onFileReplace) return setError("File replacement is not available right now.");
        const saved = await onFileReplace(editingId, { ...metadata, url: "" }, file);
        if (saved !== false) reset();
      } else {
        if (!onFileUpload) return setError("File upload is not available right now.");
        const saved = await onFileUpload({ ...metadata, url: "" }, file);
        if (saved !== false) reset();
      }
      return;
    }

    let parsed: URL;
    try { parsed = new URL(form.url.trim()); }
    catch { return setError("Enter a valid HTTPS resource link."); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return setError("Study links must use HTTPS and cannot contain embedded credentials.");
    const payload = { ...metadata, url: parsed.toString() };
    const saved = editingId ? await onUpdate(editingId, payload) : await onUpload(payload);
    if (saved !== false) reset();
  }

  return <div className="admin-study-materials stack">
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div><p className="eyebrow">CONTENT MANAGEMENT</p><h1>{editingId ? "Edit study resource" : "Study resources"}</h1><p className="muted">Add a trusted HTTPS link or upload a file (maximum 10 MB). New resources stay draft until published.</p></div>
        <button className="ghost" disabled={busy} onClick={onRefresh}>Refresh</button>
      </div>
      <label>Resource type<select aria-label="Resource type" value={mode} disabled={busy} onChange={(event) => { setMode(event.target.value as Mode); setFile(null); setError(""); }}><option value="link">External HTTPS link</option><option value="file">Upload a file</option></select></label>
      <div className="admin-two-col">
        <label>Resource title<input value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Data Structures — Unit 1 Notes"/></label>
        <label>Subject<input value={form.subject} onChange={(event) => set("subject", event.target.value)}/></label>
        <label>Topic<input value={form.topic} onChange={(event) => set("topic", event.target.value)} placeholder="Arrays and linked lists"/></label>
        {mode === "link" ? <label>HTTPS resource link<input type="url" inputMode="url" value={form.url} onChange={(event) => set("url", event.target.value)} placeholder="https://example.org/notes.pdf"/></label> :
          <label>Choose study file<input aria-label="Choose study file" type="file" accept={ACCEPTED} disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)}/><small className="muted">{file ? file.name + " · " + (file.size / 1024 / 1024).toFixed(2) + " MB" : editingId ? "Choose a file only if replacing the existing file." : "PDF, TXT, Markdown, DOCX, PPTX, XLSX, PNG or JPG · max 10 MB"}</small></label>}
      </div>
      <label>Audience scope<select aria-label="Content audience scope" value={form.audienceScope} disabled={busy} onChange={(event) => set("audienceScope", event.target.value as Fields["audienceScope"])}><option value="ALL">All students</option><option value="COLLEGE">One college</option><option value="BRANCH">One diploma branch</option></select></label>
      {form.audienceScope !== "ALL" && <div className="admin-two-col audience-target-fields">
        <label>College name<input value={form.targetCollegeName} onChange={(event) => set("targetCollegeName", event.target.value)} placeholder="Institution name (optional if code entered)"/></label>
        <label>College code<input value={form.targetCollegeCode} onChange={(event) => set("targetCollegeCode", event.target.value)} placeholder="College / institute code"/></label>
        {form.audienceScope === "BRANCH" && <>
          <label>Diploma branch<input list="arctester-diploma-branches" value={form.targetBranchName} onChange={(event) => set("targetBranchName", event.target.value)} placeholder="Search or enter a branch name"/></label>
          <label>Branch code<input value={form.targetBranchCode} onChange={(event) => set("targetBranchCode", event.target.value)} placeholder="Branch code (optional if name entered)"/></label>
          <datalist id="arctester-diploma-branches">{AP_DIPLOMA_BRANCHES.map((branch) => <option key={branch.code} value={branch.name}>{branch.code}</option>)}</datalist>
        </>}
        <small className="muted">Content targeting matches institute/branch codes or names from student profiles. Leave college fields empty to make a branch resource available to that branch across colleges.</small>
      </div>}
      <label>Description<textarea rows={3} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="What students will learn from this resource."/></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="editor-actions">
        <button className="primary" disabled={busy || !form.title.trim() || !form.subject.trim() || (mode === "link" ? !form.url.trim() : (!file && !editingId))} onClick={() => void submit()}>
          {busy ? "Saving…" : editingId ? mode === "file" && file ? "Replace file" : "Update resource" : mode === "file" ? "Upload file as draft" : "Save link as draft"}
        </button>
        {editingId && <button className="ghost" disabled={busy} onClick={reset}>Cancel edit</button>}
      </div>
      <p className="muted">Draft resources are private. Publish only files or links you have permission to share.</p>
    </section>
    <section className="admin-panel">
      <div className="admin-panel-head"><div><p className="eyebrow">LIBRARY</p><h2>Resources ({materials.length})</h2></div></div>
      {!materials.length ? <p className="muted">No study resources added yet.</p> : <div className="study-material-admin-list">
        {materials.map((item) => <article className="study-material-admin-card" key={item.id}>
          <div className="study-material-admin-main"><div><strong>{item.title}</strong><p className="muted">{item.subject}{item.topic ? " · " + item.topic : ""}</p><p className="muted">{item.audienceScope === "BRANCH" ? "Branch · " + (item.targetBranchName || item.targetBranchCode || "selected branch") + (item.targetCollegeName || item.targetCollegeCode ? " · " + (item.targetCollegeName || item.targetCollegeCode) : "") : item.audienceScope === "COLLEGE" ? "College · " + (item.targetCollegeName || item.targetCollegeCode || "selected college") : "Audience · All students"}</p><p className="muted">{item.description || "No description"}</p>
            {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a> : item.fileName ? <a href={API + "/study-materials/" + encodeURIComponent(item.id) + "/file"} target="_blank" rel="noopener noreferrer">{item.fileName} · {((item.sizeBytes ?? 0) / 1024 / 1024).toFixed(2)} MB</a> : <p className="warn">Resource file/link missing — edit this item before publishing.</p>}
          </div><span className={"status " + (item.status === "PUBLISHED" ? "status-used" : item.status === "ARCHIVED" ? "status-expired" : "status-pending")}>{item.status}</span></div>
          <div className="row wrap"><button className="button button-secondary" disabled={busy} onClick={() => edit(item)}>Edit / relink</button>
            {item.status !== "PUBLISHED" && <button className="button button-primary" disabled={busy || !(item.url || item.fileName)} onClick={() => onStatusChange(item.id, "PUBLISHED")}>Publish</button>}
            {item.status === "PUBLISHED" && <button className="button button-secondary" disabled={busy} onClick={() => onStatusChange(item.id, "DRAFT")}>Unpublish</button>}
            {item.status !== "ARCHIVED" && <button className="button button-secondary" disabled={busy} onClick={() => onStatusChange(item.id, "ARCHIVED")}>Archive</button>}
            <button className="button button-danger" disabled={busy} onClick={() => { if (window.confirm("Permanently delete this study resource?")) onDelete(item.id); }}>Delete</button>
          </div>
        </article>)}
      </div>}
    </section>
  </div>;
}
