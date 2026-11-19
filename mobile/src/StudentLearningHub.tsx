import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { getOfflineLearningPackage, getOfflineStudyMaterials, removeOfflineStudyMaterial, saveOfflineLearningPackage, saveOfflineStudyMaterial, type OfflineLearningPackage, type OfflineStudyMaterial } from "./learningStore";
import { searchStudyMaterials, studyMaterialFormat, type StudyMaterialSummary } from "./studyMaterialSearch";

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
type Props = { api: ApiRequest; userId: string };
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
type Prediction = { status: string; message: string; predictedScorePercent?: number; predictionInterval?: { lowerPercent: number; upperPercent: number }; modelMae?: number; baselineMae?: number };
type NotificationPreferences = { examAssignments: boolean; examResults: boolean };
type StudyMaterial = StudyMaterialSummary;

export default function StudentLearningHub({ api, userId }: Props) {
  const apiRef = useRef(api);
  apiRef.current = api;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>([]);
  const [materialQuery, setMaterialQuery] = useState("");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>({ examAssignments: true, examResults: true });
  const [savingPreference, setSavingPreference] = useState(false);
  const [offlinePackage, setOfflinePackage] = useState<OfflineLearningPackage | null>(null);
  const [offlineMaterials, setOfflineMaterials] = useState<OfflineStudyMaterial[]>([]);
  const [selectedOfflineMaterial, setSelectedOfflineMaterial] = useState<OfflineStudyMaterial | null>(null);
  const [downloadingMaterialId, setDownloadingMaterialId] = useState<string | null>(null);
  const [downloadingBank, setDownloadingBank] = useState(false);
  const [showOfflineBank, setShowOfflineBank] = useState(false);
  const [offlineQuery, setOfflineQuery] = useState("");
  const [query, setQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("All");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [performanceResult, recommendationResult, conceptResult, predictionResult, preferenceResult, materialResult] = await Promise.allSettled([
      apiRef.current<Overview>("/analytics/overview"),
      apiRef.current<Recommendations>("/analytics/recommendations"),
      apiRef.current<{ total: number; concepts: Concept[] }>("/learning/concepts?limit=50"),
      apiRef.current<Prediction>("/analytics/score-prediction"),
      apiRef.current<{ preferences: NotificationPreferences }>("/notifications/preferences"),
      apiRef.current<{ materials: StudyMaterial[] }>("/study-materials"),
    ]);
    if (performanceResult.status === "fulfilled") setOverview(performanceResult.value);
    if (recommendationResult.status === "fulfilled") setRecommendations(recommendationResult.value);
    if (conceptResult.status === "fulfilled") setConcepts(conceptResult.value.concepts ?? []);
    if (predictionResult.status === "fulfilled") setPrediction(predictionResult.value);
    if (preferenceResult.status === "fulfilled") setPreferences(preferenceResult.value.preferences);
    if (materialResult.status === "fulfilled") setStudyMaterials(materialResult.value.materials ?? []);
    const failures = [performanceResult, recommendationResult, conceptResult, predictionResult, preferenceResult, materialResult].filter((item) => item.status === "rejected");
    if (failures.length === 6) setError("Learning data could not be loaded. Check your connection and try again.");
    else if (failures.length) setError("Some learning sections could not be refreshed. Available sections are still shown.");
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    setOfflinePackage(null);
    setOfflineMaterials([]);
    setSelectedOfflineMaterial(null);
    void load();
    void getOfflineLearningPackage(userId).then((value) => {
      if (active) setOfflinePackage(value);
    }).catch(() => {
      if (active) setOfflinePackage(null);
    });
    void getOfflineStudyMaterials(userId).then((value) => {
      if (active) setOfflineMaterials(value);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load saved study materials.");
    });
    return () => { active = false; };
  }, [load, userId]);

  useEffect(() => NetInfo.addEventListener((state) => {
    setIsOnline(state.isConnected !== false && state.isInternetReachable !== false);
  }), []);
  const updatePreference = useCallback(async (key: keyof NotificationPreferences, value: boolean) => { const previous = preferences; const next = { ...previous, [key]: value }; setPreferences(next); setSavingPreference(true); try { const result = await apiRef.current<{ preferences: NotificationPreferences }>("/notifications/preferences", { method: "PATCH", body: JSON.stringify({ [key]: value }) }); setPreferences(result.preferences); } catch (cause) { setPreferences(previous); setError(cause instanceof Error ? cause.message : "Could not save notification preferences."); } finally { setSavingPreference(false); } }, [preferences]);

  const downloadQuestionBank = useCallback(async () => { setDownloadingBank(true); setError(""); try { const pack = await apiRef.current<OfflineLearningPackage>("/learning/package"); await saveOfflineLearningPackage(userId, pack); setOfflinePackage(pack); setShowOfflineBank(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not download the offline question bank."); } finally { setDownloadingBank(false); } }, [userId]);

  const downloadStudyMaterial = useCallback(async (material: StudyMaterial) => {
    if (material.mimeType !== "text/plain" && material.mimeType !== "text/markdown") {
      setError("Offline reading currently supports text and Markdown files. PDF files remain available through the online download and preview endpoints.");
      return;
    }
    setDownloadingMaterialId(material.id);
    setError("");
    try {
      const response = await apiRef.current<{ material: Omit<OfflineStudyMaterial, "downloadedAt"> }>(
        "/study-materials/" + encodeURIComponent(material.id) + "/offline",
      );
      const saved = await saveOfflineStudyMaterial(userId, {
        ...response.material,
        downloadedAt: new Date().toISOString(),
      });
      setOfflineMaterials((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedOfflineMaterial(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this study material for offline reading.");
    } finally {
      setDownloadingMaterialId(null);
    }
  }, [userId]);

  const openOfflineMaterial = useCallback((material: OfflineStudyMaterial) => {
    setSelectedOfflineMaterial(material);
  }, []);

  const deleteOfflineMaterial = useCallback(async (material: OfflineStudyMaterial) => {
    try {
      await removeOfflineStudyMaterial(userId, material.id);
      setOfflineMaterials((current) => current.filter((item) => item.id !== material.id));
      setSelectedOfflineMaterial((current) => current?.id === material.id ? null : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the saved study material.");
    }
  }, [userId]);

  const offlineQuestions = useMemo(() => (offlinePackage?.questions ?? []).filter((item) => [item.text, item.subject, item.topic ?? "", ...item.options].join(" ").toLowerCase().includes(offlineQuery.trim().toLowerCase())).slice(0, 30), [offlinePackage, offlineQuery]);
  const visibleMaterials = useMemo(() => searchStudyMaterials(studyMaterials, materialQuery), [studyMaterials, materialQuery]);
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
        <View style={styles.networkStatus}>
          <View style={[styles.networkDot, isOnline === false ? styles.networkDotOffline : styles.networkDotOnline]} />
          <Text style={styles.networkStatusText}>{isOnline === null ? "Checking connection…" : isOnline ? "Online · Learning data can refresh" : "Offline · Saved questions and downloaded notes remain available"}</Text>
        </View>
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

      <Text style={styles.sectionTitle}>ECET score outlook</Text>
      {prediction?.status === "ready" ? <View style={styles.explanation}><Text style={styles.predictionValue}>{Math.round(prediction.predictedScorePercent ?? 0)}%</Text><Text style={styles.cardTitle}>Estimated score range: {Math.round(prediction.predictionInterval?.lowerPercent ?? 0)}–{Math.round(prediction.predictionInterval?.upperPercent ?? 0)}%</Text><Text style={styles.body}>{prediction.message}</Text><Text style={styles.meta}>Model MAE {prediction.modelMae?.toFixed(1)} · Baseline MAE {prediction.baselineMae?.toFixed(1)}</Text></View> : <View style={styles.card}><Text style={styles.body}>{prediction?.message ?? "Score prediction is not available yet."}</Text></View>}

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

      <Text style={styles.sectionTitle}>Notification preferences</Text>
      <View style={styles.card}>
        <View style={styles.preferenceRow}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Exam assignments</Text><Text style={styles.meta}>Notify me when an exam is assigned to me.</Text></View><Switch value={preferences.examAssignments} disabled={savingPreference} onValueChange={(value) => void updatePreference("examAssignments", value)} /></View>
        <View style={styles.preferenceDivider} />
        <View style={styles.preferenceRow}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Exam results</Text><Text style={styles.meta}>Notify me when a result or reviewed submission is available.</Text></View><Switch value={preferences.examResults} disabled={savingPreference} onValueChange={(value) => void updatePreference("examResults", value)} /></View>
        {savingPreference ? <Text style={styles.meta}>Saving preference…</Text> : null}
      </View>
      <Text style={styles.sectionTitle}>Offline question bank</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{offlinePackage ? offlinePackage.total.toLocaleString() + " questions saved on this device" : "No offline question bank yet"}</Text>
        <Text style={styles.body}>{offlinePackage ? "Downloaded " + new Date(offlinePackage.exportedAt).toLocaleString() + ". Stored separately for this account and available without a connection." : "Download the question bank while online to browse questions later without internet."}</Text>
        <TouchableOpacity onPress={() => void downloadQuestionBank()} disabled={downloadingBank} style={styles.downloadButton}><Text style={styles.downloadButtonText}>{downloadingBank ? "Downloading…" : offlinePackage ? "Update offline question bank" : "Download for offline use"}</Text></TouchableOpacity>
        {offlinePackage ? <TouchableOpacity onPress={() => setShowOfflineBank(!showOfflineBank)} style={styles.refresh}><Text style={styles.refreshText}>{showOfflineBank ? "Hide saved questions" : "Browse saved questions"}</Text></TouchableOpacity> : null}
      </View>
      {showOfflineBank && offlinePackage ? <>
        <TextInput value={offlineQuery} onChangeText={setOfflineQuery} placeholder="Search saved questions" placeholderTextColor="#8993a5" style={styles.search} />
        {offlineQuestions.map((question) => <View key={question.id} style={styles.card}><Text style={styles.meta}>{question.subject}{question.topic ? " · " + question.topic : ""} · {question.difficulty}</Text><Text style={styles.cardTitle}>{question.text}</Text>{question.options.map((option, index) => <Text key={index} style={styles.body}>{String.fromCharCode(65 + index)}. {option}</Text>)}</View>)}
        {offlineQuestions.length === 0 ? <Text style={styles.empty}>No saved questions match this search.</Text> : null}
        {offlinePackage.questions.length > offlineQuestions.length ? <Text style={styles.meta}>Showing up to 30 matching questions. Search to find a specific item.</Text> : null}
      </> : null}
      <Text style={styles.sectionTitle}>Saved offline study materials</Text>
      {offlineMaterials.map((material) => (
        <View key={material.id} style={styles.card}>
          <Text style={styles.cardTitle}>{material.title}</Text>
          <Text style={styles.meta}>{material.subject}{material.topic ? " · " + material.topic : ""} · Saved {new Date(material.downloadedAt).toLocaleDateString()}</Text>
          <View style={styles.preferenceRow}>
            <TouchableOpacity onPress={() => openOfflineMaterial(material)} style={styles.refresh}>
              <Text style={styles.refreshText}>Open offline</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void deleteOfflineMaterial(material)} style={styles.refresh}>
              <Text style={styles.refreshText}>Remove download</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {offlineMaterials.length === 0 ? <Text style={styles.empty}>No saved study materials. Download text or Markdown notes below while online.</Text> : null}

      <Text style={styles.sectionTitle}>Study materials</Text>
      <TextInput value={materialQuery} onChangeText={setMaterialQuery} placeholder="Search study materials" placeholderTextColor="#8993a5" style={styles.search} />
      {visibleMaterials.map((material) => (
        <View key={material.id} style={styles.card}>
          <Text style={styles.cardTitle}>{material.title}</Text>
          <Text style={styles.meta}>{material.subject}{material.topic ? " · " + material.topic : ""} · {studyMaterialFormat(material.mimeType)} · {(material.sizeBytes / 1024).toFixed(0)} KB</Text>
          {!!material.description && <Text style={styles.body}>{material.description}</Text>}
          {(material.mimeType === "text/plain" || material.mimeType === "text/markdown") ? (
            <TouchableOpacity
              onPress={() => {
                const saved = offlineMaterials.find((item) => item.id === material.id);
                if (saved) openOfflineMaterial(saved);
                else void downloadStudyMaterial(material);
              }}
              disabled={downloadingMaterialId === material.id}
              style={styles.refresh}
            >
              <Text style={styles.refreshText}>
                {downloadingMaterialId === material.id ? "Saving…" : offlineMaterials.some((item) => item.id === material.id) ? "Read offline" : "Download for offline reading"}
              </Text>
            </TouchableOpacity>
          ) : <Text style={styles.meta}>PDF preview/download requires an internet connection in this mobile app.</Text>}
        </View>
      ))}
      {!loading && visibleMaterials.length === 0 && <Text style={styles.empty}>{materialQuery ? "No study materials match this search." : "No published study materials are available yet."}</Text>}

      {selectedOfflineMaterial ? (
        <View style={styles.card}>
          <Text style={styles.meta}>OFFLINE READER · {selectedOfflineMaterial.subject}{selectedOfflineMaterial.topic ? " · " + selectedOfflineMaterial.topic : ""}</Text>
          <Text style={styles.cardTitle}>{selectedOfflineMaterial.title}</Text>
          <Text style={styles.body}>{selectedOfflineMaterial.description}</Text>
          <Text selectable style={styles.offlineContent}>{selectedOfflineMaterial.content}</Text>
          <TouchableOpacity onPress={() => setSelectedOfflineMaterial(null)} style={styles.refresh}>
            <Text style={styles.refreshText}>Close reader</Text>
          </TouchableOpacity>
        </View>
      ) : null}

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
  preferenceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  preferenceDivider: { height: 1, backgroundColor: "#e2e8f0", marginVertical: 4 },
  downloadButton: { backgroundColor: "#2563eb", borderRadius: 10, padding: 12, alignItems: "center", marginTop: 6 },
  downloadButtonText: { color: "#ffffff", fontWeight: "900" },
  notice: { backgroundColor: "#fff7ed", borderRadius: 12, padding: 12 },
  noticeText: { color: "#9a3412", lineHeight: 19 },
  sectionTitle: { color: "#14213d", fontSize: 18, fontWeight: "900", marginTop: 8 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { width: "48%", flexGrow: 1, backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, padding: 14 },
  metricValue: { color: "#1d4ed8", fontSize: 24, fontWeight: "900" },
  metricLabel: { color: "#64748b", fontSize: 12, marginTop: 3 },
  explanation: { backgroundColor: "#eff6ff", borderRadius: 14, padding: 14, gap: 6 },
  predictionValue: { color: "#1d4ed8", fontSize: 32, fontWeight: "900" },
  card: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { color: "#172554", fontSize: 15, fontWeight: "900", flexShrink: 1 },
  priority: { color: "#2563eb", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  body: { color: "#475569", lineHeight: 20, fontSize: 13 },
  offlineContent: { color: "#334155", lineHeight: 23, fontSize: 13, paddingVertical: 10 },
  networkStatus: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingVertical: 8 },
  networkDot: { width: 8, height: 8, borderRadius: 4 },
  networkDotOnline: { backgroundColor: "#16a34a" },
  networkDotOffline: { backgroundColor: "#dc2626" },
  networkStatusText: { color: "#64748b", fontSize: 12, flexShrink: 1 },
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
