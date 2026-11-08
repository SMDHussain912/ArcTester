import type { BinaryTrainingSample } from "./classificationValidation.js";

export interface ReadinessPracticeAttempt {
  userId: number;
  finishedAt: string | Date;
  correct: number;
  total: number;
  subjects: string[];
}

export interface ReadinessFormalExam {
  userId: number;
  startedAt: string | Date;
  submittedAt: string | Date;
  score: number;
  maximumScore: number;
}

export interface ReadinessTrainingSample extends BinaryTrainingSample {
  occurredAt: number;
  userId: number;
}

export interface ReadinessDatasetOptions {
  minimumPriorAttempts?: number;
  readinessThreshold?: number;
  recentWindow?: number;
}

function timestamp(value: string | Date, label: string): number {
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(result)) throw new Error(`${label} must be a valid date`);
  return result;
}

function validatePracticeAttempt(attempt: ReadinessPracticeAttempt, index: number): number {
  if (!Number.isInteger(attempt.userId) || attempt.userId <= 0) throw new Error(`Practice attempt ${index} has an invalid userId`);
  if (!Number.isInteger(attempt.correct) || !Number.isInteger(attempt.total) ||
      attempt.total <= 0 || attempt.correct < 0 || attempt.correct > attempt.total) {
    throw new Error(`Practice attempt ${index} has invalid score counts`);
  }
  if (!Array.isArray(attempt.subjects) || attempt.subjects.some((subject) => typeof subject !== "string" || !subject.trim())) {
    throw new Error(`Practice attempt ${index} has invalid subjects`);
  }
  return timestamp(attempt.finishedAt, `Practice attempt ${index} finishedAt`);
}

/**
 * Creates one training row per graded formal exam using only that student's
 * completed practice attempts finished before the formal exam started.
 * Formal exam results supply labels; they are never included as input features.
 */
export function buildExamReadinessDataset(
  practiceAttempts: ReadinessPracticeAttempt[],
  formalExams: ReadinessFormalExam[],
  options: ReadinessDatasetOptions = {},
): ReadinessTrainingSample[] {
  const minimumPriorAttempts = options.minimumPriorAttempts ?? 3;
  const readinessThreshold = options.readinessThreshold ?? 0.6;
  const recentWindow = options.recentWindow ?? 3;
  if (!Number.isInteger(minimumPriorAttempts) || minimumPriorAttempts < 1) {
    throw new Error("minimumPriorAttempts must be a positive integer");
  }
  if (!Number.isInteger(recentWindow) || recentWindow < 1) {
    throw new Error("recentWindow must be a positive integer");
  }
  if (!Number.isFinite(readinessThreshold) || readinessThreshold <= 0 || readinessThreshold >= 1) {
    throw new Error("readinessThreshold must be greater than 0 and less than 1");
  }

  const histories = new Map<number, Array<ReadinessPracticeAttempt & { timestamp: number; accuracy: number }>>();
  practiceAttempts.forEach((attempt, index) => {
    const finished = validatePracticeAttempt(attempt, index);
    const history = histories.get(attempt.userId) ?? [];
    history.push({ ...attempt, timestamp: finished, accuracy: attempt.correct / attempt.total });
    histories.set(attempt.userId, history);
  });
  for (const history of histories.values()) history.sort((a, b) => a.timestamp - b.timestamp);

  const orderedExams = formalExams.map((exam, index) => {
    if (!Number.isInteger(exam.userId) || exam.userId <= 0) throw new Error(`Formal exam ${index} has an invalid userId`);
    if (!Number.isFinite(exam.score) || !Number.isFinite(exam.maximumScore) ||
        exam.maximumScore <= 0 || exam.score < 0 || exam.score > exam.maximumScore) {
      throw new Error(`Formal exam ${index} has invalid score values`);
    }
    const startedAt = timestamp(exam.startedAt, `Formal exam ${index} startedAt`);
    const submittedAt = timestamp(exam.submittedAt, `Formal exam ${index} submittedAt`);
    if (submittedAt < startedAt) throw new Error(`Formal exam ${index} was submitted before it started`);
    return { ...exam, startedTimestamp: startedAt, submittedTimestamp: submittedAt };
  }).sort((a, b) => a.submittedTimestamp - b.submittedTimestamp);

  const result: ReadinessTrainingSample[] = [];
  for (const exam of orderedExams) {
    const prior = (histories.get(exam.userId) ?? []).filter((attempt) => attempt.timestamp < exam.startedTimestamp);
    if (prior.length < minimumPriorAttempts) continue;
    const recent = prior.slice(-recentWindow);
    const accuracyMean = prior.reduce((sum, attempt) => sum + attempt.accuracy, 0) / prior.length;
    const recentAccuracy = recent.reduce((sum, attempt) => sum + attempt.accuracy, 0) / recent.length;
    const subjectCount = new Set(prior.flatMap((attempt) => attempt.subjects)).size;
    result.push({
      userId: exam.userId,
      occurredAt: exam.submittedTimestamp,
      features: [
        prior.length,
        prior[prior.length - 1].accuracy,
        recentAccuracy,
        accuracyMean,
        prior.reduce((sum, attempt) => sum + attempt.total, 0),
        subjectCount,
      ],
      label: exam.score / exam.maximumScore >= readinessThreshold ? 1 : 0,
    });
  }
  return result;
}

/** Extracts the current learner's feature vector using their completed practice history. */
export function buildCurrentReadinessFeatures(
  practiceAttempts: ReadinessPracticeAttempt[],
  userId: number,
  recentWindow = 3,
): number[] | null {
  if (!Number.isInteger(recentWindow) || recentWindow < 1) throw new Error("recentWindow must be a positive integer");
  const history = practiceAttempts
    .map((attempt, index) => ({
      attempt,
      timestamp: validatePracticeAttempt(attempt, index),
      accuracy: attempt.correct / attempt.total,
    }))
    .filter((item) => item.attempt.userId === userId)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (history.length < 1) return null;
  const recent = history.slice(-recentWindow);
  return [
    history.length,
    history[history.length - 1].accuracy,
    recent.reduce((sum, item) => sum + item.accuracy, 0) / recent.length,
    history.reduce((sum, item) => sum + item.accuracy, 0) / history.length,
    history.reduce((sum, item) => sum + item.attempt.total, 0),
    new Set(history.flatMap((item) => item.attempt.subjects)).size,
  ];
}
