// API response types shared by web clients.
// These mirror the server-side schemas in api/src/*.ts so the frontend can
// type its responses without importing from the backend.

export interface FullMockPerformanceRow {
  subject: string;
  topic: string | null;
  questionCount: number;
  answeredQuestions: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  accuracy: number | null;
}

export interface FullMockPerformanceReport {
  generatedAt: string;
  completedFullMocks: number;
  latestMockAt: string | null;
  questionCount: number;
  answeredQuestions: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  accuracy: number | null;
  subjects: FullMockPerformanceRow[];
  topics: FullMockPerformanceRow[];
}

export interface PerformanceOverview {
  practice: {
    completedAttempts: number;
    questions: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number | null;
    trend?: { attemptId: number; finishedAt: string; accuracy: number | null; correct: number; total: number }[];
  };
  formalExams: {
    submissions?: number;
    graded: number;
    scorePercentage: number | null;
    score: number | null;
    maximumScore: number | null;
    reviewRequired: number;
    correct?: number;
    incorrect?: number;
    unanswered?: number;
    subjects?: { subject: string; correct: number; incorrect: number; unanswered: number; awardedMarks: number; maximumMarks: number; accuracy: number | null }[];
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
  evidence?: { answeredQuestions: number; incorrectAnswers: number; accuracy: number | null; minimumAnswers: number; weakAccuracyThreshold: number; source?: "completed-full-mock" | "completed-practice" } | null;
}

export interface StudyRecommendationsReport {
  basedOnAttempts: number;
  basedOnFullMocks?: number;
  latestFullMockAt?: string | null;
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

export interface OfflineLearningQuestion {
  id: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string[];
  difficulty: number;
}

export interface OfflineLearningPackage {
  schemaVersion: number;
  practiceOnly: boolean;
  total: number;
  subjects: string[];
  exportedAt: string;
  questions: OfflineLearningQuestion[];
}

export interface IntegrityResponse {
  violationCount: number;
  max: number;
  warn: boolean;
  flagged: boolean;
}
