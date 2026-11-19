import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export type PracticePaperConfig = {
  subjects: string[];
  topicFilters: { subject: string; topic: string }[];
  difficulty: "any" | "easy" | "medium" | "hard";
  count: number;
};
type BankSubject = { subject: string; count: number; topics?: { topic: string; count: number }[] };
type Props = {
  subjects: BankSubject[];
  total: number;
  darkMode: boolean;
  disabled: boolean;
  onRefresh: () => void;
  onStart: (config: PracticePaperConfig) => void;
};

export default function StudentPracticeBuilder({ subjects, total, darkMode, disabled, onRefresh, onStart }: Props) {
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<Record<string, string[]>>({});
  const [difficulty, setDifficulty] = useState<PracticePaperConfig["difficulty"]>("any");
  const [count, setCount] = useState("20");
  const selectedCount = Math.max(1, Math.min(200, Math.floor(Number(count) || 20)));
  const available = useMemo(() => subjects.filter((item) => item.count > 0), [subjects]);
  const topicFilters = selectedSubjects.flatMap((subject) => (selectedTopics[subject] ?? []).map((topic) => ({ subject, topic })));
  const sourceCount = selectedSubjects.reduce((sum, subject) => sum + (available.find((item) => item.subject === subject)?.count ?? 0), 0);
  const palette = darkMode ? { card: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#a7b4c8", chip: "#26364d" } : { card: "#fff", border: "#e4e8ef", text: "#172033", muted: "#748096", chip: "#f8fafc" };
  const toggleSubject = (subject: string) => setSelectedSubjects((current) => current.includes(subject) ? current.filter((item) => item !== subject) : [...current, subject]);
  const toggleTopic = (subject: string, topic: string) => setSelectedTopics((current) => { const selected = current[subject] ?? []; return { ...current, [subject]: selected.includes(topic) ? selected.filter((item) => item !== topic) : [...selected, topic] }; });
  return <View style={styles.container}>
    <View style={styles.row}><Text style={[styles.heading, { color: palette.text }]}>Build your practice paper</Text><TouchableOpacity onPress={onRefresh}><Text style={styles.action}>Refresh</Text></TouchableOpacity></View><View style={styles.row}><TouchableOpacity onPress={() => setSelectedSubjects(available.map((item) => item.subject))}><Text style={styles.action}>Select all subjects</Text></TouchableOpacity><TouchableOpacity onPress={() => { setSelectedSubjects([]); setSelectedTopics({}); }}><Text style={[styles.action, { color: palette.muted }]}>Clear selection</Text></TouchableOpacity></View>
    <Text style={[styles.muted, { color: palette.muted }]}>Pick subjects and optional topics. Exam questions are kept out of this pool where possible; a small overlap is allowed if the practice bank runs short.</Text>
    {total === 0 ? <View style={[styles.empty, { backgroundColor: palette.card, borderColor: palette.border }]}><Text style={{ color: palette.text, fontWeight: "700" }}>No published questions available</Text><Text style={{ color: palette.muted, marginTop: 5 }}>Ask an administrator to add questions to the bank.</Text></View> : null}
    {available.map((item) => { const selected = selectedSubjects.includes(item.subject); const chosen = selectedTopics[item.subject] ?? []; return <View key={item.subject} style={[styles.subjectCard, { backgroundColor: palette.card, borderColor: palette.border }]}><TouchableOpacity onPress={() => toggleSubject(item.subject)} style={styles.subjectRow} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}><MaterialCommunityIcons name={selected ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color={selected ? "#2563eb" : palette.muted} /><View style={{ flex: 1 }}><Text style={{ color: palette.text, fontWeight: "700" }}>{item.subject}</Text><Text style={{ color: palette.muted, fontSize: 12 }}>{item.count} questions · {(item.topics ?? []).length} topics</Text></View></TouchableOpacity>{selected && (item.topics ?? []).length > 0 ? <View style={styles.chips}>{(item.topics ?? []).map((topic) => { const active = chosen.includes(topic.topic); return <TouchableOpacity key={topic.topic} onPress={() => toggleTopic(item.subject, topic.topic)} accessibilityRole="checkbox" accessibilityState={{ checked: active }} style={[styles.chip, { borderColor: active ? "#2563eb" : palette.border, backgroundColor: active ? (darkMode ? "#1d3b68" : "#eff6ff") : palette.chip }]}><Text style={{ color: active ? (darkMode ? "#bfdbfe" : "#1d4ed8") : palette.muted, fontSize: 12 }}>{topic.topic} · {topic.count}</Text></TouchableOpacity>; })}</View> : null}<Text style={{ color: palette.muted, fontSize: 11, marginTop: 5 }}>{selected ? (chosen.length ? chosen.length + " topic filters selected" : "All topics included") : ""}</Text></View>; })}
    <Text style={[styles.label, { color: palette.muted }]}>QUESTION COUNT (1–200)</Text>
    <TextInput keyboardType="number-pad" value={count} onChangeText={(value) => setCount(value.replace(/[^0-9]/g, "").slice(0, 3))} style={[styles.input, { color: palette.text, backgroundColor: palette.card, borderColor: palette.border }]} />
    <Text style={[styles.label, { color: palette.muted }]}>DIFFICULTY</Text>
    <View style={styles.chips}>{(["any", "easy", "medium", "hard"] as const).map((level) => <TouchableOpacity key={level} onPress={() => setDifficulty(level)} style={[styles.chip, { borderColor: difficulty === level ? "#2563eb" : palette.border, backgroundColor: difficulty === level ? (darkMode ? "#1d3b68" : "#eff6ff") : palette.chip }]}><Text style={{ color: difficulty === level ? "#2563eb" : palette.muted, fontWeight: "700", fontSize: 12 }}>{level === "any" ? "All" : level[0].toUpperCase() + level.slice(1)}</Text></TouchableOpacity>)}</View>
    <Text style={[styles.muted, { color: palette.muted }]}>{selectedSubjects.length} subjects selected · {sourceCount.toLocaleString()} questions before filters</Text>
    <TouchableOpacity disabled={disabled || selectedSubjects.length === 0 || total === 0} onPress={() => onStart({ subjects: selectedSubjects, topicFilters, difficulty, count: selectedCount })} style={[styles.start, (disabled || selectedSubjects.length === 0 || total === 0) && { opacity: 0.45 }]}><Text style={styles.startText}>{disabled ? "Resume your saved paper first" : "Create " + selectedCount + "-question paper"}</Text></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({ container: { gap: 10 }, row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, heading: { fontSize: 20, fontWeight: "800", flex: 1 }, muted: { fontSize: 13, lineHeight: 19 }, action: { color: "#2563eb", fontWeight: "700" }, subjectCard: { borderWidth: 1, borderRadius: 14, padding: 12 }, subjectRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 }, chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8 }, label: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 9 }, input: { borderWidth: 1, borderRadius: 11, padding: 12 }, start: { backgroundColor: "#2563eb", padding: 15, borderRadius: 12, alignItems: "center", marginTop: 10 }, startText: { color: "#fff", fontWeight: "800" }, empty: { borderWidth: 1, borderRadius: 12, padding: 14 } });