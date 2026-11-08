import { useEffect, useState } from "react";
import type { FormEvent } from "react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");
type User = { id: number; email: string; role: "ADMIN" | "STUDENT" };
type Bank = { total: number; subjects: { subject: string; count: number }[] };
type Invitation = {
  id: string;
  email: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: "PENDING" | "USED" | "REVOKED" | "EXPIRED";
};
type CreatedInvitation = { id: string; email: string; token: string; expiresAt: string };
type Announcement = { id: string; title: string; message: string; createdAt: string; publishedAt: string; expiresAt: string | null; seenAt?: string | null };
type AdminQuestion = { id: number; subject: string; topic: string | null; text: string; options: string[]; difficulty?: string };
type AdminStudent = { id: number; email: string };
type AdminExam = {
  id: string;
  title: string;
  description: string;
  status: string;
  versions: { id: string; version: number; publishedAt: string | null; durationMinutes: number; _count: { questions: number; assignments: number } }[];
};
type AdminAnalytics = {
  totals: { students: number; exams: number; assignments: number; submissions: number; submissionRate: number; averagePercentage: number | null };
  exams: { examId: string; title: string; assigned: number; submitted: number; submissionRate: number; averagePercentage: number | null }[];
  recentSubmissions: { studentEmail: string; examTitle: string; submittedAt: string; score: number | null; maximumScore: number | null; status: string }[];
};
type Question = {
  id: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string[];
};
type Test = {
  attemptId: number;
  mode: string;
  deadline: string | null;
  questions: Question[];
  warnings: string[];
};
type Result = {
  attemptId: number;
  score: number;
  total: number;
  breakdown: { subject: string; correct: number; total: number }[];
  questions: {
    questionId: number;
    text: string;
    options: string[];
    selectedIndex: number | null;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string;
  }[];
};

