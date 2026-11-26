import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type Api = <T>(path: string, init?: RequestInit) => Promise<T>;
type Assignment = {
  id: string; status: string; assignedAt: string; availableFrom: string | null; dueAt: string | null;
  exam: { id: string; title: string; description: string };
  version: number; durationMinutes: number; questionCount: number;
  submission: { id: string; status: string; score: number | null; maximumScore: number | null; submittedAt: string | null } | null;
};
type ExamQuestion = { id: string; position: number; subject: string; topic: string | null; text: string; options: string[]; optionOrder: number[]; marks: number; negativeMarks: number };
type ExamPackage = { assignmentId: string; title: string; description: string; version: number; instructions: string; durationMinutes: number; serverTime: string; questions: ExamQuestion[] };
type Props = { api: Api; darkMode: boolean; disabled: boolean };
type SavedAnswers = Record<string, number | null>;
const palette = { blue: "#2563eb", green: "#15803d", red: "#b42318" };
function uuid() { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }); }
function formatTime(seconds: number) { const safe = Math.max(0, seconds); return String(Math.floor(safe / 60)).padStart(2, "0") + ":" + String(safe % 60).padStart(2, "0"); }

export default function StudentExamCenter({ api, darkMode, disabled }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paper, setPaper] = useState<ExamPackage | null>(null);
  const [answers, setAnswers] = useState<SavedAnswers>({});
  const [index, setIndex] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const revisionRef = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const attemptUuid = useRef(uuid());
  const [saving, setSaving] = useState(false);
  const dark = darkMode;
  const colors = dark ? { card: "#172235", border: "#334155", text: "#f1f5f9", muted: "#a7b4c8", surface: "#1e293b" } : { card: "#fff", border: "#e4e8ef", text: "#172033", muted: "#748096", surface: "#f8fafc" };

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await api<{ assignments: Assignment[] }>("/exams/assigned");
      setAssignments(response.assignments);
    } catch (cause) { setError((cause as Error).message || "Could not load assigned exams."); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!deadline) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  const start = async (assignment: Assignment) => {
    if (disabled || busy) return;
    setBusy(true); setError("");
    try {
      const started = await api<{ session: { startedAt: string; deadline: string; serverTime: string } }>(`/exams/assignments/${assignment.id}/session/start`, { method: "POST", body: JSON.stringify({}), headers: { "x-arctester-client": "mobile" } });
      const [packageResponse, saved] = await Promise.all([
        api<{ package: ExamPackage }>(`/exams/assignments/${assignment.id}/package`),
        api<{ revision: number; answers: { examQuestionId: string; selectedIndex: number | null }[] }>(`/exams/assignments/${assignment.id}/answers`),
      ]);
      const restored: SavedAnswers = {};
      for (const question of packageResponse.package.questions) restored[question.id] = null;
      for (const answer of saved.answers) if (answer.examQuestionId in restored) restored[answer.examQuestionId] = answer.selectedIndex;
      setPaper(packageResponse.package); setAnswers(restored); setIndex(0);
      setStartedAt(started.session.startedAt); setDeadline(new Date(started.session.deadline).getTime());
      revisionRef.current = saved.revision; attemptUuid.current = uuid();
    } catch (cause) { setError((cause as Error).message || "Could not start this exam."); }
    finally { setBusy(false); }
  };

  const saveAnswers = (next: SavedAnswers, assignmentId: string) => {
    setSaving(true);
    saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
      const response = await api<{ revision: number }>(`/exams/assignments/${assignmentId}/answers`, {
        method: "PUT",
        body: JSON.stringify({ revision: revisionRef.current, answers: Object.entries(next).map(([examQuestionId, selectedIndex]) => ({ examQuestionId, selectedIndex })) }),
      });
      revisionRef.current = response.revision;
    }).catch((cause: unknown) => setError((cause as Error).message || "Answer sync failed. Keep the exam open and retry."))
      .finally(() => setSaving(false));
  };

  const choose = (question: ExamQuestion, optionIndex: number) => {
    if (!paper || seconds <= 0 || busy) return;
    const next = { ...answers, [question.id]: optionIndex };
    setAnswers(next);
    saveAnswers(next, paper.assignmentId);
  };

  const submit = async () => {
    if (!paper || !startedAt || busy) return;
    Alert.alert("Submit exam?", "You cannot change answers after submitting.", [
      { text: "Keep writing", style: "cancel" },
      { text: "Submit exam", style: "destructive", onPress: () => void doSubmit() },
    ]);
  };
  const doSubmit = async () => {
    if (!paper || !startedAt) return;
    setBusy(true); setError("");
    try {
      await saveQueue.current.catch(() => undefined);
      const result = await api<{ submission: { status: string } }>(`/exams/assignments/${paper.assignmentId}/submission`, {
        method: "POST",
        body: JSON.stringify({
          attemptUuid: attemptUuid.current, startedAt, submittedAt: new Date().toISOString(),
          revision: revisionRef.current,
          answers: paper.questions.map(question => ({ examQuestionId: question.id, selectedIndex: answers[question.id] ?? null })),
        }),
      });
      Alert.alert("Exam submitted", result.submission.status === "REVIEW_REQUIRED" ? "Your attempt was received and is waiting for review." : "Your exam was submitted successfully.");
      setPaper(null); setDeadline(null); setStartedAt(null); setAnswers({}); setIndex(0);
      await refresh();
    } catch (cause) { setError((cause as Error).message || "Submission failed. Your answers remain saved."); }
    finally { setBusy(false); }
  };

  if (paper) {
    const question = paper.questions[index];
    const answered = Object.values(answers).filter(value => value !== null && value !== undefined).length;
    return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.top}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>{paper.title}</Text><Text style={[styles.muted, { color: colors.muted }]}>Question {index + 1} / {paper.questions.length}</Text></View><View style={[styles.timer, seconds < 60 && { backgroundColor: "#fee2e2" }]}><MaterialCommunityIcons name="timer-outline" size={17} color={seconds < 60 ? palette.red : palette.blue}/><Text style={{ color: seconds < 60 ? palette.red : palette.blue, fontWeight: "900" }}>{formatTime(seconds)}</Text></View></View>
      <View style={[styles.progress, { backgroundColor: colors.border }]}><View style={[styles.progressFill, { width: `${100 * answered / paper.questions.length}%` }]} /></View>
      {paper.instructions ? <Text style={[styles.muted, { color: colors.muted, marginTop: 12 }]}>{paper.instructions}</Text> : null}
      <Text style={[styles.meta, { color: colors.muted }]}>{question.subject}{question.topic ? " · " + question.topic : ""} · {question.marks} mark(s)</Text>
      <Text style={[styles.question, { color: colors.text }]}>{question.text}</Text>
      {question.options.map((option, optionIndex) => {
        const selected = answers[question.id] === optionIndex;
        return <TouchableOpacity key={optionIndex} onPress={() => choose(question, optionIndex)} accessibilityRole="radio" accessibilityState={{ selected }} style={[styles.option, { borderColor: selected ? palette.blue : colors.border, backgroundColor: selected ? (dark ? "#1d3b68" : "#eff6ff") : colors.surface }]}><Text style={{ color: selected ? palette.blue : colors.text, fontWeight: selected ? "800" : "500" }}>{String.fromCharCode(65 + optionIndex)}. {option}</Text></TouchableOpacity>;
      })}
      <Text style={[styles.muted, { color: colors.muted, marginTop: 10 }]}>{saving ? "Saving answers…" : `${answered} answered · autosaved to your account`}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <TouchableOpacity disabled={index === 0 || busy} onPress={() => setIndex(index - 1)} style={[styles.secondary, { borderColor: colors.border, opacity: index === 0 ? .45 : 1 }]}><Text style={{ color: colors.text, fontWeight: "700" }}>Previous</Text></TouchableOpacity>
        {index < paper.questions.length - 1 ? <TouchableOpacity onPress={() => setIndex(index + 1)} style={styles.primary}><Text style={styles.primaryText}>Next question →</Text></TouchableOpacity> : <TouchableOpacity disabled={busy || saving} onPress={() => void submit()} style={[styles.primary, (busy || saving) && { opacity: .5 }]}><Text style={styles.primaryText}>{busy ? "Submitting…" : "Submit exam"}</Text></TouchableOpacity>}
      </View>
      <TouchableOpacity onPress={() => Alert.alert("Leave exam?", "Your started exam remains active. Return to Exams to resume it.", [{ text: "Stay", style: "cancel" }, { text: "Leave", onPress: () => { setPaper(null); setDeadline(null); setStartedAt(null); void refresh(); } }])} style={styles.leave}><Text style={{ color: colors.muted, fontWeight: "700" }}>Exit exam</Text></TouchableOpacity>
    </View>;
  }

  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.top}><Text style={[styles.title, { color: colors.text, flex: 1 }]}>Write an exam</Text><TouchableOpacity onPress={() => void refresh()}><Text style={{ color: palette.blue, fontWeight: "800" }}>Refresh</Text></TouchableOpacity></View>
    <Text style={[styles.muted, { color: colors.muted }]}>Assigned examinations appear here. Start an exam to open the timed writing interface; your answers save automatically.</Text>
    {loading ? <ActivityIndicator style={{ marginTop: 18 }} /> : assignments.length === 0 ? <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}><MaterialCommunityIcons name="clipboard-text-outline" size={34} color={colors.muted}/><Text style={{ color: colors.text, fontWeight: "800", marginTop: 8 }}>No exams assigned yet</Text><Text style={[styles.muted, { color: colors.muted, textAlign: "center", marginTop: 4 }]}>Your teacher or administrator must publish and assign an exam to your account.</Text></View> : assignments.map(item => {
      const submitted = Boolean(item.submission);
      const notOpen = item.availableFrom ? new Date(item.availableFrom).getTime() > Date.now() : false;
      const expired = item.dueAt ? new Date(item.dueAt).getTime() <= Date.now() : false;
      const canStart = !submitted && !notOpen && !expired && !disabled;
      return <View key={item.id} style={[styles.assignment, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={[styles.assignmentTitle, { color: colors.text }]}>{item.exam.title}</Text>
        {item.exam.description ? <Text style={[styles.muted, { color: colors.muted }]}>{item.exam.description}</Text> : null}
        <Text style={[styles.meta, { color: colors.muted }]}>{item.questionCount} questions · {item.durationMinutes} min · Version {item.version}</Text>
        {submitted ? <Text style={{ color: palette.green, fontWeight: "800", marginTop: 8 }}>Submitted · {item.submission?.status}</Text> : notOpen ? <Text style={{ color: colors.muted, marginTop: 8 }}>Opens {new Date(item.availableFrom!).toLocaleString()}</Text> : expired ? <Text style={{ color: palette.red, marginTop: 8 }}>Deadline passed</Text> : <TouchableOpacity disabled={!canStart || busy} onPress={() => void start(item)} style={[styles.primary, (!canStart || busy) && { opacity: .5 }]}><Text style={styles.primaryText}>{busy ? "Opening exam…" : "Write exam"}</Text></TouchableOpacity>}
      </View>;
    })}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 12, gap: 10 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { fontSize: 21, fontWeight: "900" },
  muted: { fontSize: 13, lineHeight: 19 },
  timer: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, backgroundColor: "#eff6ff", paddingHorizontal: 10, paddingVertical: 8 },
  progress: { height: 6, borderRadius: 8, overflow: "hidden", marginTop: 4 },
  progressFill: { height: "100%", backgroundColor: palette.blue, borderRadius: 8 },
  meta: { fontSize: 11, fontWeight: "700", marginTop: 8 },
  question: { fontSize: 17, lineHeight: 25, fontWeight: "800", marginTop: 10, marginBottom: 4 },
  option: { borderWidth: 1.5, borderRadius: 12, padding: 14, marginTop: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  primary: { flex: 1, backgroundColor: palette.blue, borderRadius: 12, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, marginTop: 8 },
  primaryText: { color: "#fff", fontWeight: "800" },
  secondary: { borderWidth: 1, borderRadius: 12, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 8 },
  leave: { alignItems: "center", padding: 10, marginTop: 4 },
  empty: { borderWidth: 1, borderRadius: 12, alignItems: "center", padding: 18, marginTop: 12 },
  assignment: { borderWidth: 1, borderRadius: 13, padding: 13, marginTop: 12 },
  assignmentTitle: { fontSize: 16, fontWeight: "900" },
  error: { color: palette.red, lineHeight: 20, marginTop: 8 },
});
