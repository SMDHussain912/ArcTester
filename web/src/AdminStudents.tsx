import { useEffect, useState } from "react";

type AccessStatus = "PENDING" | "APPROVED" | "REJECTED";
type Student = {
  id: number; email: string; fullName: string | null; collegeName: string | null; collegeCode: string | null;
  postalPin: string | null; branchName: string | null; branchCode: string | null;
  registrationNumber: string | null; accessStatus: AccessStatus; createdAt: string;
};
type Page = {
  students: Student[]; page: number; total: number; totalPages: number;
  statusCounts: Record<AccessStatus, number>;
};
type Props = { onError: (message: string) => void; onNotice: (message: string) => void };
const API = (import.meta.env.VITE_API_URL || "https://arctester.onrender.com").replace(/\/+$/, "");
const fields: Array<{ key: keyof Student; label: string }> = [
  { key: "fullName", label: "Full name" }, { key: "email", label: "Email" },
  { key: "registrationNumber", label: "Diploma registration number" }, { key: "postalPin", label: "Mandal PIN" },
  { key: "collegeName", label: "College name" }, { key: "collegeCode", label: "College code" },
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
  const [collegeFilter, setCollegeFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [status, setStatus] = useState<AccessStatus | "ALL">("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (query.trim()) params.set("q", query.trim());
    if (collegeFilter.trim()) params.set("college", collegeFilter.trim());
    if (branchFilter.trim()) params.set("branch", branchFilter.trim());
    if (status !== "ALL") params.set("status", status);
    request<Page>("/admin/students?" + params.toString())
      .then((result) => { if (active) setData(result); })
      .catch((error: unknown) => { if (active) onError(error instanceof Error ? error.message : "Could not load students."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [query, collegeFilter, branchFilter, status, page, reload, onError]);
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
  async function changeAccess(student: Student, next: AccessStatus) {
    if (next === "REJECTED" && !window.confirm("Reject access for " + student.email + "?")) return;
    if (next === "APPROVED" && student.accessStatus !== "APPROVED" && !window.confirm("Approve " + student.email + "? They can sign in after approval.")) return;
    setBusy(true);
    try {
      await request("/admin/students/" + student.id + "/access", { method: "PATCH", body: JSON.stringify({ accessStatus: next }) });
      onNotice(next === "APPROVED" ? "Student approved." : next === "REJECTED" ? "Student access rejected." : "Student approval reset.");
      setReload((value) => value + 1);
    } catch (error) { onError(error instanceof Error ? error.message : "Could not update student access."); }
    finally { setBusy(false); }
  }
  async function approveSelected() {
    const ids = selected.filter((id) => data?.students.some((student) => student.id === id && student.accessStatus === "PENDING"));
    if (!ids.length || busy) return;
    if (!window.confirm("Approve " + ids.length + " selected student account(s)?")) return;
    setBusy(true);
    try {
      const result = await request<{ approvedCount: number }>("/admin/students/access/bulk", { method: "PATCH", body: JSON.stringify({ ids }) });
      onNotice("Approved " + result.approvedCount + " student account(s).");
      setSelected([]);
      setReload((value) => value + 1);
    } catch (error) { onError(error instanceof Error ? error.message : "Could not approve selected students."); }
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
  const visibleStudents = data?.students ?? [];
  const counts = data?.statusCounts ?? { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  return <section className="admin-students">
    <div className="admin-page-title"><div><p className="eyebrow">STUDENT OPERATIONS</p><h1>Students</h1><p>Review new registrations, manage approved accounts, and maintain student academic profiles in one workspace.</p></div>
      <button className="ghost" type="button" disabled={busy} onClick={() => setReload((value) => value + 1)}>Refresh</button>
    </div>
    <div className="admin-stat-grid">
      <article><span>Pending approval</span><b>{counts.PENDING.toLocaleString()}</b><small>Awaiting administrator review</small></article>
      <article><span>Approved</span><b>{counts.APPROVED.toLocaleString()}</b><small>Can sign in and learn</small></article>
      <article><span>Rejected</span><b>{counts.REJECTED.toLocaleString()}</b><small>Access not approved</small></article>
    </div>
    <div className="admin-panel">
      <div className="admin-toolbar">
        <input type="search" aria-label="Search students" placeholder="Search name, email, college, branch or registration number…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); setSelected([]); }} />
        <select aria-label="Filter student status" value={status} onChange={(event) => { setStatus(event.target.value as AccessStatus | "ALL"); setPage(1); setSelected([]); }}>
          <option value="PENDING">Pending approval</option><option value="APPROVED">Approved students</option><option value="REJECTED">Rejected / disabled</option><option value="ALL">All students</option>
        </select>
        <input aria-label="Filter by college" placeholder="Filter college…" value={collegeFilter} onChange={(event) => { setCollegeFilter(event.target.value); setPage(1); setSelected([]); }} />
        <input aria-label="Filter by branch" placeholder="Filter branch…" value={branchFilter} onChange={(event) => { setBranchFilter(event.target.value); setPage(1); setSelected([]); }} />
      </div>
      <div className="table-top"><span>{data ? (data.total ?? 0).toLocaleString() + " student account(s)" : "Loading students…"}</span>
        <button className="primary" type="button" disabled={busy || !selected.length || status !== "PENDING"} onClick={() => void approveSelected()}>Approve selected ({selected.length})</button>
      </div>
      {editing && <div className="admin-panel" role="dialog" aria-label="Edit student profile">
        <h2>Edit student profile</h2><p className="muted">Changes apply to the student account and academic profile.</p>
        <div className="admin-student-edit-grid">{fields.map(({ key, label }) => <label key={key}>{label}<input value={draft[key] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
        <div className="admin-toolbar"><button type="button" disabled={busy} onClick={() => void save()}>Save changes</button><button className="ghost" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
      </div>}
      {busy && <p role="status" className="muted">Working…</p>}
      <div className="admin-student-list">{visibleStudents.map((student) => <article className="admin-student-row" key={student.id}>
        <input type="checkbox" aria-label={"Select " + student.email} checked={selected.includes(student.id)} disabled={student.accessStatus !== "PENDING" || status !== "PENDING"} onChange={() => setSelected((current) => current.includes(student.id) ? current.filter((id) => id !== student.id) : [...current, student.id])} />
        <div className="admin-student-main"><strong>{student.fullName || "Unnamed student"}</strong><span>{student.email}</span><small>{student.collegeName || "College not set"} · {student.registrationNumber || "Registration number not set"} · {student.branchName || "Branch not set"}</small><small>Account ID {student.id} · PIN {student.postalPin || "—"} · {student.accessStatus} · Registered {new Date(student.createdAt).toLocaleDateString()}</small></div>
        <div className="admin-student-actions">
          {student.accessStatus !== "APPROVED" && <button className="primary" type="button" disabled={busy} onClick={() => void changeAccess(student, "APPROVED")}>Approve</button>}
          {student.accessStatus !== "REJECTED" && <button className="ghost" type="button" disabled={busy} onClick={() => void changeAccess(student, "REJECTED")}>Reject</button>}
          {student.accessStatus === "REJECTED" && <button className="ghost" type="button" disabled={busy} onClick={() => void changeAccess(student, "PENDING")}>Reset approval</button>}
          <button className="ghost" type="button" disabled={busy} onClick={() => beginEdit(student)}>Edit</button>
          <button className="danger" type="button" disabled={busy} onClick={() => void remove(student)}>Remove</button>
        </div>
      </article>)}</div>
      {!busy && visibleStudents.length === 0 && <div className="empty-state"><h3>No students found</h3><p>Try another search or status filter.</p></div>}
      {data && (data.totalPages ?? 1) > 1 && <div className="pagination"><button className="ghost" disabled={page <= 1 || busy} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {data.totalPages}</span><button className="ghost" disabled={page >= data.totalPages || busy} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
    </div>
  </section>;
}
