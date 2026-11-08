import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  getPendingSubmissions,
  getRemainingSeconds,
  getCachedExamPackage,
  listCachedExamPackages,
  queueOfflineSubmission,
  restoreActiveAttempt,
  saveExamPackage,
  saveOfflineAnswer,
  startOfflineAttempt,
  type OfflineExamPackage,
} from "./offlineStore";
import { syncPendingSubmissions } from "./offlineSync";

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

type AssignedExam = {
  id: string;
  status: string;
  assignedAt: string;
  availableFrom: string | null;
  dueAt: string | null;
  exam: {
    id: string;
    title: string;
    description: string;
  };
  version: number;
  durationMinutes: number;
  questionCount: number;
  submission: {
    id: string;
    status: string;
    score: number;
    maximumScore: number;
  } | null;
};

type Props = {
  api: ApiRequest;
  apiUrl: string;
  token: string;
};

export function OfflineExams({ api, apiUrl, token }: Props) {
  const apiRef = useRef(api);
  apiRef.current = api;

  const [assignments, setAssignments] = useState<AssignedExam[]>([]);
  const [cachedIds, setCachedIds] = useState<string[]>([]);
  const [activePackage, setActivePackage] = useState<OfflineExamPackage | null>(null);
  const [activeAttemptUuid, setActiveAttemptUuid] = useState("");
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [error, setError] = useState("");
  const autoSubmitStarted = useRef(false);
  const syncLock = useRef(false);

  const refreshLocalState = useCallback(async () => {
    const [packages, pending] = await Promise.all([
      listCachedExamPackages(),
      getPendingSubmissions(),
    ]);
    setCachedIds(packages.map((item) => item.assignmentId));
    setPendingCount(pending.length);
  }, []);

  const refreshAssignments = useCallback(async () => {
    const result = await apiRef.current<{ assignments: AssignedExam[] }>("/exams/assigned");
    setAssignments(result.assignments);
  }, []);

  const syncOutbox = useCallback(async () => {
    if (syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    try {
      const pending = await getPendingSubmissions();
      if (pending.length > 0) {
        setSyncMessage("Uploading saved exam submissions…");
        await syncPendingSubmissions(apiUrl, token);
      }
      setSyncMessage("Loading assigned exams…");
      await refreshAssignments();
      await refreshLocalState();
      setSyncMessage("Connected · exam list updated");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not synchronize offline data.");
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, [apiUrl, refreshAssignments, refreshLocalState, token]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        await Promise.all([refreshAssignments(), refreshLocalState()]);
        const state = await NetInfo.fetch();
        if (mounted && state.isConnected && state.isInternetReachable !== false) {
          setOnline(true);
          await syncOutbox();
        }
      } catch (cause) {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : "Could not load assigned exams.");
        }
      }
    };

    void load();
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(connected);
      if (connected) {
        setSyncMessage("Internet connected");
        void syncOutbox();
      }
    });
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void load();
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [refreshAssignments, refreshLocalState, syncOutbox]);

  useEffect(() => {
    if (!activePackage) return;
    let cancelled = false;

    const tick = async () => {
      const seconds = await getRemainingSeconds(activePackage.assignmentId);
      if (!cancelled) setRemainingSeconds(seconds);
    };

    void tick();
    const interval = setInterval(() => void tick(), 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activePackage]);

  const downloadExam = async (assignmentId: string) => {
    setBusyId(assignmentId);
    setError("");
    try {
      const response = await apiRef.current<{
        package: OfflineExamPackage;
        sha256: string;
      }>(`/exams/assignments/${encodeURIComponent(assignmentId)}/package`);
      await saveExamPackage(response.package, response.sha256);
      await refreshLocalState();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not download this exam.");
    } finally {
      setBusyId(null);
    }
  };

  const startExam = async (assignmentId: string) => {
    setBusyId(assignmentId);
    setError("");
    autoSubmitStarted.current = false;
    try {
      const started = await startOfflineAttempt(assignmentId);
      const restored = await restoreActiveAttempt(assignmentId);
      setActivePackage(started.examPackage);
      setActiveAttemptUuid(started.attemptUuid);
      setAnswers(restored?.answers ?? {});
      setRemainingSeconds(await getRemainingSeconds(assignmentId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start this exam.");
    } finally {
      setBusyId(null);
    }
  };

  const submitExam = useCallback(async () => {
    if (!activePackage || !activeAttemptUuid) return;
    setBusyId(activePackage.assignmentId);
    setError("");
    try {
      await queueOfflineSubmission(activePackage.assignmentId);
      const submittedAssignmentId = activePackage.assignmentId;
      setActivePackage(null);
      setActiveAttemptUuid("");
      setAnswers({});
      await refreshLocalState();
      const network = await NetInfo.fetch();
      if (network.isConnected && network.isInternetReachable !== false) {
        await syncOutbox();
      } else {
        setSyncMessage("Submission saved on this device. It will upload when internet returns.");
      }
      await refreshAssignments();
      setSyncMessage((current) =>
        current || "Submission saved on this device. It will upload when internet returns.",
      );
      setBusyId(null);
      void getCachedExamPackage(submittedAssignmentId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this submission.");
      setBusyId(null);
    }
  }, [activeAttemptUuid, activePackage, refreshAssignments, refreshLocalState, syncOutbox]);

  useEffect(() => {
    if (activePackage && remainingSeconds === 0 && !autoSubmitStarted.current) {
      autoSubmitStarted.current = true;
      void submitExam();
    }
  }, [activePackage, remainingSeconds, submitExam]);

  const chooseAnswer = async (questionId: string, selectedIndex: number) => {
    if (!activePackage) return;
    try {
      await saveOfflineAnswer(activePackage.assignmentId, questionId, selectedIndex);
      setAnswers((current) => ({ ...current, [questionId]: selectedIndex }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your answer.");
    }
  };

  if (activePackage) {
    const minutes = Math.floor((remainingSeconds ?? 0) / 60);
    const seconds = (remainingSeconds ?? 0) % 60;
    return (
      <View style={styles.card}>
        <Text style={styles.heading}>{activePackage.title}</Text>
        <Text style={styles.timer}>
          Time left: {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </Text>
        <Text style={styles.muted}>
          Attempt {activeAttemptUuid.slice(0, 8)} · Answers are saved on this device
        </Text>
        {activePackage.questions.map((question, index) => (
          <View key={question.id} style={styles.question}>
            <Text style={styles.questionTitle}>
              {index + 1}. {question.text}
            </Text>
            {question.options.map((option, optionIndex) => (
              <TouchableOpacity
                key={optionIndex}
                onPress={() => void chooseAnswer(question.id, optionIndex)}
                style={[
                  styles.option,
                  answers[question.id] === optionIndex && styles.optionSelected,
                ]}
              >
                <Text style={styles.optionText}>
                  {String.fromCharCode(65 + optionIndex)}. {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        <TouchableOpacity
          disabled={busyId !== null}
          onPress={() => void submitExam()}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>
            {busyId ? "Saving…" : "Submit exam"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Assigned exams</Text>
        <TouchableOpacity disabled={syncing} onPress={() => void syncOutbox()}>
          <Text style={styles.link}>{syncing ? "Syncing…" : "Sync now"}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.muted}>
        {online ? "Internet connected" : "Offline mode"} · {pendingCount} pending submission
        {pendingCount === 1 ? "" : "s"}
      </Text>
      {!!syncMessage && <Text style={styles.syncMessage}>{syncMessage}</Text>}
      {assignments.length === 0 ? (
        <Text style={styles.empty}>No exams have been assigned to this account yet.</Text>
      ) : (
        assignments.map((assignment) => {
          const downloaded = cachedIds.includes(assignment.id);
          return (
            <View key={assignment.id} style={styles.assignment}>
              <Text style={styles.assignmentTitle}>{assignment.exam.title}</Text>
              <Text style={styles.muted}>
                {assignment.questionCount} questions · {assignment.durationMinutes} minutes · v
                {assignment.version}
              </Text>
              {assignment.submission ? (
                <Text style={styles.submitted}>
                  Submitted · {assignment.submission.score}/{assignment.submission.maximumScore}
                </Text>
              ) : (
                <View style={styles.actions}>
                  <TouchableOpacity
                    disabled={busyId !== null || !!assignment.submission}
                    onPress={() => void downloadExam(assignment.id)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryText}>
                      {busyId === assignment.id ? "Working…" : downloaded ? "Downloaded" : "Download"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={!downloaded || busyId !== null}
                    onPress={() => void startExam(assignment.id)}
                    style={[styles.primarySmall, !downloaded && styles.disabled]}
                  >
                    <Text style={styles.primaryText}>Start / Resume</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: "#172033", fontSize: 17, fontWeight: "800", marginBottom: 8 },
  link: { color: "#2563eb", fontWeight: "700" },
  muted: { color: "#748096", fontSize: 12, marginTop: 4 },
  syncMessage: { color: "#2563eb", fontSize: 12, marginTop: 8 },
  empty: { color: "#748096", marginTop: 12, lineHeight: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e4e8ef",
    marginTop: 18,
  },
  heading: { color: "#172033", fontSize: 21, fontWeight: "800" },
  timer: { color: "#b42318", fontWeight: "800", fontSize: 18, marginTop: 12 },
  question: { borderTopWidth: 1, borderTopColor: "#edf0f5", paddingTop: 16, marginTop: 16 },
  questionTitle: { color: "#172033", fontSize: 15, fontWeight: "700", lineHeight: 22 },
  option: { borderWidth: 1, borderColor: "#e0e5ed", borderRadius: 10, padding: 12, marginTop: 8 },
  optionSelected: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  optionText: { color: "#293449", lineHeight: 20 },
  primary: {
    backgroundColor: "#2563eb",
    borderRadius: 11,
    padding: 14,
    alignItems: "center",
    marginTop: 18,
  },
  primarySmall: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#dce2eb",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  secondaryText: { color: "#526078", fontWeight: "700" },
  assignment: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e8ef",
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  assignmentTitle: { color: "#172033", fontWeight: "800", fontSize: 15 },
  submitted: { color: "#167647", fontWeight: "700", marginTop: 12 },
  error: { color: "#b42318", marginTop: 12, lineHeight: 20 },
});
