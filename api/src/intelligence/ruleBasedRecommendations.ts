export interface RecommendationEvidenceRow {
  subject: string;
  topic: string | null;
  seen: number;
  correct: number;
  wrong: number;
  accuracy: number | null;
}

export interface RecentPracticeActivity {
  subject: string;
  topic: string | null;
  lastPracticedAt: Date | string | number;
}

export interface RuleBasedRecommendation {
  id: string;
  priority: "high" | "medium";
  title: string;
  reason: string;
  subject: string;
  topic: string | null;
  mode: "practice" | "mistakes";
  questionCount: number;
  evidence: {
    answeredQuestions: number;
    incorrectAnswers: number;
    accuracy: number;
    minimumAnswers: number;
    weakAccuracyThreshold: number;
  };
}

export interface RuleBasedRecommendationResult {
  recommendations: RuleBasedRecommendation[];
  recentlyPracticedWeakCount: number;
}

function evidenceKey(subject: string, topic: string | null): string {
  return JSON.stringify([subject, topic]);
}

function sortEvidence(a: RecommendationEvidenceRow, b: RecommendationEvidenceRow): number {
  return (a.accuracy ?? 1) - (b.accuracy ?? 1) ||
    b.wrong - a.wrong ||
    b.seen - a.seen ||
    a.subject.localeCompare(b.subject) ||
    (a.topic ?? "").localeCompare(b.topic ?? "");
}

function mergeEvidenceRows(rows: RecommendationEvidenceRow[], subjectLevel: boolean): RecommendationEvidenceRow[] {
  const merged = new Map<string, RecommendationEvidenceRow>();
  for (const row of rows) {
    if (subjectLevel && row.topic !== null) continue;
    const key = evidenceKey(row.subject, subjectLevel ? null : row.topic);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row, topic: subjectLevel ? null : row.topic });
      continue;
    }
    const seen = current.seen + row.seen;
    const correct = current.correct + row.correct;
    const wrong = current.wrong + row.wrong;
    merged.set(key, {
      ...current,
      seen,
      correct,
      wrong,
      accuracy: seen > 0 ? correct / seen : null,
    });
  }
  return [...merged.values()];
}

function isWeakEnough(
  row: RecommendationEvidenceRow,
  minimumAnswers: number,
  weakAccuracyThreshold: number,
): boolean {
  return row.seen >= minimumAnswers && row.accuracy !== null &&
    row.accuracy >= 0 && row.accuracy < weakAccuracyThreshold;
}

function priorityFor(row: RecommendationEvidenceRow, minimumAnswers: number): "high" | "medium" {
  const accuracy = row.accuracy ?? 1;
  return row.seen >= minimumAnswers &&
    (accuracy <= 0.2 || (accuracy < 0.4 && row.seen >= Math.max(minimumAnswers, 8)))
    ? "high"
    : "medium";
}

function toRecommendationEvidence(
  row: RecommendationEvidenceRow,
  minimumAnswers: number,
  weakAccuracyThreshold: number,
) {
  return {
    answeredQuestions: row.seen,
    incorrectAnswers: row.wrong,
    accuracy: row.accuracy ?? 0,
    minimumAnswers,
    weakAccuracyThreshold,
  };
}

/**
 * Builds deterministic, evidence-backed recommendations. Sufficient named
 * topic evidence takes precedence over subject aggregates, even when the
 * topics are not weak. Subject fallback is reserved for missing/low-sample
 * topic labels. A cooldown suppresses recently practiced weak areas.
 */
