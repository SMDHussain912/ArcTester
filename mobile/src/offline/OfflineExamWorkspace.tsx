import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  cacheExamPackage,
  getCachedExam,
  getOfflineAttempt,
  listCachedExams,
  listPendingSubmissions,
  markSubmissionSyncError,
  markSubmissionSynced,
  queueOfflineSubmission,
  saveOfflineAnswer,
  startOfflineAttempt,
  type CachedExam,
  type ExamPackage,
  type PendingSubmission,
} from "./examStore";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");

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
  submission: { id: string; status: string; score: number | null; maximumScore: number | null } | null;
};

type Props = { token: string; onExit: () => void };

export default function OfflineExamWorkspace({ token, onExit }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [cached, setCached] = useState<CachedExam[]>([]);
  const [activePackage, setActivePackage] = useState<ExamPackage | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const syncLock = useRef(false);
  const submittedLock = useRef(false);

  const request = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "The server request failed.");
    return body as T;
  }, [token]);

  const refreshLocal = useCallback(async () => {
    setCached(await listCachedExams());
  }, []);

  const refreshAssignments = useCallback(async () => {
    if (!token) return;
    const result = await request<{ assignments: Assignment[] }>("/exams/assigned");
    setAssignments(result.assignments);
  }, [request, token]);

  const synchronize = useCallback(async () => {
    if (syncLock.current || !token) return;
    syncLock.current = true;
    setSyncing(true);
    setMessage("Internet connected");
    setError("");
    try {
      setMessage("Uploading saved attempts");
      const pending = await listPendingSubmissions();
      for (const attempt of pending) {
        try {
          const result = await request<{
            submission: { id: string };
          }>(`/exams/assignments/${attempt.assignmentId}/submission`, {
            method: "POST",
            body: JSON.stringify({
              attemptUuid: attempt.attemptUuid,
              startedAt: attempt.startedAt,
              submittedAt: attempt.submittedAt,
              answers: attempt.answers,
            }),
          });
          await markSubmissionSynced(attempt.assignmentId, result.submission.id);
        } catch (cause) {
          await markSubmissionSyncError(
            attempt.assignmentId,
            cause instanceof Error ? cause.message : "Submission sync failed."
          );
        }
      }

      setMessage("Loading new exams");
      const latest = await request<{ assignments: Assignment[] }>("/exams/assigned");
      setAssignments(latest.assignments);
      for (const assignment of latest.assignments) {
        if (assignment.submission) continue;
        try {
          const result = await request<{ package: ExamPackage; sha256: string }>(
            `/exams/assignments/${assignment.id}/package`
          );
          await cacheExamPackage(result.package, result.sha256);
        } catch {
          // Keep any previously cached copy if this package is not currently downloadable.
        }
      }
      await refreshLocal();
      setMessage("Sync complete");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sync failed.");
      setMessage("Sync paused — saved work is still on this device");
    } finally {
      setSyncing(false);
      syncLock.current = false;
    }
  }, [refreshLocal, request, token]);

  useEffect(() => {
    void refreshLocal();
    void refreshAssignments().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Could not load assigned exams.");
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline(connected);
      if (connected) void synchronize();
    });
    return unsubscribe;
  }, [refreshAssignments, refreshLocal, synchronize]);

  const startExam = useCallback(async (assignmentId: string) => {
    setBusy(true);
    setError("");
    try {
      let exam = await getCachedExam(assignmentId);
      if (!exam) {
        if (!online) throw new Error("Connect to the internet once to download this exam.");
        const result = await request<{ package: ExamPackage; sha256: string }>(
          `/exams/assignments/${assignmentId}/package`
        );
        exam = await cacheExamPackage(result.package, result.sha256);
        await refreshLocal();
      }

      const attemptUuid = await startOfflineAttempt(assignmentId);
      const stored = await getOfflineAttempt(assignmentId);
      const restored: Record<string, number | null> = {};
      for (const question of exam.package.questions) restored[question.id] = null;
      for (const answer of stored?.answers ?? []) restored[answer.examQuestionId] = answer.selectedIndex;
      setAnswers(restored);
      setActivePackage(exam.package);
      setActiveAttempt(attemptUuid);
      submittedLock.current = false;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start this exam.");
    } finally {
      setBusy(false);
    }
  }, [online, refreshLocal, request]);

  const submitAttempt = useCallback(async () => {
    if (!activePackage || !activeAttempt || submittedLock.current) return;
    submittedLock.current = true;
    setBusy(true);
    try {
      const submission = await queueOfflineSubmission(activePackage.assignmentId);
      setMessage("Attempt saved on this device");
      if (online) {
        setMessage("Uploading saved attempt");
        const result = await request<{ submission: { id: string } }>(
          `/exams/assignments/${submission.assignmentId}/submission`,
          {
            method: "POST",
            body: JSON.stringify(submission),
          }
        );
        await markSubmissionSynced(submission.assignmentId, result.submission.id);
        await refreshAssignments();
        setMessage("Submission synchronized");
      } else {
        setMessage("Offline submission queued — reconnect to upload");
      }
      setActivePackage(null);
      setActiveAttempt(null);
      await refreshLocal();
    } catch (cause) {
      submittedLock.current = false;
      setError(cause instanceof Error ? cause.message : "Could not save the submission.");
    } finally {
      setBusy(false);
    }
  }, [activeAttempt, activePackage, online, refreshAssignments, refreshLocal, request]);

  const startedAt = useMemo(async () => {
    if (!activePackage) return null;
    return getOfflineAttempt(activePackage.assignmentId);
  }, [activePackage]);

  useEffect(() => {
    let cancelled = false;
    void startedAt.then((attempt) => {
      if (!cancelled && attempt) {
        const local = Date.now();
        const cachedExam = cached.find((item) => item.package.assignmentId === activePackage?.assignmentId);
        const adjustedNow = local + (cachedExam?.serverOffsetMs ?? 0);
        const elapsed = Math.floor((adjustedNow - new Date(attempt.startedAt).getTime()) / 1000);
        setRemainingSeconds(Math.max(0, (activePackage?.durationMinutes ?? 0) * 60 - elapsed));
      }
    });
    return () => { cancelled = true; };
  }, [activePackage, cached, startedAt]);

  useEffect(() => {
    if (!activePackage || !activeAttempt) return;
    const timer = setInterval(() => {
      const cachedExam = cached.find((item) => item.package.assignmentId === activePackage.assignmentId);
      void getOfflineAttempt(activePackage.assignmentId).then((attempt) => {
        if (!attempt) return;
        const adjustedNow = Date.now() + (cachedExam?.serverOffsetMs ?? 0);
        const elapsed = Math.floor((adjustedNow - new Date(attempt.startedAt).getTime()) / 1000);
        const left = Math.max(0, activePackage.durationMinutes * 60 - elapsed);
        setRemainingSeconds(left);
        if (left === 0) void submitAttempt();
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeAttempt, activePackage, cached, submitAttempt]);

  const chooseAnswer = async (questionId: string, selectedIndex: number) => {
    if (!activePackage) return;
    setAnswers((current) => ({ ...current, [questionId]: selectedIndex }));
    try {
      await saveOfflineAnswer(activePackage.assignmentId, questionId, selectedIndex);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Answer could not be saved locally.");
    }
  };

  if (activePackage) {
    return (
      <View style={{ gap: 12 }}>
        <View style={{ backgroundColor: "#fff", padding: 18, borderRadius: 16 }}>
          <Text style={{ color: "#172033", fontSize: 21, fontWeight: "800" }}>{activePackage.title}</Text>
          <Text style={{ color: "#2563eb", fontWeight: "800", marginTop: 8 }}>
            Time left: {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}
          </Text>
          <Text style={{ color: "#748096", marginTop: 5 }}>
            {activePackage.questions.length} questions · Saved locally as you answer
          </Text>
        </View>
        <ScrollView style={{ maxHeight: 520 }} nestedScrollEnabled>
          {activePackage.questions.map((question, index) => (
            <View key={question.id} style={{ backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10 }}>
              <Text style={{ color: "#748096", fontSize: 12 }}>QUESTION {index + 1} · {question.subject}</Text>
              <Text style={{ color: "#172033", fontWeight: "700", fontSize: 16, lineHeight: 23, marginTop: 8 }}>
                {question.text}
              </Text>
              {question.options.map((option, optionIndex) => (
                <TouchableOpacity
                  key={optionIndex}
                  onPress={() => void chooseAnswer(question.id, optionIndex)}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: answers[question.id] === optionIndex ? "#2563eb" : "#e0e5ed",
                    backgroundColor: answers[question.id] === optionIndex ? "#eff6ff" : "#fff",
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: "#293449" }}>{String.fromCharCode(65 + optionIndex)}. {option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity disabled={busy} onPress={() => void submitAttempt()} style={{ backgroundColor: "#2563eb", padding: 15, borderRadius: 12, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>{busy ? "Saving…" : "Submit exam"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: "#172033", fontSize: 22, fontWeight: "800" }}>Assigned exams</Text>
        <TouchableOpacity onPress={onExit}><Text style={{ color: "#2563eb", fontWeight: "700" }}>Back</Text></TouchableOpacity>
      </View>
      <Text style={{ color: online ? "#16845b" : "#b7791f", fontWeight: "700" }}>
        {online ? "Online · Sync enabled" : "Offline · Cached exams available"}
      </Text>
      {!!message && <Text style={{ color: "#526078" }}>{message}</Text>}
      {syncing && <ActivityIndicator />}
      {assignments.map((assignment) => {
        const local = cached.find((item) => item.package.assignmentId === assignment.id);
        const completed = Boolean(assignment.submission);
        return (
          <View key={assignment.id} style={{ backgroundColor: "#fff", padding: 16, borderRadius: 14, borderWidth: 1, borderColor: "#e4e8ef" }}>
            <Text style={{ color: "#172033", fontWeight: "800", fontSize: 16 }}>{assignment.exam.title}</Text>
            <Text style={{ color: "#748096", marginTop: 5 }}>
              {assignment.questionCount} questions · {assignment.durationMinutes} minutes · v{assignment.version}
            </Text>
            <Text style={{ color: completed ? "#16845b" : "#748096", marginTop: 6 }}>
              {completed ? `Submitted · ${assignment.submission?.status}` : local ? "Downloaded for offline use" : "Not downloaded"}
            </Text>
            {!completed && (
              <TouchableOpacity disabled={busy || (!local && !online)} onPress={() => void startExam(assignment.id)} style={{ backgroundColor: "#2563eb", padding: 12, borderRadius: 10, alignItems: "center", marginTop: 12 }}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{busy ? "Please wait…" : local ? "Start exam" : "Download and start"}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      {!assignments.length && <Text style={{ color: "#748096" }}>No exams have been assigned yet.</Text>}
      {!!error && <Text style={{ color: "#b42318", lineHeight: 21 }}>{error}</Text>}
      <TouchableOpacity disabled={!online || syncing} onPress={() => void synchronize()} style={{ padding: 14, alignItems: "center" }}>
        <Text style={{ color: "#2563eb", fontWeight: "700" }}>{syncing ? "Synchronizing…" : "Sync now"}</Text>
      </TouchableOpacity>
    </View>
  );
}
