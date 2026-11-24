import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./apiClient";

type Assignment = {
  id: string;
  status: string;
  assignedAt: string;
  availableFrom: string | null;
  dueAt: string | null;
  exam: { id: string; title: string; description: string };
  version: number;
  durationMinutes: number;
  questionCount: number;
  submission: { id: string; status: string; score: number | null; maximumScore: number | null; submittedAt: string } | null;
};
type ExamQuestion = { id: string; position: number; subject: string; topic: string | null; text: string; options: string[]; optionOrder: number[]; marks: number; negativeMarks: number };
type ExamPackage = { assignmentId: string; title: string; instructions: string; durationMinutes: number; serverTime: string; questions: ExamQuestion[] };
type ActiveExam = { assignment: Assignment; exam: ExamPackage; startedAt: string; deadline: string; };
type SavedAnswer = { examQuestionId: string; selectedIndex: number | null };

function formatDate(value: string | null): string {
  if (!value) return "No deadline";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function availability(assignment: Assignment, now: number): { canStart: boolean; label: string } {
  if (assignment.submission) return { canStart: false, label: assignment.submission.status === "REVIEW_REQUIRED" ? "Submitted · awaiting review" : "Submitted" };
  if (assignment.availableFrom && new Date(assignment.availableFrom).getTime() > now) return { canStart: false, label: `Available ${formatDate(assignment.availableFrom)}` };
  if (assignment.dueAt && new Date(assignment.dueAt).getTime() <= now) return { canStart: false, label: "Deadline passed" };
  return { canStart: true, label: "Ready to start" };
}

export default function StudentAssignedExams() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [active, setActive] = useState<ActiveExam | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const [showSubmit, setShowSubmit] = useState(false);
  const [viewSubmission, setViewSubmission] = useState<Assignment | null>(null);
  const revisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const submittingRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await request<{ assignments: Assignment[] }>("/exams/assigned");
      setAssignments(Array.isArray(response.assignments) ? response.assignments : []);
    } catch (cause) {
      setError((cause as Error).message || "Could not load your assigned exams.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const heartbeat = window.setInterval(() => {
      void request(`/exams/assignments/${encodeURIComponent(active.assignment.id)}/session/heartbeat`, {
        method: "POST", body: JSON.stringify({ event: "HEARTBEAT" }),
      }).catch((cause) => setError(`Connection heartbeat failed: ${(cause as Error).message}`));
    }, 30000);
    return () => { window.clearInterval(timer); window.clearInterval(heartbeat); };
  }, [active]);

  const remainingSeconds = active
    ? Math.max(0, Math.ceil((new Date(active.deadline).getTime() - now) / 1000))
    : null;

  const startExam = async (assignment: Assignment) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { package: exam } = await request<{ package: ExamPackage }>(
        `/exams/assignments/${encodeURIComponent(assignment.id)}/package`,
      );
      const { session } = await request<{ session: { startedAt: string; deadline: string } }>(
        `/exams/assignments/${encodeURIComponent(assignment.id)}/session/start`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const saved = await request<{ revision: number; answers: { examQuestionId: string; selectedIndex: number | null }[] }>(
        `/exams/assignments/${encodeURIComponent(assignment.id)}/answers`,
      );
      revisionRef.current = saved.revision ?? 0;
      setAnswers(Object.fromEntries((saved.answers ?? []).map((answer) => [answer.examQuestionId, answer.selectedIndex])));
      saveQueueRef.current = Promise.resolve();
      submittingRef.current = false;
      setShowSubmit(false);
      setActive({ assignment, exam, startedAt: session.startedAt, deadline: session.deadline });
    } catch (cause) {
      setError((cause as Error).message || "Could not start this exam.");
    } finally {
      setBusy(false);
    }
  };

  const selectAnswer = (questionId: string, selectedIndex: number) => {
    if (!active || submittingRef.current) return;
    const next = { ...answers, [questionId]: selectedIndex };
    setAnswers(next);
    const payload: SavedAnswer[] = active.exam.questions.map((question) => ({
      examQuestionId: question.id,
      selectedIndex: next[question.id] ?? null,
    }));
    setSaving(true);
    saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(async () => {
      const response = await request<{ revision: number }>(
        `/exams/assignments/${encodeURIComponent(active.assignment.id)}/answers`,
        { method: "PUT", body: JSON.stringify({ revision: revisionRef.current, answers: payload }) },
      );
      revisionRef.current = response.revision;
    }).catch((cause) => {
      setError(`Answer save failed. Your current selections remain on screen; submit when ready. ${(cause as Error).message}`);
    }).finally(() => setSaving(false));
  };

  const submitExam = async () => {
    if (!active || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError("");
    try {
      await saveQueueRef.current;
      const payload = active.exam.questions.map((question) => ({
        examQuestionId: question.id,
        selectedIndex: answers[question.id] ?? null,
      }));
      const response = await request<{ submission: { status: string; score: number | null; maximumScore: number | null } }>(
        `/exams/assignments/${encodeURIComponent(active.assignment.id)}/submission`,
        { method: "POST", body: JSON.stringify({
          attemptUuid: crypto.randomUUID(),
          startedAt: active.startedAt,
          submittedAt: new Date().toISOString(),
          revision: revisionRef.current,
          answers: payload,
        }) },
      );
      setActive(null);
      setAnswers({});
      setShowSubmit(false);
      setNotice(response.submission?.status === "REVIEW_REQUIRED"
        ? "Exam submitted. Your attempt is awaiting administrator review."
        : "Exam submitted successfully.");
      await refresh();
    } catch (cause) {
      submittingRef.current = false;
      setError((cause as Error).message || "Submission failed. Your answers are still available; try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (active && remainingSeconds === 0 && !submittingRef.current) void submitExam();
  // submitExam intentionally uses the active exam snapshot and current answer state.
  }, [active, remainingSeconds]);

  if (active) {
    const answered = active.exam.questions.filter((question) => answers[question.id] !== undefined && answers[question.id] !== null).length;
    return <section className="assigned-exams">
      <header className="page-heading"><div><p className="eyebrow">ASSIGNED EXAM · VERSION {active.assignment.version}</p><h1>{active.exam.title}</h1><p className="muted">{answered}/{active.exam.questions.length} answered · {saving ? "Saving…" : "Answers autosaved"}</p></div><strong className={remainingSeconds !== null && remainingSeconds < 300 ? "timer-warning" : "exam-countdown"}>{Math.floor((remainingSeconds ?? 0) / 60).toString().padStart(2, "0")}:{((remainingSeconds ?? 0) % 60).toString().padStart(2, "0")}</strong></header>
      {active.exam.instructions ? <div className="panel"><b>Instructions</b><p>{active.exam.instructions}</p></div> : null}
      <div className="question-list">{active.exam.questions.map((question, index) => <article className="panel question-card" key={question.id}>
        <p className="eyebrow">QUESTION {index + 1} · {question.subject}{question.topic ? ` · ${question.topic}` : ""} · +{question.marks} / −{question.negativeMarks}</p>
        <h2>{question.text}</h2>
        <div className="options">{question.options.map((option, displayedIndex) => <button type="button" className={answers[question.id] === displayedIndex ? "option selected" : "option"} aria-pressed={answers[question.id] === displayedIndex} key={displayedIndex} disabled={busy} onClick={() => selectAnswer(question.id, displayedIndex)}><span>{String.fromCharCode(65 + displayedIndex)}</span>{option}</button>)}</div>
      </article>)}</div>
      <div className="practice-submit-bar"><p>{active.exam.questions.length - answered} unanswered · {saving ? "Saving answers…" : "Your answers are saved as you choose."}</p><button type="button" className="primary" disabled={busy} onClick={() => setShowSubmit(true)}>Review & submit</button></div>
      {showSubmit ? <div className="announcement-overlay"><section className="announcement-popup panel" role="dialog" aria-modal="true" aria-labelledby="assigned-exam-submit-title"><p className="eyebrow">FINAL CHECK</p><h2 id="assigned-exam-submit-title">Submit this exam?</h2><p>You answered {answered} of {active.exam.questions.length} questions. Unanswered questions will receive zero marks.</p><div className="row"><button type="button" className="ghost" disabled={busy} onClick={() => setShowSubmit(false)}>Keep reviewing</button><button type="button" className="primary" disabled={busy} onClick={() => void submitExam()}>{busy ? "Submitting…" : "Submit exam"}</button></div></section></div> : null}
      {notice ? <p className="success" role="status">{notice}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>;
  }

  return <section className="assigned-exams">
    <div className="page-heading"><div><p className="eyebrow">YOUR EXAMS</p><h1>Assigned exams</h1><p className="muted">Exams assigned by your administrator appear here. Open an available paper to begin.</p></div><button type="button" className="ghost" disabled={loading} onClick={() => void refresh()}>Refresh</button></div>
    {notice ? <p className="success" role="status">{notice}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    {loading ? <div className="panel">Loading your assignments…</div> : assignments.length ? <div className="exam-list">{assignments.map((assignment) => {
      const state = availability(assignment, now);
      const submitted = Boolean(assignment.submission);
      const actionLabel = assignment.status === "IN_PROGRESS" ? "Continue exam" : "Write exam";
      return <article className="panel exam-row" key={assignment.id}>
        <div className="exam-row-content">
          <span className={submitted ? "status status-used" : "status"}>{state.label}</span>
          <h2>{assignment.exam.title}</h2>
          <p>{assignment.questionCount} questions · {assignment.durationMinutes} minutes · Version {assignment.version}</p>
          <p className="muted">Due: {formatDate(assignment.dueAt)}</p>
          {assignment.submission?.submittedAt ? <p className="muted">Submitted: {formatDate(assignment.submission.submittedAt)}</p> : null}
        </div>
        <div className="exam-actions">
          {submitted
            ? <button type="button" className="primary" onClick={() => setViewSubmission(assignment)}>View results</button>
            : state.canStart
              ? <button type="button" className="primary" disabled={busy} onClick={() => void startExam(assignment)}>{busy ? "Opening…" : actionLabel}</button>
              : <button type="button" className="ghost" disabled>{state.label}</button>}
        </div>
      </article>;
    })}</div> : <div className="panel empty-state"><h2>No exams assigned yet</h2><p>Your administrator has not assigned an exam to your account.</p></div>}
    {viewSubmission ? <div className="announcement-overlay"><section className="announcement-popup panel exam-result-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-result-title">
      <p className="eyebrow">EXAM SUBMISSION</p>
      <h2 id="exam-result-title">{viewSubmission.exam.title}</h2>
      <p className="muted">Status: {viewSubmission.submission?.status === "GRADED" ? "Graded" : viewSubmission.submission?.status === "REVIEW_REQUIRED" ? "Awaiting administrator review" : viewSubmission.submission?.status ?? "Submitted"}</p>
      {viewSubmission.submission?.score !== null && viewSubmission.submission?.score !== undefined && viewSubmission.submission?.maximumScore !== null && viewSubmission.submission?.maximumScore !== undefined
        ? <p className="exam-result-score"><strong>{viewSubmission.submission.score}</strong> / {viewSubmission.submission.maximumScore} marks</p>
        : <p>Your exam was submitted. The score will appear here after it has been evaluated.</p>}
      {viewSubmission.submission?.submittedAt ? <p className="muted">Submitted: {formatDate(viewSubmission.submission.submittedAt)}</p> : null}
      <div className="row"><button type="button" className="ghost" onClick={() => setViewSubmission(null)}>Close</button></div>
    </section></div> : null}
  </section>;
}