function browserDeviceFingerprint(): string {
  const key = "arctester-device-fingerprint";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const fingerprint =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, fingerprint);
  return fingerprint;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request failed.");
  return body as T;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null);
  const [adminAnalytics, setAdminAnalytics] = useState<AdminAnalytics | null>(null);
  const [adminQuestions, setAdminQuestions] = useState<AdminQuestion[]>([]);
  const [adminStudents, setAdminStudents] = useState<AdminStudent[]>([]);
  const [adminExams, setAdminExams] = useState<AdminExam[]>([]);
  const [examTitle, setExamTitle] = useState("");
  const [examDescription, setExamDescription] = useState("");
  const [examInstructions, setExamInstructions] = useState("");
  const [examDuration, setExamDuration] = useState(180);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [examQuestionSearch, setExamQuestionSearch] = useState("");
  const [examMarks, setExamMarks] = useState(1);
  const [examNegativeMarks, setExamNegativeMarks] = useState(0);
  const [shuffleExamQuestions, setShuffleExamQuestions] = useState(false);
  const [shuffleExamOptions, setShuffleExamOptions] = useState(false);
  const [questionSubject, setQuestionSubject] = useState("Computer Science");
  const [questionTopic, setQuestionTopic] = useState("General");
  const [questionText, setQuestionText] = useState("");
  const [questionOptions, setQuestionOptions] = useState(["", "", "", ""]);
  const [questionCorrectIndex, setQuestionCorrectIndex] = useState(0);
  const [questionExplanation, setQuestionExplanation] = useState("");
  const [questionDifficulty, setQuestionDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [questionSaved, setQuestionSaved] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [importReport, setImportReport] = useState<{ added: number; duplicates: number; invalid: { row: number; reason: string }[]; total: number } | null>(null);
  const [importPreviewReady, setImportPreviewReady] = useState(false);
  const [importPreviewError, setImportPreviewError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [bankSubjectFilter, setBankSubjectFilter] = useState("all");
  const [bankSearch, setBankSearch] = useState("");
  const [subjectQuotas, setSubjectQuotas] = useState<Record<string, number>>({});
  const [difficultyMix, setDifficultyMix] = useState<"any" | "balanced" | "easy" | "medium" | "hard">("any");
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [assigningExamId, setAssigningExamId] = useState("");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementExpiresAt, setAnnouncementExpiresAt] = useState("");
  const [register, setRegister] = useState(false);
  const [test, setTest] = useState<Test | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState<"dashboard" | "practice" | "question-bank" | "exams" | "announcements" | "invitations">("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("arctester-theme") as "light" | "dark") || "light"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("arctester-theme", theme);
  }, [theme]);

  useEffect(() => {
    request<{ user: User }>("/auth/me")
      .then(({ user: current }) => setUser(current))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    request("/auth/devices/register", {
      method: "POST",
      body: JSON.stringify({
        deviceName: "Web browser",
        platform: "web",
        fingerprint: browserDeviceFingerprint(),
      }),
    }).catch((cause) => setError((cause as Error).message));
    request<Bank>("/bank")
      .then(setBank)
      .catch((cause) => setError((cause as Error).message));
  }, [user]);

  useEffect(() => {
    if (user?.role !== "STUDENT") return;
    let active = true;
    const loadAnnouncements = () => request<{ announcements: Announcement[] }>("/announcements")
      .then(({ announcements: items }) => { if (active) setAnnouncements(items); })
      .catch((cause) => { if (active) setError((cause as Error).message); });
    void loadAnnouncements();
    const interval = window.setInterval(() => { void loadAnnouncements(); }, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [user]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    request<{ invitations: Invitation[] }>("/auth/invitations")
      .then(({ invitations: items }) => setInvitations(items))
      .catch((cause) => setError((cause as Error).message));
    request<{ announcements: Announcement[] }>("/admin/announcements")
      .then(({ announcements: items }) => setAnnouncements(items))
      .catch((cause) => setError((cause as Error).message));
    request<{ questions: AdminQuestion[] }>("/admin/question-bank")
      .then(({ questions }) => setAdminQuestions(questions))
      .catch((cause) => setError((cause as Error).message));
    request<{ students: AdminStudent[] }>("/admin/students")
      .then(({ students }) => setAdminStudents(students))
      .catch((cause) => setError((cause as Error).message));
    request<{ exams: AdminExam[] }>("/admin/exams")
      .then(({ exams }) => setAdminExams(exams))
      .catch((cause) => setError((cause as Error).message));
    request<AdminAnalytics>("/admin/analytics/overview")
      .then(setAdminAnalytics)
      .catch((cause) => setError((cause as Error).message));
  }, [user]);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCreatedInvitation(null);
    try {
      const response = await request<{ invitation: CreatedInvitation }>("/auth/invitations", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      setCreatedInvitation(response.invitation);
      setInviteEmail("");
      const refreshed = await request<{ invitations: Invitation[] }>("/auth/invitations");
      setInvitations(refreshed.invitations);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshAdminExams() {
    const refreshed = await request<{ exams: AdminExam[] }>("/admin/exams");
    setAdminExams(refreshed.exams);
  }

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setQuestionSaved(false);
    try {
      const { question } = await request<{ question: AdminQuestion }>("/admin/questions", {
        method: "POST",
        body: JSON.stringify({ subject: questionSubject.trim(), topic: questionTopic.trim() || "General", text: questionText.trim(), options: questionOptions.map((option) => option.trim()), correctIndex: questionCorrectIndex, explanation: questionExplanation.trim(), difficulty: questionDifficulty, source: "Admin question editor" }),
      });
      setAdminQuestions((current) => [...current, question].sort((a, b) => a.subject.localeCompare(b.subject) || a.id - b.id));
      setQuestionText("");
      setQuestionOptions(["", "", "", ""]);
      setQuestionCorrectIndex(0);
      setQuestionExplanation("");
      setQuestionSaved(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function importQuestions() {
    setImportBusy(true);
    setError("");
    setImportReport(null);
    try {
      const endpoint = importFormat === "csv" ? "/admin/questions/import/csv" : "/admin/questions/import/json";
      const payload = importFormat === "csv"
        ? { content: importText }
        : { questions: JSON.parse(importText) };
      const response = await request<{ report: { added: number; duplicates: number; invalid: { row: number; reason: string }[]; total: number } }>(endpoint, {
        method: "POST", body: JSON.stringify(payload),
      });
      setImportReport(response.report);
      setImportPreviewReady(false);
      const refreshed = await request<{ questions: AdminQuestion[] }>("/admin/question-bank");
      setAdminQuestions(refreshed.questions);
      const bankInfo = await request<Bank>("/bank");
      setBank(bankInfo);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setImportBusy(false);
    }
  }

  async function loadImportFile(file?: File) {
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop();
    const format = extension === "json" ? "json" : "csv";
    setImportFormat(format);
    setImportText(await file.text());
    setImportReport(null);
    setImportPreviewReady(false);
  }

  function previewQuestionImport() {
    setImportPreviewError("");
    try {
      if (importFormat === "json") {
        const parsed: unknown = JSON.parse(importText);
        if (!Array.isArray(parsed)) throw new Error("JSON must contain an array of question rows.");
      } else {
        const header = importText.toLowerCase().split(/\r?\n/, 1)[0];
        if (!header.includes("subject") || !header.includes("correctindex")) throw new Error("CSV header must include subject and correctIndex columns.");
      }
      setImportPreviewReady(true);
    } catch (cause) {
      setImportPreviewError((cause as Error).message);
      setImportPreviewReady(false);
    }
  }

  function downloadQuestionTemplate(format: "csv" | "json") {
    const sample = format === "csv"
      ? "subject,topic,text,optionA,optionB,optionC,optionD,correctIndex,explanation,source,difficulty\nComputer Science,Data Structures,Which structure uses FIFO?,Stack,Queue,Tree,Graph,1,Queue follows first in first out,AP ECET,easy"
      : JSON.stringify([["Computer Science","Which structure uses FIFO?",["Stack","Queue","Tree","Graph"],1,"Queue follows first in first out"]], null, 2);
    const blob = new Blob([sample], { type: format === "csv" ? "text/csv" : "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `arctester-questions-template.${format}`; anchor.click();
    URL.revokeObjectURL(url);
  }

  function generateSubjectPaper() {
    const picked: number[] = [];
    const subjects = [...new Set(adminQuestions.map((question) => question.subject))];
    for (const subject of subjects) {
      const quota = Math.max(0, subjectQuotas[subject] ?? 0);
      let pool = adminQuestions.filter((question) => question.subject === subject && !picked.includes(question.id));
      if (difficultyMix !== "any") {
        if (difficultyMix === "balanced") {
          const easy = pool.filter((q) => q.difficulty === "easy").slice(0, Math.ceil(quota / 3));
          const medium = pool.filter((q) => q.difficulty === "medium").slice(0, Math.ceil(quota / 3));
          const hard = pool.filter((q) => q.difficulty === "hard").slice(0, Math.floor(quota / 3));
          pool = [...easy, ...medium, ...hard];
        } else pool = pool.filter((q) => (q.difficulty ?? "medium") === difficultyMix);
      }
      for (const q of pool.sort(() => Math.random() - 0.5).slice(0, quota)) picked.push(q.id);
    }
    setSelectedQuestionIds(picked);
    setError(picked.length ? `Generated a ${picked.length}-question paper from your subject quotas.` : "Set at least one subject quota and make sure the bank has enough matching questions.");
  }

  async function createExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedQuestionIds.length === 0) {
      setError("Select at least one question for the exam.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/admin/exams", {
        method: "POST",
        body: JSON.stringify({
          title: examTitle.trim(),
          description: examDescription.trim(),
          instructions: examInstructions.trim(),
          durationMinutes: examDuration,
          shuffleQuestions: shuffleExamQuestions,
          shuffleOptions: shuffleExamOptions,
          questions: selectedQuestionIds.map((questionId) => ({ questionId, marks: examMarks, negativeMarks: examNegativeMarks })),
        }),
      });
      setExamTitle("");
      setExamDescription("");
      setExamInstructions("");
      setSelectedQuestionIds([]);
      await refreshAdminExams();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function publishExam(examId: string) {
    setBusy(true);
    setError("");
    try {
      await request(`/admin/exams/${examId}/publish`, { method: "POST" });
      await refreshAdminExams();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function assignExam(examId: string) {
    if (selectedStudentIds.length === 0) {
      setError("Select at least one student before assigning this exam.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await request<{ created: number }>(`/admin/exams/${examId}/assign`, {
        method: "POST",
        body: JSON.stringify({ studentIds: selectedStudentIds }),
      });
      setAssigningExamId("");
      setSelectedStudentIds([]);
      setError(`Exam assigned to ${result.created} student(s).`);
      await refreshAdminExams();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/admin/announcements", {
        method: "POST",
        body: JSON.stringify({
          title: announcementTitle.trim(),
          message: announcementMessage.trim(),
          expiresAt: announcementExpiresAt ? new Date(announcementExpiresAt).toISOString() : undefined,
        }),
      });
      setAnnouncementTitle("");
      setAnnouncementMessage("");
      setAnnouncementExpiresAt("");
      const refreshed = await request<{ announcements: Announcement[] }>("/admin/announcements");
      setAnnouncements(refreshed.announcements);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeAnnouncement(id: string) {
    setBusy(true);
    try {
      const result = await request<{ seenAt: string }>(`/announcements/${id}/read`, { method: "POST" });
      setAnnouncements((current) => current.map((item) => item.id === id ? { ...item, seenAt: result.seenAt } : item));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(id: string) {
    setBusy(true);
    setError("");
    try {
      await request(`/auth/invitations/${id}/revoke`, { method: "POST" });
      const refreshed = await request<{ invitations: Invitation[] }>("/auth/invitations");
      setInvitations(refreshed.invitations);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function authenticate() {
    setBusy(true);
    setError("");
    try {
      if (register) {
        await request("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, invitationToken: invitationToken.trim() }),
        });
        setRegister(false);
        setInvitationToken("");
      } else {
        const session = await request<{ user: User }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setUser(session.user);
      }
      setPassword("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startTest(mode: "mock" | "practice" | "mistakes", subject?: string) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const created = await request<Test>("/tests", {
        method: "POST",
        body: JSON.stringify({ mode, subject, count: mode === "mock" ? undefined : 10 }),
      });
      setTest(created);
      setAnswers({});
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitTest() {
    if (!test) return;
    setBusy(true);
    try {
      await request(`/tests/${test.attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: test.questions.map((question) => ({
            questionId: question.id,
            selectedIndex: answers[question.id] ?? null,
          })),
        }),
      });
      const fullResult = await request<Result>(`/tests/${test.attemptId}/result`);
      setResult(fullResult);
      setTest(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await request("/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    setBank(null);
    setTest(null);
    setResult(null);
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <Brand />
          <p className="eyebrow">YOUR PERSONAL PRACTICE SPACE</p>
          <h1>{register ? "Create your account" : "Welcome back"}</h1>
          <p className="muted">Sign in to continue your preparation.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void authenticate();
            }}
          >
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? 8 : 1}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {register && (
              <label>
                Invitation code
                <input
                  type="text"
                  autoComplete="one-time-code"
                  required
                  value={invitationToken}
                  onChange={(event) => setInvitationToken(event.target.value)}
                />
              </label>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            </button>
          </form>
          <button className="text-button" onClick={() => setRegister(!register)}>
            {register ? "Already have an account? Sign in" : "Have an invitation? Create account"}
          </button>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (user.role === "ADMIN") {
    return (
      <div className="app-shell">
        <header className="topbar">
          <Brand />
          <nav aria-label="Admin navigation">
            <button className={activePage === "dashboard" ? "nav-active" : "nav-button"} onClick={() => setActivePage("dashboard")}>Overview</button>
            <button className={activePage === "exams" ? "nav-active" : "nav-button"} onClick={() => setActivePage("exams")}>Exams</button>
            <button className={activePage === "question-bank" ? "nav-active" : "nav-button"} onClick={() => setActivePage("question-bank")}>Question bank</button>
            <button className={activePage === "announcements" ? "nav-active" : "nav-button"} onClick={() => setActivePage("announcements")}>Announcements</button>
            <button className={activePage === "invitations" ? "nav-active" : "nav-button"} onClick={() => setActivePage("invitations")}>Invitations</button>
          </nav>
          <div className="top-actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              aria-pressed={theme === "dark"}
              title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? "☾" : "☀"}
            </button>
            <span className="user-email">{user.email}</span>
            <button className="ghost" onClick={signOut}>Sign out</button>
          </div>
        </header>
        <main className="main-content">
          <section hidden={activePage !== "dashboard"} className="welcome panel" id="admin-dashboard">
            <div>
              <p className="eyebrow">ARCTESTER ADMINISTRATION</p>
              <h1>Manage your students.</h1>
              <p className="muted">Create invitation codes and control who can join your exam workspace.</p>
            </div>
            <div className="welcome-mark">A</div>
          </section>
          <section hidden={activePage !== "dashboard"} id="results-analytics">
            <div className="section-head">
              <div><p className="eyebrow">RESULTS & PERFORMANCE</p><h2>Exam analytics</h2></div>
              <button className="ghost" disabled={busy} onClick={() => request<AdminAnalytics>("/admin/analytics/overview").then(setAdminAnalytics).catch((cause) => setError((cause as Error).message))}>Refresh</button>
            </div>
            <div className="stats-row admin-analytics-stats">
              <article className="panel stat"><span className="muted">Students</span><strong>{adminAnalytics?.totals.students ?? "—"}</strong><span className="muted">Registered accounts</span></article>
              <article className="panel stat"><span className="muted">Exams</span><strong>{adminAnalytics?.totals.exams ?? "—"}</strong><span className="muted">Created exams</span></article>
              <article className="panel stat"><span className="muted">Assignments</span><strong>{adminAnalytics?.totals.assignments ?? "—"}</strong><span className="muted">Student exam assignments</span></article>
              <article className="panel stat"><span className="muted">Submissions</span><strong>{adminAnalytics?.totals.submissions ?? "—"}</strong><span className="muted">{Math.round((adminAnalytics?.totals.submissionRate ?? 0) * 100)}% submission rate</span></article>
              <article className="panel stat"><span className="muted">Average score</span><strong>{adminAnalytics?.totals.averagePercentage === null || adminAnalytics?.totals.averagePercentage === undefined ? "—" : `${adminAnalytics.totals.averagePercentage.toFixed(1)}%`}</strong><span className="muted">Across scored submissions</span></article>
            </div>
            <div className="section-head"><div><p className="eyebrow">EXAM BREAKDOWN</p><h2>Performance by exam</h2></div></div>
            <div className="panel analytics-table-wrap">
              <table className="analytics-table">
                <thead><tr><th>Exam</th><th>Assigned</th><th>Submitted</th><th>Completion</th><th>Average</th></tr></thead>
                <tbody>{adminAnalytics?.exams.map((exam) => <tr key={exam.examId}><td>{exam.title}</td><td>{exam.assigned}</td><td>{exam.submitted}</td><td>{Math.round(exam.submissionRate * 100)}%</td><td>{exam.averagePercentage === null ? "—" : `${exam.averagePercentage.toFixed(1)}%`}</td></tr>)}
                {adminAnalytics && adminAnalytics.exams.length === 0 && <tr><td colSpan={5} className="muted">No exam assignments yet.</td></tr>}</tbody>
              </table>
            </div>
            <div className="section-head"><div><p className="eyebrow">LATEST ACTIVITY</p><h2>Recent submissions</h2></div></div>
            <div className="panel analytics-table-wrap">
              <table className="analytics-table">
                <thead><tr><th>Student</th><th>Exam</th><th>Submitted</th><th>Score</th></tr></thead>
                <tbody>{adminAnalytics?.recentSubmissions.map((item, index) => <tr key={`${item.studentEmail}-${item.examTitle}-${index}`}><td>{item.studentEmail}</td><td>{item.examTitle}</td><td>{new Date(item.submittedAt).toLocaleString()}</td><td>{item.score === null || item.maximumScore === null ? "Pending" : `${item.score} / ${item.maximumScore}`}</td></tr>)}
                {adminAnalytics && adminAnalytics.recentSubmissions.length === 0 && <tr><td colSpan={4} className="muted">No submissions received yet.</td></tr>}</tbody>
              </table>
            </div>
          </section>
          <section hidden={activePage !== "exams"} id="exam-management">
            <div className="section-head">
              <div><p className="eyebrow">EXAM DELIVERY</p><h2>Create a mock test</h2></div>
            </div>
            <form className="panel admin-form exam-builder" onSubmit={(event) => void createExam(event)}>
              <label>Exam title
                <input required minLength={2} maxLength={120} value={examTitle} onChange={(event) => setExamTitle(event.target.value)} placeholder="AP ECET CSE Mock Test 01" />
              </label>
              <label>Description
                <input maxLength={2000} value={examDescription} onChange={(event) => setExamDescription(event.target.value)} placeholder="Optional exam description" />
              </label>
              <label>Instructions
                <textarea rows={2} maxLength={5000} value={examInstructions} onChange={(event) => setExamInstructions(event.target.value)} placeholder="Instructions shown before the exam" />
              </label>
              <label>Duration (minutes)
                <input type="number" min={1} max={600} required value={examDuration} onChange={(event) => setExamDuration(Number(event.target.value))} />
              </label>
              <div className="question-editor-grid exam-scoring-grid">
                <label>Marks per question
                  <input type="number" min={0} max={100} step="0.25" value={examMarks} onChange={(event) => setExamMarks(Number(event.target.value))} />
                </label>
                <label>Negative marks per wrong answer
                  <input type="number" min={0} max={100} step="0.25" value={examNegativeMarks} onChange={(event) => setExamNegativeMarks(Number(event.target.value))} />
                </label>
              </div>
              <div className="exam-settings-row">
                <label><input type="checkbox" checked={shuffleExamQuestions} onChange={(event) => setShuffleExamQuestions(event.target.checked)} /> Shuffle question order</label>
                <label><input type="checkbox" checked={shuffleExamOptions} onChange={(event) => setShuffleExamOptions(event.target.checked)} /> Shuffle answer options</label>
              </div>
              <section className="subject-quota-builder">
                <div className="picker-heading"><strong>Examiner paper blueprint</strong><span>Allocate question counts by subject</span></div>
                <div className="quota-grid">{[...new Set(adminQuestions.map((question) => question.subject))].map((subject) => <label key={subject}>{subject}<span className="muted">{adminQuestions.filter((q) => q.subject === subject).length} available</span><input type="number" min={0} max={adminQuestions.filter((q) => q.subject === subject).length} value={subjectQuotas[subject] ?? 0} onChange={(event) => setSubjectQuotas((current) => ({ ...current, [subject]: Number(event.target.value) }))} /></label>)}</div>
                <div className="quota-actions"><label>Difficulty distribution<select value={difficultyMix} onChange={(event) => setDifficultyMix(event.target.value as typeof difficultyMix)}><option value="any">Any difficulty</option><option value="balanced">Balanced easy / medium / hard</option><option value="easy">Easy only</option><option value="medium">Medium only</option><option value="hard">Hard only</option></select></label><button type="button" className="ghost" onClick={generateSubjectPaper}>Generate paper from quotas</button></div>
                <p className="muted">The generated selection is editable below. Total selected: {selectedQuestionIds.length} questions.</p>
              </section>
              <div className="exam-question-picker">
                <div className="picker-heading"><strong>Choose questions</strong><span>{selectedQuestionIds.length} selected · {adminQuestions.length} available</span></div>
                <input className="question-search" type="search" value={examQuestionSearch} onChange={(event) => setExamQuestionSearch(event.target.value)} placeholder="Search by subject, topic or question…" />
                {adminQuestions.length === 0 ? <p className="muted">No questions yet. Open Question bank to add your first question.</p> : adminQuestions.filter((question) => `${question.subject} ${question.topic ?? ""} ${question.text}`.toLowerCase().includes(examQuestionSearch.trim().toLowerCase())).map((question) => (
                  <label className="pick-row" key={question.id}>
                    <input type="checkbox" checked={selectedQuestionIds.includes(question.id)} onChange={(event) => setSelectedQuestionIds((current) => event.target.checked ? [...current, question.id] : current.filter((id) => id !== question.id))} />
                    <span><strong>{question.subject}{question.topic ? ` · ${question.topic}` : ""}</strong><small>{question.text}</small></span>
                    <small className="muted">{question.difficulty ?? "medium"}</small>
                  </label>
                ))}
              </div>
              <button className="primary" disabled={busy || selectedQuestionIds.length === 0}>{busy ? "Saving…" : `Create draft (${selectedQuestionIds.length} questions)`}</button>
            </form>
            <div className="section-head"><div><p className="eyebrow">EXAM LIBRARY</p><h2>Drafts and published exams</h2></div></div>
            <div className="admin-exam-list">
              {adminExams.length === 0 ? <div className="panel empty-state">No exams created yet.</div> : adminExams.map((exam) => {
                const version = exam.versions[0];
                const published = Boolean(version?.publishedAt);
                return <article className="panel admin-exam-card" key={exam.id}>
                  <div className="admin-exam-meta"><div><strong>{exam.title}</strong><p className="muted">{exam.description || "No description"} · {version?._count.questions ?? 0} questions · {version?.durationMinutes ?? 0} min</p></div><span className={published ? "status status-used" : "status status-pending"}>{published ? "PUBLISHED" : "DRAFT"}</span></div>
                  <div className="admin-exam-actions">
                    {!published && <button className="primary" disabled={busy} onClick={() => void publishExam(exam.id)}>Publish version</button>}
                    {published && <button className="ghost" disabled={busy || adminStudents.length === 0} onClick={() => { setAssigningExamId(assigningExamId === exam.id ? "" : exam.id); setSelectedStudentIds([]); }}>Assign to students</button>}
                    {published && <span className="muted">{version?._count.assignments ?? 0} assignments</span>}
                  </div>
                  {assigningExamId === exam.id && <div className="student-picker">
                    <strong>Select students</strong>
                    {adminStudents.length === 0 ? <p className="muted">No student accounts are registered yet.</p> : adminStudents.map((student) => <label className="student-pick" key={student.id}><input type="checkbox" checked={selectedStudentIds.includes(student.id)} onChange={(event) => setSelectedStudentIds((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} />{student.email}</label>)}
                    <button className="primary" disabled={busy || selectedStudentIds.length === 0} onClick={() => void assignExam(exam.id)}>Assign to {selectedStudentIds.length} student(s)</button>
                  </div>}
                </article>;
              })}
            </div>
          </section>
          <section hidden={activePage !== "question-bank"} id="admin-question-bank">
            <section className="panel import-workspace">
              <div className="section-head"><div><p className="eyebrow">BULK QUESTION INGESTION</p><h2>Upload questions</h2><p className="muted">Import AP ECET questions in bulk using CSV or JSON, or paste your dataset.</p></div></div>
              <div className="import-toolbar">
                <label className="import-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void loadImportFile(event.dataTransfer.files?.[0]); }}>
                  <strong>Choose a CSV or JSON file</strong><span>Click to browse or drag a file here · max 8 MB</span>
                  <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => void loadImportFile(event.target.files?.[0])} />
                </label>
                <div className="import-template-actions"><button type="button" className="ghost" onClick={() => downloadQuestionTemplate("csv")}>Download CSV template</button><button type="button" className="ghost" onClick={() => downloadQuestionTemplate("json")}>Download JSON template</button></div>
              </div>
              <div className="import-mode-row"><label>Format<select value={importFormat} onChange={(event) => { setImportFormat(event.target.value as "csv" | "json"); setImportPreviewReady(false); }}><option value="csv">CSV with headers</option><option value="json">JSON question array</option></select></label><span className="muted">Correct answer index: 0 = A, 1 = B, 2 = C, 3 = D.</span></div>
              <label>Paste question data<textarea rows={8} value={importText} onChange={(event) => { setImportText(event.target.value); setImportReport(null); setImportPreviewReady(false); }} placeholder={importFormat === "csv" ? "subject,topic,text,optionA,optionB,optionC,optionD,correctIndex,explanation,source,difficulty" : '[["Computer Science","Question text",["A","B","C","D"],1,"Explanation"]]'} /></label>
              <div className="import-footer"><span className="muted">{importText.trim() ? "Data loaded — preview before import" : "No data loaded yet"}</span><div className="import-confirm-actions"><button className="ghost" type="button" disabled={!importText.trim() || importBusy} onClick={previewQuestionImport}>Preview import</button><button className="primary" type="button" disabled={importBusy || !importPreviewReady} onClick={() => void importQuestions()}>{importBusy ? "Importing…" : "Confirm & import"}</button></div></div>
              {importPreviewError && <p className="error">{importPreviewError}</p>}
              {importPreviewReady && <div className="import-preview"><strong>Import preview ready</strong><span>Format structure checked. Duplicate detection and row validation will be reported after confirmation.</span><pre>{importText.split(/\r?\n/).slice(0, 6).join("\n")}</pre></div>}
              {importReport && <div className="import-report" role="status"><div><strong>{importReport.added}</strong><span>Added</span></div><div><strong>{importReport.duplicates}</strong><span>Duplicates skipped</span></div><div><strong>{importReport.invalid.length}</strong><span>Invalid rows</span></div><div><strong>{importReport.total}</strong><span>Rows processed</span></div>{importReport.invalid.length > 0 && <details><summary>Review invalid rows</summary>{importReport.invalid.map((row) => <p key={row.row}>Row {row.row}: {row.reason}</p>)}</details>}</div>}
            </section>
            <div className="section-head">
              <div><p className="eyebrow">QUESTION AUTHORING</p><h2>Add a question</h2><p className="muted">Create four-option AP ECET questions and add them directly to your reusable bank.</p></div>
            </div>
            <form className="panel admin-form question-editor" onSubmit={(event) => void createQuestion(event)}>
              <div className="question-editor-grid">
                <label>Subject
                  <input required maxLength={80} value={questionSubject} onChange={(event) => setQuestionSubject(event.target.value)} placeholder="Computer Science" />
                </label>
                <label>Topic
                  <input maxLength={80} value={questionTopic} onChange={(event) => setQuestionTopic(event.target.value)} placeholder="Data Structures" />
                </label>
                <label>Difficulty
                  <select value={questionDifficulty} onChange={(event) => setQuestionDifficulty(event.target.value as "easy" | "medium" | "hard")}>
                    <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                  </select>
                </label>
              </div>
              <label>Question
                <textarea required rows={3} maxLength={4000} value={questionText} onChange={(event) => setQuestionText(event.target.value)} placeholder="Enter the complete question…" />
              </label>
              <div className="question-option-editor">
                <div className="picker-heading"><strong>Answer options</strong><span>Select the radio button beside the correct answer</span></div>
                {questionOptions.map((option, index) => (
                  <div className="question-option-row" key={index}>
                    <label className="question-correct-choice" title={`Mark option ${String.fromCharCode(65 + index)} as correct`}>
                      <input type="radio" name="question-correct-answer" checked={questionCorrectIndex === index} onChange={() => setQuestionCorrectIndex(index)} />
                      <strong>{String.fromCharCode(65 + index)}</strong>
                    </label>
                    <input required maxLength={1000} aria-label={`Option ${String.fromCharCode(65 + index)}`} value={option} onChange={(event) => setQuestionOptions((current) => current.map((item, i) => i === index ? event.target.value : item))} placeholder={`Option ${String.fromCharCode(65 + index)}`} />
                  </div>
                ))}
              </div>
              <label>Explanation <span className="muted">(shown after the student submits)</span>
                <textarea rows={2} maxLength={3000} value={questionExplanation} onChange={(event) => setQuestionExplanation(event.target.value)} placeholder="Explain why the correct answer is right…" />
              </label>
              {questionSaved && <p className="success-message" role="status">Question added to the question bank.</p>}
              <button className="primary" disabled={busy}>{busy ? "Adding…" : "Add question to bank"}</button>
            </form>
            <div className="section-head">
              <div><p className="eyebrow">REUSABLE CONTENT</p><h2>Question bank <span className="muted">({adminQuestions.length})</span></h2></div>
              <button className="ghost" disabled={busy} onClick={() => request<{ questions: AdminQuestion[] }>("/admin/question-bank").then(({ questions }) => setAdminQuestions(questions)).catch((cause) => setError((cause as Error).message))}>Refresh</button>
            </div>
            <div className="bank-filter-toolbar">
              <label>Filter by subject
                <select value={bankSubjectFilter} onChange={(event) => setBankSubjectFilter(event.target.value)}>
                  <option value="all">All subjects</option>
                  {[...new Set(adminQuestions.map((question) => question.subject))].sort((a, b) => a.localeCompare(b)).map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                </select>
              </label>
              <label>Search questions
                <input type="search" value={bankSearch} onChange={(event) => setBankSearch(event.target.value)} placeholder="Search question, topic or subject…" />
              </label>
              <span className="muted">{adminQuestions.filter((question) => (bankSubjectFilter === "all" || question.subject === bankSubjectFilter) && `${question.subject} ${question.topic ?? ""} ${question.text}`.toLowerCase().includes(bankSearch.trim().toLowerCase())).length} matching</span>
            </div>
            <div className="panel admin-question-list">
              {adminQuestions.length === 0 ? <p className="muted">No questions yet. Add your first question above.</p> : adminQuestions.filter((question) => (bankSubjectFilter === "all" || question.subject === bankSubjectFilter) && `${question.subject} ${question.topic ?? ""} ${question.text}`.toLowerCase().includes(bankSearch.trim().toLowerCase())).map((question) => (
                <article className="admin-question-row" key={question.id}>
                  <div><strong>{question.subject}{question.topic ? ` · ${question.topic}` : ""}</strong><p>{question.text}</p><small className="muted">{question.difficulty ?? "medium"} · {question.options.length} options</small></div>
                  <span className="status status-used">#{question.id}</span>
                </article>
              ))}
              {adminQuestions.length > 0 && adminQuestions.filter((question) => (bankSubjectFilter === "all" || question.subject === bankSubjectFilter) && `${question.subject} ${question.topic ?? ""} ${question.text}`.toLowerCase().includes(bankSearch.trim().toLowerCase())).length === 0 && <p className="muted">No questions match these filters.</p>}
            </div>
          </section>
          <section hidden={activePage !== "announcements"} id="announcements">
            <div className="section-head">
              <div><p className="eyebrow">STUDENT COMMUNICATION</p><h2>Send an announcement</h2></div>
            </div>
            <form className="panel admin-form announcement-form" onSubmit={(event) => void createAnnouncement(event)}>
              <label>Title
                <input required minLength={2} maxLength={120} value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} placeholder="Exam schedule update" />
              </label>
              <label>Message
                <textarea required maxLength={4000} rows={3} value={announcementMessage} onChange={(event) => setAnnouncementMessage(event.target.value)} placeholder="Write a message for your students…" />
              </label>
              <label>Expiry date and time <span className="muted">(optional)</span>
                <input type="datetime-local" value={announcementExpiresAt} onChange={(event) => setAnnouncementExpiresAt(event.target.value)} />
              </label>
              <p className="muted announcement-expiry-help">Leave empty if this notice should not expire. Expired notices are automatically hidden from students.</p>
              <button className="primary" disabled={busy}>{busy ? "Publishing…" : "Publish announcement"}</button>
            </form>
            <div className="panel announcement-list">
              {announcements.length === 0 ? <p className="muted">No announcements published yet.</p> : announcements.map((item) => (
                <article className="announcement-row" key={item.id}>
                  <div className="announcement-admin-title"><strong>{item.title}</strong><span className={item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now() ? "status status-expired" : "status status-used"}>{item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now() ? "EXPIRED" : "ACTIVE"}</span></div>
                  <p>{item.message}</p>
                  <small>Published {new Date(item.publishedAt).toLocaleString()} · {item.expiresAt ? `Expires ${new Date(item.expiresAt).toLocaleString()}` : "No expiry"}</small>
                </article>
              ))}
            </div>
          </section>
          <section hidden={activePage !== "invitations"} id="invitations">
            <div className="section-head">
              <div><p className="eyebrow">STUDENT ACCESS</p><h2>Invite a student</h2></div>
            </div>
            <form className="panel admin-form" onSubmit={(event) => void createInvitation(event)}>
              <label>Email address
                <input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="student@example.com" />
              </label>
              <button className="primary" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</button>
            </form>
            {createdInvitation && (
              <article className="panel invite-result">
                <p className="eyebrow">COPY THIS CODE — IT IS SHOWN ONLY ONCE</p>
                <strong>{createdInvitation.email}</strong>
                <code>{createdInvitation.token}</code>
                <button className="ghost" onClick={() => void navigator.clipboard?.writeText(createdInvitation.token)}>Copy invitation code</button>
                <p className="muted">Expires {new Date(createdInvitation.expiresAt).toLocaleString()}</p>
              </article>
            )}
            <div className="section-head">
              <div><p className="eyebrow">ACCESS CONTROL</p><h2>Recent invitations</h2></div>
              <button className="ghost" onClick={() => request<{ invitations: Invitation[] }>("/auth/invitations").then(({ invitations: items }) => setInvitations(items)).catch((cause) => setError((cause as Error).message))}>Refresh</button>
            </div>
            <div className="panel invitation-list">
              {invitations.length === 0 ? <p className="muted">No invitations created yet.</p> : invitations.map((invitation) => (
                <article className="invitation-row" key={invitation.id}>
                  <div><strong>{invitation.email}</strong><small>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></div>
                  <span className={`status status-${invitation.status.toLowerCase()}`}>{invitation.status}</span>
                  {invitation.status === "PENDING" && <button className="ghost" disabled={busy} onClick={() => void revokeInvitation(invitation.id)}>Revoke</button>}
                </article>
              ))}
            </div>
          </section>
          {error && <p className="error">{error}</p>}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <nav aria-label="Student navigation">
          <button className={activePage === "dashboard" ? "nav-active" : "nav-button"} onClick={() => setActivePage("dashboard")}>Dashboard</button>
          <button className={activePage === "practice" ? "nav-active" : "nav-button"} onClick={() => setActivePage("practice")}>Practice</button>
          <button className={activePage === "question-bank" ? "nav-active" : "nav-button"} onClick={() => setActivePage("question-bank")}>Question bank</button>
          <button className={activePage === "announcements" ? "nav-active" : "nav-button"} onClick={() => setActivePage("announcements")}>Announcements{announcements.filter((item) => !item.seenAt).length > 0 ? ` (${announcements.filter((item) => !item.seenAt).length})` : ""}</button>
        </nav>
        <div className="top-actions">
          <button
            className="icon-button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label="Toggle theme"
          >
            {theme === "light" ? "☾" : "☀"}
          </button>
          <span className="user-email">{user.email}</span>
          <button className="ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {user.role === "STUDENT" && !test && !result && announcements.some((item) => !item.seenAt) ? (() => {
        const notice = announcements.find((item) => !item.seenAt)!;
        return (
          <div className="announcement-overlay">
            <section className="announcement-popup panel" role="dialog" aria-modal="true" aria-labelledby="announcement-popup-title">
              <div className="announcement-popup-top"><span className="status status-pending">NEW ANNOUNCEMENT</span><span className="muted">{new Date(notice.publishedAt).toLocaleString()}</span></div>
              <p className="eyebrow">FROM ARCTESTER ADMIN</p>
              <h2 id="announcement-popup-title">{notice.title}</h2>
              <p className="announcement-popup-message">{notice.message}</p>
              {notice.expiresAt ? <p className="announcement-popup-expiry">Expires {new Date(notice.expiresAt).toLocaleString()}</p> : null}
              <button className="primary" disabled={busy} onClick={() => void acknowledgeAnnouncement(notice.id)}>{busy ? "Saving…" : "Got it · Mark as seen"}</button>
              <p className="muted announcement-popup-footnote">You won't see this announcement again after marking it as seen.</p>
            </section>
          </div>
        );
      })() : null}
      <main className="main-content">
        {test ? (
          <section>
            <div className="page-heading">
              <div>
                <p className="eyebrow">PRACTICE SESSION</p>
                <h1>Stay focused.</h1>
                <p className="muted">
                  {test.questions.length} questions · {Object.keys(answers).length} answered
                </p>
              </div>
              <button className="ghost" onClick={() => setTest(null)}>
                Exit session
              </button>
            </div>
            {test.warnings.map((warning) => (
              <p className="notice" key={warning}>
                {warning}
              </p>
            ))}
            <div className="question-list">
              {test.questions.map((question, index) => (
                <article className="panel question-card" key={question.id}>
                  <p className="eyebrow">
                    QUESTION {index + 1} · {question.subject}
                  </p>
                  <h2>{question.text}</h2>
                  <div className="options">
                    {question.options.map((option, optionIndex) => (
                      <button
                        key={optionIndex}
                        className={
                          answers[question.id] === optionIndex ? "option selected" : "option"
                        }
                        onClick={() =>
                          setAnswers((current) => ({ ...current, [question.id]: optionIndex }))
                        }
                      >
                        <span>{String.fromCharCode(65 + optionIndex)}</span>
                        {option}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            <button className="primary" disabled={busy} onClick={() => void submitTest()}>
              {busy ? "Submitting…" : "Submit answers"}
            </button>
          </section>
        ) : result ? (
          <section>
            <div className="page-heading">
              <div>
                <p className="eyebrow">SESSION COMPLETE</p>
                <h1>Your result</h1>
              </div>
              <button className="ghost" onClick={() => setResult(null)}>
                Back to dashboard
              </button>
            </div>
            <div className="panel score-panel">
              <strong>
                {result.score} / {result.total}
              </strong>
              <span className="muted">Your score</span>
            </div>
            <div className="grid two">
              {result.breakdown.map((item) => (
                <article className="panel" key={item.subject}>
                  <h3>{item.subject}</h3>
                  <p>
                    {item.correct} / {item.total} correct
                  </p>
                </article>
              ))}
            </div>
            <h2 className="section-heading">Answer review</h2>
            {result.questions.map((question, index) => (
              <article className="panel question-card" key={question.questionId}>
                <p className="eyebrow">QUESTION {index + 1}</p>
                <h3>{question.text}</h3>
                <p className={question.isCorrect ? "success" : "error"}>
                  {question.isCorrect ? "Correct" : "Incorrect"}
                </p>
                <p className="muted">{question.explanation}</p>
              </article>
            ))}
          </section>
        ) : activePage === "announcements" ? (
          <section className="student-announcements">
            <div className="page-heading">
              <div><p className="eyebrow">STUDENT COMMUNICATION</p><h1>Announcements</h1><p className="muted">Notices published by your ArcTester administrator.</p></div>
              <button className="ghost" onClick={() => request<{ announcements: Announcement[] }>("/announcements").then(({ announcements: items }) => setAnnouncements(items)).catch((cause) => setError((cause as Error).message))}>Refresh</button>
            </div>
            {announcements.length === 0 ? <div className="panel empty-state"><h2>No announcements yet</h2><p className="muted">New notices from your administrator will appear here automatically.</p></div> : announcements.map((item) => (
              <article className="panel announcement-row" key={item.id}>
                <div className="announcement-meta"><span className={item.seenAt ? "status status-used" : "status status-pending"}>{item.seenAt ? "SEEN" : "UNREAD"}</span><small>{new Date(item.publishedAt).toLocaleString()}</small></div>
                <h2>{item.title}</h2><p>{item.message}</p>
                {item.expiresAt ? <small className="muted">Expires {new Date(item.expiresAt).toLocaleString()}</small> : null}
              </article>
            ))}
          </section>
        ) : (
          <>
            <section hidden={activePage !== "dashboard"} className="welcome panel" id="dashboard">
              <div>
                <p className="eyebrow">YOUR LEARNING DASHBOARD</p>
                <h1>Make every practice count.</h1>
                <p className="muted">
                  Pick a subject or start a mixed session. Your progress is saved to your account.
                </p>
              </div>
              <div className="welcome-mark">A</div>
            </section>
            {activePage === "dashboard" && announcements.length > 0 ? (
              <section className="panel student-notice-preview">
                <div className="section-head"><div><p className="eyebrow">IMPORTANT UPDATES</p><h2>Latest announcement</h2></div><button className="ghost" onClick={() => setActivePage("announcements")}>View all ({announcements.length}) →</button></div>
                <strong>{announcements[0].title}</strong><p>{announcements[0].message}</p><small className="muted">{new Date(announcements[0].publishedAt).toLocaleString()}</small>
              </section>
            ) : null}
            <div hidden={activePage !== "dashboard"} className="stats-row">
              <article className="panel stat">
                <span className="muted">Question bank</span>
                <strong>{bank?.total ?? "—"}</strong>
                <span className="muted">Available questions</span>
              </article>
              <article className="panel stat">
                <span className="muted">Subjects</span>
                <strong>{bank?.subjects.length ?? "—"}</strong>
                <span className="muted">In your question bank</span>
              </article>
            </div>
            <section hidden={activePage !== "practice"} id="practice">
              <div className="section-head">
                <div>
                  <p className="eyebrow">GET STARTED</p>
                  <h2>Choose your practice</h2>
                </div>
              </div>
              <div className="grid three">
                <article className="panel action-card">
                  <span className="action-icon">◈</span>
                  <h3>Mock test</h3>
                  <p className="muted">
                    Take a full-length exam using the configured test pattern.
                  </p>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void startTest("mock")}
                  >
                    Start mock test
                  </button>
                </article>
                <article className="panel action-card">
                  <span className="action-icon">◎</span>
                  <h3>Quick practice</h3>
                  <p className="muted">Build a short mixed practice session.</p>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void startTest("practice")}
                  >
                    Start practice
                  </button>
                </article>
                <article className="panel action-card">
                  <span className="action-icon">↻</span>
                  <h3>Review mistakes</h3>
                  <p className="muted">Revisit questions you have answered incorrectly.</p>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void startTest("mistakes")}
                  >
                    Review mistakes
                  </button>
                </article>
              </div>
            </section>
            <section hidden={activePage !== "question-bank"}>
              <div className="section-head">
                <div>
                  <p className="eyebrow">QUESTION BANK</p>
                  <h2>Practice by subject</h2>
                </div>
              </div>
              <div className="grid two">
                {bank?.subjects.map((item) => (
                  <button
                    className="panel subject-card"
                    key={item.subject}
                    disabled={busy}
                    onClick={() => void startTest("practice", item.subject)}
                  >
                    <span>
                      <strong>{item.subject}</strong>
                      <small>{item.count} questions</small>
                    </span>
                    <b>→</b>
                  </button>
                ))}
              </div>
            </section>
            <p hidden={activePage !== "dashboard"} className="footnote">
              Mock test structure currently follows the existing configured AP ECET pattern. Generic
              exam management is a separate upcoming phase.
            </p>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </main>
    </div>
  );
}

function Brand() {
  return (
    <a className="brand" href="#dashboard">
      <span className="brand-mark">A</span>
      <span>ArcTester</span>
    </a>
  );
}
