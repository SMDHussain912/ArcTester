import { useEffect, useState } from "react";

type Student = {
  id: number; email: string; fullName: string | null; collegeName: string | null; collegeCode: string | null;
  postalPin: string | null; branchName: string | null; branchCode: string | null; registrationNumber: string | null; accessStatus: string; createdAt: string;
};
type Page = { students: Student[]; page: number; total: number; totalPages: number };
type Props = { onError: (message: string) => void; onNotice: (message: string) => void };
const API = (import.meta.env.VITE_API_URL || "https://arctester.onrender.com").replace(/\/+$/, "");
const fields: Array<{ key: keyof Student; label: string }> = [
  { key: "fullName", label: "Full name" }, { key: "email", label: "Email" },
  { key: "collegeName", label: "College name" }, { key: "collegeCode", label: "College PIN / institute code" },
  { key: "branchName", label: "Branch" }, { key: "branchCode", label: "Branch code" },
];
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, { ...init, credentials: "include", headers: { "content-type": "application/json", ...init.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status >= 500 ? "ArcTester couldn't complete this request. Try again." : typeof body.error === "string" ? body.error : "Request failed.");
  return body as T;
}
export default function AdminStudents({ onError, onNotice }: Props) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (query.trim()) params.set("q", query.trim());
    request<Page>("/admin/students?" + params.toString())
      .then((result) => { if (active) setData(result); })
      .catch((error: unknown) => { if (active) onError(error instanceof Error ? error.message : "Could not load students."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [query, page, reload, onError]);
  function beginEdit(student: Student) {
    setEditing(student);
    setDraft(Object.fromEntries(fields.map(({ key }) => [key, String(student[key] ?? "")])));
  }
  async function save() {
    if (!editing) return;
    const changes: Record<string, string> = {};
    for (const { key } of fields) {
      const value = draft[key] ?? "";
      if (value !== String(editing[key] ?? "")) changes[key] = value;
    }
    if (!Object.keys(changes).length) { setEditing(null); return; }
    setBusy(true);
    try {
      await request("/admin/students/" + editing.id, { method: "PATCH", body: JSON.stringify(changes) });
      onNotice("Student profile updated.");
      setEditing(null);
      setReload((value) => value + 1);
    } catch (error) { onError(error instanceof Error ? error.message : "Could not update student."); }
    finally { setBusy(false); }
  }
  async function remove(student: Student) {
    if (!window.confirm("Remove " + (student.fullName || student.email) + "? Their account will be disabled and personal profile fields anonymized. Linked academic records will be retained.")) return;
    setBusy(true);
    try {
      await request("/admin/students/" + student.id, { method: "DELETE" });
      onNotice("Student account removed and anonymized.");
      setEditing(null);
      setReload((value) => value + 1);
    } catch (error) { onError(error instanceof Error ? error.message : "Could not remove student."); }
    finally { setBusy(false); }
  }
  return <section className="admin-students">
    <div className="admin-page-title"><div><p className="eyebrow">STUDENT OPERATIONS</p><h1>Manage students</h1><p>Edit student academic profiles or remove accounts.</p></div>
      <button className="ghost" type="button" disabled={busy} onClick={() => setReload((value) => value + 1)}>Refresh</button>
    </div>
    <div className="admin-panel">
      <div className="admin-toolbar"><input aria-label="Search students" placeholder="Search name, email, college or registration number…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></div>
      <p className="muted">{data ? data.total.toLocaleString() + " student accounts" : "Loading students…"}</p>
      {editing && <div className="admin-panel" role="dialog" aria-label="Edit student profile">
        <h2>Edit student profile</h2><p className="muted">Changes apply to the student account and academic profile.</p>
        <div className="admin-student-edit-grid">{fields.map(({ key, label }) => <label key={key}>{label}<input value={draft[key] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
        <div className="admin-toolbar"><button type="button" disabled={busy} onClick={() => void save()}>Save changes</button><button className="ghost" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
      </div>}
      {busy && <p role="status" className="muted">Working…</p>}
      <div className="admin-student-list">{(data?.students ?? []).map((student) => <article className="admin-student-row" key={student.id}>
        <div><strong>{student.fullName || "Unnamed student"}</strong><span>{student.email}</span><small>{student.collegeName || "College not set"} · {student.registrationNumber || "Registration number not set"} · {student.branchName || "Branch not set"} · {student.accessStatus}</small></div>
        <div className="admin-student-actions"><button className="ghost" type="button" disabled={busy} onClick={() => beginEdit(student)}>Edit</button><button className="danger" type="button" disabled={busy} onClick={() => void remove(student)}>Remove</button></div>
      </article>)}</div>
      {!busy && data?.students.length === 0 && <div className="empty-state"><h3>No students found</h3><p>Try another name, email, college, or PIN.</p></div>}
      {data && data.totalPages > 1 && <div className="pagination"><button className="ghost" disabled={page <= 1 || busy} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {data.totalPages}</span><button className="ghost" disabled={page >= data.totalPages || busy} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
    </div>
  </section>;
}
