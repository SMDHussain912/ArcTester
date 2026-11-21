import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { mobilePalette, radius, spacing, typeScale } from "../design/tokens";

type PathQuestion = {
  id: number; subject: string; topic: string | null; text: string; options: string[];
  questionType: "mcq" | "multi_select" | "true_false" | "fill_blank" | "numeric" | "matching";
  promptData: Record<string, unknown>;
};
type PathUnit = {
  id: number; title: string; position: number; status: string;
  lessons: { id: number; title: string; status: string }[];
  unitTest: { status: string; passedAt: string | null; bestScorePct: number; attempts: number };
};
type PathState = { subjects: { id: number; subject: string; units: PathUnit[] }[] };
type Session = { unitId: number; title: string; attemptKey: string; questions: PathQuestion[] };
type TestResult = { passed: boolean; scorePct: number; passScorePct: number; progress: { attempts: number; bestScorePct: number } };
type Props = {
  darkMode: boolean;
  disabled?: boolean;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
};

export default function UnitTestCheckpoint({ darkMode, disabled = false, api }: Props) {
  const palette = darkMode ? mobilePalette.dark : mobilePalette.light;
  const [path, setPath] = useState<PathState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const apiRef = useRef(api);\n  apiRef.current = api;\n  const [resultTitle, setResultTitle] = useState("");

  const refresh = async () => {
    setLoading(true);
    try { setPath(await apiRef.current<PathState>("/path")); }
    catch (cause) { setError((cause as Error).message || "Could not load your unit checkpoints."); }
    finally { setLoading(false); }
  };
  useEffect(() => { let active = true; setLoading(true); apiRef.current<PathState>("/path").then((value) => { if (active) setPath(value); }).catch((cause) => { if (active) setError((cause as Error).message || "Could not load your unit checkpoints."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);

  const start = async (unit: PathUnit) => {
    setBusy(true); setError(""); setResult(null);
    try {
      const created = await api<{ unitId: number; attemptKey: string; questions: PathQuestion[] }>(`/path/units/${unit.id}/test`);
      if (!created.attemptKey || created.questions.length !== 10) throw new Error("This unit checkpoint is not ready yet.");
      setSession({ unitId: unit.id, title: unit.title, attemptKey: created.attemptKey, questions: created.questions });
      setAnswers({}); setSaved({}); setIndex(0); setResultTitle(unit.title);
    } catch (cause) { setError((cause as Error).message || "Could not start the unit checkpoint."); }
    finally { setBusy(false); }
  };

  const saveAnswer = async (question: PathQuestion, response: unknown) => {
    if (!session || busy) return;
    setAnswers((current) => ({ ...current, [question.id]: response }));
    setBusy(true); setError("");
    try {
      await api(`/path/units/${session.unitId}/test/answer`, {
        method: "POST", body: JSON.stringify({ questionId: question.id, response, attemptKey: session.attemptKey }),
      });
      setSaved((current) => ({ ...current, [question.id]: true }));
    } catch (cause) { setError((cause as Error).message || "Answer could not be saved. Retry before moving on."); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    if (!session || busy) return;
    const missing = session.questions.some((question) => answers[question.id] === undefined || saved[question.id] !== true);
    if (missing) { setError("Save an answer for all 10 questions before submitting."); return; }
    setBusy(true); setError("");
    try {
      const completed = await api<TestResult>(`/path/units/${session.unitId}/test/complete`, {
        method: "POST", body: JSON.stringify({ attemptKey: session.attemptKey }),
      });
      setResult(completed); setResultTitle(session.title); setSession(null);
      await refresh();
    } catch (cause) { setError((cause as Error).message || "Could not submit this checkpoint."); }
    finally { setBusy(false); }
  };

  const card = { backgroundColor: palette.surface, borderColor: palette.border };
  const text = { color: palette.text };
  const muted = { color: palette.muted };
  const question = session?.questions[index];

  if (session && question) {
    const leftItems = Array.isArray(question.promptData.leftItems) ? question.promptData.leftItems.filter((x): x is string => typeof x === "string") : [];
    const rightItems = Array.isArray(question.promptData.rightItems) ? question.promptData.rightItems.filter((x): x is string => typeof x === "string") : [];
    const selected = answers[question.id];
    return (
      <View style={[styles.container, styles.panel, card]}>
        <View style={styles.row}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Exit unit test" onPress={() => { setSession(null); setError(""); }} style={styles.iconButton}><MaterialCommunityIcons name="arrow-left" size={22} color={palette.text} /></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: palette.primary }]}>UNIT CHECKPOINT</Text>
            <Text style={[styles.heading, text]}>{session.title}</Text>
          </View>
          <Text style={[styles.count, muted]}>{index + 1}/10</Text>
        </View>
        <View style={[styles.track, { backgroundColor: palette.border }]}><View style={[styles.fill, { width: `${(index + 1) * 10}%`, backgroundColor: palette.primary }]} /></View>
        <Text style={[styles.meta, muted]}>{question.subject}{question.topic ? ` · ${question.topic}` : ""} · 70% to pass</Text>
        <Text style={[styles.question, text]}>{question.text}</Text>
        {question.questionType === "fill_blank" || question.questionType === "numeric" ? (
          <View style={{ gap: spacing["2"] }}>
            <TextInput value={typeof selected === "string" ? selected : typeof selected === "number" ? String(selected) : ""} onChangeText={(value) => { setAnswers((current) => ({ ...current, [question.id]: value })); setSaved((current) => ({ ...current, [question.id]: false })); }} keyboardType={question.questionType === "numeric" ? "decimal-pad" : "default"} placeholder={question.questionType === "numeric" ? "Enter a number" : "Type your answer"} placeholderTextColor={palette.muted} style={[styles.input, { color: palette.text, backgroundColor: palette.background, borderColor: palette.border }]} />
            <TouchableOpacity disabled={busy || !String(selected ?? "").trim() || (question.questionType === "numeric" && !Number.isFinite(Number(selected)))} onPress={() => void saveAnswer(question, question.questionType === "numeric" ? Number(selected) : String(selected).trim())} style={[styles.primary, { backgroundColor: palette.primary }, busy && styles.disabled]}><Text style={[styles.primaryText, { color: palette.onPrimary }]}>{saved[question.id] ? "Saved ✓" : "Save answer"}</Text></TouchableOpacity>
          </View>
        ) : question.questionType === "matching" && leftItems.length > 0 && rightItems.length > 0 ? (
          <View style={{ gap: spacing["3"] }}>
            {leftItems.map((left, leftIndex) => {
              const response = Array.isArray(selected) ? selected as unknown[] : [];
              const current = response[leftIndex];
              return <View key={leftIndex} style={[styles.matchRow, { borderColor: palette.border }]}><Text style={[styles.optionText, text]}>{left}</Text><View style={styles.matchChoices}>{rightItems.map((right, rightIndex) => <TouchableOpacity key={rightIndex} onPress={() => { const next = leftItems.map((_, i) => i === leftIndex ? rightIndex : response[i] ?? null); setAnswers((old) => ({ ...old, [question.id]: next })); setSaved((old) => ({ ...old, [question.id]: false })); }} style={[styles.matchChoice, { borderColor: palette.border, backgroundColor: current === rightIndex ? palette.primarySoft : palette.background }]}><Text style={[styles.optionText, { color: current === rightIndex ? palette.primary : palette.text }]}>{right}</Text></TouchableOpacity>)}</View></View>;
            })}
            <TouchableOpacity disabled={busy || !Array.isArray(selected) || selected.length !== leftItems.length || selected.some((value) => !Number.isInteger(value))} onPress={() => void saveAnswer(question, selected)} style={[styles.primary, { backgroundColor: palette.primary }]}><Text style={[styles.primaryText, { color: palette.onPrimary }]}>{saved[question.id] ? "Saved ✓" : "Save matching"}</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: spacing["2"] }}>
            {question.questionType === "multi_select" ? <Text style={[styles.meta, muted]}>Select all that apply.</Text> : null}
            {question.options.map((option, optionIndex) => {
              const multi = question.questionType === "multi_select";
              const checked = multi ? Array.isArray(selected) && selected.includes(optionIndex) : selected === optionIndex;
              return <TouchableOpacity key={optionIndex} accessibilityRole={multi ? "checkbox" : "radio"} accessibilityState={{ checked }} disabled={busy} onPress={() => {
                if (multi) {
                  const current = Array.isArray(selected) ? selected as number[] : [];
                  const next = current.includes(optionIndex) ? current.filter((value) => value !== optionIndex) : [...current, optionIndex].sort((a,b)=>a-b);
                  setAnswers((old) => ({ ...old, [question.id]: next })); setSaved((old) => ({ ...old, [question.id]: false }));
                } else void saveAnswer(question, optionIndex);
              }} style={[styles.option, { borderColor: checked ? palette.primary : palette.border, backgroundColor: checked ? palette.primarySoft : palette.background }]}>
                <Text style={[styles.optionText, { color: checked ? palette.primary : palette.text }]}>{String.fromCharCode(65 + optionIndex)}. {option}</Text>
              </TouchableOpacity>;
            })}
            {question.questionType === "multi_select" ? <TouchableOpacity disabled={busy || !Array.isArray(selected) || selected.length === 0} onPress={() => void saveAnswer(question, selected)} style={[styles.primary, { backgroundColor: palette.primary }]}><Text style={[styles.primaryText, { color: palette.onPrimary }]}>{saved[question.id] ? "Saved ✓" : "Save selections"}</Text></TouchableOpacity> : null}
          </View>
        )}
        <Text style={[styles.meta, muted]}>{saved[question.id] ? "Answer saved securely." : "Save your answer before moving on."}</Text>
        {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
        <View style={styles.actions}>
          <TouchableOpacity disabled={index === 0 || busy} onPress={() => setIndex((value) => Math.max(0, value - 1))} style={[styles.secondary, { borderColor: palette.border }]}><Text style={[styles.primaryText, text]}>Previous</Text></TouchableOpacity>
          {index < 9 ? <TouchableOpacity disabled={busy || !saved[question.id]} onPress={() => setIndex((value) => Math.min(9, value + 1))} style={[styles.primary, { backgroundColor: palette.primary, flex: 1 }]}><Text style={[styles.primaryText, { color: palette.onPrimary }]}>Next question →</Text></TouchableOpacity> : <TouchableOpacity disabled={busy} onPress={() => void finish()} style={[styles.primary, { backgroundColor: palette.primary, flex: 1 }]}><Text style={[styles.primaryText, { color: palette.onPrimary }]}>{busy ? "Submitting…" : "Submit checkpoint"}</Text></TouchableOpacity>}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.panel, card]}>
      <View style={styles.row}>
        <View style={[styles.pathIcon, { backgroundColor: palette.primarySoft }]}><MaterialCommunityIcons name="clipboard-check-outline" size={24} color={palette.primary} /></View>
        <View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: palette.primary }]}>LEARN · CHECK · RETRY</Text><Text style={[styles.heading, text]}>Unit checkpoints</Text><Text style={[styles.subtitle, muted]}>Pass with 70%. Failed tests can be retried; your best score stays.</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh unit checkpoints" onPress={() => void refresh()} disabled={loading}><MaterialCommunityIcons name="refresh" size={21} color={palette.primary} /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator color={palette.primary} style={{ marginVertical: 12 }} /> : null}
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
      {result ? <View style={[styles.result, { backgroundColor: result.passed ? palette.successSoft : palette.primarySoft }]}><Text style={[styles.resultTitle, { color: result.passed ? palette.success : palette.primary }]}>{result.passed ? "Checkpoint passed!" : "Not passed yet"}</Text><Text style={[styles.resultScore, text]}>{result.scorePct}% · {result.passScorePct}% required</Text><Text style={[styles.meta, muted]}>Attempt {result.progress.attempts} · Best {result.progress.bestScorePct}%</Text><Text style={[styles.meta, text]}>{result.passed ? "Unit unlocked. You can continue to the next unit." : "Review the lessons, then retry this checkpoint."}</Text></View> : null}
      {!path || path.subjects.length === 0 ? <Text style={[styles.meta, muted]}>No learning-path units are available yet.</Text> : path.subjects.map((subject) => <View key={subject.id} style={{ gap: spacing["2"] }}><Text style={[styles.subject, text]}>{subject.subject}</Text>{subject.units.map((unit) => {
        const done = unit.unitTest.status === "completed";
        const unlocked = unit.unitTest.status === "available" || done;
        const lessonsDone = unit.lessons.filter((lesson) => lesson.status === "completed").length;
        return <View key={unit.id} style={[styles.unitCard, { borderColor: palette.border, backgroundColor: palette.background }]}><View style={{ flex: 1 }}><Text style={[styles.unitTitle, text]}>{unit.position}. {unit.title}</Text><Text style={[styles.meta, muted]}>{lessonsDone}/{unit.lessons.length} lessons · {done ? `Passed · best ${unit.unitTest.bestScorePct}%` : unit.unitTest.status === "locked" ? "Complete lessons to unlock" : unit.unitTest.attempts ? `Retry available · best ${unit.unitTest.bestScorePct}%` : "Checkpoint ready"}</Text></View><TouchableOpacity disabled={disabled || busy || loading || !unlocked} onPress={() => void start(unit)} style={[styles.startButton, { backgroundColor: unlocked ? palette.primary : palette.border }, (!unlocked || disabled || busy) && styles.disabled]}><Text style={[styles.startText, { color: unlocked ? palette.onPrimary : palette.muted }]}>{done ? "Review" : unit.unitTest.attempts ? "Retry" : "Start"}</Text></TouchableOpacity></View>;
      })}</View>)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing["4"], gap: spacing["3"] },
  panel: { borderWidth: 1, borderRadius: radius.xl, padding: spacing["4"] },
  row: { flexDirection: "row", alignItems: "center", gap: spacing["3"] },
  pathIcon: { width: 44, height: 44, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  heading: { fontSize: typeScale.size.lg, fontWeight: "900", marginTop: 3 },
  subtitle: { fontSize: typeScale.size.xs, lineHeight: 18, marginTop: 4 },
  count: { fontSize: typeScale.size.sm, fontWeight: "800" },
  track: { height: 6, borderRadius: 8, overflow: "hidden" },
  fill: { height: 6, borderRadius: 8 },
  meta: { fontSize: typeScale.size.xs, lineHeight: 18, marginTop: 3 },
  question: { fontSize: typeScale.size.md, fontWeight: "800", lineHeight: 24, marginVertical: spacing["2"] },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing["3"], fontSize: typeScale.size.md },
  option: { borderWidth: 1, borderRadius: radius.md, padding: spacing["3"] },
  optionText: { fontSize: typeScale.size.sm, lineHeight: 20, fontWeight: "600" },
  primary: { minHeight: 44, borderRadius: radius.md, paddingHorizontal: spacing["3"], alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: typeScale.size.sm, fontWeight: "800" },
  secondary: { minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing["3"], alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: spacing["2"], marginTop: spacing["2"] },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  error: { fontSize: typeScale.size.sm, lineHeight: 20 },
  subject: { fontSize: typeScale.size.md, fontWeight: "900", marginTop: spacing["2"] },
  unitCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing["3"], flexDirection: "row", alignItems: "center", gap: spacing["2"] },
  unitTitle: { fontSize: typeScale.size.sm, fontWeight: "800" },
  startButton: { minWidth: 60, minHeight: 40, borderRadius: radius.md, paddingHorizontal: spacing["3"], alignItems: "center", justifyContent: "center" },
  startText: { fontSize: typeScale.size.sm, fontWeight: "900" },
  result: { borderRadius: radius.lg, padding: spacing["3"], gap: spacing["1"] },
  resultTitle: { fontSize: typeScale.size.md, fontWeight: "900" },
  resultScore: { fontSize: typeScale.size.xl, fontWeight: "900" },
  matchRow: { borderWidth: 1, borderRadius: radius.md, padding: spacing["2"], gap: spacing["2"] },
  matchChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing["1"] },
  matchChoice: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing["2"], paddingVertical: spacing["1"] },
  disabled: { opacity: 0.45 },
});
