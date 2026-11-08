import { useEffect, useState } from "react";
import { xlsxToCsv } from "./xlsx";
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
type AdminQuestion = { id: number; subject: string; topic: string | null; text: string; options: string[]; correctIndex?: number; explanation?: string; source?: string; difficulty?: string };
type AdminSubject = { id: number; name: string; questionCount: number; topics: { id: number; name: string }[] };
type AdminStudent = { id: number; email: string };
type AssignedExam = { id: string; status: string; assignedAt: string; availableFrom: string | null; dueAt: string | null; exam: { id: string; title: string; description: string }; version: number; durationMinutes: number; questionCount: number; submission: { id: string; status: string; score: number | null; maximumScore: number | null; submittedAt: string } | null };
type AssignedExamPackage = { assignmentId: string; title: string; description: string; version: number; instructions: string; durationMinutes: number; availableFrom: string | null; dueAt: string | null; serverTime: string; questions: { id: string; position: number; subject: string; topic: string | null; text: string; options: string[]; marks: number; negativeMarks: number }[] };
type AssignedExamResult = { submissionId: string; status: string; score: number | null; maximumScore: number | null; submittedAt: string; questions: { id: string; position: number; text: string; options: string[]; correctIndex: number; explanation: string; selectedIndex: number | null; isCorrect: boolean; awardedMarks: number; marks: number; negativeMarks: number }[] };
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
type LiveSession = {
  id: string; status: string; student: { id: number; email: string }; exam: { id: string; title: string };
  assignmentId: string; startedAt: string | null; lastHeartbeatAt: string | null; connectivity: string;
  heartbeatCount: number; focusLossCount: number; disconnectCount: number;
  submission: { id: string; status: string } | null;
  events: { id: string; type: string; detail: string; createdAt: string; actor: { email: string; role: string } | null }[];
};
type ExamAttendance = {
  assignmentId: string; candidate: { id: number; email: string }; exam: { id: string; title: string };
  version: number; questionCount: number; assignedAt: string; availableFrom: string | null; dueAt: string | null;
  attendanceStatus: string; connectivity: string;
  session: { id: string; status: string; startedAt: string | null; lastHeartbeatAt: string | null; endedAt: string | null; heartbeatCount: number; focusLossCount: number; disconnectCount: number } | null;
  submission: { id: string; status: string; submittedAt: string; score: number | null; maximumScore: number | null } | null;
};
type SessionAudit = {
  assignmentId: string; candidate: { id: number; email: string }; exam: { title: string }; version: number;
  session: { id: string; status: string; startedAt: string | null; lastHeartbeatAt: string | null; endedAt: string | null; heartbeatCount: number; focusLossCount: number; disconnectCount: number } | null;
  submission: { id: string; status: string; submittedAt: string; receivedAt: string; score: number | null; maximumScore: number | null } | null;
  events: { id: string; type: string; detail: string; createdAt: string; actor: { id: number; email: string; role: string } | null }[];
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
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [examAttendance, setExamAttendance] = useState<ExamAttendance[]>([]);
  const [sessionAudit, setSessionAudit] = useState<SessionAudit | null>(null);
  const [sessionActionBusy, setSessionActionBusy] = useState<string | null>(null);
  const [adminQuestions, setAdminQuestions] = useState<AdminQuestion[]>([]);
  const [adminSubjects, setAdminSubjects] = useState<AdminSubject[]>([]);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicSubjectId, setNewTopicSubjectId] = useState(0);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [assignmentAvailableFrom, setAssignmentAvailableFrom] = useState("");
  const [assignmentDueAt, setAssignmentDueAt] = useState("");
  const [adminStudents, setAdminStudents] = useState<AdminStudent[]>([]);
  const [adminExams, setAdminExams] = useState<AdminExam[]>([]);
  const [assignedExams, setAssignedExams] = useState<AssignedExam[]>([]);
  const [assignmentResult, setAssignmentResult] = useState<AssignedExamResult | null>(null);
  const [assignmentResultForId, setAssignmentResultForId] = useState<string | null>(null);
  const [activeAssignmentPackage, setActiveAssignmentPackage] = useState<AssignedExamPackage | null>(null);
  const [assignmentAnswers, setAssignmentAnswers] = useState<Record<string, number>>({});
  const [assignmentStartedAt, setAssignmentStartedAt] = useState<string | null>(null);
  const [assignmentDeadline, setAssignmentDeadline] = useState<string | null>(null);
  const [assignmentServerOffset, setAssignmentServerOffset] = useState(0);
  const [assignmentSessionPaused, setAssignmentSessionPaused] = useState(false);
  const [assignmentClock, setAssignmentClock] = useState(Date.now());
  const [assignmentAutoSubmitTriggered, setAssignmentAutoSubmitTriggered] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
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
  const [importPreviewDetails, setImportPreviewDetails] = useState<{ valid: number; duplicates: number; invalid: { row: number; reason: string }[]; total: number } | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [bankSubjectFilter, setBankSubjectFilter] = useState("all");
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBankQuestionIds, setSelectedBankQuestionIds] = useState<number[]>([]);
  const [bulkDifficulty, setBulkDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [subjectQuotas, setSubjectQuotas] = useState<Record<string, number>>({});
  const [difficultyMix, setDifficultyMix] = useState<"any" | "balanced" | "easy" | "medium" | "hard">("any");
  const [topicSelectionMode, setTopicSelectionMode] = useState<"all" | "include" | "exclude">("all");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
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
  const [activePage, setActivePage] = useState<"dashboard" | "practice" | "question-bank" | "subjects" | "exams" | "live-sessions" | "attendance" | "announcements" | "invitations" | "assigned-exams">("dashboard");
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
    request<{ assignments: AssignedExam[] }>("/exams/assigned")
      .then(({ assignments }) => setAssignedExams(assignments ?? []))
      .catch((cause) => setError((cause as Error).message));
    let active = true;
    const loadAnnouncements = () => request<{ announcements: Announcement[] }>("/announcements")
      .then(({ announcements: items }) => { if (active) setAnnouncements(items); })
      .catch((cause) => { if (active) setError((cause as Error).message); });
    void loadAnnouncements();
    const interval = window.setInterval(() => { void loadAnnouncements(); }, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [user]);

  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAt || assignmentSessionPaused) return;
    const interval = window.setInterval(() => setAssignmentClock(performance.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeAssignmentPackage, assignmentStartedAt, assignmentSessionPaused]);

  const assignmentRemainingSeconds = activeAssignmentPackage && assignmentDeadline
    ? Math.max(0, Math.min(
        Math.floor((new Date(assignmentDeadline).getTime() - (assignmentClock + assignmentServerOffset)) / 1000),
        activeAssignmentPackage.dueAt ? Math.floor((new Date(activeAssignmentPackage.dueAt).getTime() - (assignmentClock + assignmentServerOffset)) / 1000) : Number.POSITIVE_INFINITY,
      ))
    : 0;

  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAt) return;
    let disposed = false;
    const heartbeat = async (event: "HEARTBEAT" | "FOCUS_LOST" | "FOCUS_RESTORED" | "CONNECTION_RESTORED" = "HEARTBEAT") => {
      try {
        const response = await request<{ serverTime: string; deadline: string | null; sessionStatus: string }>(
          `/exams/assignments/${activeAssignmentPackage.assignmentId}/session/heartbeat`,
          { method: "POST", body: JSON.stringify({ event }) },
        );
        if (disposed) return;
        setAssignmentServerOffset(new Date(response.serverTime).getTime() - performance.now());
        if (response.deadline) setAssignmentDeadline(response.deadline);
        setAssignmentSessionPaused(response.sessionStatus !== "ACTIVE");
        if (response.sessionStatus === "ACTIVE") setError((current) => current.includes("paused or locked by the invigilator") ? "" : current);
      } catch (cause) {
        if (disposed) return;
        const message = (cause as Error).message;
        if (message.toLowerCase().includes("no active exam session")) {
          setAssignmentSessionPaused(true);
          setError("Your exam session is paused or locked by the invigilator. Your timer is on hold until the session is resumed.");
        } else if (message.toLowerCase().includes("time has expired") || message.toLowerCase().includes("deadline has passed")) {
          setError(message);
          setAssignmentSessionPaused(true);
        }
      }
    };
    const onVisibilityChange = () => { void heartbeat(document.hidden ? "FOCUS_LOST" : "FOCUS_RESTORED"); };
    const onOnline = () => { void heartbeat("CONNECTION_RESTORED"); };
    void heartbeat();
    const interval = window.setInterval(() => { void heartbeat(); }, 15_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [activeAssignmentPackage, assignmentStartedAt]);

  useEffect(() => {
    if (activeAssignmentPackage && assignmentStartedAt && !assignmentSessionPaused && assignmentRemainingSeconds === 0 && !busy && !assignmentAutoSubmitTriggered) {
      setAssignmentAutoSubmitTriggered(true);
      void submitAssignedExam(true);
    }
  }, [activeAssignmentPackage, assignmentStartedAt, assignmentRemainingSeconds, assignmentSessionPaused, busy, assignmentAutoSubmitTriggered]);

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
    request<{ subjects: AdminSubject[] }>("/admin/subjects")
      .then(({ subjects }) => { const items = subjects ?? []; setAdminSubjects(items); if (items[0]) setNewTopicSubjectId(items[0].id); })
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
    void refreshLiveSessions();
    void refreshExamAttendance();
  }, [user]);

  useEffect(() => {
    if (user?.role !== "ADMIN" || !["live-sessions", "attendance"].includes(activePage)) return;
    const refresh = () => {
      if (activePage === "live-sessions") void refreshLiveSessions();
      if (activePage === "attendance") void refreshExamAttendance();
    };
    refresh();
    const interval = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(interval);
  }, [user, activePage]);

  async function refreshAssignedExams() {
    const response = await request<{ assignments: AssignedExam[] }>("/exams/assigned");
    setAssignedExams(response.assignments);
  }

  async function reviewAssignedExam(assignmentId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await request<{ result: AssignedExamResult }>(`/exams/assignments/${assignmentId}/result`);
      setAssignmentResult(response.result);
      setAssignmentResultForId(assignmentId);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function startAssignedExam(assignmentId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await request<{ package: AssignedExamPackage }>(`/exams/assignments/${assignmentId}/package`);
      const sessionResponse = await request<{ session: { startedAt: string; serverTime: string; deadline: string | null; status: string } }>(
        `/exams/assignments/${assignmentId}/session/start`, { method: "POST", body: JSON.stringify({}) },
      );
      setActiveAssignmentPackage(response.package);
      setAssignmentAnswers({});
      setAssignmentStartedAt(sessionResponse.session.startedAt);
      setAssignmentDeadline(sessionResponse.session.deadline);
      setAssignmentServerOffset(new Date(sessionResponse.session.serverTime).getTime() - performance.now());
      setAssignmentSessionPaused(false);
      setAssignmentClock(performance.now());
      setAssignmentAutoSubmitTriggered(false);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function submitAssignedExam(force = false) {
    if (!activeAssignmentPackage || !assignmentStartedAt) return;
    if (!force && !window.confirm("Submit this exam now? You cannot change answers after submission.")) return;
    setBusy(true);
    setError("");
    try {
      const attemptUuid = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
            const random = Math.floor(Math.random() * 16);
            return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
          });
      await request(`/exams/assignments/${activeAssignmentPackage.assignmentId}/submission`, {
        method: "POST",
        body: JSON.stringify({
          attemptUuid,
          startedAt: assignmentStartedAt,
          submittedAt: new Date().toISOString(),
          answers: activeAssignmentPackage.questions.map((question) => ({
            examQuestionId: question.id,
            selectedIndex: assignmentAnswers[question.id] ?? null,
          })),
        }),
      });
      setActiveAssignmentPackage(null);
      setAssignmentStartedAt(null);
      setAssignmentDeadline(null);
      setAssignmentSessionPaused(false);
      setAssignmentAnswers({});
      setAssignmentAutoSubmitTriggered(false);
      await refreshAssignedExams();
      setActivePage("assigned-exams");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

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

  async function refreshLiveSessions() {
    try {
      const response = await request<{ sessions: LiveSession[] }>("/admin/exams/live-sessions");
      setLiveSessions(response.sessions ?? []);
    } catch (cause) { setError((cause as Error).message); }
  }

  async function refreshExamAttendance() {
    try {
      const response = await request<{ attendance: ExamAttendance[] }>("/admin/exams/attendance");
      setExamAttendance(response.attendance ?? []);
    } catch (cause) { setError((cause as Error).message); }
  }

  async function controlExamSession(sessionId: string, action: "PAUSE" | "RESUME" | "TERMINATE") {
    const confirmation = action === "TERMINATE"
      ? "Terminate this candidate session? The candidate will not be able to continue."
      : action === "PAUSE" ? "Pause this candidate session?" : "Resume this candidate session?";
    if (!window.confirm(confirmation)) return;
    setSessionActionBusy(sessionId);
    setError("");
    try {
      await request(`/admin/exams/sessions/${sessionId}/action`, {
        method: "POST", body: JSON.stringify({ action, reason: `Administrator selected ${action.toLowerCase()} from the live invigilation workspace.` }),
      });
      await refreshLiveSessions();
      await refreshExamAttendance();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSessionActionBusy(null); }
  }

  async function loadSessionAudit(assignmentId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await request<{ audit: SessionAudit }>(`/admin/exams/assignments/${assignmentId}/audit`);
      setSessionAudit(response.audit);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setQuestionSaved(false);
    try {
      const payload = { subject: questionSubject.trim(), topic: questionTopic.trim() || "General", text: questionText.trim(), options: questionOptions.map((option) => option.trim()), correctIndex: questionCorrectIndex, explanation: questionExplanation.trim(), difficulty: questionDifficulty, source: "Admin question editor" };
      const endpoint = editingQuestionId === null ? "/admin/questions" : `/admin/questions/${editingQuestionId}`;
      const { question } = await request<{ question: AdminQuestion }>(endpoint, {
        method: editingQuestionId === null ? "POST" : "PATCH",
        body: JSON.stringify(payload),
      });
      setAdminQuestions((current) => {
        const next = editingQuestionId === null ? [...current, question] : current.map((item) => item.id === question.id ? question : item);
        return next.sort((a, b) => a.subject.localeCompare(b.subject) || a.id - b.id);
      });
      setEditingQuestionId(null);
      setQuestionText("");
      setQuestionOptions(["", "", "", ""]);
      setQuestionCorrectIndex(0);
      setQuestionExplanation("");
      setQuestionSaved(true);
      await refreshSubjects();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function editQuestion(question: AdminQuestion) {
    setEditingQuestionId(question.id);
    setQuestionSubject(question.subject);
    setQuestionTopic(question.topic ?? "General");
    setQuestionText(question.text);
    setQuestionOptions([...question.options]);
    setQuestionCorrectIndex(question.correctIndex ?? 0);
    setQuestionExplanation(question.explanation ?? "");
    setQuestionDifficulty((question.difficulty ?? "medium") as "easy" | "medium" | "hard");
    setQuestionSaved(false);
    document.getElementById("question-editor-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteQuestion(question: AdminQuestion) {
    if (!window.confirm(`Delete question #${question.id}? It will also remove linked practice history for this question.`)) return;
    setBusy(true);
    setError("");
    try {
      await request(`/admin/questions/${question.id}`, { method: "DELETE" });
      setAdminQuestions((current) => current.filter((item) => item.id !== question.id));
      setSelectedQuestionIds((current) => current.filter((id) => id !== question.id));
      setSelectedBankQuestionIds((current) => current.filter((id) => id !== question.id));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkDeleteQuestions() {
    if (!selectedBankQuestionIds.length) return;
    if (!window.confirm(`Delete ${selectedBankQuestionIds.length} selected questions? Linked practice history for these questions will also be removed.`)) return;
    setBusy(true);
    setError("");
    try {
      await request("/admin/questions/bulk", { method: "DELETE", body: JSON.stringify({ ids: selectedBankQuestionIds }) });
      const removed = new Set(selectedBankQuestionIds);
      setAdminQuestions((current) => current.filter((question) => !removed.has(question.id)));
      setSelectedBankQuestionIds([]);
      setSelectedQuestionIds((current) => current.filter((id) => !removed.has(id)));
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function bulkUpdateQuestionDifficulty() {
    if (!selectedBankQuestionIds.length) return;
    setBusy(true);
    setError("");
    try {
      await request("/admin/questions/bulk", {
        method: "PATCH",
        body: JSON.stringify({ ids: selectedBankQuestionIds, difficulty: bulkDifficulty }),
      });
      const selected = new Set(selectedBankQuestionIds);
      setAdminQuestions((current) => current.map((question) => selected.has(question.id) ? { ...question, difficulty: bulkDifficulty } : question));
      setSelectedBankQuestionIds([]);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function refreshSubjects() {
    const response = await request<{ subjects: AdminSubject[] }>("/admin/subjects");
    const subjects = response.subjects ?? [];
    setAdminSubjects(subjects);
    if (!newTopicSubjectId && subjects[0]) setNewTopicSubjectId(subjects[0].id);
  }

  async function createSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/admin/subjects", { method: "POST", body: JSON.stringify({ name: newSubjectName.trim() }) });
      setNewSubjectName("");
      await refreshSubjects();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function createTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTopicSubjectId) return;
    setBusy(true);
    setError("");
    try {
      await request(`/admin/subjects/${newTopicSubjectId}/topics`, { method: "POST", body: JSON.stringify({ name: newTopicName.trim() }) });
      setNewTopicName("");
      await refreshSubjects();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function deleteTopic(topicId: number) {
    if (!window.confirm("Delete this topic? Questions assigned to it will move to no topic.")) return;
    setBusy(true);
    setError("");
    try {
      await request(`/admin/topics/${topicId}`, { method: "DELETE" });
      await refreshSubjects();
      const refreshed = await request<{ questions: AdminQuestion[] }>("/admin/question-bank");
      setAdminQuestions(refreshed.questions);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
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
      await refreshSubjects();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setImportBusy(false);
    }
  }

  async function loadImportFile(file?: File) {
    if (!file) return;
    if (file.size > 8_000_000) {
      setImportPreviewError("The selected file exceeds the 8 MB upload limit.");
      return;
    }
    const extension = file.name.toLowerCase().split(".").pop();
    try {
      const isJson = extension === "json";
      const content = extension === "xlsx" ? await xlsxToCsv(file) : await file.text();
      setImportFormat(isJson ? "json" : "csv");
      setImportText(content);
      setImportReport(null);
      setImportPreviewReady(false);
      setImportPreviewDetails(null);
      setImportPreviewError("");
    } catch (cause) {
      setImportPreviewError((cause as Error).message);
    }
  }

  async function previewQuestionImport() {
    setImportPreviewError("");
    setImportPreviewDetails(null);
    setImportBusy(true);
    try {
      const payload = importFormat === "csv"
        ? { format: "csv", content: importText }
        : { format: "json", questions: JSON.parse(importText) };
      const response = await request<{ preview: { valid: number; duplicates: number; invalid: { row: number; reason: string }[]; total: number } }>("/admin/questions/import/preview", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setImportPreviewDetails(response.preview);
      setImportPreviewReady(response.preview.valid > 0);
      if (response.preview.valid === 0) setImportPreviewError("No valid new questions found. Fix the invalid rows or remove duplicates before importing.");
    } catch (cause) {
      setImportPreviewError((cause as Error).message);
      setImportPreviewReady(false);
    } finally {
      setImportBusy(false);
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

  function loadEcetBlueprint() {
    const blueprint: [RegExp, number][] = [
      [/math|mathematics/i, 50],
      [/physics/i, 25],
      [/chemistry/i, 25],
      [/computer science|\bcse\b/i, 100],
    ];
    const quotas: Record<string, number> = {};
    for (const [pattern, count] of blueprint) {
      const subject = [...new Set(adminQuestions.map((question) => question.subject))].find((name) => pattern.test(name));
      if (subject) quotas[subject] = count;
    }
    setSubjectQuotas(quotas);
    setDifficultyMix("any");
    setTopicSelectionMode("all");
    setSelectedTopics([]);
    const matched = Object.keys(quotas).length;
    setError(matched === 4 ? "Loaded the AP ECET 200-question blueprint." : `Loaded ${matched} of 4 AP ECET subject quotas. Add or rename the missing subjects in Subjects & Topics.`);
  }

  function generateSubjectPaper() {
    const picked: number[] = [];
    const subjects = [...new Set(adminQuestions.map((question) => question.subject))];
    for (const subject of subjects) {
      const quota = Math.max(0, subjectQuotas[subject] ?? 0);
      let pool = adminQuestions.filter((question) => question.subject === subject && !picked.includes(question.id));
      if (topicSelectionMode === "include") pool = pool.filter((question) => question.topic && selectedTopics.includes(`${subject}::${question.topic}`));
      if (topicSelectionMode === "exclude") pool = pool.filter((question) => !question.topic || !selectedTopics.includes(`${subject}::${question.topic}`));
      if (difficultyMix === "balanced") {
        const shuffled = (items: AdminQuestion[]) => [...items].sort(() => Math.random() - 0.5);
        const easy = shuffled(pool.filter((question) => question.difficulty === "easy"));
        const medium = shuffled(pool.filter((question) => (question.difficulty ?? "medium") === "medium"));
        const hard = shuffled(pool.filter((question) => question.difficulty === "hard"));
        const base = Math.floor(quota / 3);
        const remainder = quota % 3;
        const selected = [
          ...easy.slice(0, base + (remainder > 0 ? 1 : 0)),
          ...medium.slice(0, base + (remainder > 1 ? 1 : 0)),
          ...hard.slice(0, base),
        ];
        const selectedIds = new Set(selected.map((question) => question.id));
        if (selected.length < quota) {
          selected.push(...shuffled(pool.filter((question) => !selectedIds.has(question.id))).slice(0, quota - selected.length));
        }
        pool = shuffled(selected);
      } else {
        if (difficultyMix !== "any") pool = pool.filter((question) => (question.difficulty ?? "medium") === difficultyMix);
        pool = [...pool].sort(() => Math.random() - 0.5).slice(0, quota);
      }
      for (const question of pool.slice(0, quota)) picked.push(question.id);
    }
    setSelectedQuestionIds(picked);
    setError(picked.length ? `Generated a ${picked.length}-question paper from your subject, topic and difficulty rules.` : "No questions matched the current blueprint. Check subject quotas and topic filters.");
  }

  async function editExam(examId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await request<{ exam: { id: string; title: string; description: string; version: { instructions: string; durationMinutes: number; shuffleQuestions: boolean; shuffleOptions: boolean; questions: { questionId: number | null; marks: number; negativeMarks: number }[] } | null } }>(`/admin/exams/${examId}`);
      const exam = response.exam;
      setEditingExamId(exam.id);
      setExamTitle(exam.title);
      setExamDescription(exam.description);
      setExamInstructions(exam.version?.instructions ?? "");
      setExamDuration(exam.version?.durationMinutes ?? 180);
      setShuffleExamQuestions(exam.version?.shuffleQuestions ?? false);
      setShuffleExamOptions(exam.version?.shuffleOptions ?? false);
      setSelectedQuestionIds((exam.version?.questions ?? []).flatMap((question) => question.questionId === null ? [] : [question.questionId]));
      const firstQuestion = exam.version?.questions[0];
      setExamMarks(firstQuestion?.marks ?? 1);
      setExamNegativeMarks(firstQuestion?.negativeMarks ?? 0);
      setActivePage("exams");
      document.getElementById("exam-management")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
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
      await request(editingExamId ? `/admin/exams/${editingExamId}` : "/admin/exams", {
        method: editingExamId ? "PATCH" : "POST",
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
      setEditingExamId(null);
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

  async function cloneExam(examId: string) {
    setBusy(true);
    setError("");
    try {
      await request(`/admin/exams/${examId}/clone`, { method: "POST" });
      await refreshAdminExams();
      setError("Exam copied as a new draft.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function archiveExam(examId: string) {
    if (!window.confirm("Archive this exam? It will remain in the exam library but cannot be treated as an active exam.")) return;
    setBusy(true);
    setError("");
    try {
      await request(`/admin/exams/${examId}/archive`, { method: "POST" });
      await refreshAdminExams();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
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
        body: JSON.stringify({ studentIds: selectedStudentIds, availableFrom: assignmentAvailableFrom ? new Date(assignmentAvailableFrom).toISOString() : undefined, dueAt: assignmentDueAt ? new Date(assignmentDueAt).toISOString() : undefined }),
      });
      setAssigningExamId("");
      setSelectedStudentIds([]);
      setAssignmentAvailableFrom("");
      setAssignmentDueAt("");
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
            <button className={activePage === "live-sessions" ? "nav-active" : "nav-button"} onClick={() => setActivePage("live-sessions")}>Live invigilation</button>
            <button className={activePage === "attendance" ? "nav-active" : "nav-button"} onClick={() => setActivePage("attendance")}>Attendance</button>
            <button className={activePage === "question-bank" ? "nav-active" : "nav-button"} onClick={() => setActivePage("question-bank")}>Question bank</button>
            <button className={activePage === "subjects" ? "nav-active" : "nav-button"} onClick={() => setActivePage("subjects")}>Subjects & topics</button>
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
              <div><p className="eyebrow">EXAM DELIVERY</p><h2>{editingExamId ? `Create new version · ${examTitle}` : "Create a mock test"}</h2><p className="muted">Editing creates a new immutable version; already assigned versions remain unchanged.</p></div>
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
                <div className="quota-actions"><label>Difficulty distribution<select value={difficultyMix} onChange={(event) => setDifficultyMix(event.target.value as typeof difficultyMix)}><option value="any">Any difficulty</option><option value="balanced">Balanced easy / medium / hard</option><option value="easy">Easy only</option><option value="medium">Medium only</option><option value="hard">Hard only</option></select></label><button type="button" className="ghost" onClick={loadEcetBlueprint}>Load AP ECET blueprint</button><button type="button" className="ghost" onClick={generateSubjectPaper}>Generate paper from quotas</button></div>
                <div className="topic-blueprint"><label>Topic selection<select value={topicSelectionMode} onChange={(event) => setTopicSelectionMode(event.target.value as typeof topicSelectionMode)}><option value="all">All topics</option><option value="include">Include selected topics only</option><option value="exclude">Exclude selected topics</option></select></label><div className="topic-blueprint-options">{adminSubjects.flatMap((subject) => subject.topics.map((topic) => ({ key: `${subject.name}::${topic.name}`, label: `${subject.name} · ${topic.name}` }))).map((topic) => <label key={topic.key}><input type="checkbox" checked={selectedTopics.includes(topic.key)} onChange={(event) => setSelectedTopics((current) => event.target.checked ? [...current, topic.key] : current.filter((item) => item !== topic.key))} />{topic.label}</label>)}</div></div>
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
              <div className="row-actions"><button className="primary" disabled={busy || selectedQuestionIds.length === 0}>{busy ? "Saving…" : editingExamId ? `Save new version (${selectedQuestionIds.length} questions)` : `Create draft (${selectedQuestionIds.length} questions)`}</button>{editingExamId && <button type="button" className="ghost" disabled={busy} onClick={() => { setEditingExamId(null); setExamTitle(""); setExamDescription(""); setExamInstructions(""); setSelectedQuestionIds([]); }}>Cancel editing</button>}</div>
            </form>
            <div className="section-head"><div><p className="eyebrow">EXAM LIBRARY</p><h2>Drafts and published exams</h2></div></div>
            <div className="admin-exam-list">
              {adminExams.length === 0 ? <div className="panel empty-state">No exams created yet.</div> : adminExams.map((exam) => {
                const version = exam.versions[0];
                const published = Boolean(version?.publishedAt);
                return <article className="panel admin-exam-card" key={exam.id}>
                  <div className="admin-exam-meta"><div><strong>{exam.title}</strong><p className="muted">{exam.description || "No description"} · {version?._count.questions ?? 0} questions · {version?.durationMinutes ?? 0} min</p></div><span className={exam.status === "ARCHIVED" ? "status status-expired" : published ? "status status-used" : "status status-pending"}>{exam.status === "ARCHIVED" ? "ARCHIVED" : published ? "PUBLISHED" : "DRAFT"}</span></div>
                  <div className="admin-exam-actions">
                    {exam.status !== "ARCHIVED" && <button className="ghost" disabled={busy} onClick={() => void editExam(exam.id)}>Edit / new version</button>}
                    <button className="ghost" disabled={busy} onClick={() => void cloneExam(exam.id)}>Duplicate exam</button>
                    {exam.status !== "ARCHIVED" && <button className="ghost danger-action" disabled={busy} onClick={() => void archiveExam(exam.id)}>Archive</button>}
                    {!published && exam.status !== "ARCHIVED" && <button className="primary" disabled={busy} onClick={() => void publishExam(exam.id)}>Publish version</button>}
                    {published && exam.status !== "ARCHIVED" && <button className="ghost" disabled={busy || adminStudents.length === 0} onClick={() => { setAssigningExamId(assigningExamId === exam.id ? "" : exam.id); setSelectedStudentIds([]); setAssignmentAvailableFrom(""); setAssignmentDueAt(""); }}>Assign to students</button>}
                    {published && <span className="muted">{version?._count.assignments ?? 0} assignments</span>}
                  </div>
                  {assigningExamId === exam.id && <div className="student-picker">
                    <strong>Select students</strong>
                    <div className="question-editor-grid assignment-schedule"><label>Available from<input type="datetime-local" value={assignmentAvailableFrom} onChange={(event) => setAssignmentAvailableFrom(event.target.value)} /></label><label>Due date<input type="datetime-local" value={assignmentDueAt} onChange={(event) => setAssignmentDueAt(event.target.value)} /></label></div>
                    {adminStudents.length === 0 ? <p className="muted">No student accounts are registered yet.</p> : adminStudents.map((student) => <label className="student-pick" key={student.id}><input type="checkbox" checked={selectedStudentIds.includes(student.id)} onChange={(event) => setSelectedStudentIds((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} />{student.email}</label>)}
                    <button className="primary" disabled={busy || selectedStudentIds.length === 0} onClick={() => void assignExam(exam.id)}>Assign to {selectedStudentIds.length} student(s)</button>
                  </div>}
                </article>;
              })}
            </div>
          </section>
          <section hidden={activePage !== "live-sessions"} id="admin-live-sessions">
            <div className="section-head">
              <div><p className="eyebrow">REAL-TIME EXAM OPERATIONS</p><h2>Live invigilation</h2><p className="muted">Candidate sessions refresh every 15 seconds. Stale connections need review.</p></div>
              <button className="ghost" disabled={busy} onClick={() => void refreshLiveSessions()}>Refresh now</button>
            </div>
            <div className="stats-row admin-analytics-stats invigilation-stats">
              <article className="panel stat"><span className="muted">Active sessions</span><strong>{liveSessions.filter((item) => item.status === "ACTIVE").length}</strong><span className="muted">Currently running</span></article>
              <article className="panel stat"><span className="muted">Paused</span><strong>{liveSessions.filter((item) => item.status === "PAUSED").length}</strong><span className="muted">Awaiting resume</span></article>
              <article className="panel stat"><span className="muted">Connection alerts</span><strong>{liveSessions.filter((item) => item.connectivity !== "CONNECTED").length}</strong><span className="muted">Stale or disconnected</span></article>
            </div>
            {liveSessions.length === 0 ? <div className="panel empty-state"><h3>No live exam sessions</h3><p className="muted">When students start assigned exams, their sessions and connection signals will appear here.</p></div> : <div className="live-session-list">{liveSessions.map((session) => <article className="panel live-session-card" key={session.id}>
              <div className="live-session-heading"><div><strong>{session.student.email}</strong><p className="muted">{session.exam.title}</p></div><div className="live-session-badges"><span className={`status status-${session.status.toLowerCase()}`}>{session.status}</span><span className={`status ${session.connectivity === "CONNECTED" ? "status-used" : "status-expired"}`}>{session.connectivity}</span></div></div>
              <div className="live-session-metrics"><span><b>{session.heartbeatCount}</b> heartbeats</span><span><b>{session.focusLossCount}</b> focus losses</span><span><b>{session.disconnectCount}</b> reconnects</span><span>Last signal: {session.lastHeartbeatAt ? new Date(session.lastHeartbeatAt).toLocaleTimeString() : "Never"}</span></div>
              <div className="live-session-actions">{session.status === "ACTIVE" ? <button className="ghost" disabled={sessionActionBusy === session.id} onClick={() => void controlExamSession(session.id, "PAUSE")}>Pause</button> : session.status === "PAUSED" ? <button className="primary" disabled={sessionActionBusy === session.id} onClick={() => void controlExamSession(session.id, "RESUME")}>Resume</button> : null}<button className="ghost danger-action" disabled={sessionActionBusy === session.id} onClick={() => void controlExamSession(session.id, "TERMINATE")}>Terminate</button><button className="ghost" disabled={busy} onClick={() => void loadSessionAudit(session.assignmentId)}>View audit trail</button></div>
            </article>)}</div>}
            {sessionAudit && <section className="panel session-audit-panel"><div className="section-head"><div><p className="eyebrow">PERSISTENT EVENT HISTORY</p><h3>{sessionAudit.candidate.email} · {sessionAudit.exam.title}</h3></div><button className="ghost" onClick={() => setSessionAudit(null)}>Close</button></div><div className="session-audit-summary"><span>Status: <b>{sessionAudit.session?.status ?? "NOT STARTED"}</b></span><span>Heartbeats: <b>{sessionAudit.session?.heartbeatCount ?? 0}</b></span><span>Focus losses: <b>{sessionAudit.session?.focusLossCount ?? 0}</b></span><span>Reconnects: <b>{sessionAudit.session?.disconnectCount ?? 0}</b></span></div><ol className="session-event-list">{sessionAudit.events.map((event) => <li key={event.id}><span className="event-dot" /><div><strong>{event.type.replaceAll("_", " ")}</strong><p>{event.detail}</p><small>{new Date(event.createdAt).toLocaleString()} · {event.actor?.email ?? "System"}</small></div></li>)}</ol></section>}
          </section>
          <section hidden={activePage !== "attendance"} id="admin-exam-attendance">
            <div className="section-head"><div><p className="eyebrow">EXAM REGISTER</p><h2>Candidate attendance</h2><p className="muted">Assignment, session, connectivity and submission records.</p></div><button className="ghost" disabled={busy} onClick={() => void refreshExamAttendance()}>Refresh now</button></div>
            <div className="panel analytics-table-wrap"><table className="analytics-table attendance-table"><thead><tr><th>Candidate</th><th>Examination</th><th>Attendance</th><th>Connection</th><th>Started</th><th>Submitted</th><th>Score</th><th>Audit</th></tr></thead><tbody>{examAttendance.map((item) => <tr key={item.assignmentId}><td>{item.candidate.email}</td><td>{item.exam.title} · v{item.version}</td><td><span className={`status status-${item.attendanceStatus.toLowerCase()}`}>{item.attendanceStatus.replaceAll("_", " ")}</span></td><td>{item.connectivity.replaceAll("_", " ")}</td><td>{item.session?.startedAt ? new Date(item.session.startedAt).toLocaleString() : "—"}</td><td>{item.submission?.submittedAt ? new Date(item.submission.submittedAt).toLocaleString() : "—"}</td><td>{item.submission ? `${item.submission.score ?? "Pending"} / ${item.submission.maximumScore ?? "—"}` : "—"}</td><td><button className="ghost" disabled={busy} onClick={() => void loadSessionAudit(item.assignmentId)}>View</button></td></tr>)}</tbody></table>{examAttendance.length === 0 && <p className="empty-state">No exam assignments have been created yet.</p>}</div>
            {sessionAudit && <section className="panel session-audit-panel"><div className="section-head"><div><p className="eyebrow">PERSISTENT EVENT HISTORY</p><h3>{sessionAudit.candidate.email} · {sessionAudit.exam.title}</h3></div><button className="ghost" onClick={() => setSessionAudit(null)}>Close</button></div><ol className="session-event-list">{sessionAudit.events.map((event) => <li key={event.id}><span className="event-dot" /><div><strong>{event.type.replaceAll("_", " ")}</strong><p>{event.detail}</p><small>{new Date(event.createdAt).toLocaleString()} · {event.actor?.email ?? "System"}</small></div></li>)}</ol></section>}
          </section>
          <section hidden={activePage !== "subjects"} id="admin-subjects-topics">
            <div className="section-head"><div><p className="eyebrow">QUESTION TAXONOMY</p><h2>Subjects and topics</h2><p className="muted">Organise the question bank before building exam blueprints.</p></div><button className="ghost" disabled={busy} onClick={() => void refreshSubjects()}>Refresh</button></div>
            <div className="grid two">
              <form className="panel admin-form" onSubmit={(event) => void createSubject(event)}><label>New subject<input required maxLength={80} value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} placeholder="e.g. Computer Networks" /></label><button className="primary" disabled={busy || !newSubjectName.trim()}>Add subject</button></form>
              <form className="panel admin-form" onSubmit={(event) => void createTopic(event)}><label>Topic belongs to<select required value={newTopicSubjectId || ""} onChange={(event) => setNewTopicSubjectId(Number(event.target.value))}><option value="" disabled>Select subject</option>{adminSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>New topic<input required maxLength={80} value={newTopicName} onChange={(event) => setNewTopicName(event.target.value)} placeholder="e.g. Routing protocols" /></label><button className="primary" disabled={busy || !newTopicSubjectId || !newTopicName.trim()}>Add topic</button></form>
            </div>
            <div className="subject-management-list">{adminSubjects.map((subject) => <article className="panel admin-exam-card" key={subject.id}><div className="admin-exam-meta"><div><strong>{subject.name}</strong><p className="muted">{subject.questionCount} questions · {subject.topics.length} topics</p></div></div><div className="topic-chip-list">{subject.topics.map((topic) => <span className="topic-chip" key={topic.id}>{topic.name}<button type="button" aria-label={`Delete ${topic.name}`} disabled={busy} onClick={() => void deleteTopic(topic.id)}>×</button></span>)}{subject.topics.length === 0 && <span className="muted">No topics yet.</span>}</div></article>)}{adminSubjects.length === 0 && <div className="panel empty-state">No subjects yet. Add one above or import questions to create subjects automatically.</div>}</div>
          </section>
          <section hidden={activePage !== "question-bank"} id="admin-question-bank">
            <section className="panel import-workspace">
              <div className="section-head"><div><p className="eyebrow">BULK QUESTION INGESTION</p><h2>Upload questions</h2><p className="muted">Import AP ECET questions using CSV, JSON or Excel (.xlsx), or paste your dataset.</p></div></div>
              <div className="import-toolbar">
                <label className="import-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void loadImportFile(event.dataTransfer.files?.[0]); }}>
                  <strong>Choose a CSV, JSON or Excel file</strong><span>Click to browse or drag a file here · max 8 MB</span>
                  <input type="file" accept=".csv,.json,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void loadImportFile(event.target.files?.[0])} />
                </label>
                <div className="import-template-actions"><button type="button" className="ghost" onClick={() => downloadQuestionTemplate("csv")}>Download CSV template</button><button type="button" className="ghost" onClick={() => downloadQuestionTemplate("json")}>Download JSON template</button></div>
              </div>
              <div className="import-mode-row"><label>Format<select value={importFormat} onChange={(event) => { setImportFormat(event.target.value as "csv" | "json"); setImportPreviewReady(false); }}><option value="csv">CSV with headers</option><option value="json">JSON question array</option></select></label><span className="muted">Correct answer index: 0 = A, 1 = B, 2 = C, 3 = D.</span></div>
              <label>Paste question data<textarea rows={8} value={importText} onChange={(event) => { setImportText(event.target.value); setImportReport(null); setImportPreviewReady(false); }} placeholder={importFormat === "csv" ? "subject,topic,text,optionA,optionB,optionC,optionD,correctIndex,explanation,source,difficulty" : '[["Computer Science","Question text",["A","B","C","D"],1,"Explanation"]]'} /></label>
              <div className="import-footer"><span className="muted">{importText.trim() ? "Data loaded — preview before import" : "No data loaded yet"}</span><div className="import-confirm-actions"><button className="ghost" type="button" disabled={!importText.trim() || importBusy} onClick={previewQuestionImport}>Preview import</button><button className="primary" type="button" disabled={importBusy || !importPreviewReady} onClick={() => void importQuestions()}>{importBusy ? "Importing…" : "Confirm & import"}</button></div></div>
              {importPreviewError && <p className="error">{importPreviewError}</p>}
              {importPreviewReady && <div className="import-preview"><strong>Preflight complete</strong><div className="import-report"><div><strong>{importPreviewDetails?.valid ?? 0}</strong><span>Valid new questions</span></div><div><strong>{importPreviewDetails?.duplicates ?? 0}</strong><span>Duplicates</span></div><div><strong>{importPreviewDetails?.invalid.length ?? 0}</strong><span>Invalid rows</span></div><div><strong>{importPreviewDetails?.total ?? 0}</strong><span>Total rows</span></div></div>{Boolean(importPreviewDetails?.invalid.length) && <details><summary>Review invalid rows before import</summary>{importPreviewDetails?.invalid.map((row) => <p key={row.row}>Row {row.row}: {row.reason}</p>)}</details>}</div>}
              {importReport && <div className="import-report" role="status"><div><strong>{importReport.added}</strong><span>Added</span></div><div><strong>{importReport.duplicates}</strong><span>Duplicates skipped</span></div><div><strong>{importReport.invalid.length}</strong><span>Invalid rows</span></div><div><strong>{importReport.total}</strong><span>Rows processed</span></div>{importReport.invalid.length > 0 && <details><summary>Review invalid rows</summary>{importReport.invalid.map((row) => <p key={row.row}>Row {row.row}: {row.reason}</p>)}</details>}</div>}
            </section>
            <div className="section-head">
              <div><p className="eyebrow">QUESTION AUTHORING</p><h2>{editingQuestionId === null ? "Add a question" : `Edit question #${editingQuestionId}`}</h2><p className="muted">Create or update four-option questions in your reusable bank.</p></div>
            </div>
            <form id="question-editor-form" className="panel admin-form question-editor" onSubmit={(event) => void createQuestion(event)}>
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
              <div className="row-actions"><button className="primary" disabled={busy}>{busy ? "Saving…" : editingQuestionId === null ? "Add question to bank" : "Save question changes"}</button>{editingQuestionId !== null && <button type="button" className="ghost" disabled={busy} onClick={() => { setEditingQuestionId(null); setQuestionText(""); setQuestionOptions(["", "", "", ""]); setQuestionCorrectIndex(0); setQuestionExplanation(""); }}>Cancel edit</button>}</div>
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
            <div className="bulk-question-toolbar">
              <span className="muted">{selectedBankQuestionIds.length} selected</span>
              <button type="button" className="ghost" disabled={busy} onClick={() => setSelectedBankQuestionIds(adminQuestions.filter((question) => (bankSubjectFilter === "all" || question.subject === bankSubjectFilter) && `${question.subject} ${question.topic ?? ""} ${question.text}`.toLowerCase().includes(bankSearch.trim().toLowerCase())).map((question) => question.id))}>Select filtered</button>
              <button type="button" className="ghost" disabled={busy || !selectedBankQuestionIds.length} onClick={() => setSelectedBankQuestionIds([])}>Clear</button>
              <label>Set difficulty<select value={bulkDifficulty} onChange={(event) => setBulkDifficulty(event.target.value as typeof bulkDifficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
              <button type="button" className="ghost" disabled={busy || !selectedBankQuestionIds.length} onClick={() => void bulkUpdateQuestionDifficulty()}>Apply to selected</button>
              <button type="button" className="ghost danger-action" disabled={busy || !selectedBankQuestionIds.length} onClick={() => void bulkDeleteQuestions()}>Delete selected</button>
            </div>
            <div className="panel admin-question-list">
              {adminQuestions.length === 0 ? <p className="muted">No questions yet. Add your first question above.</p> : adminQuestions.filter((question) => (bankSubjectFilter === "all" || question.subject === bankSubjectFilter) && `${question.subject} ${question.topic ?? ""} ${question.text}`.toLowerCase().includes(bankSearch.trim().toLowerCase())).map((question) => (
                <article className="admin-question-row" key={question.id}>
                  <div><strong>{question.subject}{question.topic ? ` · ${question.topic}` : ""}</strong><p>{question.text}</p><small className="muted">{question.difficulty ?? "medium"} · {question.options.length} options</small></div>
                  <div className="question-row-actions"><label className="bank-question-select"><input type="checkbox" checked={selectedBankQuestionIds.includes(question.id)} onChange={(event) => setSelectedBankQuestionIds((current) => event.target.checked ? [...current, question.id] : current.filter((id) => id !== question.id))} />Select</label><span className="status status-used">#{question.id}</span><button type="button" className="ghost" disabled={busy} onClick={() => editQuestion(question)}>Edit</button><button type="button" className="ghost danger-action" disabled={busy} onClick={() => void deleteQuestion(question)}>Delete</button></div><details className="question-bank-preview"><summary>Preview answer & explanation</summary><p><strong>Correct answer:</strong> {question.options[question.correctIndex ?? 0]}</p><p><strong>Explanation:</strong> {question.explanation || "No explanation supplied."}</p></details>
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
          <button className={activePage === "assigned-exams" ? "nav-active" : "nav-button"} onClick={() => setActivePage("assigned-exams")}>Assigned exams{assignedExams.filter((item) => !item.submission).length ? ` (${assignedExams.filter((item) => !item.submission).length})` : ""}</button>
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

      {user.role === "STUDENT" && !test && !result && !activeAssignmentPackage && announcements.some((item) => !item.seenAt) ? (() => {
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
        {activeAssignmentPackage ? (
          <section className="assigned-exam-session">
            <div className="page-heading"><div><p className="eyebrow">OFFICIAL ASSIGNED EXAM · VERSION {activeAssignmentPackage.version}</p><h1>{activeAssignmentPackage.title}</h1><p className="muted">{activeAssignmentPackage.questions.length} questions · {activeAssignmentPackage.durationMinutes} minutes · <strong className={assignmentSessionPaused || assignmentRemainingSeconds < 300 ? "timer-warning" : "exam-countdown"}>{Math.floor(assignmentRemainingSeconds / 60).toString().padStart(2, "0")}:{(assignmentRemainingSeconds % 60).toString().padStart(2, "0")} remaining</strong></p></div><button className="ghost" disabled={busy} onClick={() => { if (window.confirm("Exit this exam? Your answers in this session will be discarded.")) { setActiveAssignmentPackage(null); setAssignmentStartedAt(null); setAssignmentDeadline(null); setAssignmentSessionPaused(false); setAssignmentAnswers({}); setAssignmentAutoSubmitTriggered(false); } }}>Exit exam</button></div>
            {assignmentSessionPaused && <p className="notice session-paused" role="status">Session paused or awaiting invigilator action. The server-controlled timer is held.</p>}
            {activeAssignmentPackage.instructions && <div className="panel exam-instructions"><strong>Instructions</strong><p>{activeAssignmentPackage.instructions}</p></div>}
            {activeAssignmentPackage.dueAt && <p className="notice">Submission deadline: {new Date(activeAssignmentPackage.dueAt).toLocaleString()}</p>}
            <section className="panel exam-question-navigator" aria-label="Question navigator"><div className="exam-progress-heading"><strong>Question progress</strong><span>{Object.keys(assignmentAnswers).length} / {activeAssignmentPackage.questions.length} answered</span></div><div className="exam-progress-track"><span style={{ width: `${activeAssignmentPackage.questions.length ? Object.keys(assignmentAnswers).length / activeAssignmentPackage.questions.length * 100 : 0}%` }} /></div><div className="exam-palette">{activeAssignmentPackage.questions.map((question, index) => <button type="button" key={question.id} disabled={assignmentSessionPaused} aria-label={`Go to question ${index + 1}${assignmentAnswers[question.id] !== undefined ? ", answered" : ", unanswered"}`} className={assignmentAnswers[question.id] !== undefined ? "exam-palette-item answered" : "exam-palette-item"} onClick={() => document.getElementById(`assigned-question-${question.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{index + 1}</button>)}</div></section>
            <div className="assigned-exam-question-list">{activeAssignmentPackage.questions.map((question, index) => <article id={`assigned-question-${question.id}`} className="panel question-card" key={question.id}><p className="eyebrow">QUESTION {index + 1} · {question.subject}{question.topic ? ` · ${question.topic}` : ""}</p><h2>{question.text}</h2><div className="options">{question.options.map((option, optionIndex) => <button type="button" key={optionIndex} disabled={assignmentSessionPaused} className={assignmentAnswers[question.id] === optionIndex ? "option selected" : "option"} onClick={() => setAssignmentAnswers((current) => ({ ...current, [question.id]: optionIndex }))}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div><small className="muted">+{question.marks} marks · −{question.negativeMarks} for a wrong answer</small></article>)}</div>
            <div className="assigned-exam-submit"><span className="muted">{Object.keys(assignmentAnswers).length} of {activeAssignmentPackage.questions.length} answered</span><button className="primary" disabled={busy || assignmentSessionPaused} onClick={() => void submitAssignedExam()}>{assignmentSessionPaused ? "Waiting for invigilator" : busy ? "Submitting…" : "Submit final answers"}</button></div>
          </section>
        ) : activePage === "practice" && test ? (
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
        ) : activePage === "practice" && result ? (
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
        ) : activePage === "assigned-exams" ? (
          <section className="assigned-exams-page">
            <div className="page-heading"><div><p className="eyebrow">EXAM CENTRE</p><h1>Assigned exams</h1><p className="muted">Exams assigned to your account by the administrator.</p></div><button className="ghost" disabled={busy} onClick={() => void refreshAssignedExams()}>Refresh</button></div>
            {assignedExams.length === 0 ? <div className="panel empty-state"><h2>No assigned exams</h2><p className="muted">When an administrator assigns an exam, it will appear here.</p></div> : assignedExams.map((item) => {
              const unavailable = item.availableFrom && new Date(item.availableFrom).getTime() > Date.now();
              const expired = item.dueAt && new Date(item.dueAt).getTime() < Date.now();
              return <article className="panel assigned-exam-card" key={item.id}>
                <div className="admin-exam-meta"><div><strong>{item.exam.title}</strong><p className="muted">{item.exam.description || "No description"} · Version {item.version} · {item.questionCount} questions · {item.durationMinutes} min</p></div><span className={item.submission ? "status status-used" : expired ? "status status-expired" : "status status-pending"}>{item.submission ? "SUBMITTED" : expired ? "EXPIRED" : unavailable ? "UPCOMING" : "READY"}</span></div>
                <div className="assigned-exam-dates"><small>Available: {item.availableFrom ? new Date(item.availableFrom).toLocaleString() : "Immediately"}</small><small>Deadline: {item.dueAt ? new Date(item.dueAt).toLocaleString() : "No deadline"}</small></div>
                {item.submission ? <><p className="muted">Submitted {new Date(item.submission.submittedAt).toLocaleString()} · Score: {item.submission.score ?? "Pending"} / {item.submission.maximumScore ?? "—"} · {item.submission.status}</p><button type="button" className="ghost" disabled={busy} onClick={() => void reviewAssignedExam(item.id)}>Review answers</button>{assignmentResultForId === item.id && assignmentResult && <div className="assigned-result-review"><h3>Answer review</h3><p><strong>{assignmentResult.score ?? "Pending"} / {assignmentResult.maximumScore ?? "—"}</strong> · {assignmentResult.status}</p>{assignmentResult.questions.map((question) => <article className="question-review-row" key={question.id}><strong>Q{question.position + 1}. {question.text}</strong><p className={question.isCorrect ? "success" : "error"}>{question.selectedIndex === null ? "Not answered" : question.isCorrect ? "Correct" : "Incorrect"} · {question.awardedMarks} marks</p><p><strong>Correct answer:</strong> {question.options[question.correctIndex]}</p><p className="muted">{question.explanation || "No explanation provided."}</p></article>)}</div>}</> : <button className="primary" disabled={busy || Boolean(unavailable) || Boolean(expired)} onClick={() => void startAssignedExam(item.id)}>{unavailable ? "Not available yet" : expired ? "Deadline passed" : "Start examination"}</button>}
              </article>;
            })}
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
