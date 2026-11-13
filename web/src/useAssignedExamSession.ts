import { useCallback, useEffect, useRef, useState } from "react";
import { type ApiRequestError } from "./apiClient";
import { mergeAssignedExamAnswers } from "../lib/answerRecovery";
import { classifyAssignmentHeartbeatFailure } from "./assignedExamHeartbeat";
import { safeStorage } from "./safeStorage";
import type { AssignedExam, AssignedExamPackage, AssignedExamResult } from "./types/assignedExams";

type QuestionSummary = { id: string; subject: string; topic: string | null; text: string; options: string[]; marks: number; negativeMarks: number; optionOrder: number[] };

type PackageWithOrder = AssignedExamPackage & { questions: QuestionSummary[] };

type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseAssignedExamSessionOptions {
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  setActivePage: (page: string) => void;
  setAssignments: (v: AssignedExam[]) => void;
  onResultLoaded?: (result: AssignedExamResult) => void;
}

export interface UseAssignedExamSessionResult {
  package: PackageWithOrder | null;
  answers: Record<string, number>;
  saveStatus: SaveStatus;
  paused: boolean;
  remainingSeconds: number;
  busy: boolean;
  error: string | null;
  startAssignedExam: (assignmentId: string) => Promise<void>;
  selectAssignedAnswer: (questionId: string, selectedIndex: number) => void;
  submitAssignedExam: (force?: boolean) => Promise<void>;
  reviewAssignedExam: (assignmentId: string) => Promise<void>;
  refreshAssignedExams: () => Promise<void>;
}

