import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { mobilePalette, radius, spacing, typeScale } from "../design/tokens";

type BankSubject = {
  subject: string;
  count: number;
  practiceCount?: number;
  topics?: { topic: string; count: number; practiceCount?: number }[];
};
type SubjectProgress = {
  subject: string;
  seen: number;
  accuracy: number | null;
};
type Props = {
  subjects: BankSubject[];
  progress: SubjectProgress[];
  darkMode: boolean;
  disabled?: boolean;
  onPractice: (subject: string) => void;
};

export default function LearningPathHome({ subjects, progress, darkMode, disabled = false, onPractice }: Props) {
  const palette = darkMode ? mobilePalette.dark : mobilePalette.light;
  const availableSubjects = subjects.filter((item) => (item.practiceCount ?? item.count) > 0);
  const totalAvailable = availableSubjects.reduce((sum, item) => sum + (item.practiceCount ?? item.count), 0);
  const totalSeen = availableSubjects.reduce((sum, item) => {
    const subjectProgress = progress.find((entry) => entry.subject === item.subject);
    return sum + Math.min(subjectProgress?.seen ?? 0, item.practiceCount ?? item.count);
  }, 0);
  const overallProgress = totalAvailable > 0 ? Math.min(1, totalSeen / totalAvailable) : 0;
  const nextSubject = availableSubjects.find((item) => {
    const itemProgress = progress.find((entry) => entry.subject === item.subject);
    return (itemProgress?.seen ?? 0) < (item.practiceCount ?? item.count);
  }) ?? availableSubjects[0];

  return (
    <View style={styles.container} accessibilityLabel="Your learning path">
      <View style={styles.headingRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.primary }]}>YOUR STUDY JOURNEY</Text>
          <Text style={[styles.heading, { color: palette.text }]}>Your learning path</Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>Small steps. Stronger fundamentals.</Text>
        </View>
        <View style={[styles.pathIcon, { backgroundColor: palette.primarySoft }]}>
          <MaterialCommunityIcons name="map-marker-path" size={25} color={palette.primary} />
        </View>
      </View>

      <View style={[styles.summaryCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.summaryTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryLabel, { color: palette.muted }]}>PATH PROGRESS</Text>
            <Text style={[styles.summaryValue, { color: palette.text }]}>{totalSeen.toLocaleString()} <Text style={[styles.summaryTotal, { color: palette.muted }]}>/ {totalAvailable.toLocaleString()} questions explored</Text></Text>
          </View>
          <Text style={[styles.percent, { color: palette.primary }]}>{Math.round(overallProgress * 100)}%</Text>
        </View>
        <View style={[styles.track, { backgroundColor: palette.border }]}>
          <View style={[styles.fill, { width: `${Math.round(overallProgress * 100)}%`, backgroundColor: palette.primary }]} />
        </View>
        {nextSubject ? (
          <View style={[styles.nextCard, { backgroundColor: palette.primarySoft }]}>
            <View style={styles.nextIcon}>
              <MaterialCommunityIcons name="book-open-page-variant" size={20} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.nextLabel, { color: palette.primary }]}>UP NEXT</Text>
              <Text style={[styles.nextTitle, { color: palette.text }]} numberOfLines={2}>{nextSubject.subject}</Text>
              <Text style={[styles.nextMeta, { color: palette.muted }]}>{(nextSubject.topics ?? []).length} topics · {nextSubject.practiceCount ?? nextSubject.count} practice questions</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Start practice in ${nextSubject.subject}`}
              disabled={disabled}
              onPress={() => onPractice(nextSubject.subject)}
              style={[styles.nextButton, { backgroundColor: palette.primary }, disabled && styles.disabled]}
            >
              <Text style={[styles.nextButtonText, { color: palette.onPrimary }]}>Start</Text>
              <MaterialCommunityIcons name="arrow-right" size={17} color={palette.onPrimary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.nextCard, { backgroundColor: palette.primarySoft }]}>
            <MaterialCommunityIcons name="book-check-outline" size={22} color={palette.primary} />
            <Text style={[styles.nextTitle, { color: palette.text, flex: 1 }]}>No practice subjects available yet</Text>
          </View>
        )}
      </View>

      <View style={styles.subjectHeader}>
        <Text style={[styles.subjectHeading, { color: palette.text }]}>Subjects</Text>
        <Text style={[styles.subjectCount, { color: palette.muted }]}>{availableSubjects.length} learning paths</Text>
      </View>
      {availableSubjects.map((item, index) => {
        const itemProgress = progress.find((entry) => entry.subject === item.subject);
        const available = item.practiceCount ?? item.count;
        const seen = Math.min(itemProgress?.seen ?? 0, available);
        const percent = available > 0 ? Math.round((seen / available) * 100) : 0;
        const complete = seen >= available;
        return (
          <View key={item.subject} style={[styles.subjectCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={[styles.subjectNumber, { backgroundColor: complete ? palette.successSoft : palette.primarySoft }]}>
              <Text style={[styles.subjectNumberText, { color: complete ? palette.success : palette.primary }]}>{complete ? "✓" : index + 1}</Text>
            </View>
            <View style={styles.subjectBody}>
              <View style={styles.subjectTitleRow}>
                <Text style={[styles.subjectTitle, { color: palette.text }]} numberOfLines={2}>{item.subject}</Text>
                <Text style={[styles.subjectPercent, { color: palette.primary }]}>{percent}%</Text>
              </View>
              <Text style={[styles.subjectMeta, { color: palette.muted }]}>{item.topics?.length ?? 0} topics · {available} questions</Text>
              <View style={[styles.track, styles.subjectTrack, { backgroundColor: palette.border }]}>
                <View style={[styles.fill, { width: `${percent}%`, backgroundColor: complete ? palette.success : palette.primary }]} />
              </View>
              <View style={styles.subjectBottom}>
                <Text style={[styles.subjectStatus, { color: complete ? palette.success : palette.muted }]}>{complete ? "Reviewed" : seen > 0 ? `${seen} explored` : "Ready to begin"}</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Practice ${item.subject}`}
                  disabled={disabled}
                  onPress={() => onPractice(item.subject)}
                  style={[styles.subjectAction, { borderColor: palette.primary }, disabled && styles.disabled]}
                >
                  <Text style={[styles.subjectActionText, { color: palette.primary }]}>Practice</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={palette.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })}
      {subjects.length === 0 ? <Text style={[styles.empty, { color: palette.muted }]}>Loading your subjects…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing["5"], gap: spacing["3"] },
  headingRow: { flexDirection: "row", alignItems: "center", gap: spacing["3"] },
  eyebrow: { fontSize: typeScale.size.xs, fontWeight: "800", letterSpacing: 1.2 },
  heading: { fontSize: typeScale.size["2xl"], fontWeight: "800", marginTop: 3 },
  subtitle: { fontSize: typeScale.size.sm, marginTop: 4 },
  pathIcon: { width: 48, height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  summaryCard: { borderWidth: 1, borderRadius: radius.xl, padding: spacing["4"], gap: spacing["3"] },
  summaryTop: { flexDirection: "row", alignItems: "center", gap: spacing["3"] },
  summaryLabel: { fontSize: typeScale.size.xs, fontWeight: "800", letterSpacing: 0.8 },
  summaryValue: { fontSize: typeScale.size.xl, fontWeight: "800", marginTop: 4 },
  summaryTotal: { fontSize: typeScale.size.sm, fontWeight: "500" },
  percent: { fontSize: typeScale.size.xl, fontWeight: "900" },
  track: { height: 8, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill },
  nextCard: { borderRadius: radius.lg, padding: spacing["3"], flexDirection: "row", alignItems: "center", gap: spacing["3"] },
  nextIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  nextLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  nextTitle: { fontSize: typeScale.size.md, fontWeight: "800", marginTop: 3 },
  nextMeta: { fontSize: typeScale.size.xs, marginTop: 3 },
  nextButton: { borderRadius: radius.md, paddingHorizontal: spacing["3"], paddingVertical: spacing["2"], flexDirection: "row", alignItems: "center", gap: 4 },
  nextButtonText: { fontSize: typeScale.size.sm, fontWeight: "800" },
  subjectHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: spacing["2"] },
  subjectHeading: { fontSize: typeScale.size.lg, fontWeight: "800" },
  subjectCount: { fontSize: typeScale.size.sm },
  subjectCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing["3"], flexDirection: "row", gap: spacing["3"] },
  subjectNumber: { width: 34, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  subjectNumberText: { fontSize: typeScale.size.md, fontWeight: "900" },
  subjectBody: { flex: 1, minWidth: 0 },
  subjectTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing["2"] },
  subjectTitle: { fontSize: typeScale.size.md, fontWeight: "800", flex: 1 },
  subjectPercent: { fontSize: typeScale.size.sm, fontWeight: "800" },
  subjectMeta: { fontSize: typeScale.size.xs, marginTop: 4 },
  subjectTrack: { marginTop: spacing["2"] },
  subjectBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing["2"], marginTop: spacing["2"] },
  subjectStatus: { fontSize: typeScale.size.xs, flex: 1 },
  subjectAction: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing["2"], paddingVertical: spacing["1"], flexDirection: "row", alignItems: "center", gap: 2 },
  subjectActionText: { fontSize: typeScale.size.sm, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  empty: { fontSize: typeScale.size.sm, padding: spacing["3"] },
});
