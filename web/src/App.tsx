import { useContext, useEffect, useRef, useState } from "react";
import { safeStorage } from "./safeStorage";
import { clearLocalExamBackupsOnLogout } from "./localExamBackup";
import { getBrowserDeviceFingerprint } from "./deviceFingerprint";
import StudentPracticeSession, { type PracticeSessionTest } from "./StudentPracticeSession";
import StudentPracticeResults, { type PracticeResult } from "./StudentPracticeResults";
import { buildPracticeConfig } from "./practiceConfig";
import { ApiRequestError, createApiClient } from "./apiClient";
import { getRemainingPracticeSeconds } from "./practiceTimer";
import type { FormEvent } from "react";
import AdminWorkspace from "./AdminWorkspace";
import AuthScreen from "./AuthScreen";
import StudentNavigation, { type StudentPage } from "./StudentNavigation";
import StudentAnnouncementDialog from "./StudentAnnouncementDialog";
import StudentNotificationBanner from "./StudentNotificationBanner";
import StudentAnnouncementsInbox from "./StudentAnnouncementsInbox";
import StudentNotificationsInbox from "./StudentNotificationsInbox";
import { useStudentCommunications } from "./useStudentCommunications";
import StudentProgress, { DashboardProgressSummary } from "./StudentProgress";
import StudentQuestionBankBrowser from "./StudentQuestionBankBrowser";
import StudentQuestionBankStats from "./StudentQuestionBankStats";
import StudentDashboardWelcome from "./StudentDashboardWelcome";
import StudentPracticeQuickActions from "./StudentPracticeQuickActions";
import StudentPracticeSubjectTopicFilters from "./StudentPracticeSubjectTopicFilters";
import StudentPracticePaperConfiguration from "./StudentPracticePaperConfiguration";
import StudentPracticeResumePreview from "./StudentPracticeResumePreview";
import StudentAssignedExamPreview from "./StudentAssignedExamPreview";
import StudentAnnouncementPreview from "./StudentAnnouncementPreview";
import StudentAnalytics from "./StudentAnalytics";
import StudentLearning from "./StudentLearning";
import StudentMaterials from "./StudentMaterials";
import { useAssignedExamSession } from "./useAssignedExamSession";
import AssignedExamSession from "./AssignedExamSession";
import { OnlineStatusContext } from "./main";
import type { AssignedExam, AssignedExamResult } from "./types/assignedExams";

const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");
const request = createApiClient(API);
type User = { id: number; email: string; role: "ADMIN" | "STUDENT" };
type Bank = { total: number; subjects: { subject: string; count: number; topics?: { topic: string; count: number }[] }[] };
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
type Test = PracticeSessionTest;
type RestoredTest = Omit<Test, "warnings"> & { warnings?: string[]; serverNow: string; saved: { questionId: number; selectedIndex: number | null }[] };
function practiceAnswersKey(attemptId: number | string): string { return `arctester-practice-answers-${attemptId}`; }
type Result = PracticeResult;

