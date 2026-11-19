import { createHash } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DISPLAYED_GAP_DAYS = 90;
const FEATURE_SCHEMA_VERSION = "performance-v1";

export interface PerformanceDatasetAnswer {
  chosen: number | null;
  isCorrect: boolean;
  subjectSnapshot?: string | null;
  topicSnapshot?: string | null;
  question?: {
    createdAt?: Date | string;
    subject?: { name?: string } | null;
    topic?: { name?: string } | null;
  } | null;
}

export interface PerformanceDatasetAttempt {
  id: number;
  userId: number;
  startedAt: Date | string;
  finishedAt: Date | string | null;
  answers: PerformanceDatasetAnswer[];
}

export interface PerformanceTopicAvailability {
  createdAt: Date | string;
  subjectName: string;
  topicName: string | null;
}

export interface PerformanceDatasetSample {
  features: Record<string, number>;
  target: number;
  groupId: string;
  occurredAt: string;
  unansweredCount: number;
}

export interface PerformanceDatasetBuildResult {
  featureSchema: { name: string; type: "numeric" }[];
  samples: PerformanceDatasetSample[];
  metadata: {
    featureSchemaVersion: string;
    attemptsConsidered: number;
    completedAttemptsWithAnswers: number;
    excludedNoAnsweredAttempts: number;
    eligibleRowsBeforeCap: number;
    sampleCount: number;
    learnerGroupCount: number;
    unansweredResponses: number;
    improvingLearnerGroups: number;
    decliningLearnerGroups: number;
    subjectVocabulary: string[];
    truncated: boolean;
  };
}

interface NormalizedAnswer {
  chosen: number | null;
  isCorrect: boolean;
  subject: string;
  topic: string | null;
}

