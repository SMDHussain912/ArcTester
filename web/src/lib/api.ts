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
