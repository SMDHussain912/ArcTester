import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { mobilePalette, radius, spacing, typeScale } from "./design/tokens";

type Concept = { slug: string; title: string; subject: string; topic: string; definition: string; examples: string[]; relatedConcepts: string[]; commonMistakes: string[] };
type LibraryResponse = { branch: { code: string | null; name: string | null }; subjects: string[]; count: number; concepts: Concept[] };
type Api = <T>(path: string, init?: RequestInit) => Promise<T>;

export default function StudentConceptLibrary({ api, darkMode }: { api: Api; darkMode: boolean }) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [result, setResult] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const apiRef = useRef(api);
  apiRef.current = api;
  const palette = darkMode ? mobilePalette.dark : mobilePalette.light;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (subject) params.set("subject", subject);
    const queryString = params.toString();
    apiRef.current<LibraryResponse>("/concept-library" + (queryString ? "?" + queryString : ""))
      .then((value) => { if (active) setResult(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load concepts."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, subject, retry]);

  const concepts = result?.concepts ?? [];
  return <View style={[styles.container, { backgroundColor: palette.surface, borderColor: palette.border }]}>
    <Text style={[styles.eyebrow, { color: palette.primary }]}>BRANCH-AWARE LEARNING</Text>
    <Text style={[styles.title, { color: palette.text }]}>Concept library</Text>
    <Text style={[styles.muted, { color: palette.muted }]}>{result?.branch.name ? result.branch.name + (result.branch.code ? " · " + result.branch.code : "") : "Shared concepts · set your branch in your account profile to personalize this library."}</Text>
    <TextInput accessibilityLabel="Search concepts" placeholder="Search concepts or topics" placeholderTextColor={palette.muted} value={query} onChangeText={setQuery} style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.background }]} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
      <TouchableOpacity onPress={() => setSubject("")} style={[styles.subjectChip, { borderColor: palette.border, backgroundColor: !subject ? palette.primarySoft : palette.background }]}><Text style={{ color: !subject ? palette.primary : palette.text, fontWeight: "800" }}>All subjects</Text></TouchableOpacity>
      {(result?.subjects ?? []).map((item) => <TouchableOpacity key={item} onPress={() => setSubject(item)} style={[styles.subjectChip, { borderColor: palette.border, backgroundColor: subject === item ? palette.primarySoft : palette.background }]}><Text style={{ color: subject === item ? palette.primary : palette.text, fontWeight: "800" }}>{item}</Text></TouchableOpacity>)}
    </ScrollView>
    {loading ? <ActivityIndicator color={palette.primary} style={{ marginVertical: 20 }} /> : error ? <View style={styles.message}><Text style={{ color: palette.danger }}>{error}</Text><TouchableOpacity onPress={() => setRetry((value) => value + 1)}><Text style={{ color: palette.primary, fontWeight: "800" }}>Try again</Text></TouchableOpacity></View> : concepts.length === 0 ? <Text style={[styles.muted, { color: palette.muted, marginVertical: 16 }]}>No concepts match this search.</Text> : concepts.map((concept) => <View key={concept.slug} style={[styles.conceptCard, { borderColor: palette.border, backgroundColor: palette.background }]}>
      <Text style={[styles.topic, { color: palette.primary }]}>{concept.subject} · {concept.topic}</Text>
      <Text style={[styles.conceptTitle, { color: palette.text }]}>{concept.title}</Text>
      <Text style={[styles.definition, { color: palette.text }]}>{concept.definition}</Text>
      {concept.examples.length ? <><Text style={[styles.section, { color: palette.text }]}>Examples</Text>{concept.examples.map((item) => <Text key={item} style={[styles.listItem, { color: palette.muted }]}>• {item}</Text>)}</> : null}
      {concept.relatedConcepts.length ? <Text style={[styles.related, { color: palette.muted }]}>Related: {concept.relatedConcepts.join(" · ")}</Text> : null}
      {concept.commonMistakes.length ? <><Text style={[styles.section, { color: palette.text }]}>Common mistakes</Text>{concept.commonMistakes.map((item) => <Text key={item} style={[styles.listItem, { color: palette.muted }]}>• {item}</Text>)}</> : null}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: radius.xl, padding: spacing["4"], gap: spacing["3"] },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { fontSize: typeScale.size.xl, fontWeight: "900" },
  muted: { fontSize: typeScale.size.sm, lineHeight: 20 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: spacing["3"], fontSize: typeScale.size.md },
  subjectRow: { gap: spacing["2"], paddingVertical: 2 },
  subjectChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing["3"], paddingVertical: spacing["2"] },
  conceptCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing["3"], gap: spacing["2"] },
  topic: { fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: .7 },
  conceptTitle: { fontSize: typeScale.size.lg, fontWeight: "900" },
  definition: { fontSize: typeScale.size.sm, lineHeight: 22 },
  section: { fontSize: typeScale.size.sm, fontWeight: "900", marginTop: spacing["1"] },
  listItem: { fontSize: typeScale.size.sm, lineHeight: 20 },
  related: { fontSize: typeScale.size.xs, lineHeight: 19 },
  message: { gap: spacing["3"], paddingVertical: spacing["3"] },
});
