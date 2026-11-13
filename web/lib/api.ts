// Typed API client for the ECET API. One place for every fetch, so the pages
// never touch `fetch` directly and errors always come back as friendly text.
//
// The session lives in an httpOnly cookie set by the API, so every call must
// send credentials. Without `credentials: "include"` the browser drops the
// cookie on cross-origin requests (localhost:3000 -> localhost:4000) and every
// protected route answers 403.

import { friendlyError, type SubmitAnswer } from "./answers";
import type { BrowserTensorflowArtifact } from "./tensorflowInference";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:4000";

export interface PublicQuestion {
  id: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string[];
}
export interface CreatedTest {
  attemptId: number;
  mode: "mock" | "practice" | "mistakes";
  deadline: string | null;
  questions: PublicQuestion[];
  warnings: string[];
}
export interface AttemptView {
  attemptId: number;
  mode: "mock" | "practice" | "mistakes";
  deadline: string;
  serverNow: string;
  questions: PublicQuestion[];
  saved: { questionId: number; selectedIndex: number | null }[];
}
export interface SubmitSummary {
  attemptId: number;
  score: number;
  total: number;
  expired: boolean;
}
export interface TestResult {
  attemptId: number;
  mode: string;
  score: number;
  total: number;
  expired: boolean;
  breakdown: { subject: string; correct: number; total: number }[];
  questions: {
    questionId: number;
    subject: string;
    topic: string | null;
    relatedConcepts: { slug: string; title: string }[];
    text: string;
    options: string[];
    selectedIndex: number | null;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string;
  }[];
}
export interface BankInfo {
  subjects: { subject: string; count: number; topics: { topic: string; count: number }[] }[];
  total: number;
  serverNow: string;
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
  schemaVersion: 1;
  exportedAt: string;
  total: number;
  subjects: string[];
  questions: {
    id: number;
    subject: string;
    topic: string | null;
    relatedConcepts: { slug: string; title: string }[];
    text: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    difficulty: string;
  }[];
}
export interface Announcement {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  publishedAt: string;
  expiresAt: string | null;
  seenAt?: string | null;
  acknowledgedAt?: string | null;
}

export interface StudentNotification {
  id: string;
  kind: "EXAM_ASSIGNMENT" | "EXAM_RESULT" | "EXAM_REVIEW" | string;
  title: string;
  message: string;
  href: string;
  createdAt: string;
  readAt: string | null;
  expiresAt: string | null;
}

export interface AuthUser {
  id: number;
  email: string;
  role: "ADMIN" | "STUDENT";
}
export interface AuthSession {
  ok: boolean;
  user: AuthUser;
}
export type AdminQuestion = PublicQuestion & { options?: string[]; difficulty?: string };
export interface QuestionImportReport { added: number; duplicates: number; invalid: { row: number; reason: string }[]; total: number; }
export interface AdminStudent {
  id: number;
  email: string;
}
export interface AdminExam {
  id: string;
  title: string;
  description: string;
  status: string;
  updatedAt: string;
  versions: {
    id: string;
    version: number;
    durationMinutes: number;
    publishedAt: string | null;
    _count: { questions: number; assignments: number };
  }[];
}

export interface PublishedExamCatalogItem {
  examId: string;
  title: string;
  description: string;
  version: number;
  durationMinutes: number;
  questionCount: number;
  publishedAt: string | null;
  assignment: { id: string; availableFrom: string | null; dueAt: string | null; submission: { id: string; status: string } | null } | null;
}

