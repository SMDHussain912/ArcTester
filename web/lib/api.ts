// Typed API client for the ECET API. One place for every fetch, so the pages
// never touch `fetch` directly and errors always come back as friendly text.

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

/** Thrown for any non-2xx; `.message` is always UI-safe. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
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

export const api = {
  bank: () => request<BankInfo>("/bank"),

  createTest: (body: { mode: string; subject?: string; count?: number }) =>
    request<CreatedTest>("/tests", { method: "POST", body: JSON.stringify(body) }),

  getAttempt: (id: number) => request<AttemptView>(`/tests/${id}`),

  submit: (id: number, answers: SubmitAnswer[]) =>
    request<SubmitSummary>(`/tests/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),

  result: (id: number) => request<TestResult>(`/tests/${id}/result`),
};
