import React from "react";
import { StyleSheet, Text, View } from "react-native";

const roadmap = [
  ["Learning hub & learning path", "A structured subject, unit and lesson experience with clear next steps."],
  ["Lessons library", "Guided lessons with interactive steps, examples and knowledge checks."],
  ["Learning summary", "A focused view of completed lessons, practice accuracy and subject progress."],
  ["Progress dashboard", "A clear view of study activity, milestones and performance over time."],
  ["Animated explanations", "Step-by-step reveals, highlights, narration and replayable lesson scenes."],
  ["Adaptive study plan", "Recommendations that prioritize weak topics and upcoming ECET goals."],
  ["Detailed exam review", "Topic-wise results, answer explanations and a personal mistake-review list."],
  ["Offline lessons & bookmarks", "Download selected lessons and save important questions for later."],
  ["XP, levels & streaks", "Earn experience, build daily streaks and track learning milestones."],
  ["Rewards, achievements & leaderboard", "Unlock milestones and compare progress with classmates."],
  ["Learning analytics", "Track accuracy trends, subject strengths and exam readiness."],
];

export default function ComingSoonScreen({ darkMode }: { darkMode: boolean }) {
  const colors = darkMode
    ? { card: "#172235", border: "#334155", text: "#f1f5f9", muted: "#a7b4c8", tile: "#1e293b" }
    : { card: "#ffffff", border: "#e4e8ef", text: "#172033", muted: "#748096", tile: "#f8fafc" };
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={styles.eyebrow}>ARCTESTER · NEXT UPDATE</Text>
      <Text style={[styles.title, { color: colors.text }]}>More ways to learn are on the way</Text>
      <Text style={[styles.body, { color: colors.muted }]}>Practice and assigned exams remain available. Learning, lessons and the learning summary are moving to a future update while we finish them.</Text>
      {roadmap.map(([title, detail], index) => (
        <View key={title} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.body, { color: colors.muted, marginTop: 4 }]}>{detail}</Text>
          </View>
        </View>
      ))}
      <Text style={[styles.footnote, { color: colors.muted }]}>These features are not available yet. We’ll enable them when they’re ready.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 18 },
  eyebrow: { color: "#4f46e5", fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "900", marginTop: 10 },
  body: { fontSize: 14, lineHeight: 21 },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  number: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" },
  numberText: { color: "#4f46e5", fontWeight: "900" },
  featureTitle: { fontSize: 15, fontWeight: "800" },
  footnote: { fontSize: 12, lineHeight: 18, marginTop: 14 },
});