export function buildRuleBasedRecommendations(input: {
  topics: RecommendationEvidenceRow[];
  subjects: RecommendationEvidenceRow[];
  recentActivity: RecentPracticeActivity[];
  minimumAnswers: number;
  weakAccuracyThreshold: number;
  recentPracticeDays: number;
  now?: number;
  maximumAreas?: number;
}): RuleBasedRecommendationResult {
  const now = input.now ?? Date.now();
  const cooldownMs = Math.max(0, input.recentPracticeDays) * 24 * 60 * 60 * 1000;
  const lastByTopic = new Map<string, number>();
  const lastBySubject = new Map<string, number>();

  for (const activity of input.recentActivity) {
    const timestamp = activity.lastPracticedAt instanceof Date
      ? activity.lastPracticedAt.getTime()
      : new Date(activity.lastPracticedAt).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const subjectKey = evidenceKey(activity.subject, null);
    lastBySubject.set(subjectKey, Math.max(lastBySubject.get(subjectKey) ?? Number.NEGATIVE_INFINITY, timestamp));
    if (activity.topic !== null) {
      const topicKey = evidenceKey(activity.subject, activity.topic);
      lastByTopic.set(topicKey, Math.max(lastByTopic.get(topicKey) ?? Number.NEGATIVE_INFINITY, timestamp));
    }
  }

  const isRecent = (timestamp: number | undefined): boolean =>
    timestamp !== undefined && now - timestamp < cooldownMs;
  const maximumAreas = Math.max(1, input.maximumAreas ?? 3);
  const namedTopics = mergeEvidenceRows(input.topics, false)
    .filter((row) => row.topic !== null && row.topic.trim().length > 0);
  const weakTopics = namedTopics
    .filter((row) => isWeakEnough(row, input.minimumAnswers, input.weakAccuracyThreshold))
    .sort(sortEvidence);

  const recommendations: RuleBasedRecommendation[] = [];
  const recentWeakTopics = weakTopics.filter((row) =>
    isRecent(lastByTopic.get(evidenceKey(row.subject, row.topic))),
  );
  const eligibleTopics = weakTopics
    .filter((row) => !isRecent(lastByTopic.get(evidenceKey(row.subject, row.topic))))
    .slice(0, maximumAreas);

  for (const row of eligibleTopics) {
    const topic = row.topic!;
    const percent = Math.round((row.accuracy ?? 0) * 100);
    const key = encodeURIComponent(`${row.subject}:${topic}`);
    const evidence = toRecommendationEvidence(row, input.minimumAnswers, input.weakAccuracyThreshold);
    recommendations.push({
      id: `revise-topic-${key}`,
      priority: priorityFor(row, input.minimumAnswers),
      title: `Revise ${topic}`,
      reason: `${percent}% accuracy across ${row.seen} answered practice questions in ${row.subject}. This meets the minimum evidence threshold; focus practice here before another full mock.`,
      subject: row.subject,
      topic,
      mode: "practice",
      questionCount: 15,
      evidence,
    });
    if (row.wrong >= 3) {
      recommendations.push({
        id: `review-topic-mistakes-${key}`,
        priority: "medium",
        title: `Review mistakes in ${topic}`,
        reason: `${row.wrong} incorrect answers are recorded for this topic. Revisit their explanations, then retry related questions.`,
        subject: row.subject,
        topic,
        mode: "mistakes",
        questionCount: Math.min(10, row.wrong),
        evidence,
      });
    }
  }

  // Topic precedence is evaluated independently for each subject. A weak
  // topic in one subject must not hide a subject-level gap elsewhere.
  const subjectsWithSufficientTopics = new Set(
    namedTopics
      .filter((row) => row.seen >= input.minimumAnswers)
      .map((row) => row.subject),
  );
  const weakSubjects = mergeEvidenceRows(input.subjects, true)
    .filter((row) =>
      !subjectsWithSufficientTopics.has(row.subject) &&
      isWeakEnough(row, input.minimumAnswers, input.weakAccuracyThreshold),
    )
    .sort(sortEvidence);
  const recentWeakSubjects = weakSubjects.filter((row) =>
    isRecent(lastBySubject.get(evidenceKey(row.subject, null))),
  );
  const eligibleSubjects = weakSubjects
    .filter((row) => !isRecent(lastBySubject.get(evidenceKey(row.subject, null))))
    .slice(0, maximumAreas);

  for (const row of eligibleSubjects) {
    const percent = Math.round((row.accuracy ?? 0) * 100);
    const key = encodeURIComponent(row.subject);
    const evidence = toRecommendationEvidence(row, input.minimumAnswers, input.weakAccuracyThreshold);
    recommendations.push({
      id: `revise-subject-${key}`,
      priority: priorityFor(row, input.minimumAnswers),
      title: `Revise ${row.subject}`,
      reason: `${percent}% accuracy across ${row.seen} answered practice questions in ${row.subject}. Topic-level evidence is not available yet, so start with a mixed subject practice set.`,
      subject: row.subject,
      topic: null,
      mode: "practice",
      questionCount: 15,
      evidence,
    });
    if (row.wrong >= 3) {
      recommendations.push({
        id: `review-subject-mistakes-${key}`,
        priority: "medium",
        title: `Review mistakes in ${row.subject}`,
        reason: `${row.wrong} incorrect answers are recorded in ${row.subject}. Revisit those explanations, then retry a mixed subject set.`,
        subject: row.subject,
        topic: null,
        mode: "mistakes",
        questionCount: Math.min(10, row.wrong),
        evidence,
      });
    }
  }

  return {
    recommendations,
    recentlyPracticedWeakCount: recentWeakTopics.length + recentWeakSubjects.length,
  };
}


export interface ImmediateAnswerDecision {
  action: "learn-concept" | "review-topic" | "spaced-practice";
  title: string;
  reason: string;
  recommendedMode: "practice" | "mistakes";
  questionCount: number;
}

/**
 * Applies the Decision Engine's immediate post-answer policy.
 * This is deliberately separate from evidence-aggregated weak-topic recommendations:
 * one answer can guide the next action, but cannot establish a persistent weak topic.
 */
export function buildImmediateAnswerDecision(input: {
  subject: string;
  topic: string | null;
  selectedIndex: number | null;
  correctIndex: number;
}): ImmediateAnswerDecision {
  const area = input.topic?.trim() || input.subject;
  if (input.selectedIndex === null) {
    return {
      action: "learn-concept",
      title: `Learn the key concept in ${area}`,
      reason: "This question was left unanswered. Review the concept before attempting a short practice set.",
      recommendedMode: "practice",
      questionCount: 5,
    };
  }
  if (input.selectedIndex !== input.correctIndex) {
    return {
      action: "review-topic",
      title: `Review ${area}`,
      reason: "This answer was incorrect. Revisit the explanation, then retry related questions to check understanding.",
      recommendedMode: "mistakes",
      questionCount: 5,
    };
  }
  return {
    action: "spaced-practice",
    title: `Reinforce ${area}`,
    reason: "This answer was correct. A short follow-up set can help check that the concept is retained.",
    recommendedMode: "practice",
    questionCount: 3,
  };
}
