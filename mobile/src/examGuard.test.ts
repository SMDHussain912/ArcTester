import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: vi.fn(),
  allowScreenCaptureAsync: vi.fn(),
}));

const mockAsyncStorage: Record<string, string> = {};
const mockGetItem = vi.fn(async (key: string) => mockAsyncStorage[key] ?? null);
const mockSetItem = vi.fn(async (key: string, value: string) => {
  mockAsyncStorage[key] = value;
});
const mockRemoveItem = vi.fn(async (key: string) => {
  delete mockAsyncStorage[key];
});

vi.mock("react-native", () => ({
  NativeModules: {},
  AsyncStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import {
  startExamGuard,
  stopExamGuard,
  isExamInProgress,
  pushViolation,
  flushGuardEvents,
  reportAppReopened,
  eventQueueForTest,
  lastRefForTest,
} from "./examGuard";

let capturedApiCalls: Array<{ path: string; body: any }> = [];
const fakeApi = vi.fn(async (path: string, init?: any) => {
  let body: any = null;
  if (init?.body) body = JSON.parse(init.body);
  capturedApiCalls.push({ path, body });
  return { ok: true };
});

beforeEach(() => {
  vi.clearAllMocks();
  capturedApiCalls = [];
  Object.keys(mockAsyncStorage).forEach((key) => delete mockAsyncStorage[key]);
  eventQueueForTest.length = 0;
  Object.keys(lastRefForTest).forEach((k) => delete lastRefForTest[k]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("examGuard", () => {
  it("flushes queued violations to the server", async () => {
    const { pushViolation, flushGuardEvents } = await import("./examGuard");
    pushViolation("TAB_HIDDEN");
    pushViolation("WINDOW_BLUR");
    await flushGuardEvents({ api: fakeApi, assignmentId: "assign-1" });
    expect(capturedApiCalls.length).toBe(1);
    expect(capturedApiCalls[0].path).toBe("/exams/assignments/assign-1/session/integrity");
    expect(capturedApiCalls[0].body.events.length).toBe(2);
    expect(capturedApiCalls[0].body.events[0].type).toBe("TAB_HIDDEN");
    expect(capturedApiCalls[0].body.events[1].type).toBe("WINDOW_BLUR");
  });

  it("does not report APP_REOPENED if no exam was in progress", async () => {
    const { reportAppReopened } = await import("./examGuard");
    await reportAppReopened({ api: fakeApi, assignmentId: "assign-1" });
    expect(capturedApiCalls.length).toBe(0);
  });

  it("debounces same-type violations", async () => {
    const { pushViolation, flushGuardEvents } = await import("./examGuard");
    pushViolation("COPY_ATTEMPT");
    pushViolation("COPY_ATTEMPT"); // debounced
    pushViolation("PASTE_ATTEMPT"); // not debounced
    await flushGuardEvents({ api: fakeApi, assignmentId: "assign-1" });
    const types = capturedApiCalls[0].body.events.map((e: any) => e.type);
    expect(types).toEqual(["COPY_ATTEMPT", "PASTE_ATTEMPT"]);
  });

  it("isExamInProgress returns false initially", async () => {
    const { isExamInProgress } = await import("./examGuard");
    expect(isExamInProgress()).toBe(false);
  });
});