interface NormalizedAttempt {
  id: number;
  userId: number;
  startedAt: Date;
  finishedAt: Date;
  answers: NormalizedAnswer[];
  answeredCount: number;
  correctCount: number;
  unansweredCount: number;
  accuracy: number;
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeName(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function topicKey(subject: string, topic: string): string {
  return JSON.stringify([subject, topic]);
}

function subjectFeatureKey(subject: string): string {
  const slug = subject.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "subject";
  const suffix = createHash("sha256").update(subject).digest("hex").slice(0, 8);
  return `subject_accuracy_${slug}_${suffix}`;
}

function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const meanX = (values.length - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  return denominator > 0 ? numerator / denominator : 0;
}

function normalizeAttempt(attempt: PerformanceDatasetAttempt): NormalizedAttempt | null {
  const startedAt = toDate(attempt.startedAt);
  const finishedAt = toDate(attempt.finishedAt);
  if (!startedAt || !finishedAt || finishedAt.getTime() < startedAt.getTime()) return null;
  const answers = attempt.answers.map((answer) => {
    const subject = normalizeName(answer.subjectSnapshot) ||
      normalizeName(answer.question?.subject?.name) || "Unknown";
    const topic = normalizeName(answer.topicSnapshot) ||
      normalizeName(answer.question?.topic?.name) || "";
    return {
      chosen: answer.chosen,
      isCorrect: answer.isCorrect,
      subject,
      topic: topic || null,
    };
  });
  const answered = answers.filter((answer) => answer.chosen !== null);
  if (!answered.length) return null;
  const correctCount = answered.filter((answer) => answer.isCorrect).length;
  return {
    id: attempt.id,
    userId: attempt.userId,
    startedAt,
    finishedAt,
    answers,
    answeredCount: answered.length,
    correctCount,
    unansweredCount: answers.length - answered.length,
    accuracy: correctCount / answered.length,
  };
}

function countTrajectoryGroups(samples: PerformanceDatasetSample[]): {
  improving: number;
  declining: number;
} {
  const grouped = new Map<string, PerformanceDatasetSample[]>();
  for (const sample of samples) {
    const rows = grouped.get(sample.groupId) ?? [];
    rows.push(sample);
    grouped.set(sample.groupId, rows);
  }
  let improving = 0;
  let declining = 0;
  for (const rows of grouped.values()) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const slope = linearSlope(rows.map((row) => row.target));
    if (slope > 0.005) improving += 1;
    if (slope < -0.005) declining += 1;
  }
  return { improving, declining };
}

/**
 * Builds point-in-time next-practice-attempt samples. All features are derived
 * only from completed attempts whose finish time is at or before the target
 * attempt's start time. Raw learner IDs are converted to keyed HMAC group IDs
 * by the caller and are never copied into the returned dataset.
 */
export function buildPerformanceDataset(
  input: {
    attempts: PerformanceDatasetAttempt[];
    subjects: string[];
    topicAvailability: PerformanceTopicAvailability[];
    learnerGroupId: (userId: number) => string;
    maxSamples?: number;
  },
): PerformanceDatasetBuildResult {
  const normalized = input.attempts
    .map(normalizeAttempt)
    .filter((attempt): attempt is NormalizedAttempt => attempt !== null);
  const subjectVocabulary = [...new Set([
    ...input.subjects.map(normalizeName).filter(Boolean),
    ...normalized.flatMap((attempt) => attempt.answers.map((answer) => answer.subject)),
  ])].sort((a, b) => a.localeCompare(b));
  if (subjectVocabulary.length > 45) {
    throw new Error("Performance feature schema supports at most 45 subjects per version.");
  }

  const subjectKeys = new Map(subjectVocabulary.map((subject) => [subject, subjectFeatureKey(subject)]));
  const topicFirstAvailable = new Map<string, number>();
  for (const item of input.topicAvailability) {
    const subject = normalizeName(item.subjectName);
    const topic = normalizeName(item.topicName);
    const createdAt = toDate(item.createdAt);
    if (!subject || !topic || !createdAt) continue;
    const key = topicKey(subject, topic);
    const current = topicFirstAvailable.get(key);
    if (current === undefined || createdAt.getTime() < current) topicFirstAvailable.set(key, createdAt.getTime());
  }

  const featureNames = [
    "completed_attempts",
    "previous_accuracy",
    "recent_accuracy_mean_3",
    "overall_accuracy_mean",
    "previous_question_count",
    "recent_accuracy_slope_3",
    "topic_coverage_ratio",
    "topic_coverage_ratio_missing",
    "days_since_last_attempt",
    ...subjectVocabulary.flatMap((subject) => {
      const key = subjectKeys.get(subject)!;
      return [key, `${key}_missing`];
    }),
  ];
  const featureSchema = featureNames.map((name) => ({ name, type: "numeric" as const }));
  const byUser = new Map<number, NormalizedAttempt[]>();
  for (const attempt of normalized) {
    const rows = byUser.get(attempt.userId) ?? [];
    rows.push(attempt);
    byUser.set(attempt.userId, rows);
  }

  const samples: PerformanceDatasetSample[] = [];
  for (const [userId, userAttempts] of byUser) {
    const byStart = [...userAttempts].sort((a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime() || a.id - b.id);
    const byFinish = [...userAttempts].sort((a, b) =>
      a.finishedAt.getTime() - b.finishedAt.getTime() || a.id - b.id);
    const prior: NormalizedAttempt[] = [];
    let finishIndex = 0;
    const groupId = input.learnerGroupId(userId);
    if (!/^[a-f0-9]{64}$/.test(groupId)) {
      throw new Error("Performance datasets require keyed HMAC-SHA-256 learner group IDs.");
    }

    for (const current of byStart) {
      while (finishIndex < byFinish.length &&
        byFinish[finishIndex]!.finishedAt.getTime() <= current.startedAt.getTime()) {
        prior.push(byFinish[finishIndex]!);
        finishIndex += 1;
      }
      if (prior.length < 3) continue;

      const recent = prior.slice(-3);
      const previous = prior[prior.length - 1]!;
      const priorAnswered = prior.reduce((sum, attempt) => sum + attempt.answeredCount, 0);
      const priorCorrect = prior.reduce((sum, attempt) => sum + attempt.correctCount, 0);
      const subjectTotals = new Map<string, { answered: number; correct: number }>();
      const attemptedTopics = new Set<string>();
      for (const attempt of prior) {
        for (const answer of attempt.answers) {
          if (answer.topic) attemptedTopics.add(topicKey(answer.subject, answer.topic));
          if (answer.chosen === null) continue;
          const totals = subjectTotals.get(answer.subject) ?? { answered: 0, correct: 0 };
          totals.answered += 1;
          if (answer.isCorrect) totals.correct += 1;
          subjectTotals.set(answer.subject, totals);
        }
      }

      const availableTopics = [...topicFirstAvailable.entries()]
        .filter(([, createdAt]) => createdAt <= current.startedAt.getTime());
      const coveredTopics = [...attemptedTopics].filter((key) =>
        (topicFirstAvailable.get(key) ?? Number.POSITIVE_INFINITY) <= current.startedAt.getTime()).length;
      const topicCoverageMissing = availableTopics.length === 0;
      const features: Record<string, number> = {
        completed_attempts: prior.length,
        previous_accuracy: previous.accuracy,
        recent_accuracy_mean_3: recent.reduce((sum, attempt) => sum + attempt.accuracy, 0) / recent.length,
        overall_accuracy_mean: priorAnswered ? priorCorrect / priorAnswered : 0,
        previous_question_count: previous.answeredCount,
        recent_accuracy_slope_3: linearSlope(recent.map((attempt) => attempt.accuracy)),
        topic_coverage_ratio: topicCoverageMissing ? 0 : coveredTopics / availableTopics.length,
        topic_coverage_ratio_missing: Number(topicCoverageMissing),
        days_since_last_attempt: Math.min(
          MAX_DISPLAYED_GAP_DAYS,
          Math.max(0, (current.startedAt.getTime() - previous.finishedAt.getTime()) / DAY_MS),
        ),
      };
      for (const subject of subjectVocabulary) {
        const key = subjectKeys.get(subject)!;
        const totals = subjectTotals.get(subject);
        const missing = !totals || totals.answered === 0;
        features[key] = missing ? 0 : totals.correct / totals.answered;
        features[`${key}_missing`] = Number(missing);
      }

      samples.push({
        features,
        target: current.accuracy,
        groupId,
        occurredAt: current.startedAt.toISOString(),
        unansweredCount: current.unansweredCount,
      });
    }
  }

  samples.sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt) || a.groupId.localeCompare(b.groupId));
  const maxSamples = Math.max(1, Math.min(5000, Math.floor(input.maxSamples ?? 5000)));
  const truncated = samples.length > maxSamples;
  const selectedSamples = truncated ? samples.slice(-maxSamples) : samples;
  const trajectories = countTrajectoryGroups(selectedSamples);
  const learnerGroupCount = new Set(selectedSamples.map((sample) => sample.groupId)).size;

  return {
    featureSchema,
    samples: selectedSamples,
    metadata: {
      featureSchemaVersion: FEATURE_SCHEMA_VERSION,
      attemptsConsidered: input.attempts.length,
      completedAttemptsWithAnswers: normalized.length,
      excludedNoAnsweredAttempts: input.attempts.length - normalized.length,
      eligibleRowsBeforeCap: samples.length,
      sampleCount: selectedSamples.length,
      learnerGroupCount,
      unansweredResponses: normalized.reduce((sum, attempt) => sum + attempt.unansweredCount, 0),
      improvingLearnerGroups: trajectories.improving,
      decliningLearnerGroups: trajectories.declining,
      subjectVocabulary,
      truncated,
    },
  };
}
