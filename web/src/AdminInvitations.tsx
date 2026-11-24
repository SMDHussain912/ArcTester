import { useMemo, useState } from "react";

export type AdminInvitation = { id: string; email: string; expiresAt: string; status: string };
export type CreatedAdminInvitation = { email: string; token: string; expiresAt: string };
export type StudentAccessStatus = "PENDING" | "APPROVED" | "REJECTED";
export type StudentAccessRow = { id: number; email: string; accessStatus: StudentAccessStatus; createdAt: string };

type AdminStudentAccessProps = {
  students: StudentAccessRow[];
  busy: boolean;
  onRefresh: () => void;
  onChangeStatus: (id: number, status: StudentAccessStatus) => void;
  onBulkApprove: (ids: number[]) => void;
};

export default function AdminInvitations({ students, busy, onRefresh, onChangeStatus, onBulkApprove }: AdminStudentAccessProps) {
  const [filter, setFilter] = useState<StudentAccessStatus | "ALL">("PENDING");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const visible = useMemo(() => students.filter((student) =>
    (filter === "ALL" || student.accessStatus === filter) &&
    student.email.toLowerCase().includes(search.trim().toLowerCase())
  ), [students, filter, search]);
  const counts = useMemo(() => ({
    pending: students.filter((student) => student.accessStatus === "PENDING").length,
    approved: students.filter((student) => student.accessStatus === "APPROVED").length,
    rejected: students.filter((student) => student.accessStatus === "REJECTED").length,
  }), [students]);
  const selectedVisible = visible.filter((student) => selected.includes(student.id));
  function toggleSelected(id: number) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function approveSelected() {
    if (!selectedVisible.length || busy) return;
    if (!window.confirm(`Approve ${selectedVisible.length} student account(s)? They will be able to sign in immediately.`)) return;
    onBulkApprove(selectedVisible.map((student) => student.id));
    setSelected([]);
  }
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">STUDENT ACCESS</p><h1>Student approvals</h1><p>Students can register themselves. Approve their account here to unlock ArcTester.</p></div><button className="ghost" onClick={onRefresh} disabled={busy}>Refresh</button></div>
      <div className="admin-stat-grid">
        <article><span>Waiting approval</span><b>{counts.pending.toLocaleString()}</b></article>
        <article><span>Approved students</span><b>{counts.approved.toLocaleString()}</b></article>
        <article><span>Rejected</span><b>{counts.rejected.toLocaleString()}</b></article>
      </div>
      <section className="admin-panel">
        <div className="admin-toolbar">
          <input type="search" aria-label="Search student email" placeholder="Search by student email…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Filter student approval status" value={filter} onChange={(event) => { setFilter(event.target.value as StudentAccessStatus | "ALL"); setSelected([]); }}>
            <option value="PENDING">Waiting approval</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="ALL">All students</option>
          </select>
        </div>
        <div className="table-top"><span>{visible.length.toLocaleString()} student account(s)</span><button className="primary" disabled={busy || selectedVisible.length === 0} onClick={approveSelected}>Approve selected ({selectedVisible.length})</button></div>
        {visible.length === 0 ? <div className="empty-state"><b>No student accounts found</b><span>New registrations will appear here after they submit the form.</span></div> : visible.map((student) => (
          <article className="invitation-row" key={student.id}>
            <input type="checkbox" aria-label={`Select ${student.email}`} checked={selected.includes(student.id)} onChange={() => toggleSelected(student.id)} />
            <div><b>{student.email}</b><small>Registered {new Date(student.createdAt).toLocaleDateString()}</small></div>
            <span className={`status status-${student.accessStatus.toLowerCase()}`}>{student.accessStatus === "PENDING" ? "Waiting" : student.accessStatus}</span>
            {student.accessStatus !== "APPROVED" && <button className="ghost" disabled={busy} onClick={() => onChangeStatus(student.id, "APPROVED")}>Approve</button>}
            {student.accessStatus !== "REJECTED" && <button className="ghost danger-button" disabled={busy} onClick={() => { if (window.confirm(`Reject access for ${student.email}?`)) onChangeStatus(student.id, "REJECTED"); }}>Reject</button>}
          </article>
        ))}
      </section>
    </>
  );
}
