"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "../../lib/session";
import { api, ApiError, type AdminExam, type AdminOverview, type AdminQuestion, type AdminStudent } from "../../lib/api";

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
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [assignExamId, setAssignExamId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("Read each question carefully. Select one answer.");
  const [duration, setDuration] = useState(60);
  const [availableFrom, setAvailableFrom] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("All subjects");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [defaultMarks, setDefaultMarks] = useState(1);
  const [negativeMarks, setNegativeMarks] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [stats, examData, studentData, questionData] = await Promise.all([
      api.adminOverview(), api.adminExams(), api.adminStudents(), api.adminQuestions(),
    ]);
    setOverview(stats);
    setExams(examData.exams);
    setStudents(studentData.students);
    setQuestions(questionData.questions);
  }, []);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "ADMIN") {
      load().catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Could not load the admin workspace."));
    }
  }, [status, user?.role, load]);

  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return questions.filter((q) => (subjectFilter === "All subjects" || q.subject === subjectFilter) && (!term || [q.text, q.subject, q.topic ?? ""].some((v) => v.toLowerCase().includes(term))));
  }, [questions, search, subjectFilter]);

  function toggleQuestion(id: number) {
    setSelectedQuestions((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
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
    if (selectedQuestions.length === 0) { setError("Select at least one question."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api.createAdminExam({
        title, description, instructions, durationMinutes: duration,
        shuffleQuestions: false, shuffleOptions: false,
        questions: selectedQuestions.map((questionId) => ({ questionId, marks: 1, negativeMarks: 0 })),
      });
      setNotice("Draft exam created. Publish it from the Exams tab when it is ready.");
      setTitle(""); setDescription(""); setSelectedQuestions([]);
      await load(); setTab("exams");
      setAssignExamId(result.exam.id);
    } catch (e) { showError(e, "Could not create the exam."); }
    finally { setBusy(false); }
  }

  async function publishExam(id: string) {
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
                  <span className="mute">{version?._count.assignments ?? 0} assignments</span>
                </div>
              </article>;
            })}
          </section>
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
          <h2>Create an exam draft</h2>
          <p className="mute">Questions are copied into an immutable version snapshot. Later question-bank edits will not change this exam.</p>
          <form onSubmit={createExam}>
            <label style={{ display: "block" }}>Exam title<input required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. ECET CSE Mock Test 01" /></label>
            <label style={{ display: "block" }}>Description<input maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description for students" /></label>
            <label style={{ display: "block" }}>Instructions<input maxLength={5000} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label>
            <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
              <label style={{ display: "block", maxWidth: 180 }}>Duration (minutes)<input type="number" min={1} max={600} required value={duration} onChange={(e) => setDuration(Math.max(1, Math.min(600, Number(e.target.value) || 1)))} /></label>
              <label style={{ display: "block", maxWidth: 150 }}>Marks per question<input type="number" min={0} max={100} step="0.25" value={defaultMarks} onChange={(e) => setDefaultMarks(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} /></label>
              <label style={{ display: "block", maxWidth: 150 }}>Negative marks<input type="number" min={0} max={100} step="0.25" value={negativeMarks} onChange={(e) => setNegativeMarks(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} /></label>
            </div>
            <div className="row" style={{ gap: 18, flexWrap: "wrap", marginTop: 12 }}>
              <label><input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} /> Shuffle question order</label>
              <label><input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} /> Shuffle answer options</label>
            </div>
            <div className="section-heading"><div><h2>Select questions</h2><p>{selectedQuestions.length} selected from {questions.length} available</p></div></div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <input style={{ flex: "2 1 240px" }} aria-label="Search question bank" placeholder="Search question, subject or topic…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select style={{ flex: "1 1 180px" }} value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}><option>All subjects</option>{[...new Set(questions.map((q) => q.subject))].sort().map((subject) => <option key={subject}>{subject}</option>)}</select>
            </div>
            <div style={{ maxHeight: 430, overflowY: "auto", marginTop: 12, border: "1px solid var(--line)", borderRadius: 10, padding: 8 }}>
              {filteredQuestions.map((question) => <label key={question.id}>
                <input type="checkbox" checked={selectedQuestions.includes(question.id)} onChange={() => toggleQuestion(question.id)} />
                <span><strong>{question.subject}{question.topic ? ` · ${question.topic}` : ""}</strong><br />{question.text}</span>
              </label>)}
              {filteredQuestions.length === 0 ? <p className="mute">No matching questions.</p> : null}
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <span className="mute">{selectedQuestions.length} questions · {duration} minutes</span>
              <button disabled={busy || !title.trim() || selectedQuestions.length === 0}>{busy ? "Creating…" : "Create draft exam"}</button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
