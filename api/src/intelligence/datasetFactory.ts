export type DatasetRow = Record<string, string | number | boolean>;

export interface DatasetFactoryOptions {
  rowsPerDataset?: number;
  seed?: number;
}

export interface SyntheticDatasetBundle {
  studentPerformance: DatasetRow[];
  topicMastery: DatasetRow[];
  examReadiness: DatasetRow[];
  learningBehaviour: DatasetRow[];
  scorePrediction: DatasetRow[];
}

const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Computer Science", "Electronics"];
const TOPICS = [
  "Algebra", "Calculus", "Probability", "Mechanics", "Optics",
  "Organic Chemistry", "Data Structures", "Operating Systems",
  "Database Management", "Digital Electronics",
];

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function studentId(index: number): string {
  return `SYN_${String(index + 1).padStart(6, "0")}`;
}

function createStudentPerformance(rows: number, random: () => number): DatasetRow[] {
  return Array.from({ length: rows }, (_, index) => {
    const ability = 0.25 + random() * 0.65;
    const attempts = 5 + Math.floor(random() * 96);
    const averageAccuracy = clamp(ability + (random() - 0.5) * 0.12, 0.05, 0.99);
    const recentAccuracy = clamp(averageAccuracy + (random() - 0.48) * 0.2, 0.02, 1);
    const subjectsCovered = 1 + Math.floor(random() * SUBJECTS.length);
    const questionsAnswered = attempts * (10 + Math.floor(random() * 31));
    const formalScore = Math.round(clamp((ability * 0.55 + recentAccuracy * 0.45 + (random() - 0.5) * 0.12) * 100, 0, 100));
    return {
      student_id: studentId(index),
      practice_attempts: attempts,
      average_accuracy: round(averageAccuracy),
      recent_accuracy: round(recentAccuracy),
      subjects_covered: subjectsCovered,
      questions_answered: questionsAnswered,
      formal_score_percentage: formalScore,
      passed_threshold: formalScore >= 60,
    };
  });
}

function createTopicMastery(rows: number, random: () => number): DatasetRow[] {
  return Array.from({ length: rows }, (_, index) => {
    const attempted = 5 + Math.floor(random() * 96);
    const ability = 0.15 + random() * 0.8;
    const accuracy = clamp(ability + (random() - 0.5) * 0.16, 0, 1);
    const correct = Math.round(attempted * accuracy);
    const measuredAccuracy = correct / attempted;
    return {
      student_id: studentId(index),
      subject: SUBJECTS[Math.floor(random() * SUBJECTS.length)],
      topic: TOPICS[Math.floor(random() * TOPICS.length)],
      questions_attempted: attempted,
      questions_correct: correct,
      accuracy: round(measuredAccuracy),
      mastery_label: attempted >= 10 && measuredAccuracy >= 0.8 ? 1 : 0,
    };
  });
}

function createExamReadiness(rows: number, random: () => number): DatasetRow[] {
  return Array.from({ length: rows }, (_, index) => {
    const priorAttempts = 3 + Math.floor(random() * 98);
    const ability = 0.2 + random() * 0.7;
    const latestAccuracy = clamp(ability + (random() - 0.5) * 0.2, 0, 1);
    const recentAccuracy = clamp(ability + (random() - 0.45) * 0.18, 0, 1);
    const overallAccuracy = clamp(ability + (random() - 0.5) * 0.12, 0, 1);
    const priorQuestions = priorAttempts * (10 + Math.floor(random() * 31));
    const subjectCount = 1 + Math.floor(random() * SUBJECTS.length);
    const outcome = clamp(0.2 * latestAccuracy + 0.4 * recentAccuracy + 0.4 * overallAccuracy + (random() - 0.5) * 0.18, 0, 1);
    const scorePercentage = Math.round(outcome * 100);
    return {
      student_id: studentId(index),
      prior_practice_attempts: priorAttempts,
      latest_accuracy: round(latestAccuracy),
      recent_accuracy: round(recentAccuracy),
      overall_accuracy: round(overallAccuracy),
      prior_questions_answered: priorQuestions,
      subject_count: subjectCount,
      formal_exam_score_percentage: scorePercentage,
      readiness_label: scorePercentage >= 60 ? 1 : 0,
    };
  });
}

function createLearningBehaviour(rows: number, random: () => number): DatasetRow[] {
  return Array.from({ length: rows }, (_, index) => {
    const studyDays = 1 + Math.floor(random() * 30);
    const sessions = studyDays + Math.floor(random() * 25);
    const averageSessionMinutes = 5 + Math.floor(random() * 116);
    const streakDays = Math.floor(random() * Math.min(studyDays, 21));
    const completionRate = clamp(0.25 + random() * 0.75, 0, 1);
    const consistency = clamp((studyDays / 30) * 0.6 + (streakDays / 21) * 0.4, 0, 1);
    const engagementScore = consistency * 0.45 + completionRate * 0.35 + Math.min(averageSessionMinutes / 90, 1) * 0.2;
    return {
      student_id: studentId(index),
      study_days_last_30: studyDays,
      sessions_last_30: sessions,
      average_session_minutes: averageSessionMinutes,
      longest_current_streak_days: streakDays,
      completion_rate: round(completionRate),
      study_consistency: round(consistency),
      engagement_label: engagementScore >= 0.58 ? 1 : 0,
    };
  });
}

function createScorePrediction(rows: number, random: () => number): DatasetRow[] {
  return Array.from({ length: rows }, (_, index) => {
    const previousAccuracy = 0.15 + random() * 0.8;
    const recentAccuracy = clamp(previousAccuracy + (random() - 0.45) * 0.2, 0, 1);
    const averageAccuracy = clamp(previousAccuracy * 0.65 + recentAccuracy * 0.35 + (random() - 0.5) * 0.08, 0, 1);
    const attemptNumber = 3 + Math.floor(random() * 98);
    const questionsAnswered = attemptNumber * (10 + Math.floor(random() * 31));
    const nextScore = clamp(averageAccuracy * 0.35 + recentAccuracy * 0.5 + previousAccuracy * 0.15 + (random() - 0.5) * 0.16, 0, 1);
    return {
      student_id: studentId(index),
      attempt_number: attemptNumber,
      previous_accuracy: round(previousAccuracy),
      recent_accuracy: round(recentAccuracy),
      historical_average_accuracy: round(averageAccuracy),
      questions_answered_before_prediction: questionsAnswered,
      next_attempt_accuracy: round(nextScore),
    };
  });
}

/**
 * Generates reproducible synthetic datasets for pipeline development and
 * algorithm tests. These rows are simulated, not observed student outcomes.
 */
export function generateSyntheticDatasets(
  options: DatasetFactoryOptions = {},
): SyntheticDatasetBundle {
  const rows = options.rowsPerDataset ?? 1_000;
  const seed = options.seed ?? 42;
  if (!Number.isInteger(rows) || rows < 1 || rows > 1_000_000) {
    throw new Error("rowsPerDataset must be an integer between 1 and 1000000");
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("seed must be an integer between 0 and 4294967295");
  }
  const random = createRandom(seed);
  return {
    studentPerformance: createStudentPerformance(rows, random),
    topicMastery: createTopicMastery(rows, random),
    examReadiness: createExamReadiness(rows, random),
    learningBehaviour: createLearningBehaviour(rows, random),
    scorePrediction: createScorePrediction(rows, random),
  };
}

/** Converts a homogeneous dataset to RFC-4180-style CSV with escaped cells. */
export function datasetToCsv(rows: DatasetRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number | boolean): string => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(",")),
  ].join("\n") + "\n";
}