export interface AssignedExam {
  id: string;
  status: string;
  assignedAt: string;
  availableFrom: string | null;
  dueAt: string | null;
  exam: { id: string; title: string; description: string };
  version: number;
  durationMinutes: number;
  questionCount: number;
  submission: {
    id: string;
    status: string;
    score: number | null;
    maximumScore: number | null;
    submittedAt: string;
  } | null;
}
export interface AssignedExamPackage {
  assignmentId: string;
  examId: string;
  title: string;
  description: string;
  version: number;
  instructions: string;
  durationMinutes: number;
  availableFrom: string | null;
  dueAt: string | null;
  serverTime: string;
  questions: {
    id: string;
    position: number;
    subject: string;
    topic: string | null;
    text: string;
    options: string[];
    optionOrder: number[];
    marks: number;
    negativeMarks: number;
  }[];
}
export interface AssignedExamResult {
  submissionId: string;
  status: string;
  score: number | null;
  maximumScore: number | null;
  submittedAt: string;
  receivedAt: string;
  questions: {
    id: string;
    position: number;
    subject: string;
    topic: string | null;
    relatedConcepts: { slug: string; title: string }[];
    text: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    marks: number;
    negativeMarks: number;
    selectedIndex: number | null;
    isCorrect: boolean;
    awardedMarks: number;
  }[];
}

export interface WeakTopicRow {
  subject: string;
  topic: string | null;
  seen: number;
  correct: number;
  wrong: number;
  incorrect: number;
  unanswered: number;
  accuracy: number | null;
}

export interface QuestionPerformanceRow {
  questionId: number;
  subject: string;
  topic: string | null;
  difficulty: string;
  seen: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  accuracy: number | null;
  sampleSize: number;
  sufficientData: boolean;
  weak: boolean;
}
export interface QuestionPerformanceReport {
  generatedAt: string;
  minimumAnswers: number;
  weakAccuracyThreshold: number;
  questions: QuestionPerformanceRow[];
  insufficientSampleCount: number;
}

export interface PerformanceOverview {
  generatedAt: string;
  practice: {
    completedAttempts: number;
    questions: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number | null;
    subjects: WeakTopicRow[];
    difficulty: {
      difficulty: string;
      correct: number;
      incorrect: number;
      unanswered: number;
      accuracy: number | null;
      answered: number;
    }[];
    trend: { attemptId: number; finishedAt: string; accuracy: number | null; correct: number; total: number }[];
  };
  formalExams: {
    submissions: number;
    graded: number;
    reviewRequired: number;
    score: number;
    maximumScore: number;
    scorePercentage: number | null;
    correct: number;
    incorrect: number;
    unanswered: number;
    subjects: {
      subject: string;
      correct: number;
      incorrect: number;
      unanswered: number;
      accuracy: number | null;
      awardedMarks: number;
      maximumMarks: number;
    }[];
  };
}

export interface WeakTopicsReport {
  subjects: WeakTopicRow[];
  topics: WeakTopicRow[];
  weakest: WeakTopicRow | null;
}

export interface StudyHistoryItem {
  attemptId: number;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  score: number;
  total: number;
  expired: boolean;
}

export interface StudyHistoryPage {
  items: StudyHistoryItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface StudyRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  reason: string;
  subject: string | null;
  topic: string | null;
  mode: "practice" | "mistakes" | "mock";
  questionCount: number;
  evidence: {
    answeredQuestions: number;
    incorrectAnswers: number;
    accuracy: number | null;
    minimumAnswers: number;
    weakAccuracyThreshold: number;
  } | null;
}

export type StudentScorePrediction =
  | { status: "insufficient_data"; completedAttempts: number; availableSamples: number; requiredSamples: number; requiredCompletedAttempts: number; message: string; populationFeatures?: Record<string, number> }
  | { status: "baseline_not_beaten"; completedAttempts: number; evaluationSamples: number; modelMae: number; baselineMae: number; message: string; populationFeatures?: Record<string, number> }
  | { status: "ready"; completedAttempts: number; trainingSamples: number; evaluationSamples: number; predictedScorePercent: number; predictionInterval: { lowerPercent: number; upperPercent: number; estimatedErrorPercent: number; method: "walk-forward-rmse" }; modelMae: number; baselineMae: number; message: string; populationFeatures?: Record<string, number> };

export interface StudyRecommendationsReport {
  generatedAt: string;
  basedOnAttempts: number;
  minimumAnswers: number;
  weakAccuracyThreshold: number;
  performanceExplanation: {
    headline: string;
    details: string[];
    answeredQuestions: number;
    incorrectAnswers: number;
    evidenceThreshold: number;
    weakAccuracyThreshold: number;
  };
  recommendations: StudyRecommendation[];
}

