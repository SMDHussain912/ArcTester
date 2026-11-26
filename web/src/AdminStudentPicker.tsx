import { useEffect, useState } from "react";

type StudentOption = { id: number; email: string; fullName: string | null; collegeName: string | null; branchName: string | null; accessStatus: string };
type Props = { value: string; onChange: (value: string) => void; disabled?: boolean };

const API = (import.meta.env.VITE_API_URL || "https://arctester.onrender.com").replace(/\/+$/, "");

export default function AdminStudentPicker({ value, onChange, disabled = false }: Props) {
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedIds = value.split(/[，,\s]+/).filter(Boolean).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
  const uniqueSelectedIds = [...new Set(selectedIds)];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: "1", limit: "100", status: "APPROVED" });
    if (query.trim()) params.set("q", query.trim());
    fetch(API + "/admin/students?" + params.toString(), { credentials: "include", headers: { "content-type": "application/json" } })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load approved students.");
        return body as { students?: StudentOption[] };
      })
      .then((body) => { if (active) setStudents(Array.isArray(body.students) ? body.students : []); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load approved students."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);

  function toggle(id: number) {
    const next = uniqueSelectedIds.includes(id) ? uniqueSelectedIds.filter((item) => item !== id) : [...uniqueSelectedIds, id];
    onChange(next.join(", "));
  }
  function remove(id: number) { onChange(uniqueSelectedIds.filter((item) => item !== id).join(", ")); }
  const selectedLabels = uniqueSelectedIds.map((id) => {
    const student = students.find((item) => item.id === id);
    return { id, label: student ? (student.fullName || student.email) + " · " + student.id : "Student account " + id };
  });

  return <div className="admin-student-picker">
    <div className="admin-student-picker-selected" aria-label="Selected student accounts">
      {selectedLabels.length ? selectedLabels.map(({ id, label }) => <span className="admin-student-picker-chip" key={id}>{label}<button type="button" disabled={disabled} aria-label={"Remove student " + id} onClick={() => remove(id)}>×</button></span>) : <span className="muted">No students selected yet.</span>}
    </div>
    <label className="admin-student-picker-search">Search approved students<input type="search" value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, college, branch or account ID"/></label>
    {error && <p className="admin-student-picker-error" role="alert">{error}</p>}
    <div className="admin-student-picker-results" aria-label="Approved student search results">
      {loading ? <p className="muted">Loading students…</p> : students.length ? students.map((student) => <label className="admin-student-picker-option" key={student.id}>
        <input type="checkbox" disabled={disabled} checked={uniqueSelectedIds.includes(student.id)} onChange={() => toggle(student.id)}/>
        <span><strong>{student.fullName || student.email}</strong><small>{student.email} · ID {student.id}</small><small>{student.collegeName || "College not set"} · {student.branchName || "Branch not set"}</small></span>
      </label>) : <p className="muted">No approved students match this search.</p>}
    </div>
    <small className="muted">Only approved accounts are listed. Selected students retain access even when you search for other students.</small>
  </div>;
}
