// API response types shared by web clients.
// These mirror the server-side schemas in api/src/*.ts so the frontend can
// type its responses without importing from the backend.

export interface PerformanceOverview {
  practice: {
    completedAttempts: number;
    questions: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number | null;
  };
  formalExams: {
    graded: number;
    scorePercentage: number | null;
    score: number | null;
    maximumScore: number | null;
    reviewRequired: number;
  };
}

export interface TopicRow {
  subject: string;
  topic: string | null;
  seen: number;
  correct: number;
  wrong: number;
  incorrect: number;
  unanswered: number;
  accuracy: number | null;
}

export interface WeakTopicsReport {
  subjects: TopicRow[];
  topics: TopicRow[];
  weakest: TopicRow | null;
}

export interface HistoryItem {
  attemptId: number;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  score: number;
  total: number;
  expired: boolean;
}

export interface ExportPayload {
  exportedAt: string;
  stats: { questionId: number; seen: number; wrong: number; lastSeen: string | null }[];
  attempts: HistoryItem[];
  answers: {
    attemptId: number;
    questionId: number;
    chosen: number | null;
    isCorrect: boolean;
    subjectSnapshot: string;
    topicSnapshot: string | null;
    difficultySnapshot: string;
  }[];
}

export interface ImportReport {
  addedStats: number;
  updatedStats: number;
  addedAttempts: number;
  skippedDuplicates: number;
}

export interface PerformanceEvidenceRow {
  subject: string;
  topic: string | null;
  seen: number;
  correct: number;
  incorrect: number;
  accuracy: number | null;
}

export interface PerformanceExplanation {
  headline: string;
  details: string[];
  answeredQuestions: number;
  incorrectAnswers: number;
  evidenceThreshold: number;
  weakAccuracyThreshold: number;
}

export interface StudyRecommendation {
  id: string;
  title: string;
  reason: string;
  priority: string;
  questionCount: number;
  mode: "mistakes" | "mock" | "practice";
  subject?: string;
  topic?: string;
}

export interface StudyRecommendationsReport {
  basedOnAttempts: number;
  minimumAnswers: number;
  weakAccuracyThreshold: number;
  performanceExplanation: PerformanceExplanation;
  recommendations: StudyRecommendation[];
}

export interface ScorePredictionInterval {
  lowerPercent: number;
  upperPercent: number;
  estimatedErrorPercent: number;
  method: string;
}

export type StudentScorePrediction =
  | {
      status: "insufficient_data";
      completedAttempts: number;
      availableSamples: number;
      requiredSamples: number;
      requiredCompletedAttempts: number;
      message: string;
      populationFeatures?: Record<string, number>;
    }
  | {
      status: "baseline_not_beaten";
      completedAttempts: number;
      evaluationSamples: number;
      modelMae: number;
      baselineMae: number;
      message: string;
      populationFeatures?: Record<string, number>;
    }
  | {
      status: "ready";
      completedAttempts: number;
      trainingSamples: number;
      evaluationSamples: number;
      predictedScorePercent: number;
      predictionInterval: ScorePredictionInterval;
      modelMae: number;
      baselineMae: number;
      message: string;
      populationFeatures?: Record<string, number>;
    };

export type StudentReadinessEstimate =
  | {
      status: "insufficient_data";
      category: null;
      completedAttempts: number;
      requiredCompletedAttempts: number;
      message: string;
    }
  | {
      status: "unavailable";
      category: null;
      completedAttempts?: number;
      message: string;
    }
  | {
      status: "fallback";
      category: null;
      probabilities: Record<"NOT_READY" | "DEVELOPING" | "READY", number>;
      confidence: number;
      modelVersion: number;
      completedAttempts: number;
      factors: { featureIndex: number; direction: "positive" | "negative" }[];
      message: string;
    }
  | {
      status: "ready";
      category: "NOT_READY" | "DEVELOPING" | "READY";
      probabilities: Record<"NOT_READY" | "DEVELOPING" | "READY", number>;
      confidence: number;
      modelVersion: number;
      completedAttempts: number;
      factors: { featureIndex: number; direction: "positive" | "negative" }[];
      message: string;
    };

export interface LearningConcept {
  slug: string;
  title: string;
  subject: string;
  topic: string;
  definition: string;
  examples: string[];
  relatedConcepts: string[];
  commonMistakes: string[];
}

export interface OfflineLearningPackage {
  total: number;
  subjects: Array<{ name: string; count: number }>;
  exportedAt: string;
}

export interface IntegrityResponse {
  violationCount: number;
  max: number;
  warn: boolean;
  flagged: boolean;
}