export function useAssignedExamSession({
  request,
  setActivePage,
  setAssignments,
  onResultLoaded,
}: UseAssignedExamSessionOptions): UseAssignedExamSessionResult {
  const [activeAssignmentPackage, setActiveAssignmentPackage] = useState<PackageWithOrder | null>(null);
  const [assignmentAnswers, setAssignmentAnswers] = useState<Record<string, number>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [paused, setPaused] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);
  const assignmentStartedAtRef = useRef<string | null>(null);
  const assignmentDeadlineRef = useRef<string | null>(null);
  const assignmentServerOffsetRef = useRef(0);
  const [assignmentClock, setAssignmentClock] = useState(performance.now());
  const autoSubmitTriggeredRef = useRef(false);
  const connectionLostRef = useRef(false);
  const saveSequenceRef = useRef(0);
  const saveConflictRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const answersRevisionRef = useRef(0);

  const keyFor = (assignmentId: string) => `arctester-assignment-answers-${assignmentId}`;
  const attemptKeyFor = (assignmentId: string) => `arctester-assigned-attempt-${assignmentId}`;

  const remainingSeconds = useCallback((): number => {
    const deadline = activeAssignmentPackage?.dueAt
      ? new Date(activeAssignmentPackage.dueAt).getTime()
      : (assignmentDeadlineRef.current ? new Date(assignmentDeadlineRef.current).getTime() : Number.POSITIVE_INFINITY);
    if (!Number.isFinite(deadline)) return 0;
    return Math.max(0, Math.ceil((deadline - (assignmentClock + assignmentServerOffsetRef.current)) / 1000));
  }, [activeAssignmentPackage?.dueAt, assignmentClock]);

  async function startAssignedExam(assignmentId: string): Promise<void> {
    setSessionBusy(true); setSessionError(""); setPaused(false);     autoSubmitTriggeredRef.current = false; connectionLostRef.current = false;
    try {
      const response = await request<{ package: PackageWithOrder }>(`/exams/assignments/${encodeURIComponent(assignmentId)}/package`);
      const sessionResponse = await request<{ session: { startedAt: string; serverTime: string; deadline: string | null; status: string } }>(
        `/exams/assignments/${encodeURIComponent(assignmentId)}/session/start`, { method: "POST", body: JSON.stringify({}) },
      );
      const serverSaved = await request<{ revision: number; answers: { examQuestionId: string; selectedIndex: number | null }[] }>(
        `/exams/assignments/${encodeURIComponent(assignmentId)}/answers`,
      );
      let restoredAnswers: Record<string, number> = {};
      try {
        const cached = JSON.parse(safeStorage.getItem(keyFor(assignmentId)) ?? "{}") as Record<string, unknown>;
        const validQuestionIds = new Set(response.package.questions.map((question) => question.id));
        restoredAnswers = Object.fromEntries(Object.entries(cached).flatMap(([id, value]) => {
          return validQuestionIds.has(id) && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3 ? [[id, Number(value)]] : [];
        }));
      } catch { safeStorage.removeItem(keyFor(assignmentId)); }
      const serverAnswers = Object.fromEntries(serverSaved.answers.flatMap((answer) => answer.selectedIndex === null ? [] : [[answer.examQuestionId, answer.selectedIndex]]));
      const merged = mergeAssignedExamAnswers(serverAnswers, restoredAnswers);
      answersRevisionRef.current = serverSaved.revision ?? 0;
      saveConflictRef.current = false;
      setActiveAssignmentPackage(response.package);
      setAssignmentAnswers(merged);
      assignmentStartedAtRef.current = sessionResponse.session.startedAt;
      assignmentDeadlineRef.current = sessionResponse.session.deadline ?? null;
      assignmentServerOffsetRef.current = new Date(sessionResponse.session.serverTime).getTime() - performance.now();
      setAssignmentClock(performance.now());
      setSaveStatus(serverSaved.answers.length > 0 ? "saved" : "idle");
      setPaused(false);
    } catch (cause) { setSessionError((cause as Error).message); }
    finally { setSessionBusy(false); }
  }

  function selectAssignedAnswer(questionId: string, selectedIndex: number): void {
    if (!activeAssignmentPackage) return;
    const next = { ...assignmentAnswers, [questionId]: selectedIndex };
    setAssignmentAnswers(next);
    if (!safeStorage.setItem(keyFor(activeAssignmentPackage.assignmentId), JSON.stringify(next))) {
      setSessionError("Browser storage is unavailable. Keep this exam tab open until you submit; server autosave will continue.");
    }
  }

  async function submitAssignedExam(force = false): Promise<void> {
    if (!activeAssignmentPackage || !assignmentStartedAtRef.current) return;
    if (!force && !window.confirm("Submit this exam now? You cannot change answers after submission.")) return;
    setSessionBusy(true); setSessionError("");
    try {
      await saveQueueRef.current.catch(() => undefined);
      const attemptKey = attemptKeyFor(activeAssignmentPackage.assignmentId);
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
          revision: answersRevisionRef.current,
          attemptUuid,
          startedAt: assignmentStartedAtRef.current,
          submittedAt: new Date().toISOString(),
          answers: activeAssignmentPackage.questions.map((question) => ({
            examQuestionId: question.id,
            selectedIndex: assignmentAnswers[question.id] ?? null,
          })),
        }),
      });
      safeStorage.removeItem(attemptKey);
      safeStorage.removeItem(keyFor(activeAssignmentPackage.assignmentId));
      setActiveAssignmentPackage(null);
      assignmentStartedAtRef.current = null; assignmentDeadlineRef.current = null; assignmentServerOffsetRef.current = 0;
      setAssignmentAnswers({}); setSaveStatus("idle"); autoSubmitTriggeredRef.current = false;
      await setAssignments([]);
      setActivePage("assigned-exams");
    } catch (cause) { setSessionError((cause as Error).message); }
    finally { setSessionBusy(false); }
  }

  async function reviewAssignedExam(assignmentId: string): Promise<void> {
    setSessionBusy(true); setSessionError("");
    try {
      const response = await request<{ result: AssignedExamResult }>(`/exams/assignments/${encodeURIComponent(assignmentId)}/result`);
      if (onResultLoaded) onResultLoaded(response.result);
    } catch (cause) { setSessionError((cause as Error).message); }
    finally { setSessionBusy(false); }
  }

  async function refreshAssignedExams(): Promise<void> {
    try {
      const response = await request<{ assignments: AssignedExam[] }>("/exams/assigned");
      setAssignments(Array.isArray(response.assignments) ? response.assignments : []);
    } catch (cause) { setSessionError((cause as Error).message); }
  }

  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAtRef.current) return;
    const assignmentId = activeAssignmentPackage.assignmentId;
    let disposed = false;
    const sendHeartbeat = async (event: "HEARTBEAT" | "FOCUS_LOST" | "FOCUS_RESTORED" | "CONNECTION_RESTORED") => {
      if (disposed) return;
      try {
        const heartbeat = await request<{ serverTime: string; deadline: string | null; sessionStatus: string }>(
          `/exams/assignments/${encodeURIComponent(assignmentId)}/session/heartbeat`,
          { method: "POST", body: JSON.stringify({ event }) },
        );
        if (disposed) return;
        const clientNow = performance.now();
        assignmentServerOffsetRef.current = new Date(heartbeat.serverTime).getTime() - clientNow;
        setAssignmentClock(clientNow);
        if (heartbeat.deadline) assignmentDeadlineRef.current = heartbeat.deadline;
        setPaused(heartbeat.sessionStatus !== "ACTIVE");
        connectionLostRef.current = false;
      } catch (cause) {
        if (disposed) return;
        const apiError = cause as ApiRequestError;
        const failure = classifyAssignmentHeartbeatFailure(apiError?.status ?? null);
        if (failure === "paused") setPaused(true);
        if (failure === "transient") connectionLostRef.current = true;
      }
    };
    const interval = window.setInterval(() => {
      void sendHeartbeat(connectionLostRef.current ? "CONNECTION_RESTORED" : "HEARTBEAT");
    }, paused ? 5000 : 15000);
    const onVisibilityChange = () => {
      if (document.hidden) { void sendHeartbeat("FOCUS_LOST"); }
      else { void sendHeartbeat(connectionLostRef.current ? "CONNECTION_RESTORED" : "FOCUS_RESTORED"); }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeAssignmentPackage, paused]);

  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAtRef.current || paused) return;
    setAssignmentClock(performance.now());
    const timer = window.setInterval(() => { setAssignmentClock(performance.now()); }, 1000);
    return () => window.clearInterval(timer);
  }, [activeAssignmentPackage, paused]);

  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAtRef.current || paused || saveConflictRef.current || Object.keys(assignmentAnswers).length === 0) return;
    const saveVersion = ++saveSequenceRef.current;
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      const save = saveQueueRef.current.catch(() => undefined).then(async () => {
        const saved = await request<{ revision: number }>(`/exams/assignments/${activeAssignmentPackage.assignmentId}/answers`, {
          method: "PUT",
          body: JSON.stringify({
            revision: answersRevisionRef.current,
            answers: activeAssignmentPackage.questions.map((question) => ({
              examQuestionId: question.id,
              selectedIndex: assignmentAnswers[question.id] ?? null,
            })),
          }),
        });
        answersRevisionRef.current = saved.revision;
        if (saveSequenceRef.current === saveVersion) setSaveStatus("saved");
      }).catch(async (cause) => {
        if (saveSequenceRef.current !== saveVersion) return;
        if ((cause as ApiRequestError)?.status === 409) {
          saveConflictRef.current = true;
          setSaveStatus("error");
          setSessionError("Your local answers are safe, but another tab or device saved newer answers. Reload the exam to reconcile before continuing.");
          return;
        }
        setSaveStatus("error");
        setSessionError(`Server autosave failed: ${(cause as Error).message}. Your local backup is still available.`);
      });
      saveQueueRef.current = save.then(() => undefined);
    }, 450);
    return () => {
      window.clearTimeout(timer);
      if (saveSequenceRef.current === saveVersion) saveSequenceRef.current += 1;
    };
  }, [activeAssignmentPackage, paused, assignmentAnswers]);

  useEffect(() => {
    if (!activeAssignmentPackage) return;
    safeStorage.setItem(keyFor(activeAssignmentPackage.assignmentId), JSON.stringify(assignmentAnswers));
  }, [activeAssignmentPackage?.assignmentId, assignmentAnswers]);

  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAtRef.current) return;
    const answerKey = keyFor(activeAssignmentPackage.assignmentId);
    const validQuestions = new Map(activeAssignmentPackage.questions.map((question) => [question.id, question]));
    const onStorage = (event: StorageEvent) => {
      if (event.key !== answerKey || !event.newValue) return;
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
        const incoming = Object.fromEntries(
          Object.entries(parsed).flatMap(([questionId, value]) => {
            const question = validQuestions.get(questionId);
            if (!question || !Number.isInteger(value) || Number(value) < 0 || Number(value) >= question.options.length) return [];
            return [[questionId, Number(value)]];
          }),
        );
        setAssignmentAnswers((current) => ({ ...current, ...incoming }));
      } catch { /* ignore malformed */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [activeAssignmentPackage, assignmentStartedAtRef.current]);

  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAtRef.current || paused || remainingSeconds() > 0 || autoSubmitTriggeredRef.current || sessionBusy) return;
    autoSubmitTriggeredRef.current = true;
    void submitAssignedExam(true);
  }, [activeAssignmentPackage, paused, sessionBusy]);

  return {
    package: activeAssignmentPackage,
    answers: assignmentAnswers,
    saveStatus,
    paused,
    remainingSeconds: remainingSeconds(),
    busy: sessionBusy,
    error: sessionError,
    startAssignedExam,
    selectAssignedAnswer,
    submitAssignedExam,
    reviewAssignedExam,
    refreshAssignedExams,
  };
}