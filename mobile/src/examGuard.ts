import * as ExpoScreenCapture from "expo-screen-capture";

const WEIGHTS: Record<string, number> = {
  FULLSCREEN_EXIT: 1,
  WINDOW_BLUR: 1,
  TAB_HIDDEN: 1,
  COPY_ATTEMPT: 1,
  PASTE_ATTEMPT: 1,
  CONTEXT_MENU: 1,
  DEVTOOLS_KEY: 2,
  DISPLAY_EXTENDED: 3,
  EXTERNAL_DISPLAY: 3,
  APP_BACKGROUND: 2,
  WINDOW_FOCUS_LOST: 1,
  MULTI_WINDOW: 3,
  SCREEN_CAPTURE_ATTEMPT: 3,
  UNPINNED: 3,
  APP_REOPENED: 2,
  DEVICE_CHANGED: 3,
} as const;

let guard: any = null;
let examInProgress = false;
let eventQueue: Array<{ type: string; at: string; detail?: string }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let subscription: { remove: () => void } | null = null;

/**
 * Queue an integrity event for later flush to the server.
 * Debounced per type at 2s.
 */
const lastRef: Record<string, number> = {};
export const lastRefForTest = lastRef;
export const eventQueueForTest = eventQueue;

export function pushViolation(type: string, detail?: string): void {
  const now = Date.now();
  if (now - (lastRef[type] ?? 0) < 2000) return;
  lastRef[type] = now;
  eventQueue.push({ type, at: new Date().toISOString(), detail: detail ?? "" });
}

async function flushEvents(api: (path: string, init?: RequestInit) => Promise<any>, assignmentId: string): Promise<void> {
  const batch = eventQueue.splice(0, eventQueue.length);
  if (batch.length === 0) return;
  try {
    await api(`/exams/assignments/${encodeURIComponent(assignmentId)}/session/integrity`, {
      method: "POST",
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    eventQueue.unshift(...batch);
  }
}

function scheduleFlush(api: (path: string, init?: RequestInit) => Promise<any>, assignmentId: string): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flushEvents(api, assignmentId), 5000);
}

/**
 * Start the Android exam guard: prevent screenshots, start native violation
 * monitoring, and persist "examInProgress" so APP_REOPENED can be reported on
 * launch. Call when the student begins an assigned exam.
 */
export async function startExamGuard({
  api,
  assignmentId,
  usePinning = false,
}: {
  api: (path: string, init?: RequestInit) => Promise<any>;
  assignmentId: string;
  usePinning?: boolean;
}): Promise<void> {
  try {
    await ExpoScreenCapture.preventScreenCaptureAsync();
  } catch {
    // expo-screen-capture unavailable in Expo Go; continue without blocking.
  }
  examInProgress = true;
  try {
    const { NativeModules } = require("react-native");
    guard = NativeModules.ExamGuard;
    await guard.start(usePinning);
  } catch {
    guard = null; // Native module not available (Expo Go / not a dev build)
  }
  if (guard) {
    subscription = guard.addListener("onViolation", (event: any) => {
      pushViolation(event.type, event.detail);
      scheduleFlush(api, assignmentId);
    });
  }
  // Persist so we can report APP_REOPENED if the app is killed and reopened.
  try {
    const { AsyncStorage } = require("react-native");
    AsyncStorage.setItem("arctester-exam-in-progress", "1");
    AsyncStorage.setItem("arctester-active-assignment", assignmentId);
  } catch {}
}

/**
 * Stop the Android exam guard: allow screenshots, stop native monitoring, and
 * always clear the in-progress flag even on error. Call on submit, unmount,
 * and app launch.
 */
export async function stopExamGuard(): Promise<void> {
  examInProgress = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  try {
    const { NativeModules } = require("react-native");
    if (guard) await guard.stop();
  } catch {}
  guard = null;
  try {
    await ExpoScreenCapture.allowScreenCaptureAsync();
  } catch {}
  try {
    const { AsyncStorage } = require("react-native");
    await AsyncStorage.removeItem("arctester-exam-in-progress");
    await AsyncStorage.removeItem("arctester-active-assignment");
  } catch {}
}

/**
 * Report APP_REOPENed if a previous exam was interrupted by process death.
 * Call on app launch before starting any new exam.
 */
export async function reportAppReopened({
  api,
  assignmentId,
}: {
  api: (path: string, init?: RequestInit) => Promise<any>;
  assignmentId: string;
}): Promise<void> {
  try {
    const { AsyncStorage } = require("react-native");
    const flag = await AsyncStorage.getItem("arctester-exam-in-progress");
    if (flag === "1") {
      pushViolation("APP_REOPENED", "App was reopened after process death during an active exam.");
      await flushEvents(api, assignmentId);
      await AsyncStorage.removeItem("arctester-exam-in-progress");
      await AsyncStorage.removeItem("arctester-active-assignment");
    }
  } catch {}
}

/** Flush any queued integrity events immediately. */
export async function flushGuardEvents({
  api,
  assignmentId,
}: {
  api: (path: string, init?: RequestInit) => Promise<any>;
  assignmentId: string;
}): Promise<void> {
  await flushEvents(api, assignmentId);
}

/** Whether an exam is currently in progress on this device. */
export function isExamInProgress(): boolean {
  return examInProgress;
}
