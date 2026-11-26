import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { OfflineLearningQuestion } from "./learningStore";

type Props = { questions: OfflineLearningQuestion[]; darkMode?: boolean };

export default function OfflinePracticeLibrary({ questions, darkMode = false }: Props) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("All");
  const [visibleCount, setVisibleCount] = useState(12);
  const subjects = useMemo(() => ["All", ...new Set(questions.map((item) => item.subject).sort((a, b) => a.localeCompare(b)))], [questions]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return questions.filter((item) => (subject === "All" || item.subject === subject) && (!needle || [item.text, item.subject, item.topic ?? "", ...item.options].join(" ").toLowerCase().includes(needle)));
  }, [questions, query, subject]);
  const palette = darkMode
    ? { card: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#a7b4c8", field: "#0f172a", chip: "#26364d" }
    : { card: "#ffffff", border: "#e4e8ef", text: "#172033", muted: "#748096", field: "#f8fafc", chip: "#f1f5f9" };
  return <View style={[styles.container, { backgroundColor: palette.card, borderColor: palette.border }]} accessibilityLabel="Downloaded practice question bank">
    <View style={styles.header}><View style={{ flex: 1 }}><Text style={[styles.title, { color: palette.text }]}>Downloaded practice bank</Text><Text style={[styles.caption, { color: palette.muted }]}>{questions.length} questions saved for offline reading · answer keys are not included</Text></View><Text style={[styles.count, { color: palette.text }]}>{filtered.length}</Text></View>
    <TextInput value={query} onChangeText={(value) => { setQuery(value); setVisibleCount(12); }} placeholder="Search questions, topics or options" placeholderTextColor={palette.muted} style={[styles.search, { color: palette.text, backgroundColor: palette.field, borderColor: palette.border }]} accessibilityLabel="Search downloaded practice questions" />
    <View style={styles.chips}>{subjects.map((name) => <TouchableOpacity key={name} onPress={() => { setSubject(name); setVisibleCount(12); }} style={[styles.chip, { backgroundColor: subject === name ? (darkMode ? "#1d3b68" : "#eff6ff") : palette.chip, borderColor: subject === name ? "#2563eb" : palette.border }]}><Text style={{ color: subject === name ? (darkMode ? "#bfdbfe" : "#1d4ed8") : palette.muted, fontSize: 12, fontWeight: "700" }}>{name}</Text></TouchableOpacity>)}</View>
    {filtered.length === 0 ? <Text style={[styles.empty, { color: palette.muted }]}>No downloaded questions match this search.</Text> : filtered.slice(0, visibleCount).map((item, index) => <View key={item.id} style={[styles.question, { borderColor: palette.border }]}><View style={styles.meta}><Text style={[styles.metaText, { color: palette.muted }]}>{item.subject}{item.topic ? " · " + item.topic : ""}</Text><Text style={[styles.metaText, { color: palette.muted }]}>{item.difficulty}</Text></View><Text style={[styles.questionText, { color: palette.text }]}>{index + 1}. {item.text}</Text>{item.options.map((option, optionIndex) => <Text key={optionIndex} style={[styles.option, { color: palette.muted }]}>{String.fromCharCode(65 + optionIndex)}. {option}</Text>)}</View>)}
    {filtered.length > visibleCount ? <TouchableOpacity onPress={() => setVisibleCount((current) => current + 12)} style={styles.more}><Text style={styles.moreText}>Show {Math.min(12, filtered.length - visibleCount)} more questions</Text></TouchableOpacity> : null}
  </View>;
}

const styles = StyleSheet.create({ container: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 14, gap: 11 }, header: { flexDirection: "row", alignItems: "center", gap: 12 }, title: { fontSize: 16, fontWeight: "800" }, caption: { fontSize: 12, lineHeight: 17, marginTop: 3 }, count: { fontSize: 22, fontWeight: "800" }, search: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7 }, question: { borderTopWidth: 1, paddingTop: 10, gap: 4 }, meta: { flexDirection: "row", justifyContent: "space-between", gap: 8 }, metaText: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }, questionText: { fontSize: 14, fontWeight: "700", lineHeight: 20, marginTop: 4 }, option: { fontSize: 12, lineHeight: 17, paddingLeft: 8 }, empty: { fontSize: 13, paddingVertical: 12 }, more: { alignItems: "center", padding: 11 }, moreText: { color: "#2563eb", fontWeight: "800", fontSize: 13 } });