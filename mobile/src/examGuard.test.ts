import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const secureStore = vi.hoisted(() => ({ values: {} as Record<string, string> }));

vi.mock("expo-modules-core", () => ({
  requireNativeModule: () => { throw new Error("ExamGuard native module is unavailable in unit tests"); },
}));

vi.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: vi.fn(),
  allowScreenCaptureAsync: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => secureStore.values[key] ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStore.values[key] = value;
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    delete secureStore.values[key];
  }),
}));

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
  Object.keys(secureStore.values).forEach((key) => delete secureStore.values[key]);
  eventQueueForTest.length = 0;
  Object.keys(lastRefForTest).forEach((key) => delete lastRefForTest[key]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("examGuard", () => {
  it("flushes queued violations to the server", async () => {
    pushViolation("TAB_HIDDEN");
    pushViolation("WINDOW_BLUR");
    await flushGuardEvents({ api: fakeApi, assignmentId: "assign-1" });
    expect(capturedApiCalls).toHaveLength(1);
    expect(capturedApiCalls[0].path).toBe("/exams/assignments/assign-1/session/integrity");
    expect(capturedApiCalls[0].body.events.map((event: any) => event.type)).toEqual(["TAB_HIDDEN", "WINDOW_BLUR"]);
  });

  it("does not report APP_REOPENED if no exam was in progress", async () => {
    await reportAppReopened({ api: fakeApi, assignmentId: "assign-1" });
    expect(capturedApiCalls).toHaveLength(0);
  });

  it("persists an active assignment and reports a process restart for that same exam", async () => {
    await startExamGuard({ api: fakeApi, assignmentId: "assign-1" });
    expect(secureStore.values["arctester-exam-in-progress"]).toBe("1");
    expect(secureStore.values["arctester-active-assignment"]).toBe("assign-1");

    await reportAppReopened({ api: fakeApi, assignmentId: "assign-1" });
    expect(capturedApiCalls).toHaveLength(1);
    expect(capturedApiCalls[0].body.events[0].type).toBe("APP_REOPENED");
    expect(secureStore.values["arctester-exam-in-progress"]).toBeUndefined();
  });

  it("keeps the interruption marker when the server cannot accept the restart event", async () => {
    await startExamGuard({ api: fakeApi, assignmentId: "assign-1" });
    const unavailableApi = vi.fn(async () => { throw new Error("network unavailable"); });
    await reportAppReopened({ api: unavailableApi, assignmentId: "assign-1" });
    expect(secureStore.values["arctester-exam-in-progress"]).toBe("1");
    expect(secureStore.values["arctester-active-assignment"]).toBe("assign-1");
    expect(eventQueueForTest.some((event) => event.type === "APP_REOPENED")).toBe(true);
  });

  it("restores queued integrity events after a process restart", async () => {
    await startExamGuard({ api: fakeApi, assignmentId: "assign-1" });
    pushViolation("TAB_HIDDEN", "App was backgrounded");
    const unavailableApi = vi.fn(async () => { throw new Error("offline"); });
    await flushGuardEvents({ api: unavailableApi, assignmentId: "assign-1" });
    expect(eventQueueForTest).toHaveLength(1);

    // Simulate a fresh JS process while SecureStore remains intact.
    eventQueueForTest.length = 0;
    Object.keys(lastRefForTest).forEach((key) => delete lastRefForTest[key]);
    await reportAppReopened({ api: fakeApi, assignmentId: "assign-1" });

    expect(capturedApiCalls).toHaveLength(1);
    expect(capturedApiCalls[0].body.events.map((event: any) => event.type)).toEqual([
      "TAB_HIDDEN",
      "APP_REOPENED",
    ]);
    expect(secureStore.values["arctester-pending-integrity-events"]).toBeUndefined();
  });

  it("does not attribute a previous exam restart to a different assignment", async () => {
    await startExamGuard({ api: fakeApi, assignmentId: "assign-1" });
    await reportAppReopened({ api: fakeApi, assignmentId: "assign-2" });
    expect(capturedApiCalls).toHaveLength(0);
    expect(secureStore.values["arctester-active-assignment"]).toBe("assign-1");
  });

  it("clears secure interruption markers when the exam guard stops", async () => {
    await startExamGuard({ api: fakeApi, assignmentId: "assign-1" });
    await stopExamGuard();
    expect(secureStore.values["arctester-exam-in-progress"]).toBeUndefined();
    expect(secureStore.values["arctester-active-assignment"]).toBeUndefined();
    expect(isExamInProgress()).toBe(false);
  });

  it("debounces same-type violations", async () => {
    pushViolation("COPY_ATTEMPT");
    pushViolation("COPY_ATTEMPT");
    pushViolation("PASTE_ATTEMPT");
    await flushGuardEvents({ api: fakeApi, assignmentId: "assign-1" });
    expect(capturedApiCalls[0].body.events.map((event: any) => event.type)).toEqual(["COPY_ATTEMPT", "PASTE_ATTEMPT"]);
  });

  it("isExamInProgress returns false after cleanup", () => {
    expect(isExamInProgress()).toBe(false);
  });
});
