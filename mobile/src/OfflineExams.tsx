import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert, Animated, AppState, Easing, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  configureOfflineStore,
  getPendingSubmissions,
  getRemainingSeconds,
  listCachedExamPackages,
  queueOfflineSubmission,
  restoreActiveAttempt,
  saveExamPackage,
  saveOfflineAnswer,
  startOfflineAttempt,
  type OfflineExamPackage,
} from "./offlineStore";
import { syncPendingSubmissions } from "./offlineSync";
import StudentAssignmentResult from "./StudentAssignmentResult";

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
  userId: string;
  onExit?: () => void;
};

export function OfflineExams({ api, apiUrl, token, userId, onExit }: Props) {
  const apiRef = useRef(api);
  apiRef.current = api;

  const [assignments, setAssignments] = useState<AssignedExam[]>([]);
  const [cachedIds, setCachedIds] = useState<string[]>([]);
  const [cachedPackages, setCachedPackages] = useState<OfflineExamPackage[]>([]);
  const [activePackage, setActivePackage] = useState<OfflineExamPackage | null>(null);
  const [activeAttemptUuid, setActiveAttemptUuid] = useState("");
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const questionTransition = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [error, setError] = useState("");
  const [viewingResultId, setViewingResultId] = useState<string | null>(null);
  const autoSubmitStarted = useRef(false);
  const syncLock = useRef(false);
  const answerSaveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const refreshLocalState = useCallback(async () => {
    configureOfflineStore(userId);
    const [packages, pending] = await Promise.all([
      listCachedExamPackages(),
      getPendingSubmissions(),
    ]);
    setCachedIds(packages.map((item) => item.assignmentId));
    setCachedPackages(packages);
    setPendingCount(pending.length);
  }, [userId]);

  const refreshAssignments = useCallback(async () => {
    const result = await apiRef.current<{ assignments: AssignedExam[] }>("/exams/assigned");
    setAssignments(result.assignments);
  }, []);

  const syncOutbox = useCallback(async () => {
    if (syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    setError("");
    try {
      configureOfflineStore(userId);
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
  }, [apiUrl, refreshAssignments, refreshLocalState, token, userId]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        await refreshLocalState();
        try {
          await refreshAssignments();
        } catch (cause) {
          if (mounted) {
            setError(cause instanceof Error ? cause.message : "Could not load assigned exams.");
          }
        }
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
      configureOfflineStore(userId);
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
      configureOfflineStore(userId);
      const started = await startOfflineAttempt(assignmentId);
      const restored = await restoreActiveAttempt(assignmentId);
      setActivePackage(started.examPackage);
      setCurrentQuestionIndex(0);
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
      // Finish every queued SQLite answer write before freezing the submission snapshot.
      await answerSaveQueue.current;
      await queueOfflineSubmission(activePackage.assignmentId);
      setActivePackage(null);
      setCurrentQuestionIndex(0);
      setActiveAttemptUuid("");
      setAnswers({});
      await refreshLocalState();
      const network = await NetInfo.fetch();
      if (network.isConnected && network.isInternetReachable !== false) {
        await syncOutbox();
      } else {
        setSyncMessage("Submission saved on this device. It will upload when internet returns.");
      }
      setBusyId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this submission.");
      setBusyId(null);
    }
  }, [activeAttemptUuid, activePackage, refreshLocalState, syncOutbox]);

  const confirmSubmitExam = () => {
    if (!activePackage || busyId !== null) return;
    const answered = Object.values(answers).filter((value) => value !== null && value !== undefined).length;
    const unanswered = activePackage.questions.length - answered;
    Alert.alert(
      "Submit assigned exam?",
      unanswered > 0
        ? `You answered ${answered} of ${activePackage.questions.length} questions. ${unanswered} will remain unanswered. Your submission will be saved on this device and synced when possible.`
        : `All ${activePackage.questions.length} questions are answered. Save and submit this exam now?`,
      [
        { text: "Keep working", style: "cancel" },
        { text: "Submit exam", style: "default", onPress: () => { void submitExam(); } },
      ],
    );
  };

  useEffect(() => {
    if (activePackage && remainingSeconds === 0 && !autoSubmitStarted.current) {
      autoSubmitStarted.current = true;
      void submitExam();
    }
  }, [activePackage, remainingSeconds, submitExam]);

  useEffect(() => {
    if (!activePackage) return;
    if (reduceMotion) {
      questionTransition.setValue(1);
      progress.setValue((currentQuestionIndex + 1) / activePackage.questions.length);
      return;
    }
    questionTransition.setValue(0);
    Animated.timing(questionTransition, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    Animated.timing(progress, {
      toValue: (currentQuestionIndex + 1) / activePackage.questions.length,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [activePackage, currentQuestionIndex, progress, questionTransition, reduceMotion]);

  const chooseAnswer = (questionId: string, selectedIndex: number) => {
    if (!activePackage || busyId !== null) return;
    const assignmentId = activePackage.assignmentId;
    // Update the UI immediately, but serialize SQLite read-modify-write operations.
    setAnswers((current) => ({ ...current, [questionId]: selectedIndex }));
    answerSaveQueue.current = answerSaveQueue.current
      .catch(() => undefined)
      .then(() => saveOfflineAnswer(assignmentId, questionId, selectedIndex));
    void answerSaveQueue.current.catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Could not save your answer.");
    });
  };

  if (activePackage) {
    const minutes = Math.floor((remainingSeconds ?? 0) / 60);
    const seconds = (remainingSeconds ?? 0) % 60;
    return (
      <View style={styles.card}>
        {onExit && <TouchableOpacity onPress={onExit} style={styles.backButton}><Text style={styles.link}>‹ Back to dashboard</Text></TouchableOpacity>}
        <Text style={styles.heading}>{activePackage.title}</Text>
        <Text style={styles.timer}>
          Time left: {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </Text>
        <Text style={styles.muted}>
          Attempt {activeAttemptUuid.slice(0, 8)} · Answers are saved on this device
        </Text>
        <Text style={styles.muted}>
          Question {currentQuestionIndex + 1} of {activePackage.questions.length} · {Object.keys(answers).length} answered
        </Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
        </View>
        <View style={styles.navigator}>
          <Text style={styles.navigatorTitle}>QUESTION NAVIGATOR</Text>
          <View style={styles.navigatorGrid}>
            {activePackage.questions.map((question, index) => {
              const answered = answers[question.id] !== undefined && answers[question.id] !== null;
              const current = index === currentQuestionIndex;
              return (
                <TouchableOpacity
                  key={question.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Question ${index + 1}${answered ? ", answered" : ", unanswered"}`}
                  accessibilityState={{ selected: current }}
                  onPress={() => setCurrentQuestionIndex(index)}
                  style={[
                    styles.navigatorItem,
                    answered && styles.navigatorAnswered,
                    current && styles.navigatorCurrent,
                  ]}
                >
                  <Text style={[
                    styles.navigatorNumber,
                    answered && styles.navigatorNumberAnswered,
                    current && styles.navigatorNumberCurrent,
                  ]}>{index + 1}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.navigatorLegend}>
            <Text style={styles.navigatorLegendText}>● Answered</Text>
            <Text style={styles.navigatorLegendText}>○ Unanswered</Text>
          </View>
        </View>
        {activePackage.questions[currentQuestionIndex] && (
          <Animated.View
            key={activePackage.questions[currentQuestionIndex].id}
            style={[
              styles.question,
              {
                opacity: questionTransition,
                transform: [{ translateX: questionTransition.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
              },
            ]}
          >
            <Text style={styles.questionTitle}>
              {currentQuestionIndex + 1}. {activePackage.questions[currentQuestionIndex].text}
            </Text>
            {activePackage.questions[currentQuestionIndex].options.map((option, optionIndex) => (
              <TouchableOpacity
                key={optionIndex}
                onPress={() => void chooseAnswer(activePackage.questions[currentQuestionIndex].id, optionIndex)}
                style={[
                  styles.option,
                  answers[activePackage.questions[currentQuestionIndex].id] === optionIndex && styles.optionSelected,
                ]}
              >
                <Text style={styles.optionText}>
                  {String.fromCharCode(65 + optionIndex)}. {option}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}
        <View style={styles.examActions}>
          <TouchableOpacity
            disabled={currentQuestionIndex === 0 || busyId !== null}
            onPress={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))}
            style={[styles.secondaryButton, currentQuestionIndex === 0 && styles.disabled]}
          >
            <Text style={styles.secondaryText}>Previous</Text>
          </TouchableOpacity>
          {currentQuestionIndex < activePackage.questions.length - 1 ? (
            <TouchableOpacity
              onPress={() => setCurrentQuestionIndex((index) => Math.min(activePackage.questions.length - 1, index + 1))}
              style={styles.primarySmall}
            >
              <Text style={styles.primaryText}>Next question ›</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              disabled={busyId !== null}
              onPress={confirmSubmitExam}
              style={styles.primarySmall}
            >
              <Text style={styles.primaryText}>{busyId ? "Saving…" : "Submit exam"}</Text>
            </TouchableOpacity>
          )}
        </View>
        {currentQuestionIndex < activePackage.questions.length - 1 && (
          <TouchableOpacity disabled={busyId !== null} onPress={confirmSubmitExam} style={styles.submitLink}>
            <Text style={styles.link}>Submit exam now</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          disabled={busyId !== null}
          onPress={() => setActivePackage(null)}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryText}>Save & exit · Resume later</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (viewingResultId) {
    return (
      <View style={styles.section}>
        <TouchableOpacity onPress={() => setViewingResultId(null)} style={styles.linkRow}>
          <Text style={styles.link}>‹ Back to assigned exams</Text>
        </TouchableOpacity>
        <StudentAssignmentResult
          assignmentId={viewingResultId}
          api={apiRef.current}
          token={token}
          onBack={() => setViewingResultId(null)}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        {onExit ? <TouchableOpacity onPress={onExit}><Text style={styles.link}>‹ Dashboard</Text></TouchableOpacity> : <Text style={styles.sectionTitle}>Assigned exams</Text>}
        <TouchableOpacity disabled={syncing} onPress={() => void syncOutbox()}>
          <Text style={styles.link}>{syncing ? "Syncing…" : "Sync now"}</Text>
        </TouchableOpacity>
      </View>
      {onExit && <Text style={styles.sectionTitle}>Assigned exams</Text>}
      <Text style={styles.muted}>
        {online ? "Internet connected" : "Offline mode"} · {pendingCount} pending submission
        {pendingCount === 1 ? "" : "s"}
      </Text>
      {!!syncMessage && <Text style={styles.syncMessage}>{syncMessage}</Text>}
      {assignments.length === 0 && cachedPackages.length === 0 ? (
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
                <View style={{ gap: 8 }}>
                  <Text style={styles.submitted}>
                    Submitted · {assignment.submission.score == null ? "—" : assignment.submission.score}/{assignment.submission.maximumScore ?? "—"}
                  </Text>
                  <TouchableOpacity
                    disabled={busyId !== null}
                    onPress={() => void setViewingResultId(assignment.id)}
                    style={[styles.primarySmall, { alignSelf: "flex-start" }]}
                  >
                    <Text style={styles.primaryText}>View result</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.actions}>
                  <TouchableOpacity
                    disabled={busyId !== null || !!assignment.submission}
                    onPress={() => void downloadExam(assignment.id)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryText}>
                      {busyId === assignment.id
                        ? "Working…"
                        : downloaded
                          ? "Downloaded"
                          : "Download"}
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
      {cachedPackages
        .filter(
          (examPackage) =>
            !assignments.some((assignment) => assignment.id === examPackage.assignmentId)
        )
        .map((examPackage) => (
          <View key={examPackage.assignmentId} style={styles.assignment}>
            <Text style={styles.assignmentTitle}>{examPackage.title}</Text>
            <Text style={styles.muted}>
              {examPackage.questions.length} questions · {examPackage.durationMinutes} minutes ·
              Saved offline
            </Text>
            <TouchableOpacity
              disabled={busyId !== null}
              onPress={() => void startExam(examPackage.assignmentId)}
              style={[styles.primarySmall, { alignSelf: "flex-start", marginTop: 12 }]}
            >
              <Text style={styles.primaryText}>Start / Resume offline</Text>
            </TouchableOpacity>
          </View>
        ))}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { alignSelf: "flex-start", marginBottom: 14 },
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
  progressTrack: { height: 6, backgroundColor: "#e8edf5", borderRadius: 99, overflow: "hidden", marginTop: 12 },
  progressFill: { height: 6, backgroundColor: "#2563eb", borderRadius: 99 },
  navigator: { marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: "#f7f9fc", borderWidth: 1, borderColor: "#e8edf5" },
  navigatorTitle: { color: "#748096", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  navigatorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  navigatorItem: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: "#dce2eb", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  navigatorAnswered: { backgroundColor: "#eaf7f0", borderColor: "#9bd4b5" },
  navigatorCurrent: { borderColor: "#2563eb", borderWidth: 2, backgroundColor: "#eff6ff" },
  navigatorNumber: { color: "#526078", fontSize: 12, fontWeight: "700" },
  navigatorNumberAnswered: { color: "#167647" },
  navigatorNumberCurrent: { color: "#2563eb" },
  navigatorLegend: { flexDirection: "row", gap: 14, marginTop: 10 },
  navigatorLegendText: { color: "#748096", fontSize: 10 },
  examActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 18 },
  submitLink: { alignSelf: "center", padding: 10, marginTop: 4 },
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
  linkRow: { marginTop: 8, alignSelf: "flex-start" },
});
