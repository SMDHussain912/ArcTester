import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
type Props = { api: ApiRequest };
type Concept = {
  slug: string; title: string; subject: string; topic: string; definition: string;
  examples: string[]; relatedConcepts: string[]; commonMistakes: string[];
};
type Overview = {
  practice: { completedAttempts: number; questions: number; correct: number; incorrect: number; unanswered: number; accuracy: number | null };
  formalExams: { graded: number; scorePercentage: number | null; reviewRequired: number };
};
type Recommendation = { id: string; title: string; reason: string; priority: string; questionCount: number; mode: string; subject?: string; topic?: string };
type Recommendations = { basedOnAttempts: number; recommendations: Recommendation[]; performanceExplanation: { headline: string; details: string[]; answeredQuestions: number } };

export default function StudentLearningHub({ api }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [query, setQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("All");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [performanceResult, recommendationResult, conceptResult] = await Promise.allSettled([
      api<Overview>("/analytics/overview"),
      api<Recommendations>("/analytics/recommendations"),
      api<{ total: number; concepts: Concept[] }>("/learning/concepts?limit=50"),
    ]);
    if (performanceResult.status === "fulfilled") setOverview(performanceResult.value);
    if (recommendationResult.status === "fulfilled") setRecommendations(recommendationResult.value);
    if (conceptResult.status === "fulfilled") setConcepts(conceptResult.value.concepts ?? []);
    const failures = [performanceResult, recommendationResult, conceptResult].filter((item) => item.status === "rejected");
    if (failures.length === 3) setError("Learning data could not be loaded. Check your connection and try again.");
    else if (failures.length) setError("Some learning sections could not be refreshed. Available sections are still shown.");
    setLoading(false);
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const subjects = useMemo(() => ["All", ...Array.from(new Set(concepts.map((item) => item.subject))).sort()], [concepts]);
  const filtered = useMemo(() => concepts.filter((item) => {
    const matchesSubject = selectedSubject === "All" || item.subject === selectedSubject;
    const haystack = [item.title, item.subject, item.topic, item.definition, ...item.examples, ...item.commonMistakes].join(" ").toLowerCase();
    return matchesSubject && haystack.includes(query.trim().toLowerCase());
  }), [concepts, query, selectedSubject]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>YOUR STUDY SPACE</Text>
        <Text style={styles.title}>Learning hub</Text>
        <Text style={styles.muted}>Performance insights, next steps and quick concept revision.</Text>
        <TouchableOpacity onPress={() => void load()} disabled={loading} style={styles.refresh}>
          <Text style={styles.refreshText}>{loading ? "Refreshing…" : "Refresh learning data"}</Text>
        </TouchableOpacity>
      </View>

      {!!error && <View style={styles.notice}><Text style={styles.noticeText}>{error}</Text></View>}
      {loading && !overview && concepts.length === 0 && <ActivityIndicator size="large" style={{ marginVertical: 24 }} />}

      <Text style={styles.sectionTitle}>Your progress</Text>
      {overview ? (
        <View style={styles.metrics}>
          <View style={styles.metric}><Text style={styles.metricValue}>{overview.practice.completedAttempts}</Text><Text style={styles.metricLabel}>Practice tests</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{overview.practice.accuracy === null ? "—" : Math.round(overview.practice.accuracy * 100) + "%"}</Text><Text style={styles.metricLabel}>Practice accuracy</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{overview.formalExams.graded}</Text><Text style={styles.metricLabel}>Graded exams</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{overview.formalExams.reviewRequired}</Text><Text style={styles.metricLabel}>Awaiting review</Text></View>
        </View>
      ) : <Text style={styles.empty}>Performance summary is unavailable.</Text>}

      <Text style={styles.sectionTitle}>Recommended next steps</Text>
      {recommendations?.performanceExplanation ? (
        <View style={styles.explanation}>
          <Text style={styles.cardTitle}>{recommendations.performanceExplanation.headline}</Text>
          {recommendations.performanceExplanation.details.map((detail, index) => <Text key={index} style={styles.body}>• {detail}</Text>)}
        </View>
      ) : null}
      {recommendations?.recommendations.length ? recommendations.recommendations.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.priority}>{item.priority}</Text>
          </View>
          <Text style={styles.body}>{item.reason}</Text>
          <Text style={styles.meta}>{item.subject ?? "Mixed practice"}{item.topic ? " · " + item.topic : ""} · {item.questionCount} questions</Text>
        </View>
      )) : <Text style={styles.empty}>More completed practice will unlock personalized recommendations.</Text>}

      <Text style={styles.sectionTitle}>Concept library</Text>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search concepts, topics or examples" placeholderTextColor="#8993a5" style={styles.search} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {subjects.map((subject) => (
          <TouchableOpacity key={subject} onPress={() => setSelectedSubject(subject)} style={[styles.filter, selectedSubject === subject && styles.filterActive]}>
            <Text style={[styles.filterText, selectedSubject === subject && styles.filterTextActive]}>{subject}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {filtered.map((concept) => {
        const expanded = expandedSlug === concept.slug;
        return (
          <View key={concept.slug} style={styles.card}>
            <TouchableOpacity onPress={() => setExpandedSlug(expanded ? null : concept.slug)} accessibilityRole="button" accessibilityState={{ expanded }}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{concept.title}</Text>
                  <Text style={styles.meta}>{concept.subject} · {concept.topic}</Text>
                </View>
                <Text style={styles.expand}>{expanded ? "−" : "+"}</Text>
              </View>
              <Text style={styles.body} numberOfLines={expanded ? undefined : 2}>{concept.definition}</Text>
            </TouchableOpacity>
            {expanded && <>
              <Text style={styles.subheading}>Examples</Text>
              {concept.examples.map((value, index) => <Text key={index} style={styles.body}>• {value}</Text>)}
              <Text style={styles.subheading}>Common mistakes</Text>
              {concept.commonMistakes.map((value, index) => <Text key={index} style={styles.body}>• {value}</Text>)}
              <Text style={styles.subheading}>Related concepts</Text>
              <Text style={styles.meta}>{concept.relatedConcepts.join(" · ") || "No related concepts listed"}</Text>
            </>}
          </View>
        );
      })}
      {!loading && filtered.length === 0 && <Text style={styles.empty}>No concepts match this search.</Text>}
      <Text style={styles.footer}>{concepts.length} curated concepts available</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 28, gap: 12 },
  header: { backgroundColor: "#eef4ff", borderRadius: 18, padding: 18, gap: 7 },
  eyebrow: { color: "#2563eb", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: "#14213d", fontSize: 25, fontWeight: "900" },
  muted: { color: "#64748b", lineHeight: 20 },
  refresh: { alignSelf: "flex-start", paddingVertical: 7 },
  refreshText: { color: "#2563eb", fontWeight: "800" },
  notice: { backgroundColor: "#fff7ed", borderRadius: 12, padding: 12 },
  noticeText: { color: "#9a3412", lineHeight: 19 },
  sectionTitle: { color: "#14213d", fontSize: 18, fontWeight: "900", marginTop: 8 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { width: "48%", flexGrow: 1, backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, padding: 14 },
  metricValue: { color: "#1d4ed8", fontSize: 24, fontWeight: "900" },
  metricLabel: { color: "#64748b", fontSize: 12, marginTop: 3 },
  explanation: { backgroundColor: "#eff6ff", borderRadius: 14, padding: 14, gap: 6 },
  card: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { color: "#172554", fontSize: 15, fontWeight: "900", flexShrink: 1 },
  priority: { color: "#2563eb", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  body: { color: "#475569", lineHeight: 20, fontSize: 13 },
  meta: { color: "#64748b", fontSize: 11, lineHeight: 17 },
  empty: { color: "#64748b", paddingVertical: 8, lineHeight: 20 },
  search: { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, color: "#172554" },
  filters: { gap: 7, paddingVertical: 2 },
  filter: { borderRadius: 18, borderWidth: 1, borderColor: "#cbd5e1", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#ffffff" },
  filterActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  filterText: { color: "#475569", fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: "#ffffff" },
  expand: { color: "#2563eb", fontSize: 24, fontWeight: "700", paddingHorizontal: 6 },
  subheading: { color: "#172554", fontSize: 12, fontWeight: "900", marginTop: 5 },
  footer: { color: "#94a3b8", textAlign: "center", fontSize: 11, marginTop: 12 },
});
