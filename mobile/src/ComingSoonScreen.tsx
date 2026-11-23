import React from "react";
import { StyleSheet, Text, View } from "react-native";

const roadmap = [
  ["XP, levels & streaks", "Earn experience and track daily learning streaks."],
  ["Rewards & leaderboard", "Unlock milestones and compare progress with classmates."],
  ["Mastery & smart revision", "Find weak topics and get focused revision practice."],
  ["Learning analytics", "Track accuracy, subject strengths and exam readiness."],
  ["More guided lessons", "New animated explanations and expanded lesson paths."],
];

export default function ComingSoonScreen({ darkMode }: { darkMode: boolean }) {
  const colors = darkMode
    ? { card: "#172235", border: "#334155", text: "#f1f5f9", muted: "#a7b4c8", tile: "#1e293b" }
    : { card: "#ffffff", border: "#e4e8ef", text: "#172033", muted: "#748096", tile: "#f8fafc" };
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={styles.eyebrow}>ARCTESTER · NEXT UPDATE</Text>
      <Text style={[styles.title, { color: colors.text }]}>More ways to learn are on the way</Text>
      <Text style={[styles.body, { color: colors.muted }]}>The launch version focuses on learning, lessons, practice and assigned exams. Here’s what we’re building next.</Text>
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