export interface AdminExamReport {
  title: string;
  version: number | null;
  assigned: number;
  started: number;
  active: number;
  submitted: number;
  reviewRequired: number;
  averagePercentage: number | null;
  subjects: { subject: string; questions: number; correct: number; incorrect: number; unanswered: number; marks: number }[];
  questions: { questionId: string; position: number; subject: string; topic: string | null; responses: number; correct: number; incorrect: number; unanswered: number; accuracy: number | null }[];
}

export interface AdminExamAudit {
  assignmentId: string;
  candidate: { id: number; email: string };
  exam: { title: string };
  version: number;
  session: { id: string; status: string; startedAt: string | null; lastHeartbeatAt: string | null; endedAt: string | null; heartbeatCount: number; focusLossCount: number; disconnectCount: number } | null;
  submission: { id: string; status: string; submittedAt: string; receivedAt: string; score: number | null; maximumScore: number | null } | null;
  events: { id: string; type: string; detail: string; createdAt: string; actor: { id: number; email: string; role: string } | null }[];
}

export interface AdminAttendanceRow {
  assignmentId: string;
  candidate: { id: number; email: string };
  exam: { id: string; title: string };
  version: number;
  questionCount: number;
  assignedAt: string;
  availableFrom: string | null;
  dueAt: string | null;
  attendanceStatus: string;
  connectivity: string;
  session: { id: string; status: string; startedAt: string | null; lastHeartbeatAt: string | null; endedAt: string | null; heartbeatCount: number; focusLossCount: number; disconnectCount: number } | null;
  submission: { id: string; status: string; submittedAt: string; score: number | null; maximumScore: number | null } | null;
}

export interface AdminLiveSession {
  id: string;
  status: string;
  student: { id: number; email: string };
  exam: { id: string; title: string };
  assignmentId: string;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  connectivity: "CONNECTED" | "STALE";
  heartbeatCount: number;
  focusLossCount: number;
  disconnectCount: number;
  submission: { id: string; status: string } | null;
  events: { id: string; type: string; detail: string; createdAt: string; actor: { email: string; role: string } | null }[];
}

export interface AdminSubmission {
  id: string;
  status: string;
  score: number | null;
  maximumScore: number | null;
  startedAt: string;
  submittedAt: string;
  receivedAt: string;
  student: { id: number; email: string };
  exam: { id: string; title: string; version: number; durationMinutes: number };
  availableFrom: string | null;
  dueAt: string | null;
  questions: {
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
  }[];
}

export interface AdminOverview {
  totals: {
    students: number;
    exams: number;
    assignments: number;
    submissions: number;
    submissionRate: number;
    averagePercentage: number | null;
  };
  practice: {
    completedAttempts: number;
    questions: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number | null;
    subjects: {
      subject: string;
      correct: number;
      incorrect: number;
      unanswered: number;
      accuracy: number | null;
    }[];
    topics: {
      subject: string;
      topic: string | null;
      correct: number;
      incorrect: number;
      unanswered: number;
      accuracy: number | null;
    }[];
    questionPerformance: {
      minimumAnswers: number;
      minimumStudents: number;
      weakAccuracyThreshold: number;
      insufficientSampleCount: number;
      questions: (QuestionPerformanceRow & { sampleSize: number; uniqueStudents: number })[];
    };
  };
  formalExams: {
    graded: number;
    reviewRequired: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    subjects: {
      subject: string;
      correct: number;
      incorrect: number;
      unanswered: number;
      awardedMarks: number;
      maximumMarks: number;
      accuracy: number | null;
    }[];
    topics: {
      subject: string;
      topic: string | null;
      correct: number;
      incorrect: number;
      unanswered: number;
      awardedMarks: number;
      maximumMarks: number;
      accuracy: number | null;
    }[];
  };
  exams: {
    examId: string;
    title: string;
    assigned: number;
    submitted: number;
    submissionRate: number;
    averagePercentage: number | null;
  }[];
  recentSubmissions: {
    submissionId: string;
    studentId: number;
    studentEmail: string;
    examTitle: string;
    submittedAt: string;
    score: number | null;
    maximumScore: number | null;
    status: string;
  }[];
}