function OnlineStatusBanner() {
  const isOnline = useContext(OnlineStatusContext);
  return (
    !isOnline && (
      <div className="error" style={{ padding: "8px 16px", marginBottom: "8px", textAlign: "center" }}>
        <strong>Offline</strong> &mdash; You are currently offline. Exam results and submissions require a connection.
      </div>
    )
  );
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
  const [assignedExams, setAssignedExams] = useState<AssignedExam[]>([]);
  const [assignmentResult, setAssignmentResult] = useState<AssignedExamResult | null>(null);
  const [assignmentResultForId, setAssignmentResultForId] = useState<string | null>(null);
  const [practiceSubjects, setPracticeSubjects] = useState<string[]>([]);
  const [practiceTopicKeys, setPracticeTopicKeys] = useState<string[]>([]);
  const [practiceQuestionCount, setPracticeQuestionCount] = useState(20);
  const [practiceDifficulty, setPracticeDifficulty] = useState<"any" | "easy" | "medium" | "hard">("any");
  const [register, setRegister] = useState(false);
  const [test, setTest] = useState<Test | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [practiceClock, setPracticeClock] = useState(0);
  const [practiceServerOffset, setPracticeServerOffset] = useState(0);
  const practiceAutoSubmitRef = useRef(false);
  const submitPracticeTestRef = useRef<() => Promise<void>>(async () => {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [activePage, setActivePage] = useState<StudentPage>("dashboard");
  const {
    announcements,
    activeAnnouncements,
    notifications: studentNotifications,
    unreadNotificationCount,
    refreshAnnouncements,
    refreshNotifications,
    dismissAnnouncement,
    acknowledgeAnnouncement,
    markNotificationRead,
    clear: clearStudentCommunications,
  } = useStudentCommunications({
    userRole: user?.role ?? null,
    userId: user?.id ?? null,
    activePage,
    request,
    setError,
    setBusy,
  });
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (safeStorage.getItem("arctester-theme") as "light" | "dark") || "light"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    safeStorage.setItem("arctester-theme", theme);
  }, [theme]);

  useEffect(() => {
    request<{ user: User }>("/auth/me")
      .then(({ user: current }) => {
        setUser(current);
      })
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    request("/auth/devices/register", {
      method: "POST",
      body: JSON.stringify({
        deviceName: "Web browser",
        platform: "web",
        fingerprint: getBrowserDeviceFingerprint(safeStorage),
      }),
    }).catch((cause) => setError((cause as Error).message));
    request<Bank>("/bank")
      .then(setBank)
      .catch((cause) => setError((cause as Error).message));
  }, [user]);

  useEffect(() => {
    if (user?.role !== "STUDENT" || !["dashboard", "assigned-exams"].includes(activePage)) return;
    let cancelled = false;
    request<{ assignments: AssignedExam[] }>("/exams/assigned")
      .then(({ assignments }) => {
        if (!cancelled) setAssignedExams(Array.isArray(assignments) ? assignments : []);
      })
      .catch((cause) => {
        if (!cancelled) setError((cause as Error).message);
      });
    return () => { cancelled = true; };
  }, [user, activePage]);

  const exam = useAssignedExamSession({
    request,
    setActivePage: (page) => setActivePage(page as StudentPage),
    setAssignments: setAssignedExams,
    onResultLoaded: (result) => {
      setAssignmentResult(result);
    },
  });

  async function reviewAssignedExam(assignmentId: string) {
    setBusy(true); setError("");
    try {
      const response = await request<{ result: AssignedExamResult }>(`/exams/assignments/${encodeURIComponent(assignmentId)}/result`);
      setAssignmentResult(response.result);
      setAssignmentResultForId(assignmentId);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function refreshAssignedExams() {
    try {
      const response = await request<{ assignments: AssignedExam[] }>("/exams/assigned");
      setAssignedExams(Array.isArray(response.assignments) ? response.assignments : []);
    } catch (cause) { setError((cause as Error).message); }
  }

  // Recover a saved practice attempt after reload. The server remains the source
  // of truth for the attempt; local storage only identifies it and restores answers.
  useEffect(() => {
    if (user?.role !== "STUDENT" || test || result) return;
    const attemptId = safeStorage.getItem("arctester-active-practice-attempt");
    if (!attemptId) return;
    let cancelled = false;
    request<RestoredTest>(`/tests/${encodeURIComponent(attemptId)}`)
      .then((restored) => {
        if (cancelled || !restored || !Array.isArray(restored.questions)) return;
        const savedAnswers = safeStorage.getItem(practiceAnswersKey(attemptId));
        let answersFromStorage: Record<number, number> = {};
        if (savedAnswers) {
          try {
            const parsed: unknown = JSON.parse(savedAnswers);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              const validQuestions = new Map(restored.questions.map((question) => [String(question.id), question]));
              answersFromStorage = Object.fromEntries(
                Object.entries(parsed).flatMap(([questionId, value]) => {
                  const question = validQuestions.get(questionId);
                  if (!question || !Number.isInteger(value) || Number(value) < 0 || Number(value) >= question.options.length) {
                    return [];
                  }
                  return [[Number(questionId), Number(value)] as const];
                }),
              );
            }
          } catch {
            safeStorage.removeItem(practiceAnswersKey(attemptId));
          }
        }
        const answersFromServer = Object.fromEntries(
          (Array.isArray(restored.saved) ? restored.saved : [])
            .filter((answer) => answer.selectedIndex !== null)
            .map((answer) => [answer.questionId, answer.selectedIndex as number]),
        );
        setAnswers({ ...answersFromServer, ...answersFromStorage });
        const clientNow = performance.now();
        setPracticeServerOffset(new Date(restored.serverNow).getTime() - clientNow);
        setPracticeClock(clientNow);
        practiceAutoSubmitRef.current = false;
        setTest({ ...restored, warnings: restored.warnings ?? [] });
        setActivePage("practice");
      })
      .catch((cause) => {
        if (cancelled) return;
        if (cause instanceof ApiRequestError && (cause.status === 404 || cause.status === 409)) {
          safeStorage.removeItem("arctester-active-practice-attempt");
          safeStorage.removeItem(practiceAnswersKey(attemptId));
        }
        setError(`Your previous practice attempt could not be restored: ${(cause as Error).message}`);
      });
    return () => { cancelled = true; };
  }, [user, test, result]);

  async function openStudentNotification(id: string) {
    const notification = studentNotifications.find((item) => item.id === id);
    if (!notification) return;
    await markNotificationRead(id);
    if (notification.href === "/assignments") {
      setActivePage("assigned-exams");
      return;
    }
    const resultMatch = notification.href.match(/^\/assignments\/([^/]+)\/result$/);
    if (resultMatch) {
      setActivePage("assigned-exams");
      void reviewAssignedExam(resultMatch[1]);
    }
  }

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    request<{ invitations: Invitation[] }>("/auth/invitations")
      .then(({ invitations: items }) => setInvitations(Array.isArray(items) ? items : []))
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

  async function startTest(mode: "mock" | "practice" | "mistakes", subject?: string, practiceConfig?: { subjects: string[]; topicFilters: { subject: string; topic: string }[]; count: number; difficulty: "any" | "easy" | "medium" | "hard" }) {
    if (mode === "practice" && !subject && (!practiceConfig || practiceConfig.subjects.length === 0)) {
      setError("Select at least one subject before creating your practice paper.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const created = await request<Test>("/tests", {
        method: "POST",
        body: JSON.stringify({ mode, ...(subject ? { subject } : {}), ...(practiceConfig ? { subjects: practiceConfig.subjects, topicFilters: practiceConfig.topicFilters, count: practiceConfig.count, difficulty: practiceConfig.difficulty } : mode === "practice" ? { count: 10 } : {}) }),
      });
      const previousAttemptId = safeStorage.getItem("arctester-active-practice-attempt");
      if (previousAttemptId) safeStorage.removeItem(practiceAnswersKey(previousAttemptId));
      const clientNow = performance.now();
      setPracticeServerOffset(new Date(created.serverNow ?? new Date().toISOString()).getTime() - clientNow);
      setPracticeClock(clientNow);
      setTest(created);
      setActivePage("practice");
      practiceAutoSubmitRef.current = false;
      safeStorage.setItem("arctester-active-practice-attempt", String(created.attemptId));
      safeStorage.setItem(practiceAnswersKey(created.attemptId), "{}");
      setAnswers({});
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function createStudentPracticePaper() {
    void startTest("practice", undefined, buildPracticeConfig(practiceSubjects, practiceTopicKeys, practiceQuestionCount, practiceDifficulty));
  }

  function selectPracticeAnswer(questionId: number, selectedIndex: number) {
    if (!test) return;
    const next = { ...answers, [questionId]: selectedIndex };
    setAnswers(next);
    if (!safeStorage.setItem(practiceAnswersKey(test.attemptId), JSON.stringify(next))) {
      setError("Browser storage is unavailable. Submit your practice test before closing this tab.");
    }
  }

  async function submitTest() {
    if (!test) return;
    setBusy(true);
    setError("");
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
      safeStorage.removeItem("arctester-active-practice-attempt");
      safeStorage.removeItem(practiceAnswersKey(test.attemptId));
      setTest(null);
    } catch (cause) {
      try {
        const recovered = await request<Result>(`/tests/${test.attemptId}/result`);
        setResult(recovered);
        safeStorage.removeItem("arctester-active-practice-attempt");
        safeStorage.removeItem(practiceAnswersKey(test.attemptId));
        setTest(null);
      } catch {
        setError((cause as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  submitPracticeTestRef.current = submitTest;

  // Synchronize saved answers when the same practice attempt is open in another tab.
  useEffect(() => {
    if (!test || result) return;
    const answerKey = practiceAnswersKey(test.attemptId);
    const validQuestions = new Map(test.questions.map((question) => [String(question.id), question]));
    const onStorage = (event: StorageEvent) => {
      if (event.key !== answerKey || !event.newValue) return;
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
        const incoming = Object.fromEntries(
          Object.entries(parsed).flatMap(([questionId, value]) => {
            const question = validQuestions.get(questionId);
            if (!question || !Number.isInteger(value) || Number(value) < 0 || Number(value) >= question.options.length) {
              return [];
            }
            return [[Number(questionId), Number(value)] as const];
          }),
        );
        setAnswers((current) => ({ ...current, ...incoming }));
      } catch {
        // Ignore malformed updates from another tab; local answers remain usable.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [test, result]);

  // Keep practice/mock timers monotonic and synchronize them to the API clock.
  useEffect(() => {
    if (!test || result || !test.deadline) return;
    setPracticeClock(performance.now());
    const timer = window.setInterval(() => setPracticeClock(performance.now()), 1000);
    const onVisibilityChange = () => setPracticeClock(performance.now());
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [test, result]);

  const practiceDeadline = test?.deadline ? new Date(test.deadline).getTime() : Number.POSITIVE_INFINITY;
  const practiceRemainingSeconds = getRemainingPracticeSeconds(practiceDeadline, practiceClock, practiceServerOffset);

  useEffect(() => {
    if (!test || result || practiceRemainingSeconds === null ||
        practiceRemainingSeconds > 0 || practiceAutoSubmitRef.current || busy) return;
    practiceAutoSubmitRef.current = true;
    void submitPracticeTestRef.current();
  }, [test, result, practiceRemainingSeconds, busy]);

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await request("/auth/logout", { method: "POST" });
    } catch (cause) {
      setError(`Secure sign-out failed. Your server session may still be active. ${(cause as Error).message}`);
      setBusy(false);
      return;
    }
    setUser(null);
    clearLocalExamBackupsOnLogout();
    setBank(null);
    const activePracticeId = safeStorage.getItem("arctester-active-practice-attempt");
    if (activePracticeId) safeStorage.removeItem(practiceAnswersKey(activePracticeId));
    safeStorage.removeItem("arctester-active-practice-attempt");
    setTest(null);
    setResult(null);
    setAnswers({});
    clearStudentCommunications();
    setInvitations([]);
    setPracticeSubjects([]);
    setPracticeTopicKeys([]);
    setPracticeQuestionCount(20);
    setPracticeDifficulty("any");
    setCreatedInvitation(null);
    setInviteEmail("");
    setError("");
    setActivePage("dashboard");
    setBusy(false);
  }

  if (!user) {
    return (
      <AuthScreen
        email={email}
        password={password}
        invitationToken={invitationToken}
        register={register}
        busy={busy}
        error={error}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onInvitationTokenChange={setInvitationToken}
        onRegisterChange={setRegister}
        onAuthenticate={() => void authenticate()}
      />
    );
  }

  if (user.role === "ADMIN") {
    return <AdminWorkspace
      email={user.email}
      theme={theme}
      setTheme={setTheme}
      signOut={signOut}
      invitations={invitations}
      createInvitation={createInvitation}
      inviteEmail={inviteEmail}
      setInviteEmail={setInviteEmail}
      createdInvitation={createdInvitation}
      revokeInvitation={revokeInvitation}
      busy={busy}
    />;
  }

  return (
    <div className="app-shell student-shell">
      <StudentNavigation
        activePage={activePage}
        setActivePage={setActivePage}
        examActive={Boolean(exam.package)}
        pendingExamCount={assignedExams.filter((item) => !item.submission).length}
        unreadAnnouncementCount={announcements.filter((item) => !item.seenAt).length}
        unreadNotificationCount={unreadNotificationCount}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === "light" ? "dark" : "light")}
        email={user.email}
        busy={busy}
        onSignOut={signOut}
      />

      {user.role === "STUDENT" && !test && !result && !exam.package && announcements.some((item) => !item.seenAt) ? (() => {
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
        <OnlineStatusBanner />
        {exam.package ? (
          <AssignedExamSession
            package={exam.package}
            answers={exam.answers}
            saveStatus={exam.saveStatus}
            paused={exam.paused}
            remainingSeconds={exam.remainingSeconds}
            busy={exam.busy}
            error={exam.error}
            selectAssignedAnswer={exam.selectAssignedAnswer}
            submitAssignedExam={exam.submitAssignedExam}
            studentName={user?.email ?? null}
            studentId={String(user?.id ?? null)}
          />
        ) : activePage === "practice" && test ? (
          <StudentPracticeSession
            test={test}
            answers={answers}
            remainingSeconds={practiceRemainingSeconds}
            busy={busy}
            onLeave={() => setActivePage("dashboard")}
            onSelectAnswer={selectPracticeAnswer}
            onSubmit={() => void submitTest()}
          />
        ) : activePage === "practice" && result ? (
          <StudentPracticeResults result={result} onBack={() => setResult(null)} />
        ) : activePage === "assigned-exams" ? (
          <section className="assigned-exams-page">
            <div className="page-heading"><div><p className="eyebrow">EXAM CENTRE</p><h1>Assigned exams</h1><p className="muted">Exams assigned to your account by the administrator.</p></div><button className="ghost" disabled={busy} onClick={() => void refreshAssignedExams()}>Refresh</button></div>
            {assignedExams.length === 0 ? <div className="panel empty-state"><h2>No assigned exams</h2><p className="muted">When an administrator assigns an exam, it will appear here.</p></div> : assignedExams.map((item) => {
              const unavailable = item.availableFrom && new Date(item.availableFrom).getTime() > Date.now();
              const expired = item.dueAt && new Date(item.dueAt).getTime() < Date.now();
              return <article className="panel assigned-exam-card" key={item.id}>
                <div className="admin-exam-meta"><div><strong>{item.exam.title}</strong><p className="muted">{item.exam.description || "No description"} · Version {item.version} · {item.questionCount} questions · {item.durationMinutes} min</p></div><span className={item.submission ? "status status-used" : expired ? "status status-expired" : "status status-pending"}>{item.submission ? "SUBMITTED" : expired ? "EXPIRED" : unavailable ? "UPCOMING" : "READY"}</span></div>
                <div className="assigned-exam-dates"><small>Available: {item.availableFrom ? new Date(item.availableFrom).toLocaleString() : "Immediately"}</small><small>Deadline: {item.dueAt ? new Date(item.dueAt).toLocaleString() : "No deadline"}</small></div>
                {item.submission ? <><p className="muted">Submitted {new Date(item.submission.submittedAt).toLocaleString()} · {item.submission.status === "REVIEW_REQUIRED" || item.submission.score === null ? "Awaiting administrator review. Your result will appear after approval." : `Score: ${item.submission.score ?? "Pending"} / ${item.submission.maximumScore ?? "—"}`}</p>{item.submission.status !== "REVIEW_REQUIRED" && item.submission.score !== null && <button type="button" className="ghost" disabled={busy} onClick={() => void reviewAssignedExam(item.id)}>Review answers</button>}{assignmentResultForId === item.id && assignmentResult && <div className="assigned-result-review"><h3>Answer review</h3><p>{assignmentResult.score === null ? <strong>Awaiting invigilator review</strong> : <strong>{assignmentResult.score} / {assignmentResult.maximumScore ?? "—"}</strong>} · {assignmentResult.status}</p>{assignmentResult.questions.map((question) => <article className="question-review-row" key={question.id}><strong>Q{question.position + 1}. {question.text}</strong><p className={question.isCorrect ? "success" : "error"}>{question.selectedIndex === null ? "Not answered" : question.isCorrect ? "Correct" : "Incorrect"} · {question.awardedMarks} marks</p><p><strong>Correct answer:</strong> {question.options[question.correctIndex]}</p><p className="muted">{question.explanation || "No explanation provided."}</p></article>)}</div>}</> : <button className="primary" disabled={busy || Boolean(unavailable) || Boolean(expired)} onClick={() => void exam.startAssignedExam(item.id)}>{unavailable ? "Not available yet" : expired ? "Deadline passed" : "Start examination"}</button>}
              </article>;
            })}
          </section>
        ) : activePage === "notifications" ? (
          <StudentNotificationsInbox
            items={studentNotifications}
            onRefresh={() => void refreshNotifications().catch((cause) => setError((cause as Error).message))}
            onRead={(id) => void markNotificationRead(id)}
            onOpen={(id) => void openStudentNotification(id)}
          />
        ) : activePage === "announcements" ? (
          <StudentAnnouncementsInbox
            items={announcements}
            onRefresh={() => void refreshAnnouncements().catch((cause) => setError((cause as Error).message))}
            onAcknowledge={(id) => void acknowledgeAnnouncement(id)}
          />
        ) : activePage === "analytics" ? (
          <StudentAnalytics setActivePage={setActivePage} />
        ) : activePage === "learning" ? (
          <StudentLearning setActivePage={setActivePage} />
        ) : activePage === "materials" ? (
          <StudentMaterials setActivePage={setActivePage} />
        ) : (
          <>
            <StudentDashboardWelcome visible={activePage === "dashboard"} onNavigate={setActivePage} pendingExamCount={assignedExams.filter((item) => !item.submission).length} unreadAnnouncementCount={announcements.filter((item) => !item.seenAt).length} unreadNotificationCount={unreadNotificationCount} questionCount={bank?.total ?? 0} subjectCount={bank?.subjects.length ?? 0} />
            {activePage === "dashboard" && announcements.length > 0 ? (
              <StudentAnnouncementPreview
                announcement={announcements[0]}
                announcementCount={announcements.length}
                onViewAll={() => setActivePage("announcements")}
              />
            ) : null}
            {activePage === "dashboard" ? <DashboardProgressSummary onOpenProgress={() => setActivePage("progress")} /> : null}
            {activePage === "dashboard" ? (
              <StudentAssignedExamPreview
                assignments={assignedExams}
                onViewAll={() => setActivePage("assigned-exams")}
              />
            ) : null}
            {activePage === "dashboard" && test ? (
              <StudentPracticeResumePreview
                answeredCount={Object.keys(answers).length}
                totalQuestions={test.questions.length}
                onResume={() => setActivePage("practice")}
              />
            ) : null}
            <StudentQuestionBankStats bank={bank} visible={activePage === "dashboard"} />
            <section hidden={activePage !== "practice"} id="practice">
              <div className="section-head">
                <div>
                  <p className="eyebrow">GET STARTED</p>
                  <h2>Choose your practice</h2>
                </div>
              </div>
              <div className="practice-builder-grid">
                <article className="panel practice-builder">
                  <div className="practice-builder-title"><div><span className="action-icon">◎</span><h3>Create your question paper</h3><p className="muted">Choose subjects first. Topic selection is optional and only filters the subjects you choose.</p></div><span className="status status-used">CUSTOM PAPER</span></div>
                  <StudentPracticeSubjectTopicFilters
                    subjects={bank?.subjects ?? []}
                    showEmptyMessage={!bank || bank.subjects.length === 0}
                    selectedSubjects={practiceSubjects}
                    selectedTopicKeys={practiceTopicKeys}
                    onSubjectsChange={setPracticeSubjects}
                    onTopicKeysChange={setPracticeTopicKeys}
                    onError={setError}
                  />
                  <StudentPracticePaperConfiguration
                    selectedSubjects={practiceSubjects}
                    questionCount={practiceQuestionCount}
                    difficulty={practiceDifficulty}
                    onQuestionCountChange={setPracticeQuestionCount}
                    onDifficultyChange={setPracticeDifficulty}
                  />
                  <div className="practice-builder-footer"><span className="muted">Your paper will use your selected filters.</span><button className="primary" disabled={busy || practiceSubjects.length === 0 || !bank?.total} onClick={createStudentPracticePaper}>{busy ? "Building paper…" : "Create " + practiceQuestionCount + "-question paper"}</button></div>
                </article>
                <StudentPracticeQuickActions
                  disabled={busy}
                  onStartMock={() => void startTest("mock")}
                  onReviewMistakes={() => void startTest("mistakes")}
                />
              </div>
            </section>
            {activePage === "progress" ? <StudentProgress /> : null}
            <StudentQuestionBankBrowser
              subjects={bank?.subjects ?? []}
              visible={activePage === "question-bank"}
              disabled={busy}
              onChooseSubject={(subject) => void startTest("practice", subject)}
            />
          </>
        )}
        {error && <p className="error">{error}</p>}
      {activePage !== "notifications" && !exam.package && !test && !result && studentNotifications.find((item) => !item.readAt) && (
        <StudentNotificationBanner
          notification={studentNotifications.find((item) => !item.readAt)!}
          onRead={(id) => void markNotificationRead(id)}
          onOpen={(notification) => void openStudentNotification(notification.id)}
        />
      )}
      </main>
      {activeAnnouncements[0] && (
        <StudentAnnouncementDialog
          announcement={activeAnnouncements[0]}
          onAcknowledge={(id) => void dismissAnnouncement(id)}
        />
      )}
    </div>
  );
}
