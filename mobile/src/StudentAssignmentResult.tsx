import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type AnswerReview = {
  id: string;
  position: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  marks: number;
  negativeMarks: number;
  selectedIndex: number | null;
  isCorrect: boolean;
  awardedMarks: number;
};

type AssignmentResult = {
  submissionId: string;
  status: string;
  score: number | null;
  maximumScore: number | null;
  submittedAt: string;
  receivedAt: string | null;
  questions: AnswerReview[];
};

type ResultResponse = {
  ok: boolean;
  result: AssignmentResult;
};

type Props = {
  assignmentId: string;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  token: string;
  onBack: () => void;
};

export default function StudentAssignmentResult({
  assignmentId,
  api,
  token,
  onBack,
}: Props) {
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchResult = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api<ResultResponse>(
        `/exams/assignments/${encodeURIComponent(assignmentId)}/result`,
      );
      setResult(response.result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the exam result.");
    } finally {
      setLoading(false);
    }
  }, [api, assignmentId]);

  useEffect(() => {
    void fetchResult();
  }, [fetchResult]);

  const released = result?.status === "GRADED";
  const scorePercent =
    result && released && result.maximumScore && result.maximumScore > 0
      ? Math.round((result.score ?? 0) / result.maximumScore * 100)
      : null;

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading result…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity onPress={onBack} style={styles.linkRow}>
          <Text style={styles.link}>‹ Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!result) {
    return (
      <View style={styles.card}>
        <Text style={styles.heading}>Result not available</Text>
        <Text style={styles.muted}>This exam has not been submitted yet.</Text>
        <TouchableOpacity onPress={onBack} style={styles.linkRow}>
          <Text style={styles.link}>‹ Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} style={styles.scroll}>
      <View style={styles.card}>
        <TouchableOpacity onPress={onBack} style={styles.linkRow}>
          <Text style={styles.link}>‹ Back to assigned exams</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Exam result</Text>
        <Text style={styles.subtitle}>{result.submissionId}</Text>
        <View style={styles.statusRow}>
          <Text style={[styles.statusLabel, { color: statusColor(result.status) }]}>
            {result.status === "GRADED" ? "Graded" : "Awaiting review"}
          </Text>
          {released ? (
            <Text style={styles.scoreValue}>
              {result.score ?? 0} / {result.maximumScore ?? 0} ({scorePercent}%)
            </Text>
          ) : (
            <Text style={styles.muted}>Your result will appear after the instructor reviews it.</Text>
          )}
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Submitted</Text>
          <Text style={styles.metaValue}>{new Date(result.submittedAt).toLocaleString()}</Text>
        </View>
        {result.receivedAt && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Received</Text>
            <Text style={styles.metaValue}>{new Date(result.receivedAt).toLocaleString()}</Text>
          </View>
        )}
        {released && result.questions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Answer review</Text>
            {result.questions.map((question) => (
              <View key={question.id} style={styles.questionCard}>
                <View style={styles.questionHeader}>
                  <Text style={styles.questionNumber}>Question {question.position + 1}</Text>
                  <Text style={[styles.questionTag, { color: question.isCorrect ? "#167647" : "#b42318" }]}>
                    {question.isCorrect ? "Correct" : "Incorrect"}
                  </Text>
                </View>
                <Text style={styles.questionText}>{question.text}</Text>
                <View style={styles.options}>
                  {question.options.map((option, optionIndex) => {
                    const isCorrect = optionIndex === question.correctIndex;
                    const isSelected = optionIndex === question.selectedIndex;
                    return (
                      <View key={optionIndex} style={styles.optionRow}>
                        <Text style={[
                          styles.optionText,
                          isCorrect && styles.optionCorrect,
                          isSelected && styles.optionSelected,
                        ]}>
                          {String.fromCharCode(65 + optionIndex)}. {option}
                          {isCorrect ? " · Correct" : ""}
                          {isSelected && !isCorrect ? " · Your answer" : ""}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <View style={styles.marksRow}>
                  <Text style={styles.marksText}>
                    {question.awardedMarks} / {question.marks} marks
                  </Text>
                  <Text style={styles.muted}>{question.explanation || "No explanation provided."}</Text>
                </View>
              </View>
            ))}
          </>
        )}
        {!released && result.questions.length === 0 && (
          <Text style={styles.muted}>No answer details are available while the submission is under review.</Text>
        )}
      </View>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>Back to assigned exams</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function statusColor(status: string): string {
  if (status === "GRADED") return "#167647";
  if (status === "REVIEW_REQUIRED") return "#b45309";
  return "#526078";
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 80 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e4e8ef",
    marginBottom: 16,
  },
  linkRow: { marginTop: 8, alignSelf: "flex-start" },
  link: { color: "#2563eb", fontWeight: "700" },
  heading: { color: "#172033", fontSize: 22, fontWeight: "800", marginTop: 10 },
  subtitle: { color: "#526078", fontSize: 13, marginTop: 4 },
  statusRow: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 12 },
  statusLabel: { fontWeight: "800", fontSize: 15 },
  scoreValue: { fontWeight: "800", fontSize: 20, color: "#2563eb" },
  metaRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  metaLabel: { color: "#748096", fontSize: 12 },
  metaValue: { color: "#172033", fontSize: 13, fontWeight: "600" },
  sectionTitle: { color: "#172033", fontWeight: "800", marginTop: 16, marginBottom: 8 },
  questionCard: {
    backgroundColor: "#f7f9fc",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e8edf5",
  },
  questionHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  questionNumber: { color: "#2563eb", fontWeight: "800", fontSize: 14 },
  questionTag: { fontSize: 11, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: "#fff" },
  questionText: { color: "#172033", fontWeight: "700", fontSize: 15, marginBottom: 8 },
  options: { gap: 6 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionText: { fontSize: 14, color: "#293449" },
  optionCorrect: { color: "#167647", fontWeight: "700" },
  optionSelected: { textDecorationLine: "underline" },
  marksRow: { marginTop: 6 },
  marksText: { fontWeight: "800", color: "#172033" },
  muted: { color: "#748096", fontSize: 12, marginTop: 4 },
  error: { color: "#b42318", marginTop: 8, lineHeight: 20 },
  backButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  backText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
