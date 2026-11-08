// Typed API client for the ECET API. One place for every fetch, so the pages
// never touch `fetch` directly and errors always come back as friendly text.
//
// The session lives in an httpOnly cookie set by the API, so every call must
// send credentials. Without `credentials: "include"` the browser drops the
// cookie on cross-origin requests (localhost:3000 -> localhost:4000) and every
// protected route answers 403.

import { friendlyError, type SubmitAnswer } from "./answers";

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
    text: string;
    options: string[];
    selectedIndex: number | null;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string;
  }[];
}
export interface BankInfo {
  subjects: { subject: string; count: number }[];
  total: number;
  serverNow: string;
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
export type AdminQuestion = PublicQuestion;
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
  wrong: number;
  accuracy: number;
}

export interface WeakTopicsReport {
  subjects: WeakTopicRow[];
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

export const api = {
  bank: () => request<BankInfo>("/bank"),
  createTest: (body: { mode: string; subject?: string; count?: number }) =>
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
  assignedExamPackage: (id: string) =>
    request<{ ok: true; package: AssignedExamPackage; sha256: string }>(
      `/exams/assignments/${id}/package`
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
  weakTopics: () => request<WeakTopicsReport>("/analytics/weak-topics"),
  studyHistory: () => request<StudyHistoryItem[]>("/analytics/history"),
  adminSubmission: (id: string) =>
    request<{ ok: true; submission: AdminSubmission }>(`/admin/submissions/${id}`),
  adminOverview: () => request<{ ok: true } & AdminOverview>("/admin/analytics/overview"),
  adminExams: () => request<{ ok: true; exams: AdminExam[] }>("/admin/exams"),
  adminStudents: () => request<{ ok: true; students: AdminStudent[] }>("/admin/students"),
  adminQuestions: () => request<{ ok: true; questions: AdminQuestion[] }>("/admin/question-bank"),
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
