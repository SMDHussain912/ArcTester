"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "../../lib/session";
import { api, ApiError, type AdminExam, type AdminAttendanceRow, type AdminExamAudit, type AdminExamReport, type AdminLiveSession, type AdminOverview, type AdminQuestion, type AdminStudent } from "../../lib/api";

type Tab = "overview" | "exams" | "create";
const emptyOverview: AdminOverview = {
  totals: { students: 0, exams: 0, assignments: 0, submissions: 0, submissionRate: 0, averagePercentage: null },
  practice: {
    completedAttempts: 0, questions: 0, correct: 0, incorrect: 0, unanswered: 0, accuracy: null,
    subjects: [], topics: [],
    questionPerformance: { minimumAnswers: 5, minimumStudents: 3, weakAccuracyThreshold: 0.6, insufficientSampleCount: 0, questions: [] },
  },
  formalExams: { graded: 0, reviewRequired: 0, correct: 0, incorrect: 0, unanswered: 0, subjects: [], topics: [] },
  exams: [], recentSubmissions: [],
};

export default function AdminPage() {
  const { status, user } = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<AdminOverview>(emptyOverview);
  const [exams, setExams] = useState<AdminExam[]>([]);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [liveSessions, setLiveSessions] = useState<AdminLiveSession[]>([]);
  const [attendance, setAttendance] = useState<AdminAttendanceRow[]>([]);
  const [selectedReport, setSelectedReport] = useState<AdminExamReport | null>(null);
  const [selectedAudit, setSelectedAudit] = useState<AdminExamAudit | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [questionScoring, setQuestionScoring] = useState<Record<number, { marks: number; negativeMarks: number }>>({});
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [assignExamId, setAssignExamId] = useState("");
  const [title, setTitle] = useState("");
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("Read each question carefully. Select one answer.");
  const [duration, setDuration] = useState(60);
  const [availableFrom, setAvailableFrom] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("All subjects");
  const [difficultyFilter, setDifficultyFilter] = useState("All difficulties");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [defaultMarks, setDefaultMarks] = useState(1);
  const [negativeMarks, setNegativeMarks] = useState(0);
  const [busy, setBusy] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setWorkspaceLoading(true);
    try {
      const [stats, examData, studentData, firstQuestionPage, liveData, attendanceData] = await Promise.all([        api.adminOverview(), api.adminExams(), api.adminStudents(), api.adminQuestions(1, 200), api.adminLiveSessions(), api.adminExamAttendance(),
      ]);
      const remainingPages = await Promise.all(
        Array.from({ length: Math.max(0, firstQuestionPage.pages - 1) }, (_, index) =>
          api.adminQuestions(index + 2, 200)
        )
      );
      setOverview(stats);
      setExams(examData.exams);
      setStudents(studentData.students);
      setQuestions([
        ...firstQuestionPage.questions,
        ...remainingPages.flatMap((page) => page.questions),
      ]);
      setLiveSessions(liveData.sessions);
      setAttendance(attendanceData.attendance);
      setWorkspaceLoaded(true);
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "ADMIN") {
      load().catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Could not load the admin workspace."));
    }
  }, [status, user?.role, load]);

  useEffect(() => {
    if (status !== "authenticated" || user?.role !== "ADMIN") return;
    const timer = window.setInterval(() => {
      Promise.all([api.adminLiveSessions(), api.adminExamAttendance()]).then(([live, register]) => {
        setLiveSessions(live.sessions);
        setAttendance(register.attendance);
      }).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [status, user?.role]);

  async function controlSession(session: AdminLiveSession, action: "PAUSE" | "RESUME" | "TERMINATE") {
    const reason = action === "TERMINATE" ? window.prompt("Reason for terminating this candidate session?") : "";
    if (action === "TERMINATE" && reason === null) return;
    if (!window.confirm(`${action} session for ${session.student.email}?`)) return;
    try {
      await api.adminSessionAction(session.id, action, reason ?? "");
      const [refreshed, register] = await Promise.all([api.adminLiveSessions(), api.adminExamAttendance()]);
      setLiveSessions(refreshed.sessions);
      setAttendance(register.attendance);
      setNotice(`Session ${action.toLowerCase()} action recorded.`);
      setError("");
    } catch (cause: unknown) {
      showError(cause, "Could not update the candidate session.");
    }
  }

  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return questions.filter((q) => (subjectFilter === "All subjects" || q.subject === subjectFilter) && (difficultyFilter === "All difficulties" || (q.difficulty ?? "Unspecified") === difficultyFilter) && (!term || [q.text, q.subject, q.topic ?? ""].some((v) => v.toLowerCase().includes(term))));
  }, [questions, search, subjectFilter, difficultyFilter]);

  const selectedQuestionRows = useMemo(
    () => selectedQuestions.map((id) => questions.find((question) => question.id === id)).filter((question): question is AdminQuestion => Boolean(question)),
    [questions, selectedQuestions]
  );
  const totalMarks = selectedQuestions.reduce((sum, id) => sum + (questionScoring[id]?.marks ?? defaultMarks), 0);
  const maximumNegativeMarks = selectedQuestions.reduce((sum, id) => sum + (questionScoring[id]?.negativeMarks ?? negativeMarks), 0);
  const questionsWithoutDifficulty = selectedQuestionRows.filter((question) => !question.difficulty).length;
  const selectedSubjects = new Set(selectedQuestionRows.map((question) => question.subject));
  const subjectBreakdown = [...selectedSubjects].sort().map((subject) => {
    const rows = selectedQuestionRows.filter((question) => question.subject === subject);
    return {
      subject,
      questions: rows.length,
      marks: rows.reduce((sum, question) => sum + (questionScoring[question.id]?.marks ?? defaultMarks), 0),
    };
  });
  const selectedDifficulties = selectedQuestionRows.reduce<Record<string, number>>((counts, question) => {
    const difficulty = question.difficulty || "Unspecified";
    counts[difficulty] = (counts[difficulty] || 0) + 1;
    return counts;
  }, {});

  function toggleQuestion(id: number) {
    if (selectedQuestions.includes(id)) {
      setSelectedQuestions((current) => current.filter((value) => value !== id));
      setQuestionScoring((scoring) => {
        const next = { ...scoring };
        delete next[id];
        return next;
      });
      return;
    }
    setSelectedQuestions((current) => [...current, id]);
    setQuestionScoring((scoring) => ({
      ...scoring,
      [id]: { marks: defaultMarks, negativeMarks },
    }));
  }

  function updateQuestionScoring(id: number, field: "marks" | "negativeMarks", value: number) {
    setQuestionScoring((current) => ({
      ...current,
      [id]: {
        marks: current[id]?.marks ?? defaultMarks,
        negativeMarks: current[id]?.negativeMarks ?? negativeMarks,
        [field]: Math.max(0, Math.min(100, value)),
      },
    }));
  }
  function moveQuestion(id: number, direction: -1 | 1) {
    setSelectedQuestions((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }
  function toggleStudent(id: number) {
    setSelectedStudents((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }
  function showError(e: unknown, fallback: string) {
    setError(e instanceof ApiError ? e.message : fallback);
    setNotice("");
  }

  async function createExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) { setError("Enter an exam title."); return; }
    if (duration < 1 || duration > 600) { setError("Duration must be between 1 and 600 minutes."); return; }
    if (selectedQuestions.length === 0) { setError("Select at least one question."); return; }
    if (selectedQuestions.length > 500) { setError("An exam cannot contain more than 500 questions."); return; }
    if (selectedQuestions.some((id) => (questionScoring[id]?.negativeMarks ?? negativeMarks) > (questionScoring[id]?.marks ?? defaultMarks))) {
      setError("A question cannot have more negative marks than its correct-answer marks.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const paper = {
        durationMinutes: duration,
        questions: selectedQuestions.map((questionId) => ({
          questionId,
          marks: questionScoring[questionId]?.marks ?? defaultMarks,
          negativeMarks: questionScoring[questionId]?.negativeMarks ?? negativeMarks,
        })),
      };
      const validation = await api.validateAdminPaper(paper);
      if (!validation.valid) {
        setError(validation.errors.join(" "));
        return;
      }
      if (validation.warnings.length && !window.confirm(
        "Paper blueprint warnings:\n\n" + validation.warnings.map((warning) => "• " + warning).join("\n") + "\n\nContinue and create this draft?"
      )) return;
      const payload = {
        title, description, instructions, durationMinutes: duration,
        shuffleQuestions, shuffleOptions, questions: paper.questions,
      };
      const result = editingExamId
        ? await api.updateAdminExam(editingExamId, payload)
        : await api.createAdminExam(payload);
      setNotice(editingExamId
        ? "A new immutable exam version was saved. Existing assignments remain on their original version."
        : "Draft exam created. Publish it from the Exams tab when it is ready.");
      setEditingExamId(null);
      setTitle(""); setDescription(""); setSelectedQuestions([]); setQuestionScoring({});
      await load(); setTab("exams");
      setAssignExamId(result.exam.id);
    } catch (e) { showError(e, "Could not create the exam."); }
    finally { setBusy(false); }
  }

  async function viewExamAudit(assignmentId: string) {
    setBusy(true); setError("");
    try {
      const result = await api.adminExamAudit(assignmentId);
      setSelectedAudit(result.audit);
    } catch (cause: unknown) {
      showError(cause, "Could not load the candidate audit trail.");
    } finally { setBusy(false); }
  }

  async function viewExamReport(id: string) {
    setBusy(true); setError("");
    try {
      const result = await api.adminExamReport(id);
      setSelectedReport(result.report);
    } catch (cause: unknown) {
      showError(cause, "Could not load the exam report.");
    } finally { setBusy(false); }
  }

  async function editExam(id: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api.adminLatestExamVersion(id);
      const version = result.exam.version;
      if (!version) throw new Error("This exam has no version to edit.");
      const ids = version.questions.map((question) => question.sourceQuestionId);
      if (ids.some((questionId) => questionId === null)) {
        throw new Error("Some source questions were deleted. Clone this paper to preserve its immutable content.");
      }
      setEditingExamId(id);
      setTitle(result.exam.title);
      setDescription(result.exam.description);
      setInstructions(version.instructions);
      setDuration(version.durationMinutes);
      setShuffleQuestions(version.shuffleQuestions);
      setShuffleOptions(version.shuffleOptions);
      setSelectedQuestions(ids as number[]);
      setQuestionScoring(Object.fromEntries(version.questions.map((question) => [
        question.sourceQuestionId as number,
        { marks: question.marks, negativeMarks: question.negativeMarks },
      ])) as Record<number, { marks: number; negativeMarks: number }>);
      setTab("create");
      setNotice(`Editing ${result.exam.title}. Saving creates a new immutable version; previous assignments remain unchanged.`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not load this exam version.");
    } finally { setBusy(false); }
  }

  async function cloneExam(id: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api.cloneAdminExam(id);
      setNotice(`Created ${result.exam.title} as a new draft. Edit it before publishing.`);
      await load();
    } catch (cause: unknown) {
      showError(cause, "Could not clone this exam.");
    } finally { setBusy(false); }
  }

  async function publishExam(id: string) {
    const exam = exams.find((item) => item.id === id);
    const latest = exam?.versions[0];
    if (!window.confirm("Publish " + (exam?.title ?? "this exam") + " version " + (latest?.version ?? 1) + "? Published versions are used for student assignments. Review the question count, duration, marks and instructions before continuing.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api.publishAdminExam(id);
      setNotice("Exam published. You can now assign it to students.");
      await load();
    } catch (e) { showError(e, "Could not publish the exam."); }
    finally { setBusy(false); }
  }

  async function assignExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignExamId) { setError("Choose a published exam."); return; }
    if (selectedStudents.length === 0) { setError("Select at least one student."); return; }
    if (availableFrom && dueAt && new Date(dueAt).getTime() <= new Date(availableFrom).getTime()) {
      setError("The exam deadline must be later than its availability time.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      await api.assignAdminExam(assignExamId, {
        studentIds: selectedStudents,
        ...(availableFrom ? { availableFrom: new Date(availableFrom).toISOString() } : {}),
        ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
      });
      setNotice("Exam assignment completed. Existing assignments were left unchanged.");
      setSelectedStudents([]); setAvailableFrom(""); setDueAt("");
      await load();
    } catch (e) { showError(e, "Could not assign the exam."); }
    finally { setBusy(false); }
  }

  if (status === "loading") return <p className="mute">Checking administrator access…</p>;
  if (status !== "authenticated") return <section className="panel"><h1>Admin workspace</h1><p>Sign in with an administrator account to continue.</p><a className="button" href="/login">Sign in</a></section>;
  if (user?.role !== "ADMIN") return <section className="panel"><h1>Access restricted</h1><p className="mute">This workspace is available to administrator accounts only.</p><a className="button button-secondary" href="/">Back to dashboard</a></section>;

  return (
    <>
      <section className="page-intro">
        <p className="eyebrow">ArcTester administration</p>
        <h1>Admin workspace</h1>
        <p className="muted">Manage exams, publish immutable versions, assign students and monitor submissions.</p>
      </section>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p className="warn" role="status">{notice}</p> : null}

      {!workspaceLoaded ? (
        <section className="panel" aria-live="polite">
          <p className="muted">{workspaceLoading ? "Loading administrator workspace…" : "Workspace data could not be loaded. Check the error above and refresh to retry."}</p>
          {!workspaceLoading ? <button className="button button-secondary" onClick={() => { setError(""); load().catch((e: unknown) => showError(e, "Refresh failed.")); }}>Retry loading workspace</button> : null}
        </section>
      ) : (
      <>
      <div className="row" style={{ marginBottom: 20 }}>
        {(["overview", "exams", "create"] as const).map((value) => (
          <button key={value} className={tab === value ? "button" : "button button-secondary"} onClick={() => setTab(value)}>
            {value === "overview" ? "Overview" : value === "exams" ? "Exams & assignments" : "Create exam"}
          </button>
        ))}
        <Link className="button button-secondary" href="/admin/questions">Question bank · Upload / Manage</Link>
        <button className="button button-secondary" disabled={busy} onClick={() => { setError(""); load().catch((e: unknown) => showError(e, "Refresh failed.")); }}>Refresh</button>
      </div>

      {tab === "overview" ? (
        <>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-label">Students</div><div className="stat-value">{overview.totals.students}</div></div>
            <div className="stat-card"><div className="stat-label">Exams</div><div className="stat-value">{overview.totals.exams}</div></div>
            <div className="stat-card"><div className="stat-label">Assignments</div><div className="stat-value">{overview.totals.assignments}</div></div>
            <div className="stat-card"><div className="stat-label">Submissions</div><div className="stat-value">{overview.totals.submissions}</div></div>
          </div>
          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-header"><h2>Practice performance</h2><span className="pill">{overview.practice.completedAttempts} completed attempts</span></div>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-label">Answered accuracy</div><div className="stat-value">{overview.practice.accuracy === null ? "—" : `${Math.round(overview.practice.accuracy * 100)}%`}</div></div>
              <div className="stat-card"><div className="stat-label">Correct</div><div className="stat-value">{overview.practice.correct}</div></div>
              <div className="stat-card"><div className="stat-label">Incorrect</div><div className="stat-value">{overview.practice.incorrect}</div></div>
              <div className="stat-card"><div className="stat-label">Unanswered</div><div className="stat-value">{overview.practice.unanswered}</div></div>
            </div>
            {overview.practice.subjects.length === 0 ? <p className="mute">No completed practice attempts yet.</p> : <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table><thead><tr><th>Subject</th><th>Correct</th><th>Incorrect</th><th>Unanswered</th><th>Accuracy</th></tr></thead>
                <tbody>{overview.practice.subjects.map((row) => <tr key={row.subject}><td>{row.subject}</td><td>{row.correct}</td><td>{row.incorrect}</td><td>{row.unanswered}</td><td>{row.accuracy === null ? "—" : `${Math.round(row.accuracy * 100)}%`}</td></tr>)}</tbody>
              </table>
            </div>}
            {overview.practice.topics.length > 0 ? <div style={{ overflowX: "auto", marginTop: 14 }}>
              <h3>Practice by topic</h3>
              <table><thead><tr><th>Subject</th><th>Topic</th><th>Correct</th><th>Incorrect</th><th>Unanswered</th><th>Accuracy</th></tr></thead>
                <tbody>{overview.practice.topics.map((row) => <tr key={row.subject + ":" + (row.topic ?? "unassigned")}><td>{row.subject}</td><td>{row.topic ?? "Unassigned"}</td><td>{row.correct}</td><td>{row.incorrect}</td><td>{row.unanswered}</td><td>{row.accuracy === null ? "—" : `${Math.round(row.accuracy * 100)}%`}</td></tr>)}</tbody>
              </table>
            </div> : null}
          </section>
          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-header">
              <h2>Question difficulty signals</h2>
              <span className="pill">{overview.practice.questionPerformance.questions.length} questions tracked</span>
            </div>
            <p className="mute">
              Cohort practice only. A question is flagged after at least {overview.practice.questionPerformance.minimumAnswers} answered attempts from {overview.practice.questionPerformance.minimumStudents} students
              and accuracy below {Math.round(overview.practice.questionPerformance.weakAccuracyThreshold * 100)}%.
              {overview.practice.questionPerformance.insufficientSampleCount > 0
                ? ` ${overview.practice.questionPerformance.insufficientSampleCount} questions have insufficient sample size.`
                : ""}
            </p>
            {overview.practice.questionPerformance.questions.filter((question) => question.weak).length === 0 ? (
              <p className="mute">No question has enough evidence to be flagged as difficult.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>Question ID</th><th>Subject</th><th>Topic</th><th>Difficulty</th><th>Answered</th><th>Correct</th><th>Incorrect</th><th>Accuracy</th></tr></thead>
                  <tbody>
                    {overview.practice.questionPerformance.questions.filter((question) => question.weak).slice(0, 12).map((question) => (
                      <tr key={question.questionId}>
                        <td>#{question.questionId}</td><td>{question.subject}</td><td>{question.topic ?? "Unassigned"}</td>
                        <td>{question.difficulty}</td><td>{question.sampleSize}</td><td>{question.correct}</td><td>{question.incorrect}</td>
                        <td>{question.accuracy === null ? "—" : `${Math.round(question.accuracy * 100)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-header"><h2>Verified formal exam analytics</h2><span className="pill">{overview.formalExams.graded} graded · {overview.formalExams.reviewRequired} awaiting review</span></div>
            <p className="mute">Only graded submissions are included in verified question-level metrics. Review-required submissions are counted separately.</p>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-label">Correct</div><div className="stat-value">{overview.formalExams.correct}</div></div>
              <div className="stat-card"><div className="stat-label">Incorrect</div><div className="stat-value">{overview.formalExams.incorrect}</div></div>
              <div className="stat-card"><div className="stat-label">Unanswered</div><div className="stat-value">{overview.formalExams.unanswered}</div></div>
            </div>
            {overview.formalExams.subjects.length === 0 ? <p className="mute">No graded exam answers yet.</p> : <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table><thead><tr><th>Subject</th><th>Correct</th><th>Incorrect</th><th>Unanswered</th><th>Accuracy</th><th>Marks</th></tr></thead>
                <tbody>{overview.formalExams.subjects.map((row) => <tr key={row.subject}><td>{row.subject}</td><td>{row.correct}</td><td>{row.incorrect}</td><td>{row.unanswered}</td><td>{row.accuracy === null ? "—" : `${Math.round(row.accuracy * 100)}%`}</td><td>{row.awardedMarks} / {row.maximumMarks}</td></tr>)}</tbody>
              </table>
            </div>}
            {overview.formalExams.topics.length > 0 ? <div style={{ overflowX: "auto", marginTop: 14 }}>
              <h3>Verified results by topic</h3>
              <table><thead><tr><th>Subject</th><th>Topic</th><th>Correct</th><th>Incorrect</th><th>Unanswered</th><th>Accuracy</th><th>Marks</th></tr></thead>
                <tbody>{overview.formalExams.topics.map((row) => <tr key={row.subject + ":" + (row.topic ?? "unassigned")}><td>{row.subject}</td><td>{row.topic ?? "Unassigned"}</td><td>{row.correct}</td><td>{row.incorrect}</td><td>{row.unanswered}</td><td>{row.accuracy === null ? "—" : `${Math.round(row.accuracy * 100)}%`}</td><td>{row.awardedMarks} / {row.maximumMarks}</td></tr>)}</tbody>
              </table>
            </div> : null}
          </section>
          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-header"><h2>Exam performance</h2><span className="pill">{overview.exams.length} exams</span></div>
            {overview.exams.length === 0 ? <p className="mute">No exam assignments yet.</p> : <div style={{ overflowX: "auto" }}>
              <table><thead><tr><th>Exam</th><th>Assigned</th><th>Submitted</th><th>Submission rate</th><th>Average score</th></tr></thead>
                <tbody>{overview.exams.map((exam) => <tr key={exam.examId}><td>{exam.title}</td><td>{exam.assigned}</td><td>{exam.submitted}</td><td>{Math.round(exam.submissionRate * 100)}%</td><td>{exam.averagePercentage === null ? "—" : `${Math.round(exam.averagePercentage)}%`}</td></tr>)}</tbody>
              </table>
            </div>}
          </section>
          <section className="panel" style={{ marginTop: 18 }}>
            <h2>Recent submissions</h2>
            {overview.recentSubmissions.length === 0 ? <p className="mute">No submissions received yet.</p> : <div style={{ overflowX: "auto" }}>
              <table><thead><tr><th>Student</th><th>Exam</th><th>Score</th><th>Submitted</th><th>Status</th></tr></thead>
                <tbody>{overview.recentSubmissions.map((item, index) => <tr key={index}><td>{item.studentEmail}</td><td>{item.examTitle}</td><td>{item.score === null || item.maximumScore === null ? "Pending" : `${item.score} / ${item.maximumScore}`}</td><td>{new Date(item.submittedAt).toLocaleString()}</td><td>{item.status}</td></tr>)}</tbody>
              </table>
            </div>}
          </section>
          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-header"><h2>Live invigilation</h2><span className="pill">{liveSessions.length} active / interrupted sessions</span></div>
            <p className="mute">Candidate sessions refresh every 15 seconds. A stale heartbeat indicates a connectivity gap, not proof of misconduct.</p>
            {liveSessions.length === 0 ? <p className="mute">No candidates are currently taking an assigned examination.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>Candidate</th><th>Examination</th><th>Status</th><th>Last activity</th><th>Focus losses</th><th>Connection gaps</th><th>Invigilator actions</th></tr></thead>
                  <tbody>{liveSessions.map((session) => (
                    <tr key={session.id}>
                      <td>{session.student.email}</td><td>{session.exam.title}</td>
                      <td>{session.status} · {session.connectivity}</td>
                      <td>{session.lastHeartbeatAt ? new Date(session.lastHeartbeatAt).toLocaleTimeString() : "—"}</td>
                      <td>{session.focusLossCount}</td><td>{session.disconnectCount}</td>
                      <td><div className="row" style={{ gap: 6 }}>
                        {session.status === "ACTIVE" ? <button className="button button-secondary button-small" onClick={() => void controlSession(session, "PAUSE")}>Pause</button> : <button className="button button-secondary button-small" onClick={() => void controlSession(session, "RESUME")}>Resume</button>}
                        <button className="button button-quiet button-small" onClick={() => void controlSession(session, "TERMINATE")}>Terminate</button>
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {liveSessions.some((session) => session.events.length) ? <details style={{ marginTop: 12 }}>
              <summary>Recent invigilation events</summary>
              {liveSessions.flatMap((session) => session.events.map((event) => ({ ...event, email: session.student.email, exam: session.exam.title }))).slice(0, 30).map((event) => (
                <p key={event.id} className="mute">{new Date(event.createdAt).toLocaleString()} · {event.email} · {event.exam} · {event.type} · by {event.actor?.email ?? "system"} — {event.detail}</p>
              ))}
            </details> : null}
          </section>
          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-header"><h2>Candidate attendance register</h2><span className="pill">{attendance.length} assigned candidates</span></div>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Candidate</th><th>Exam</th><th>Attendance</th><th>Started</th><th>Submitted</th><th>Result</th><th>Audit</th></tr></thead>
                <tbody>{attendance.map((row) => (
                  <tr key={row.assignmentId}>
                    <td>{row.candidate.email}</td><td>{row.exam.title} · v{row.version}</td>
                    <td>{row.attendanceStatus} · {row.connectivity}</td>
                    <td>{row.session?.startedAt ? new Date(row.session.startedAt).toLocaleString() : "—"}</td>
                    <td>{row.submission?.submittedAt ? new Date(row.submission.submittedAt).toLocaleString() : "—"}</td>
                    <td>{row.submission ? row.submission.status : "Not submitted"}</td>
                    <td><button className="button button-quiet button-small" disabled={busy} onClick={() => void viewExamAudit(row.assignmentId)}>View log</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
          {selectedAudit ? <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-header"><h2>Candidate audit trail · {selectedAudit.candidate.email}</h2><button className="button button-quiet button-small" onClick={() => setSelectedAudit(null)}>Close log</button></div>
            <p className="muted">{selectedAudit.exam.title} · Version {selectedAudit.version} · Session {selectedAudit.session?.status ?? "Not started"}</p>
            {selectedAudit.session ? <div className="stat-grid">
              <div className="stat-card"><div className="stat-label">Heartbeats</div><div className="stat-value">{selectedAudit.session.heartbeatCount}</div></div>
              <div className="stat-card"><div className="stat-label">Focus losses</div><div className="stat-value">{selectedAudit.session.focusLossCount}</div></div>
              <div className="stat-card"><div className="stat-label">Connection gaps</div><div className="stat-value">{selectedAudit.session.disconnectCount}</div></div>
              <div className="stat-card"><div className="stat-label">Submission</div><div className="stat-value" style={{ fontSize: 16 }}>{selectedAudit.submission?.status ?? "Pending"}</div></div>
            </div> : <p className="mute">Candidate has not started this examination.</p>}
            {selectedAudit.events.length === 0 ? <p className="mute">No session events recorded.</p> : selectedAudit.events.map((event) => (
              <p key={event.id} className="mute">{new Date(event.createdAt).toLocaleString()} · {event.type} · {event.actor?.email ?? "System"} — {event.detail}</p>
            ))}
          </section> : null}
        </>
      ) : null}

      {tab === "exams" ? (
        <>
          <section className="panel">
            <div className="panel-header"><h2>Exam library</h2><span className="pill">{exams.length} total</span></div>
            {exams.length === 0 ? <p className="mute">No exams created. Use Create exam to build the first one.</p> : exams.map((exam) => {
              const version = exam.versions[0];
              return <article key={exam.id} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div><h3>{exam.title}</h3><p className="mute">{exam.description || "No description"} · {version?._count.questions ?? 0} questions · {version?.durationMinutes ?? 0} min</p></div>
                  <span className="pill">{version?.publishedAt ? "PUBLISHED" : "DRAFT"}</span>
                </div>
                <div className="row">
                  {!version?.publishedAt ? <button disabled={busy} onClick={() => void publishExam(exam.id)}>Publish version {version?.version ?? 1}</button> :
                    <button className="button button-secondary" onClick={() => { setAssignExamId(exam.id); setTab("exams"); document.getElementById("assign-exam")?.scrollIntoView({ behavior: "smooth" }); }}>Assign to students</button>}
                  <button className="button button-secondary button-small" disabled={busy} onClick={() => void viewExamReport(exam.id)}>Report</button>
                  <button className="button button-secondary button-small" disabled={busy} onClick={() => void editExam(exam.id)}>Create new version</button>
                  <button className="button button-quiet button-small" disabled={busy} onClick={() => void cloneExam(exam.id)}>Clone</button>
                  <span className="mute">{version?._count.assignments ?? 0} assignments</span>
                </div>
              </article>;
            })}
          </section>
          {selectedReport ? <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-header"><h2>Exam report · {selectedReport.title} {selectedReport.version ? `v${selectedReport.version}` : ""}</h2><button className="button button-quiet button-small" onClick={() => setSelectedReport(null)}>Close report</button></div>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-label">Assigned</div><div className="stat-value">{selectedReport.assigned}</div></div>
              <div className="stat-card"><div className="stat-label">Started</div><div className="stat-value">{selectedReport.started}</div></div>
              <div className="stat-card"><div className="stat-label">Submitted</div><div className="stat-value">{selectedReport.submitted}</div></div>
              <div className="stat-card"><div className="stat-label">Average</div><div className="stat-value">{selectedReport.averagePercentage === null ? "—" : `${Math.round(selectedReport.averagePercentage)}%`}</div></div>
            </div>
            <h3>Subject performance</h3>
            <div style={{ overflowX: "auto" }}><table><thead><tr><th>Subject</th><th>Paper questions</th><th>Correct</th><th>Incorrect</th><th>Unanswered</th><th>Maximum marks</th></tr></thead>
              <tbody>{selectedReport.subjects.map((row) => <tr key={row.subject}><td>{row.subject}</td><td>{row.questions}</td><td>{row.correct}</td><td>{row.incorrect}</td><td>{row.unanswered}</td><td>{row.marks}</td></tr>)}</tbody>
            </table></div>
            <h3>Question-level analysis</h3>
            <div style={{ overflowX: "auto" }}><table><thead><tr><th>Q.No.</th><th>Subject</th><th>Topic</th><th>Responses</th><th>Correct</th><th>Incorrect</th><th>Unanswered</th><th>Accuracy</th></tr></thead>
              <tbody>{selectedReport.questions.map((row) => <tr key={row.questionId}><td>{row.position}</td><td>{row.subject}</td><td>{row.topic ?? "Unassigned"}</td><td>{row.responses}</td><td>{row.correct}</td><td>{row.incorrect}</td><td>{row.unanswered}</td><td>{row.accuracy === null ? "—" : `${Math.round(row.accuracy * 100)}%`}</td></tr>)}</tbody>
            </table></div>
            <p className="mute">{selectedReport.reviewRequired} submissions require invigilator review. Accuracy excludes unanswered questions.</p>
          </section> : null}
          <section id="assign-exam" className="panel" style={{ marginTop: 18 }}>
            <h2>Assign a published exam</h2>
            <form onSubmit={assignExam}>
              <label style={{ display: "block" }}>Published exam
                <select value={assignExamId} onChange={(e) => setAssignExamId(e.target.value)}>
                  <option value="">Choose an exam</option>
                  {exams.filter((exam) => exam.versions[0]?.publishedAt).map((exam) => <option key={exam.id} value={exam.id}>{exam.title} (v{exam.versions[0].version})</option>)}
                </select>
              </label>
              <div className="row" style={{ justifyContent: "space-between", marginTop: 14 }}>
                <strong>Students ({selectedStudents.length} selected)</strong>
                <button type="button" className="button button-secondary button-small" onClick={() => setSelectedStudents(selectedStudents.length === students.length ? [] : students.map((s) => s.id))}>Select all / clear</button>
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10, padding: 8 }}>
                {students.map((student) => <label key={student.id}><input type="checkbox" checked={selectedStudents.includes(student.id)} onChange={() => toggleStudent(student.id)} /><span>{student.email}</span></label>)}
                {students.length === 0 ? <p className="mute">No student accounts found.</p> : null}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <label style={{ display: "block", flex: 1 }}>Available from (optional)<input type="datetime-local" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} /></label>
                <label style={{ display: "block", flex: 1 }}>Due at (optional)<input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
              </div>
              <button disabled={busy || !assignExamId || selectedStudents.length === 0}>Assign exam to {selectedStudents.length} students</button>
            </form>
          </section>
        </>
      ) : null}

      {tab === "create" ? (
        <section className="panel">
          <h2>{editingExamId ? "Create a new exam version" : "Create an exam draft"}</h2>
          <p className="mute">Questions are copied into an immutable version snapshot. Later question-bank edits will not change this exam. {editingExamId ? "Saving preserves the old version and its assignments." : ""}</p>
          <form onSubmit={createExam}>
            <label style={{ display: "block" }}>Exam title<input required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. ECET CSE Mock Test 01" /></label>
            <label style={{ display: "block" }}>Description<input maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description for students" /></label>
            <label style={{ display: "block" }}>Student instructions<textarea rows={5} maxLength={5000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Explain exam rules, allowed materials, navigation and submission policy." /></label>
            <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
              <label style={{ display: "block", maxWidth: 180 }}>Duration (minutes)<input type="number" min={1} max={600} required value={duration} onChange={(e) => setDuration(Math.max(1, Math.min(600, Number(e.target.value) || 1)))} /></label>
              <label style={{ display: "block", maxWidth: 150 }}>Marks per question<input type="number" min={0} max={100} step="0.25" value={defaultMarks} onChange={(e) => setDefaultMarks(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} /></label>
              <label style={{ display: "block", maxWidth: 150 }}>Negative marks<input type="number" min={0} max={100} step="0.25" value={negativeMarks} onChange={(e) => setNegativeMarks(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} /></label>
            </div>
            <div className="row" style={{ gap: 18, flexWrap: "wrap", marginTop: 12 }}>
              <label><input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} /> Shuffle question order</label>
              <label><input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} /> Shuffle answer options</label>
            </div>
            <div className="section-heading"><div><h2>Build the question paper</h2><p>Select questions deliberately and check the paper balance before creating it.</p></div></div>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-label">Selected questions</div><div className="stat-value">{selectedQuestions.length}</div></div>
              <div className="stat-card"><div className="stat-label">Total marks</div><div className="stat-value">{totalMarks}</div></div>
              <div className="stat-card"><div className="stat-label">Subjects covered</div><div className="stat-value">{selectedSubjects.size}</div></div>
              <div className="stat-card"><div className="stat-label">Maximum negative</div><div className="stat-value">{maximumNegativeMarks}</div></div>
            </div>
            <p className="mute">Estimated time per question: {selectedQuestions.length ? (duration / selectedQuestions.length).toFixed(1) : "—"} minutes.</p>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <input style={{ flex: "2 1 240px" }} aria-label="Search question bank" placeholder="Search question, subject or topic…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select style={{ flex: "1 1 180px" }} value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}><option>All subjects</option>{[...new Set(questions.map((q) => q.subject))].sort().map((subject) => <option key={subject}>{subject}</option>)}</select>
              <select style={{ flex: "1 1 180px" }} value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}><option>All difficulties</option>{[...new Set(questions.map((q) => q.difficulty || "Unspecified"))].sort().map((difficulty) => <option key={difficulty}>{difficulty}</option>)}</select>
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 10, flexWrap: "wrap" }}>
              <span className="mute">Showing {filteredQuestions.length} questions · {selectedQuestions.length} selected overall</span>
              <div className="row">
                <button type="button" className="button button-secondary button-small" onClick={() => {
                  const visibleIds = filteredQuestions.map((question) => question.id);
                  setSelectedQuestions((current) => [...new Set([...current, ...visibleIds])]);
                  setQuestionScoring((current) => {
                    const next = { ...current };
                    for (const id of visibleIds) next[id] ??= { marks: defaultMarks, negativeMarks };
                    return next;
                  });
                }}>Select visible</button>
                <button type="button" className="button button-quiet button-small" onClick={() => { setSelectedQuestions([]); setQuestionScoring({}); }}>Clear selection</button>
              </div>
            </div>
            <div style={{ maxHeight: 430, overflowY: "auto", marginTop: 12, border: "1px solid var(--line)", borderRadius: 10, padding: 8 }}>
              {filteredQuestions.map((question) => <label key={question.id}>
                <input type="checkbox" checked={selectedQuestions.includes(question.id)} onChange={() => toggleQuestion(question.id)} />
                <span><strong>{question.subject}{question.topic ? ` · ${question.topic}` : ""}</strong> <span className="pill">{question.difficulty || "Unspecified"}</span><br />{question.text}</span>
              </label>)}
              {filteredQuestions.length === 0 ? <p className="mute">No matching questions.</p> : null}
            </div>
            {selectedQuestions.length > 0 ? <section className="panel" style={{ marginTop: 14 }}>
              <div className="panel-header"><h3>Paper composition</h3><span className="pill">{selectedQuestions.length} questions</span></div>
              <p className="mute">{Object.entries(selectedDifficulties).map(([difficulty, count]) => `${difficulty}: ${count}`).join(" · ")}</p>
              <h4>Subject-wise paper blueprint</h4>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>Subject</th><th>Questions</th><th>Marks</th><th>Share</th></tr></thead>
                  <tbody>{subjectBreakdown.map((row) => (
                    <tr key={row.subject}>
                      <td>{row.subject}</td><td>{row.questions}</td><td>{row.marks}</td>
                      <td>{selectedQuestions.length ? Math.round((row.questions / selectedQuestions.length) * 100) : 0}%</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {questionsWithoutDifficulty ? <p className="warn">{questionsWithoutDifficulty} selected questions have no difficulty label. Topic tagging is optional; subject allocation controls the paper structure.</p> : null}
              <p className="mute">Topics are descriptive metadata, not mandatory paper sections. Set marks individually; the final preview uses these values for scoring and negative marking.</p>
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {selectedQuestionRows.map((question) => (
                  <div key={question.id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
                    <span style={{ flex: "2 1 260px" }}><strong>#{question.id} · {question.subject}</strong><br /><span className="mute">{question.text}</span></span>
                    <div className="row">
                      <button type="button" className="button button-quiet button-small" aria-label={"Move question " + question.id + " up"} onClick={() => moveQuestion(question.id, -1)} disabled={selectedQuestions[0] === question.id}>↑</button>
                      <button type="button" className="button button-quiet button-small" aria-label={"Move question " + question.id + " down"} onClick={() => moveQuestion(question.id, 1)} disabled={selectedQuestions[selectedQuestions.length - 1] === question.id}>↓</button>
                    </div>
                    <label style={{ width: 100 }}>Marks<input type="number" min={0} max={100} step="0.25" value={questionScoring[question.id]?.marks ?? defaultMarks} onChange={(event) => updateQuestionScoring(question.id, "marks", Number(event.target.value) || 0)} /></label>
                    <label style={{ width: 110 }}>Wrong answer<input type="number" min={0} max={100} step="0.25" value={questionScoring[question.id]?.negativeMarks ?? negativeMarks} onChange={(event) => updateQuestionScoring(question.id, "negativeMarks", Number(event.target.value) || 0)} /></label>
                  </div>
                ))}
              </div>
            </section> : null}
            <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <span className="mute">{selectedQuestions.length} questions · {duration} minutes · {totalMarks} marks</span>
              <button disabled={busy || !title.trim() || selectedQuestions.length === 0}>{busy ? "Saving…" : editingExamId ? "Save new version" : "Create draft exam"}</button>
              {editingExamId ? <button type="button" className="button button-secondary" disabled={busy} onClick={() => { setEditingExamId(null); setTitle(""); setDescription(""); setSelectedQuestions([]); setQuestionScoring({}); setTab("exams"); }}>Cancel version edit</button> : null}
            </div>
          </form>
        </section>
      ) : null}
      </>
      )}
    </>
  );
}
