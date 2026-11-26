import { useEffect, useState } from "react";

type StudentSummary = { id: number; fullName: string | null; email: string; registrationNumber: string | null; collegeName: string | null; collegeCode: string | null; branchName: string | null; branchCode: string | null };
type AuditEvent = { id: string; createdAt: string; action: string; outcome: "SUCCESS" | "FAILURE"; actorId: number | null; actorRole: string; resourceType: string; resourceId: string; requestId: string; route: string; collegeCode: string; branchCode: string; contextJson: string };
type AuditPage = { events: AuditEvent[]; page: number; limit: number; total: number; totalPages: number };
type Props = { student: StudentSummary; onClose: () => void; onError: (message: string) => void };
const API = (import.meta.env.VITE_API_URL || "https://arctester.onrender.com").replace(/\\/+$/, "");
const actions = ["LOGIN", "LOGIN_FAILURE", "AUTHENTICATION_SECURITY_CHANGE", "SESSION_REVOKED", "SESSION_ACTIVITY", "STUDENT_APPROVAL", "STUDENT_APPROVAL_BULK", "STUDENT_PROFILE_CHANGE", "STUDENT_ACCOUNT_ANONYMIZED", "LESSON_ACCESS", "LESSON_COMPLETION", "QUESTION_ACTIVITY", "EXAM_START", "EXAM_SUBMIT", "CONTENT_EDIT", "ADMIN_OPERATION", "AUDIT_TIMELINE_VIEW", "AUDIT_EXPORT", "AUDIT_INTEGRITY_CHECK"];
async function request<T>(path: string): Promise<T> {
  const response = await fetch(API + path, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load student audit events.");
  return body as T;
}
export default function AdminStudentAudit({ student, onClose, onError }: Props) {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [collegeCode, setCollegeCode] = useState(student.collegeCode ?? "");
  const [branchCode, setBranchCode] = useState(student.branchCode ?? "");
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [integrity, setIntegrity] = useState<{ valid: boolean; checkedEvents: number; checkedAt: string; firstInvalidEventId: string | null } | null>(null);
  const params = new URLSearchParams({ page: String(page), limit: "25" });
  if (action) params.set("action", action);
  if (outcome) params.set("outcome", outcome);
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(to).toISOString());
  if (collegeCode.trim()) params.set("collegeCode", collegeCode.trim());
  if (branchCode.trim()) params.set("branchCode", branchCode.trim());
  useEffect(() => {
    let active = true;
    setLoading(true);
    request<AuditPage>("/admin/students/" + student.id + "/audit?" + params.toString())
      .then((result) => { if (active) setData(result); })
      .catch((error: unknown) => { if (active) onError(error instanceof Error ? error.message : "Could not load audit timeline."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [student.id, page, action, outcome, from, to, collegeCode, branchCode, refresh, onError]);
  async function verifyIntegrity() {
    try {
      const result = await request<{ valid: boolean; checkedEvents: number; checkedAt: string; firstInvalidEventId: string | null }>("/admin/audit/integrity");
      setIntegrity(result);
    } catch (error) { onError(error instanceof Error ? error.message : "Could not verify audit integrity."); }
  }
  async function exportLogs(format: "csv" | "json") {
    setExporting(true);
    try {
      const exportParams = new URLSearchParams(params);
      exportParams.delete("page");
      exportParams.delete("limit");
      exportParams.set("format", format);
      const response = await fetch(API + "/admin/students/" + student.id + "/audit/export?" + exportParams.toString(), { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Audit export failed.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "student-" + student.id + "-audit." + format;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setRefresh(value => value + 1);
    } catch (error) { onError(error instanceof Error ? error.message : "Audit export failed."); }
    finally { setExporting(false); }
  }
  return <section className="admin-panel admin-student-audit" aria-label="Student audit timeline">
    <div className="admin-panel-head"><div><p className="eyebrow">STUDENT ACTIVITY</p><h2>Audit timeline · {student.fullName || student.email}</h2><p className="admin-muted">Account {student.id} · {student.registrationNumber || "No registration number"} · {student.collegeName || "College not set"} / {student.branchName || "Branch not set"}</p></div><button className="ghost" type="button" onClick={onClose}>Close timeline</button></div>
    <div className="admin-toolbar audit-filter-toolbar">
      <label>Event type<select value={action} onChange={event => { setAction(event.target.value); setPage(1); }}><option value="">All event types</option>{actions.map(value=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
      <label>Outcome<select value={outcome} onChange={event => { setOutcome(event.target.value); setPage(1); }}><option value="">All outcomes</option><option value="SUCCESS">Success</option><option value="FAILURE">Failure</option></select></label>
      <label>From<input type="datetime-local" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label>
      <label>To<input type="datetime-local" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></label>
      <label>College code<input value={collegeCode} onChange={event => { setCollegeCode(event.target.value); setPage(1); }} /></label>
      <label>Branch code<input value={branchCode} onChange={event => { setBranchCode(event.target.value); setPage(1); }} /></label>
    </div>
    <div className="admin-toolbar"><span>{data ? data.total.toLocaleString() + " matching events" : "Loading events…"}</span><button className="ghost" type="button" disabled={exporting} onClick={() => void verifyIntegrity()}>Verify log integrity</button><button className="ghost" type="button" disabled={exporting} onClick={() => void exportLogs("csv")}>Export CSV</button><button className="ghost" type="button" disabled={exporting} onClick={() => void exportLogs("json")}>Export JSON</button><button className="ghost" type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</button></div>
    {integrity && <p role="status" className={integrity.valid ? "admin-alert success" : "admin-alert error"}>{integrity.valid ? "Audit chain verified: " + integrity.checkedEvents.toLocaleString() + " events checked." : "Audit chain integrity failure at event " + integrity.firstInvalidEventId + "."} Checked {new Date(integrity.checkedAt).toLocaleString()}.</p>}
    {loading && <p role="status" className="admin-muted">Loading timeline…</p>}
    <div className="admin-student-audit-list">{data?.events.map(event=><article className="admin-panel" key={event.id}>
      <div className="admin-panel-head"><div><strong>{event.action.replaceAll("_"," ")}</strong><p className="admin-muted">{new Date(event.createdAt).toLocaleString()} · Actor {event.actorId ?? "unknown"} ({event.actorRole})</p></div><span className={event.outcome==="SUCCESS"?"status-pill success":"status-pill danger"}>{event.outcome}</span></div>
      <p>{event.resourceType || "Request"} {event.resourceId ? "· " + event.resourceId : ""} · {event.route}</p>
      <small className="admin-muted">Request ID: {event.requestId} · College {event.collegeCode || "—"} · Branch {event.branchCode || "—"}</small>
    </article>)}</div>
    {!loading && data?.events.length===0 && <div className="empty-state"><h3>No audit events match</h3><p>Try clearing some filters or check back after the student performs an action.</p></div>}
    {data && data.totalPages>1 && <div className="pagination"><button className="ghost" disabled={page<=1||loading} onClick={()=>setPage(value=>value-1)}>Previous</button><span>Page {data.page} of {data.totalPages}</span><button className="ghost" disabled={page>=data.totalPages||loading} onClick={()=>setPage(value=>value+1)}>Next</button></div>}
    <p className="admin-muted">Audit records use server-resolved identity and omit passwords, tokens, cookies, OTPs, request bodies, IP addresses, and device fingerprints.</p>
  </section>;
}
