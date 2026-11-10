import { useEffect, useRef, useState } from "react";
import { mergeAssignedExamAnswers } from "../lib/answerRecovery";
import { classifyAssignmentHeartbeatFailure } from "./assignedExamHeartbeat";
import { safeStorage } from "./safeStorage";
import { bindLocalExamBackupOwner, clearLocalExamBackupsOnLogout } from "./localExamBackup";
import type { FormEvent } from "react";
import AdminWorkspace from "./AdminWorkspace";
import StudentNavigation, { type StudentPage } from "./StudentNavigation";
import StudentAnnouncementDialog from "./StudentAnnouncementDialog";
import StudentProgress, { DashboardProgressSummary } from "./StudentProgress";

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
  serverNow?: string;
  questions: Question[];
  warnings: string[];
};
type RestoredTest = Omit<Test, "warnings"> & { warnings?: string[]; serverNow: string; saved: { questionId: number; selectedIndex: number | null }[] };
function practiceAnswersKey(attemptId: number | string): string { return `arctester-practice-answers-${attemptId}`; }
function assignedAnswersKey(assignmentId: string): string { return `arctester-assignment-answers-${assignmentId}`; }
function assignedAttemptKey(assignmentId: string): string { return `arctester-assigned-attempt-${assignmentId}`; }
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
  const existing = safeStorage.getItem(key);
  if (existing) return existing;
  const fingerprint =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  safeStorage.setItem(key, fingerprint);
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
  const [activeAnnouncements, setActiveAnnouncements] = useState<Announcement[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null);
  const [assignedExams, setAssignedExams] = useState<AssignedExam[]>([]);
  const [assignmentResult, setAssignmentResult] = useState<AssignedExamResult | null>(null);
  const [assignmentResultForId, setAssignmentResultForId] = useState<string | null>(null);
  const [activeAssignmentPackage, setActiveAssignmentPackage] = useState<AssignedExamPackage | null>(null);
  const [assignmentAnswers, setAssignmentAnswers] = useState<Record<string, number>>({});
  const [assignmentStartedAt, setAssignmentStartedAt] = useState<string | null>(null);
  const [assignmentDeadline, setAssignmentDeadline] = useState<string | null>(null);
  const [assignmentServerOffset, setAssignmentServerOffset] = useState(0);
  const [assignmentSessionPaused, setAssignmentSessionPaused] = useState(false);
  const [assignmentClock, setAssignmentClock] = useState(0);
  const [assignmentAutoSubmitTriggered, setAssignmentAutoSubmitTriggered] = useState(false);
  const assignmentConnectionLostRef = useRef(false);
  const [practiceSubjects, setPracticeSubjects] = useState<string[]>([]);
  const [practiceTopicKeys, setPracticeTopicKeys] = useState<string[]>([]);
  const [practiceQuestionCount, setPracticeQuestionCount] = useState(20);
  const [practiceDifficulty, setPracticeDifficulty] = useState<"any" | "easy" | "medium" | "hard">("any");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
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
  const [assignmentSaveStatus, setAssignmentSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const assignmentSaveSequenceRef = useRef(0);
  const assignmentSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const assignmentAnswersRevisionRef = useRef(0);
  const effectiveAssignmentDeadline = Math.min(
    assignmentDeadline ? new Date(assignmentDeadline).getTime() : Number.POSITIVE_INFINITY,
    activeAssignmentPackage?.dueAt ? new Date(activeAssignmentPackage.dueAt).getTime() : Number.POSITIVE_INFINITY,
  );
  const assignmentRemainingSeconds = Number.isFinite(effectiveAssignmentDeadline)
    ? Math.max(0, Math.ceil((effectiveAssignmentDeadline - (assignmentClock + assignmentServerOffset)) / 1000))
    : 0;
  const practiceDeadline = test?.deadline ? new Date(test.deadline).getTime() : Number.POSITIVE_INFINITY;
  const practiceRemainingSeconds = Number.isFinite(practiceDeadline)
    ? Math.max(0, Math.ceil((practiceDeadline - (practiceClock + practiceServerOffset)) / 1000))
    : null;
  const [activePage, setActivePage] = useState<StudentPage>("dashboard");
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
        bindLocalExamBackupOwner(current.id);
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
        fingerprint: browserDeviceFingerprint(),
      }),
    }).catch((cause) => setError((cause as Error).message));
    request<Bank>("/bank")
      .then(setBank)
      .catch((cause) => setError((cause as Error).message));
  }, [user]);

  useEffect(() => {
    if (user?.role !== "STUDENT") {
      setActiveAnnouncements([]);
      return;
    }
    request<{ announcements: Announcement[] }>("/announcements/active")
      .then(({ announcements }) => setActiveAnnouncements(Array.isArray(announcements) ? announcements : []))
      .catch((cause) => setError((cause as Error).message));
  }, [user]);

  useEffect(() => {
    if (user?.role !== "STUDENT" || !["dashboard", "announcements"].includes(activePage)) return;
    request<{ announcements: Announcement[] }>("/announcements")
      .then(({ announcements: items }) => setAnnouncements(Array.isArray(items) ? items : []))
      .catch((cause) => setError((cause as Error).message));
  }, [user, activePage]);

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
        // A stale local attempt must not prevent the student from using the app.
        safeStorage.removeItem("arctester-active-practice-attempt");
        setError(`Your previous practice attempt could not be restored: ${(cause as Error).message}`);
      });
    return () => { cancelled = true; };
  }, [user, test, result]);

  async function dismissAnnouncement(id: string) {
    try {
      await request("/announcements/" + id + "/read", { method: "POST" });
      setActiveAnnouncements((items) => items.filter((item) => item.id !== id));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    request<{ invitations: Invitation[] }>("/auth/invitations")
      .then(({ invitations: items }) => setInvitations(Array.isArray(items) ? items : []))
      .catch((cause) => setError((cause as Error).message));
  }, [user]);

  async function refreshAssignedExams() {
    try {
      const response = await request<{ assignments: AssignedExam[] }>("/exams/assigned");
      setAssignedExams(Array.isArray(response.assignments) ? response.assignments : []);
    } catch (cause) {
      setError((cause as Error).message);
    }
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
      const serverSaved = await request<{ revision: number; answers: { examQuestionId: string; selectedIndex: number | null }[] }>(
        `/exams/assignments/${assignmentId}/answers`,
      );
      let restoredAnswers: Record<string, number> = {};
      try {
        const cached = JSON.parse(safeStorage.getItem(assignedAnswersKey(assignmentId)) ?? "{}") as Record<string, unknown>;
        const validQuestionIds = new Set(response.package.questions.map((question) => question.id));
        restoredAnswers = Object.fromEntries(Object.entries(cached).flatMap(([id, value]) => {
          const questionId = id;
          return validQuestionIds.has(questionId) && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3 ? [[questionId, Number(value)] as const] : [];
        }));
      } catch { safeStorage.removeItem(assignedAnswersKey(assignmentId)); }
      assignmentAnswersRevisionRef.current = serverSaved.revision ?? 0;
      const serverAnswers = Object.fromEntries(serverSaved.answers.flatMap((answer) =>
        answer.selectedIndex === null ? [] : [[answer.examQuestionId, answer.selectedIndex] as const]
      ));
      restoredAnswers = mergeAssignedExamAnswers(serverAnswers, restoredAnswers);
      setAssignmentSaveStatus(serverSaved.answers.length > 0 ? "saved" : "idle");
      setActiveAssignmentPackage(response.package);
      setAssignmentAnswers(restoredAnswers);
      setAssignmentStartedAt(sessionResponse.session.startedAt);
      setAssignmentDeadline(sessionResponse.session.deadline);
      setAssignmentServerOffset(new Date(sessionResponse.session.serverTime).getTime() - performance.now());
      setAssignmentSessionPaused(false);
      setAssignmentClock(performance.now());
      setAssignmentAutoSubmitTriggered(false);
      assignmentConnectionLostRef.current = false;
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  // Drive the candidate countdown from the server deadline and a server/client clock offset.
  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAt || assignmentSessionPaused) return;
    setAssignmentClock(performance.now());
    const timer = window.setInterval(() => setAssignmentClock(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeAssignmentPackage, assignmentStartedAt, assignmentSessionPaused]);

  // Keep the server-owned session alive and report focus/reconnection events.
  // Transient network failures do not pause the candidate timer; only an explicit
  // server response that the session is unavailable/paused does.
  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAt) return;
    const assignmentId = activeAssignmentPackage.assignmentId;
    let disposed = false;
    let heartbeatInFlight = false;
    const sendHeartbeat = async (event: "HEARTBEAT" | "FOCUS_LOST" | "FOCUS_RESTORED" | "CONNECTION_RESTORED") => {
      if (disposed || heartbeatInFlight) return;
      heartbeatInFlight = true;
      try {
        const heartbeat = await request<{ serverTime: string; deadline: string | null; sessionStatus: string }>(
          `/exams/assignments/${encodeURIComponent(assignmentId)}/session/heartbeat`,
          { method: "POST", body: JSON.stringify({ event }) },
        );
        if (disposed) return;
        setAssignmentServerOffset(new Date(heartbeat.serverTime).getTime() - performance.now());
        if (heartbeat.deadline) setAssignmentDeadline(heartbeat.deadline);
        setAssignmentSessionPaused(heartbeat.sessionStatus !== "ACTIVE");
        assignmentConnectionLostRef.current = false;
      } catch (cause) {
        if (disposed) return;
        const message = (cause as Error).message;
        const failure = classifyAssignmentHeartbeatFailure(message);
        if (failure === "paused") setAssignmentSessionPaused(true);
        if (failure === "transient") assignmentConnectionLostRef.current = true;
        // Deadline failures intentionally leave the timer running so the client
        // can submit its locally saved answers for server-side review.
      } finally {
        heartbeatInFlight = false;
      }
    };
    const interval = window.setInterval(() => {
      void sendHeartbeat(assignmentConnectionLostRef.current ? "CONNECTION_RESTORED" : "HEARTBEAT");
    }, 15000);
    const onVisibilityChange = () => {
      if (document.hidden) {
        void sendHeartbeat("FOCUS_LOST");
      } else {
        void sendHeartbeat(assignmentConnectionLostRef.current ? "CONNECTION_RESTORED" : "FOCUS_RESTORED");
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeAssignmentPackage, assignmentStartedAt]);

  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAt || assignmentSessionPaused ||
        assignmentRemainingSeconds > 0 || assignmentAutoSubmitTriggered || busy) return;
    setAssignmentAutoSubmitTriggered(true);
    void submitAssignedExam(true);
  }, [activeAssignmentPackage, assignmentStartedAt, assignmentSessionPaused, assignmentRemainingSeconds, assignmentAutoSubmitTriggered, busy]);

  // Keep assigned-exam answers in sync when the same session is open in another tab.
  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAt) return;
    const answerKey = assignedAnswersKey(activeAssignmentPackage.assignmentId);
    const validQuestions = new Map(activeAssignmentPackage.questions.map((question) => [question.id, question]));
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
            return [[questionId, Number(value)] as const];
          }),
        );
        setAssignmentAnswers((current) => ({ ...current, ...incoming }));
      } catch {
        // Ignore malformed updates; the current tab's answers remain available.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [activeAssignmentPackage, assignmentStartedAt]);

  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAt || assignmentSessionPaused || Object.keys(assignmentAnswers).length === 0) return;
    const assignmentId = activeAssignmentPackage.assignmentId;
    const saveVersion = ++assignmentSaveSequenceRef.current;
    setAssignmentSaveStatus("saving");
    const timer = window.setTimeout(() => {
      // Serialize saves so an older, slower request cannot overwrite newer answers.
      const save = assignmentSaveQueueRef.current.catch(() => undefined).then(async () => {
        const saved = await request<{ revision: number }>(`/exams/assignments/${assignmentId}/answers`, {
          method: "PUT",
          body: JSON.stringify({
            revision: assignmentAnswersRevisionRef.current,
            answers: activeAssignmentPackage.questions.map((question) => ({
              examQuestionId: question.id,
              selectedIndex: assignmentAnswers[question.id] ?? null,
            })),
          }),
        });
        assignmentAnswersRevisionRef.current = saved.revision;
        if (assignmentSaveSequenceRef.current === saveVersion) setAssignmentSaveStatus("saved");
      }).catch(async (cause) => {
        if (assignmentSaveSequenceRef.current !== saveVersion) return;
        const message = (cause as Error).message;
        if (message.includes("changed in another session")) {
          try {
            const latest = await request<{ revision: number; answers: { examQuestionId: string; selectedIndex: number | null }[] }>(
              `/exams/assignments/${encodeURIComponent(assignmentId)}/answers`,
            );
            if (assignmentSaveSequenceRef.current !== saveVersion) return;
            assignmentAnswersRevisionRef.current = latest.revision;
            const serverAnswers = Object.fromEntries(
              latest.answers.flatMap((answer) => answer.selectedIndex === null
                ? []
                : [[answer.examQuestionId, answer.selectedIndex] as const]),
            );
            const mergedAnswers = { ...serverAnswers, ...assignmentAnswers };
            safeStorage.setItem(assignedAnswersKey(assignmentId), JSON.stringify(mergedAnswers));
            setAssignmentAnswers(mergedAnswers);
            setAssignmentSaveStatus("saving");
            return;
          } catch (recoveryError) {
            setError(`Autosave conflict recovery failed: ${(recoveryError as Error).message}. Your local backup is still available.`);
          }
        }
        setAssignmentSaveStatus("error");
        setError(`Server autosave failed: ${message}. Your local backup is still available.`);
      });
      assignmentSaveQueueRef.current = save.then(() => undefined);
    }, 450);
    return () => {
      window.clearTimeout(timer);
      if (assignmentSaveSequenceRef.current === saveVersion) assignmentSaveSequenceRef.current += 1;
    };
  }, [activeAssignmentPackage, assignmentStartedAt, assignmentSessionPaused, assignmentAnswers]);

  function selectAssignedAnswer(questionId: string, selectedIndex: number) {
    if (!activeAssignmentPackage) return;
    const next = { ...assignmentAnswers, [questionId]: selectedIndex };
    setAssignmentAnswers(next);
    if (!safeStorage.setItem(assignedAnswersKey(activeAssignmentPackage.assignmentId), JSON.stringify(next))) {
      setError("Browser storage is unavailable. Keep this exam tab open until you submit; server autosave will continue.");
    }
  }

  async function submitAssignedExam(force = false) {
    if (!activeAssignmentPackage || !assignmentStartedAt) return;
    if (!force && !window.confirm("Submit this exam now? You cannot change answers after submission.")) return;
    setBusy(true);
    setError("");
    try {
      // Drain the autosave queue so the final submit carries the latest server revision.
      await assignmentSaveQueueRef.current.catch(() => undefined);
      const attemptKey = assignedAttemptKey(activeAssignmentPackage.assignmentId);
      let attemptUuid = safeStorage.getItem(attemptKey);
      if (!attemptUuid) {
        attemptUuid = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
              const random = Math.floor(Math.random() * 16);
              return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
            });
        safeStorage.setItem(attemptKey, attemptUuid);
      }
      await request(`/exams/assignments/${activeAssignmentPackage.assignmentId}/submission`, {
        method: "POST",
        body: JSON.stringify({
          revision: assignmentAnswersRevisionRef.current,
          attemptUuid,
          startedAt: assignmentStartedAt,
          submittedAt: new Date().toISOString(),
          answers: activeAssignmentPackage.questions.map((question) => ({
            examQuestionId: question.id,
            selectedIndex: assignmentAnswers[question.id] ?? null,
          })),
        }),
      });
      safeStorage.removeItem(attemptKey);
      safeStorage.removeItem(assignedAnswersKey(activeAssignmentPackage.assignmentId));
      setActiveAssignmentPackage(null);
      setAssignmentStartedAt(null);
      setAssignmentDeadline(null);
      setAssignmentSessionPaused(false);
      setAssignmentAnswers({});
      setAssignmentSaveStatus("idle");
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
        bindLocalExamBackupOwner(session.user.id);
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
    const topicFilters = practiceTopicKeys.flatMap((key) => {
      try { const parsed = JSON.parse(key) as [string, string]; return [{ subject: parsed[0], topic: parsed[1] }]; }
      catch { return []; }
    });
    void startTest("practice", undefined, { subjects: practiceSubjects, topicFilters, count: practiceQuestionCount, difficulty: practiceDifficulty });
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
    clearLocalExamBackupsOnLogout();
    setUser(null);
    setBank(null);
    const activePracticeId = safeStorage.getItem("arctester-active-practice-attempt");
    if (activePracticeId) safeStorage.removeItem(practiceAnswersKey(activePracticeId));
    safeStorage.removeItem("arctester-active-practice-attempt");
    setTest(null);
    setResult(null);
    setAnswers({});
    setAssignmentAnswers({});
    if (activeAssignmentPackage) {
      safeStorage.removeItem(assignedAnswersKey(activeAssignmentPackage.assignmentId));
      safeStorage.removeItem(assignedAttemptKey(activeAssignmentPackage.assignmentId));
    }
    setActiveAssignmentPackage(null);
    setAssignmentStartedAt(null);
    setAssignmentDeadline(null);
    setAssignmentSessionPaused(false);
    setAssignmentResult(null);
    setAssignmentResultForId(null);
    setAssignedExams([]);
    setAnnouncements([]);
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
    <div className="app-shell">
      <StudentNavigation
        activePage={activePage}
        setActivePage={setActivePage}
        examActive={Boolean(activeAssignmentPackage)}
        pendingExamCount={assignedExams.filter((item) => !item.submission).length}
        unreadAnnouncementCount={announcements.filter((item) => !item.seenAt).length}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === "light" ? "dark" : "light")}
        email={user.email}
        busy={busy}
        onSignOut={signOut}
      />

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
            <div className="page-heading"><div><p className="eyebrow">OFFICIAL ASSIGNED EXAM · VERSION {activeAssignmentPackage.version}</p><h1>{activeAssignmentPackage.title}</h1><p className="muted">{activeAssignmentPackage.questions.length} questions · {activeAssignmentPackage.durationMinutes} minutes · <strong className={assignmentSessionPaused || assignmentRemainingSeconds < 300 ? "timer-warning" : "exam-countdown"}>{Math.floor(assignmentRemainingSeconds / 60).toString().padStart(2, "0")}:{(assignmentRemainingSeconds % 60).toString().padStart(2, "0")} remaining</strong></p></div><button className="ghost" disabled={busy} onClick={() => { if (window.confirm("Leave this exam? Your answers are saved on this device and synced to the server while online. You can reopen the exam and continue while time remains.")) { setActiveAssignmentPackage(null); setAssignmentStartedAt(null); setAssignmentDeadline(null); setAssignmentSessionPaused(false); setAssignmentAutoSubmitTriggered(false); } }}>Leave exam</button></div>
            {assignmentSessionPaused && <p className="notice session-paused" role="status">Session paused or awaiting invigilator action. The server-controlled timer is held.</p>}
            {activeAssignmentPackage.instructions && <div className="panel exam-instructions"><strong>Instructions</strong><p>{activeAssignmentPackage.instructions}</p></div>}
            {activeAssignmentPackage.dueAt && <p className="notice">Submission deadline: {new Date(activeAssignmentPackage.dueAt).toLocaleString()}</p>}
            <section className="panel exam-question-navigator" aria-label="Question navigator"><div className="exam-progress-heading"><strong>Question progress</strong><span>{Object.keys(assignmentAnswers).length} / {activeAssignmentPackage.questions.length} answered</span></div><div className="exam-progress-track"><span style={{ width: `${activeAssignmentPackage.questions.length ? Object.keys(assignmentAnswers).length / activeAssignmentPackage.questions.length * 100 : 0}%` }} /></div><div className="exam-palette">{activeAssignmentPackage.questions.map((question, index) => <button type="button" key={question.id} disabled={assignmentSessionPaused} aria-label={`Go to question ${index + 1}${assignmentAnswers[question.id] !== undefined ? ", answered" : ", unanswered"}`} className={assignmentAnswers[question.id] !== undefined ? "exam-palette-item answered" : "exam-palette-item"} onClick={() => document.getElementById(`assigned-question-${question.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{index + 1}</button>)}</div></section>
            <div className="assigned-exam-question-list">{activeAssignmentPackage.questions.map((question, index) => <article id={`assigned-question-${question.id}`} className="panel question-card" key={question.id}><p className="eyebrow">QUESTION {index + 1} · {question.subject}{question.topic ? ` · ${question.topic}` : ""}</p><h2>{question.text}</h2><div className="options">{question.options.map((option, optionIndex) => <button type="button" key={optionIndex} disabled={assignmentSessionPaused} className={assignmentAnswers[question.id] === optionIndex ? "option selected" : "option"} onClick={() => selectAssignedAnswer(question.id, optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div><small className="muted">+{question.marks} marks · −{question.negativeMarks} for a wrong answer</small></article>)}</div>
            <div className="assigned-exam-submit"><span className="muted">{Object.keys(assignmentAnswers).length} of {activeAssignmentPackage.questions.length} answered</span><small className={`autosave-status autosave-${assignmentSaveStatus}`}>{assignmentSaveStatus === "saving" ? "Saving to server…" : assignmentSaveStatus === "saved" ? "All answers synced" : assignmentSaveStatus === "error" ? "Sync failed · local backup saved" : "Local backup active"}</small><button className="primary" disabled={busy || assignmentSessionPaused} onClick={() => void submitAssignedExam()}>{assignmentSessionPaused ? "Waiting for invigilator" : busy ? "Submitting…" : "Submit final answers"}</button></div>
          </section>
        ) : activePage === "practice" && test ? (
          <section>
            <div className="page-heading">
              <div>
                <p className="eyebrow">PRACTICE SESSION</p>
                <h1>Stay focused.</h1>
                <p className="muted">
                  {test.questions.length} questions · {Object.keys(answers).length} answered
                  {practiceRemainingSeconds !== null ? <> · <strong className={practiceRemainingSeconds < 300 ? "timer-warning" : "exam-countdown"}>{Math.floor(practiceRemainingSeconds / 60).toString().padStart(2, "0")}:{(practiceRemainingSeconds % 60).toString().padStart(2, "0")} remaining</strong></> : null}
                </p>
              </div>
              <button className="ghost" onClick={() => setActivePage("dashboard")}>
                Leave session
              </button>
            </div>
            {test.warnings.map((warning) => (
              <p className="notice" key={warning}>
                {warning}
              </p>
            ))}
            <section className="panel exam-question-navigator" aria-label="Practice question navigator"><div className="exam-progress-heading"><strong>Question progress</strong><span>{Object.keys(answers).length} / {test.questions.length} answered</span></div><div className="exam-progress-track"><span style={{ width: `${test.questions.length ? Object.keys(answers).length / test.questions.length * 100 : 0}%` }} /></div><div className="exam-palette">{test.questions.map((question, index) => <button type="button" key={question.id} aria-label={`Go to question ${index + 1}${answers[question.id] !== undefined ? ", answered" : ", unanswered"}`} className={answers[question.id] !== undefined ? "exam-palette-item answered" : "exam-palette-item"} onClick={() => document.getElementById(`practice-question-${question.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{index + 1}</button>)}</div></section>
            <div className="question-list">
              {test.questions.map((question, index) => (
                <article id={`practice-question-${question.id}`} className="panel question-card" key={question.id}>
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
                          selectPracticeAnswer(question.id, optionIndex)
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
                <p className={question.selectedIndex === null ? "muted" : question.isCorrect ? "success" : "error"}>
                  {question.selectedIndex === null ? "Not answered" : question.isCorrect ? "Correct" : "Incorrect"}
                </p>
                <p><strong>Your answer:</strong> {question.selectedIndex === null ? "Not answered" : question.options[question.selectedIndex]}</p>
                <p><strong>Correct answer:</strong> {question.options[question.correctIndex]}</p>
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
                {item.submission ? <><p className="muted">Submitted {new Date(item.submission.submittedAt).toLocaleString()} · {item.submission.status === "REVIEW_REQUIRED" ? "Awaiting administrator review. Your result will appear after approval." : `Score: ${item.submission.score ?? "Pending"} / ${item.submission.maximumScore ?? "—"}`}</p>{item.submission.status !== "REVIEW_REQUIRED" && <button type="button" className="ghost" disabled={busy} onClick={() => void reviewAssignedExam(item.id)}>Review answers</button>}{assignmentResultForId === item.id && assignmentResult && <div className="assigned-result-review"><h3>Answer review</h3><p><strong>{assignmentResult.score ?? "Pending"} / {assignmentResult.maximumScore ?? "—"}</strong> · {assignmentResult.status}</p>{assignmentResult.questions.map((question) => <article className="question-review-row" key={question.id}><strong>Q{question.position + 1}. {question.text}</strong><p className={question.isCorrect ? "success" : "error"}>{question.selectedIndex === null ? "Not answered" : question.isCorrect ? "Correct" : "Incorrect"} · {question.awardedMarks} marks</p><p><strong>Correct answer:</strong> {question.options[question.correctIndex]}</p><p className="muted">{question.explanation || "No explanation provided."}</p></article>)}</div>}</> : <button className="primary" disabled={busy || Boolean(unavailable) || Boolean(expired)} onClick={() => void startAssignedExam(item.id)}>{unavailable ? "Not available yet" : expired ? "Deadline passed" : "Start examination"}</button>}
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
            {activePage === "dashboard" ? <DashboardProgressSummary onOpenProgress={() => setActivePage("progress")} /> : null}
            {activePage === "dashboard" && assignedExams.some((item) => !item.submission) ? (
              <section className="panel student-notice-preview" aria-labelledby="upcoming-exams-title">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">EXAM CENTRE</p>
                    <h2 id="upcoming-exams-title">Your assigned exams</h2>
                    <p className="muted">{assignedExams.filter((item) => !item.submission).length} exam{assignedExams.filter((item) => !item.submission).length === 1 ? "" : "s"} awaiting submission</p>
                  </div>
                  <button type="button" className="ghost" onClick={() => setActivePage("assigned-exams")}>View all exams →</button>
                </div>
                <div className="grid two">
                  {assignedExams.filter((item) => !item.submission).slice(0, 3).map((item) => {
                    const unavailable = item.availableFrom && new Date(item.availableFrom).getTime() > Date.now();
                    const expired = item.dueAt && new Date(item.dueAt).getTime() < Date.now();
                    return (
                      <article className="panel assigned-exam-card" key={item.id}>
                        <div className="admin-exam-meta">
                          <div><strong>{item.exam.title}</strong><p className="muted">Version {item.version} · {item.questionCount} questions · {item.durationMinutes} min</p></div>
                          <span className={expired ? "status status-expired" : unavailable ? "status status-pending" : "status status-used"}>{expired ? "EXPIRED" : unavailable ? "UPCOMING" : "READY"}</span>
                        </div>
                        <p className="muted">Available: {item.availableFrom ? new Date(item.availableFrom).toLocaleString() : "Immediately"}</p>
                        <p className="muted">Deadline: {item.dueAt ? new Date(item.dueAt).toLocaleString() : "No deadline"}</p>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {activePage === "dashboard" && test ? (
              <section className="panel student-notice-preview" aria-labelledby="practice-resume-title">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">PRACTICE IN PROGRESS</p>
                    <h2 id="practice-resume-title">Resume your practice session</h2>
                    <p className="muted">{Object.keys(answers).length} of {test.questions.length} questions answered. Your selections are saved in this browser.</p>
                  </div>
                  <button type="button" className="primary" onClick={() => setActivePage("practice")}>Continue practice</button>
                </div>
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
              <div className="practice-builder-grid">
                <article className="panel practice-builder">
                  <div className="practice-builder-title"><div><span className="action-icon">◎</span><h3>Create your question paper</h3><p className="muted">Choose subjects first. Topic selection is optional and only filters the subjects you choose.</p></div><span className="status status-used">CUSTOM PAPER</span></div>
                  <div className="practice-builder-section">
                    <div className="practice-builder-label"><strong>1. Select subjects</strong><span className="muted">{practiceSubjects.length} selected</span></div>
                    <div className="practice-subject-grid">
                      {(bank?.subjects ?? []).map((item) => <label className={practiceSubjects.includes(item.subject) ? "practice-subject-choice selected" : "practice-subject-choice"} key={item.subject}>
                        <input type="checkbox" checked={practiceSubjects.includes(item.subject)} onChange={(event) => {
                          if (event.target.checked && practiceSubjects.length >= 30) {
                            setError("You can select up to 30 subjects in one practice paper.");
                            return;
                          }
                          setError("");
                          setPracticeSubjects((current) => event.target.checked ? [...current, item.subject] : current.filter((name) => name !== item.subject));
                          if (!event.target.checked) setPracticeTopicKeys((current) => current.filter((key) => { try { return (JSON.parse(key) as [string, string])[0] !== item.subject; } catch { return false; } }));
                        }} />
                        <span><strong>{item.subject}</strong><small>{item.count} questions available</small></span>
                      </label>)}
                    </div>
                    {(!bank || bank.subjects.length === 0) && <p className="muted">No subjects are available in the question bank yet.</p>}
                    <div className="practice-builder-actions"><button type="button" className="text-button" disabled={!bank?.subjects.length} onClick={() => { const all = bank?.subjects.map((item) => item.subject) ?? []; setPracticeSubjects(all.slice(0, 30)); setError(all.length > 30 ? "Only the first 30 subjects were selected. The API supports up to 30 subjects per paper." : ""); }}>Select all subjects</button><button type="button" className="text-button" disabled={!practiceSubjects.length} onClick={() => { setPracticeSubjects([]); setPracticeTopicKeys([]); }}>Clear selection</button></div>
                  </div>
                  <div className="practice-builder-section">
                    <div className="practice-builder-label"><strong>2. Choose topics <span className="muted">(optional)</span></strong><span className="muted">{practiceTopicKeys.length ? String(practiceTopicKeys.length) + " selected" : "All topics"}</span></div>
                    {practiceSubjects.length === 0 ? <p className="practice-helper">Select at least one subject to see its topics.</p> : <div className="practice-topic-groups">{practiceSubjects.map((subject) => {
                      const item = bank?.subjects.find((entry) => entry.subject === subject);
                      if (!item?.topics.length) return <div className="practice-topic-group" key={subject}><strong>{subject}</strong><p className="muted">No topics are defined. All questions in this subject remain eligible.</p></div>;
                      return <div className="practice-topic-group" key={subject}><strong>{subject}</strong><div className="practice-topic-list">{item.topics.map((topic) => {
                        const key = JSON.stringify([subject, topic.topic]);
                        return <label key={key}><input type="checkbox" checked={practiceTopicKeys.includes(key)} onChange={(event) => setPracticeTopicKeys((current) => event.target.checked ? [...current, key] : current.filter((value) => value !== key))} />{topic.topic}<small>{topic.count}</small></label>;
                      })}</div></div>;
                    })}</div>}
                    <p className="practice-helper">Leave all topics unchecked to include every topic in your selected subjects. For each subject, leave its topics unchecked to include all topics; selecting topics restricts only that subject.</p>
                    {practiceTopicKeys.length > 0 && <button type="button" className="text-button" onClick={() => setPracticeTopicKeys([])}>Clear topic filters</button>}
                  </div>
                  <div className="practice-builder-section">
                    <strong>3. Configure your paper</strong>
                    <div className="practice-config-grid">
                      <label>Number of questions<input type="number" min={1} max={200} value={practiceQuestionCount} onChange={(event) => setPracticeQuestionCount(Math.max(1, Math.min(200, Math.floor(Number(event.target.value) || 1))))} /></label>
                      <label>Difficulty<select value={practiceDifficulty} onChange={(event) => setPracticeDifficulty(event.target.value as typeof practiceDifficulty)}><option value="any">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
                    </div>
                    <p className="practice-helper">Questions are distributed as evenly as possible across selected subjects. If a subject has too few matching questions, ArcTester will tell you.</p>{practiceSubjects.length > 0 && <div className="practice-quota-preview"><span className="practice-helper">Requested subject distribution</span><div>{practiceSubjects.map((subject, index) => { const base = Math.floor(practiceQuestionCount / practiceSubjects.length); const quota = base + (index < practiceQuestionCount % practiceSubjects.length ? 1 : 0); return <span key={subject}><strong>{subject}</strong><b>{quota}</b></span>; })}</div></div>}
                  </div>
                  <div className="practice-builder-footer"><span className="muted">Your paper will use your selected filters.</span><button className="primary" disabled={busy || practiceSubjects.length === 0 || !bank?.total} onClick={createStudentPracticePaper}>{busy ? "Building paper…" : "Create " + practiceQuestionCount + "-question paper"}</button></div>
                </article>
                <div className="practice-side-actions">
                  <article className="panel action-card"><span className="action-icon">◈</span><h3>ECET mock test</h3><p className="muted">Take a full-length paper using the configured AP ECET test pattern.</p><button className="ghost" disabled={busy} onClick={() => void startTest("mock")}>Start mock test</button></article>
                  <article className="panel action-card"><span className="action-icon">↻</span><h3>Review mistakes</h3><p className="muted">Revisit questions you have answered incorrectly.</p><button className="ghost" disabled={busy} onClick={() => void startTest("mistakes")}>Review mistakes</button></article>
                </div>
              </div>
            </section>
            {activePage === "progress" ? <StudentProgress /> : null}
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
          </>
        )}
        {error && <p className="error">{error}</p>}
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


function Brand() {
  return (
    <a className="brand" href="#dashboard">
      <span className="brand-mark">A</span>
      <span>ArcTester</span>
    </a>
  );
}