/** Thrown for any non-2xx; `.message` is always UI-safe. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function isAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(503, "Cannot reach the app server. Is `npm run dev:api` running?");
  }
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const serverMessage =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : "";
    throw new ApiError(response.status, serverMessage || friendlyError(response.status));
  }
  return body as T;
}
const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export interface AdminModelDataset {
  id: string;
  name: string;
  task: "regression" | "binary-classification";
  targetColumn: string;
  featureSchema: Array<{ name: string; type: "numeric" | "categorical"; categories?: string[] }>;
  rowCount: number;
  sourceDescription: string;
  sourceAttested: boolean;
  datasetKind: "synthetic" | "real-anonymized";
  fingerprint: string;
  createdAt: string;
}

export interface AdminRegisteredModel {
  modelId: string;
  version: number;
  algorithm: string;
  task: string;
  dataset: string;
  isActive: boolean;
  createdAt: string;
  activatedAt?: string | null;
  productionEligible?: boolean | null;
}

export interface TensorflowTrainingReport {
  ok: true;
  model: AdminRegisteredModel | null;
  promoted: false;
  productionEligible: boolean;
  split: { trainRows: number; testRows: number; trainGroups: number; testGroups: number };
  candidate: { rows: number; mae: number; rmse: number; rSquared: number | null };
  baseline: { rows: number; mae: number; rmse: number; rSquared: number | null };
  reason: string;
  message: string;
}

export const api = {
  bank: () => request<BankInfo>("/bank"),
  offlineLearningPackage: () => request<OfflineLearningPackage>("/learning/package"),
  learningConcepts: (query = "", subject = "") => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (subject.trim()) params.set("subject", subject.trim());
    const suffix = params.toString();
    return request<{ total: number; concepts: LearningConcept[] }>(
      "/learning/concepts" + (suffix ? "?" + suffix : "")
    );
  },
  learningConcept: (slug: string) => request<LearningConcept>("/learning/concepts/" + encodeURIComponent(slug)),
  createTest: (body: { mode: string; subject?: string; subjects?: string[]; topics?: string[]; count?: number }) =>
    request<CreatedTest>("/tests", json(body)),
  getAttempt: (id: number) => request<AttemptView>(`/tests/${id}`),
  submit: (id: number, answers: SubmitAnswer[]) =>
    request<SubmitSummary>(`/tests/${id}/submit`, json({ answers })),
  result: (id: number) => request<TestResult>(`/tests/${id}/result`),
  register: (email: string, password: string) =>
    request<{ ok: boolean; message: string }>("/auth/register", json({ email, password })),
  login: (email: string, password: string) =>
    request<AuthSession>("/auth/login", json({ email, password })),
  logout: () => request<{ ok: boolean; message: string }>("/auth/logout", { method: "POST" }),
  me: () => request<AuthSession>("/auth/me"),
  assignedExams: () => request<{ ok: true; assignments: AssignedExam[] }>("/exams/assigned"),
  publishedExamCatalog: () => request<{ ok: true; catalog: PublishedExamCatalogItem[] }>("/exams/catalog"),
  assignedExamPackage: (id: string) =>
    request<{ ok: true; package: AssignedExamPackage; sha256: string }>(
      `/exams/assignments/${id}/package`
    ),
  startAssignedExamSession: (id: string) =>
    request<{ ok: true; session: { id: string; status: string; startedAt: string; serverTime: string; deadline: string | null } }>(
      `/exams/assignments/${id}/session/start`, json({})
    ),
  heartbeatAssignedExamSession: (id: string, event: "HEARTBEAT" | "FOCUS_LOST" | "FOCUS_RESTORED" | "CONNECTION_RESTORED" = "HEARTBEAT") =>
    request<{ ok: true; serverTime: string; deadline: string | null; sessionStatus: string }>(
      `/exams/assignments/${id}/session/heartbeat`, json({ event })
    ),
  adminLiveSessions: () =>
    request<{ ok: true; serverTime: string; sessions: AdminLiveSession[] }>("/admin/exams/live-sessions"),
  adminExamAttendance: () =>
    request<{ ok: true; serverTime: string; attendance: AdminAttendanceRow[] }>("/admin/exams/attendance"),
  adminExamAudit: (assignmentId: string) =>
    request<{ ok: true; audit: AdminExamAudit }>(`/admin/exams/assignments/${assignmentId}/audit`),
  adminSessionAction: (id: string, action: "PAUSE" | "RESUME" | "TERMINATE", reason = "") =>
    request<{ ok: true; session: { id: string; status: string; endedAt: string | null } }>(
      `/admin/exams/sessions/${id}/action`, json({ action, reason })
    ),
  submitAssignedExam: (
    id: string,
    body: {
      attemptUuid: string;
      startedAt: string;
      submittedAt: string;
      answers: { examQuestionId: string; selectedIndex: number | null }[];
    }
  ) =>
    request<{ ok: true; duplicate: boolean; submission: { id: string; status: string } }>(
      `/exams/assignments/${id}/submission`,
      json(body)
    ),
  assignedExamResult: (id: string) =>
    request<{ ok: true; result: AssignedExamResult }>(`/exams/assignments/${id}/result`),
  performanceOverview: () => request<PerformanceOverview>("/analytics/overview"),
  weakTopics: () => request<WeakTopicsReport>("/analytics/weak-topics"),
  questionPerformance: () => request<QuestionPerformanceReport>("/analytics/question-performance"),
  studyHistory: (page = 1) => request<StudyHistoryPage>(`/analytics/history?page=${page}&limit=10`),
  studentScorePrediction: () => request<StudentScorePrediction>("/analytics/score-prediction"),
  activeTensorflowModel: (modelId: string) => request<{ ok: true; artifact: BrowserTensorflowArtifact }>(`/models/${encodeURIComponent(modelId)}/active/tensorflow`),
  studyRecommendations: () =>
    request<StudyRecommendationsReport>("/analytics/recommendations"),
  announcements: () => request<{ ok: true; announcements: Announcement[]; serverTime: string }>("/announcements"),
  acknowledgeAnnouncement: (id: string) =>
    request<{ ok: true; seenAt: string; acknowledgedAt: string | null }>(`/announcements/${encodeURIComponent(id)}/acknowledge`, json({})),
  notifications: (unreadOnly = false) =>
    request<{ ok: true; notifications: StudentNotification[]; unreadCount: number; serverTime: string }>(
      `/notifications${unreadOnly ? "?unread=true" : ""}`
    ),
  readNotification: (id: string) =>
    request<{ ok: true; readAt: string; alreadyRead: boolean }>(
      `/notifications/${encodeURIComponent(id)}/read`, json({})
    ),
  adminAnnouncements: () => request<{ ok: true; announcements: Announcement[] }>("/admin/announcements"),
  createAnnouncement: (body: { title: string; message: string; expiresAt?: string }) =>
    request<{ ok: true; announcement: Announcement }>("/admin/announcements", json(body)),
  adminSubmission: (id: string) =>
    request<{ ok: true; submission: AdminSubmission }>(`/admin/submissions/${id}`),
  adminOverview: () => request<{ ok: true } & AdminOverview>("/admin/analytics/overview"),
  adminModelDatasets: () => request<{ ok: true; datasets: AdminModelDataset[] }>("/admin/model-datasets"),
  adminRegisteredModels: () => request<{ ok: true; models: AdminRegisteredModel[] }>("/admin/models"),
  activateAdminModelVersion: (modelId: string, version: number) =>
    request<{ ok: true; model: { modelId: string; version: number; isActive: boolean; activatedAt: string } }>(
      `/admin/models/${encodeURIComponent(modelId)}/${version}/activate`, json({})
    ),
  registerAdminModelDataset: (body: {
    name: string;
    task: "regression";
    targetColumn: string;
    featureSchema: Array<{ name: string; type: "numeric" }>;
    samples: Array<{ features: Record<string, number>; target: number; groupId: string }>;
    sourceDescription: string;
    sourceAttested: true;
    datasetKind: "synthetic" | "real-anonymized";
  }) => request<{ ok: true; dataset: AdminModelDataset }>("/admin/model-datasets", json(body)),
  trainAdminTensorflowDataset: (datasetId: string, body: { modelId: string; seed?: number; epochs?: number; batchSize?: number }) =>
    request<TensorflowTrainingReport>(`/admin/model-datasets/${encodeURIComponent(datasetId)}/train-tensorflow`, json(body)),
  adminExams: () => request<{ ok: true; exams: AdminExam[] }>("/admin/exams"),
  adminStudents: () => request<{ ok: true; students: AdminStudent[] }>("/admin/students"),
  adminQuestions: (page = 1, pageSize = 200) => request<{ ok: true; questions: AdminQuestion[]; page: number; pages: number; total: number }>(`/admin/question-bank?page=${page}&pageSize=${pageSize}`),
  createAdminQuestion: (body: { subject: string; topic: string; text: string; options: string[]; correctIndex: number; explanation: string; difficulty: string; source: string }) => request<{ ok: true; question: AdminQuestion }>("/admin/questions", json(body)),
  importAdminCsv: (content: string) => request<{ ok: true; report: QuestionImportReport }>("/admin/questions/import/csv", json({ content })),
  importAdminJson: (questions: unknown[]) => request<{ ok: true; report: QuestionImportReport }>("/admin/questions/import/json", json({ questions })),
  validateAdminPaper: (body: { durationMinutes: number; questions: { questionId: number; marks: number; negativeMarks: number }[] }) =>
    request<{ ok: true; valid: boolean; errors: string[]; warnings: string[]; totalQuestions: number; totalMarks: number; averageSecondsPerQuestion: number; subjects: { subject: string; count: number; percentage: number }[]; difficulties: { difficulty: string; count: number; percentage: number }[] }>("/admin/exams/validate-paper", json(body)),
  adminExamReport: (id: string) => request<{ ok: true; report: AdminExamReport }>(`/admin/exams/${id}/report`),
  adminLatestExamVersion: (id: string) =>
    request<{ ok: true; exam: { id: string; title: string; description: string; status: string; version: { id: string; version: number; instructions: string; durationMinutes: number; shuffleQuestions: boolean; shuffleOptions: boolean; publishedAt: string | null; questions: { sourceQuestionId: number | null; position: number; subject: string; topic: string | null; text: string; marks: number; negativeMarks: number }[] } | null } }>(`/admin/exams/${id}/latest-version`),
  cloneAdminExam: (id: string) => request<{ ok: true; exam: AdminExam }>(`/admin/exams/${id}/clone`, json({})),
  updateAdminExam: (id: string, body: { title: string; description: string; instructions: string; durationMinutes: number; shuffleQuestions: boolean; shuffleOptions: boolean; questions: { questionId: number; marks: number; negativeMarks: number }[] }) =>
    request<{ ok: true; exam: AdminExam }>(`/admin/exams/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  createAdminExam: (body: {
    title: string;
    description: string;
    instructions: string;
    durationMinutes: number;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    questions: { questionId: number; marks: number; negativeMarks: number }[];
  }) => request<{ ok: true; exam: AdminExam }>("/admin/exams", json(body)),
  publishAdminExam: (id: string) =>
    request<{ ok: true; examId: string; versionId: string; publishedAt: string }>(
      `/admin/exams/${id}/publish`,
      json({})
    ),
  assignAdminExam: (
    id: string,
    body: { studentIds: number[]; availableFrom?: string; dueAt?: string }
  ) =>
    request<{ ok: true; created: number; assignments: unknown[] }>(
      `/admin/exams/${id}/assign`,
      json(body)
    ),
};
