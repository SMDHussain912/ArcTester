import React, { useEffect, useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { mobilePalette, radius, spacing, typeScale } from "../design/tokens";
import { availableLessonSubjects, availableLessonTopics } from "../lessonPath";
import type { LearningPathSubject } from "../learningPath";

type Props = {
  subjects: LearningPathSubject[];
  darkMode: boolean;
  disabled?: boolean;
  onStart: (subject: string, topic?: string) => void;
};

export default function LessonLaunchCard({ subjects, darkMode, disabled = false, onStart }: Props) {
  const palette = darkMode ? mobilePalette.dark : mobilePalette.light;
  const options = useMemo(() => availableLessonSubjects(subjects), [subjects]);
  const [subjectName, setSubjectName] = useState(options[0]?.subject ?? "");
  const subject = options.find((item) => item.subject === subjectName) ?? options[0];
  const topics = availableLessonTopics(subject);
  const [topicName, setTopicName] = useState("");
  useEffect(() => {
    if (!options.some((item) => item.subject === subjectName)) setSubjectName(options[0]?.subject ?? "");
  }, [options, subjectName]);
  useEffect(() => { setTopicName(""); }, [subject?.subject]);
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]} accessibilityLabel="Start a guided lesson">
      <View style={styles.headingRow}>
        <View style={[styles.icon, { backgroundColor: palette.primarySoft }]}><MaterialCommunityIcons name="book-open-variant" size={23} color={palette.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: palette.text }]}>Quick lesson</Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>One question · check your answer · read the explanation</Text>
        </View>
      </View>
      {options.length === 0 ? <Text style={[styles.subtitle, { color: palette.muted }]}>No practice questions are available for lessons yet.</Text> : <>
        <Text style={[styles.label, { color: palette.muted }]}>SUBJECT</Text>
        <View style={styles.chips}>{options.map((item) => <TouchableOpacity key={item.subject} accessibilityRole="button" accessibilityState={{ selected: subject?.subject === item.subject }} onPress={() => setSubjectName(item.subject)} style={[styles.chip, { backgroundColor: subject?.subject === item.subject ? palette.primarySoft : palette.surface, borderColor: subject?.subject === item.subject ? palette.primary : palette.border }]}><Text style={{ color: subject?.subject === item.subject ? palette.primary : palette.muted, fontSize: 12, fontWeight: "700" }}>{item.subject}</Text></TouchableOpacity>)}</View>
        {topics.length > 0 ? <>
          <Text style={[styles.label, { color: palette.muted }]}>TOPIC (OPTIONAL)</Text>
          <View style={styles.chips}>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: !topicName }} onPress={() => setTopicName("")} style={[styles.chip, { backgroundColor: !topicName ? palette.primarySoft : palette.surface, borderColor: !topicName ? palette.primary : palette.border }]}><Text style={{ color: !topicName ? palette.primary : palette.muted, fontSize: 12, fontWeight: "700" }}>Any topic</Text></TouchableOpacity>
            {topics.map((item) => <TouchableOpacity key={item.topic} accessibilityRole="button" accessibilityState={{ selected: topicName === item.topic }} onPress={() => setTopicName(item.topic)} style={[styles.chip, { backgroundColor: topicName === item.topic ? palette.primarySoft : palette.surface, borderColor: topicName === item.topic ? palette.primary : palette.border }]}><Text style={{ color: topicName === item.topic ? palette.primary : palette.muted, fontSize: 12, fontWeight: "700" }}>{item.topic}</Text></TouchableOpacity>)}
          </View>
        </> : null}
        <TouchableOpacity disabled={disabled || !subject} onPress={() => subject && onStart(subject.subject, topicName || undefined)} style={[styles.start, { backgroundColor: palette.primary }, disabled && styles.disabled]}><Text style={[styles.startText, { color: palette.onPrimary }]}>Start lesson</Text><MaterialCommunityIcons name="arrow-right" size={18} color={palette.onPrimary} /></TouchableOpacity>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.xl, padding: spacing["4"], gap: spacing["3"], marginTop: spacing["4"] },
  headingRow: { flexDirection: "row", alignItems: "center", gap: spacing["3"] },
  icon: { width: 44, height: 44, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  title: { fontSize: typeScale.size.lg, fontWeight: "800" },
  subtitle: { fontSize: typeScale.size.sm, lineHeight: 19 },
  label: { fontSize: typeScale.size.xs, fontWeight: "800", letterSpacing: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing["3"], paddingVertical: spacing["2"] },
  start: { minHeight: 46, borderRadius: radius.lg, paddingHorizontal: spacing["4"], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing["2"] },
  startText: { fontWeight: "800" },
  disabled: { opacity: 0.45 },
});
