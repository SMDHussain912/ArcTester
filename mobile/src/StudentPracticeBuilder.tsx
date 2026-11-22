import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export type PracticeQuestionType = "mcq" | "multi_select" | "true_false" | "fill_blank" | "numeric" | "matching";
export type PracticePaperConfig = {
  subjects: string[];
  topicFilters: { subject: string; topic: string }[];
  difficulty: "any" | "easy" | "medium" | "hard";
  count: number;
  durationMinutes: number;
  questionTypes: PracticeQuestionType[];
};
type BankSubject = { subject: string; count: number; practiceCount?: number; topics?: { topic: string; count: number; practiceCount?: number }[] };
type Props = {
  subjects: BankSubject[];
  total: number;
  darkMode: boolean;
  disabled: boolean;
  initialSubject?: string;
  onRefresh: () => void;
  onStart: (config: PracticePaperConfig) => void;
};

export default function StudentPracticeBuilder({ subjects, total, darkMode, disabled, initialSubject, onRefresh, onStart }: Props) {
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(() => initialSubject ? [initialSubject] : []);
  useEffect(() => { if (initialSubject) setSelectedSubjects([initialSubject]); }, [initialSubject]);
  const [selectedTopics, setSelectedTopics] = useState<Record<string, string[]>>({});
  const [difficulty, setDifficulty] = useState<PracticePaperConfig["difficulty"]>("any");
  const [count, setCount] = useState("20");
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [questionTypes, setQuestionTypes] = useState<PracticeQuestionType[]>([]);
  const questionTypeOptions: { value: PracticeQuestionType; label: string }[] = [
    { value: "mcq", label: "MCQ" }, { value: "multi_select", label: "Multi-select" },
    { value: "true_false", label: "True/false" }, { value: "fill_blank", label: "Fill blank" },
    { value: "numeric", label: "Numeric" }, { value: "matching", label: "Matching" },
  ];
  const selectedPoolCount = selectedSubjects.reduce((sum, subject) => {
    const item = available.find((candidate) => candidate.subject === subject);
    if (!item) return sum;
    const chosenTopics = selectedTopics[subject] ?? [];
    if (chosenTopics.length) return sum + chosenTopics.reduce((topicSum, name) => topicSum + Number(item.topics?.find((topic) => topic.topic === name)?.count ?? 0), 0);
    return sum + Number(item.count ?? 0);
  }, 0);
  const selectedCount = Math.max(1, Math.min(200, selectedPoolCount || 1, Math.floor(Number(count) || 20)));
  const available = useMemo(() => subjects.filter((item) => item.count > 0), [subjects]);
  const topicFilters = selectedSubjects.flatMap((subject) => (selectedTopics[subject] ?? []).map((topic) => ({ subject, topic })));
  const sourceCount = selectedSubjects.reduce((sum, subject) => { const item = available.find((candidate) => candidate.subject === subject); return sum + (item?.practiceCount ?? item?.count ?? 0); }, 0);
  const palette = darkMode ? { card: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#a7b4c8", chip: "#26364d" } : { card: "#fff", border: "#e4e8ef", text: "#172033", muted: "#748096", chip: "#f8fafc" };
  const toggleSubject = (subject: string) => setSelectedSubjects((current) => current.includes(subject) ? current.filter((item) => item !== subject) : [...current, subject]);
  const toggleTopic = (subject: string, topic: string) => setSelectedTopics((current) => { const selected = current[subject] ?? []; return { ...current, [subject]: selected.includes(topic) ? selected.filter((item) => item !== topic) : [...selected, topic] }; });
  return <View style={styles.container}>
    <View style={styles.row}><Text style={[styles.heading, { color: palette.text }]}>Build your practice paper</Text><TouchableOpacity onPress={onRefresh}><Text style={styles.action}>Refresh</Text></TouchableOpacity></View><View style={styles.row}><TouchableOpacity onPress={() => setSelectedSubjects(available.map((item) => item.subject))}><Text style={styles.action}>Select all subjects</Text></TouchableOpacity><TouchableOpacity onPress={() => { setSelectedSubjects([]); setSelectedTopics({}); }}><Text style={[styles.action, { color: palette.muted }]}>Clear selection</Text></TouchableOpacity></View>
    <Text style={[styles.muted, { color: palette.muted }]}>Pick subjects and optional topics. Exam questions are kept out of this pool where possible; a small overlap is allowed if the practice bank runs short.</Text>
    {total === 0 ? <View style={[styles.empty, { backgroundColor: palette.card, borderColor: palette.border }]}><Text style={{ color: palette.text, fontWeight: "700" }}>No published questions available</Text><Text style={{ color: palette.muted, marginTop: 5 }}>Ask an administrator to add questions to the bank.</Text></View> : null}
    {available.map((item) => { const selected = selectedSubjects.includes(item.subject); const chosen = selectedTopics[item.subject] ?? []; return <View key={item.subject} style={[styles.subjectCard, { backgroundColor: palette.card, borderColor: palette.border }]}><TouchableOpacity onPress={() => toggleSubject(item.subject)} style={styles.subjectRow} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}><MaterialCommunityIcons name={selected ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color={selected ? "#2563eb" : palette.muted} /><View style={{ flex: 1 }}><Text style={{ color: palette.text, fontWeight: "700" }}>{item.subject}</Text><Text style={{ color: palette.muted, fontSize: 12 }}>{item.practiceCount ?? item.count} practice-first questions · {(item.topics ?? []).length} topics</Text></View></TouchableOpacity>{selected && (item.topics ?? []).length > 0 ? <View style={styles.chips}>{(item.topics ?? []).map((topic) => { const active = chosen.includes(topic.topic); return <TouchableOpacity key={topic.topic} onPress={() => toggleTopic(item.subject, topic.topic)} accessibilityRole="checkbox" accessibilityState={{ checked: active }} style={[styles.chip, { borderColor: active ? "#2563eb" : palette.border, backgroundColor: active ? (darkMode ? "#1d3b68" : "#eff6ff") : palette.chip }]}><Text style={{ color: active ? (darkMode ? "#bfdbfe" : "#1d4ed8") : palette.muted, fontSize: 12 }}>{topic.topic} · {topic.practiceCount ?? topic.count}</Text></TouchableOpacity>; })}</View> : null}<Text style={{ color: palette.muted, fontSize: 11, marginTop: 5 }}>{selected ? (chosen.length ? chosen.length + " topic filters selected" : "All topics included") : ""}</Text></View>; })}
    <Text style={[styles.label, { color: palette.muted }]}>QUESTION COUNT (1–200)</Text>
    <TextInput keyboardType="number-pad" value={count} onChangeText={(value) => setCount(value.replace(/[^0-9]/g, "").slice(0, 3))} style={[styles.input, { color: palette.text, backgroundColor: palette.card, borderColor: palette.border }]} />
    <Text style={[styles.muted, { color: palette.muted }]}>{selectedPoolCount.toLocaleString()} approved questions match the selected subjects and topics. The paper size is capped to this available count.</Text>
    <Text style={[styles.label, { color: palette.muted }]}>DIFFICULTY</Text>
    <View style={styles.chips}>{(["any", "easy", "medium", "hard"] as const).map((level) => <TouchableOpacity key={level} onPress={() => setDifficulty(level)} style={[styles.chip, { borderColor: difficulty === level ? "#2563eb" : palette.border, backgroundColor: difficulty === level ? (darkMode ? "#1d3b68" : "#eff6ff") : palette.chip }]}><Text style={{ color: difficulty === level ? "#2563eb" : palette.muted, fontWeight: "700", fontSize: 12 }}>{level === "any" ? "All" : level[0].toUpperCase() + level.slice(1)}</Text></TouchableOpacity>)}</View>
    <Text style={[styles.label, { color: palette.muted }]}>QUESTION TYPES</Text>
    <Text style={[styles.muted, { color: palette.muted }]}>{questionTypes.length ? questionTypes.length + " types selected" : "All question types included"}</Text>
    <View style={styles.chips}>{questionTypeOptions.map((item) => { const active = questionTypes.includes(item.value); return <TouchableOpacity key={item.value} onPress={() => setQuestionTypes((current) => active ? current.filter((value) => value !== item.value) : [...current, item.value])} style={[styles.chip, { borderColor: active ? "#2563eb" : palette.border, backgroundColor: active ? (darkMode ? "#1d3b68" : "#eff6ff") : palette.chip }]}><Text style={{ color: active ? "#2563eb" : palette.muted, fontWeight: "700", fontSize: 12 }}>{item.label}</Text></TouchableOpacity>; })}</View>
    <TouchableOpacity onPress={() => setQuestionTypes([])}><Text style={styles.action}>Use all question types</Text></TouchableOpacity>
    <Text style={[styles.label, { color: palette.muted }]}>TIME LIMIT</Text>
    <View style={styles.chips}>{([5, 10, 15, 20, 30, 45, 60, 90, 120, 180] as const).map((minutes) => <TouchableOpacity key={minutes} onPress={() => setDurationMinutes(minutes)} style={[styles.chip, { borderColor: durationMinutes === minutes ? "#2563eb" : palette.border, backgroundColor: durationMinutes === minutes ? (darkMode ? "#1d3b68" : "#eff6ff") : palette.chip }]}><Text style={{ color: durationMinutes === minutes ? "#2563eb" : palette.muted, fontWeight: "700", fontSize: 12 }}>{minutes} min</Text></TouchableOpacity>)}</View>
    <Text style={[styles.muted, { color: palette.muted }]}>{selectedSubjects.length} subjects selected · {selectedPoolCount.toLocaleString()} matching questions · {sourceCount.toLocaleString()} practice-first questions</Text>
    <TouchableOpacity disabled={disabled || selectedSubjects.length === 0 || total === 0 || selectedPoolCount === 0} onPress={() => onStart({ subjects: selectedSubjects, topicFilters, difficulty, count: selectedCount, durationMinutes, questionTypes })} style={[styles.start, (disabled || selectedSubjects.length === 0 || total === 0 || selectedPoolCount === 0) && { opacity: 0.45 }]}><Text style={styles.startText}>{disabled ? "Resume your saved paper first" : "Create " + selectedCount + "-question · " + durationMinutes + " min paper"}</Text></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({ container: { gap: 10 }, row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, heading: { fontSize: 20, fontWeight: "800", flex: 1 }, muted: { fontSize: 13, lineHeight: 19 }, action: { color: "#2563eb", fontWeight: "700" }, subjectCard: { borderWidth: 1, borderRadius: 14, padding: 12 }, subjectRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 }, chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8 }, label: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 9 }, input: { borderWidth: 1, borderRadius: 11, padding: 12 }, start: { backgroundColor: "#2563eb", padding: 15, borderRadius: 12, alignItems: "center", marginTop: 10 }, startText: { color: "#fff", fontWeight: "800" }, empty: { borderWidth: 1, borderRadius: 12, padding: 14 } });