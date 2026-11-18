import * as ExpoScreenCapture from "expo-screen-capture";
import * as SecureStore from "expo-secure-store";

const EXAM_IN_PROGRESS_KEY = "arctester-exam-in-progress";
const ACTIVE_ASSIGNMENT_KEY = "arctester-active-assignment";

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
    // Expo Go and unsupported platforms may not provide native screen protection.
  }
  examInProgress = true;
  try {
    const { NativeModules } = require("react-native");
    guard = NativeModules.ExamGuard;
    await guard.start(usePinning);
  } catch {
    guard = null;
  }
  if (guard) {
    subscription = guard.addListener("onViolation", (event: any) => {
      pushViolation(event.type, event.detail);
      scheduleFlush(api, assignmentId);
    });
  }
  // SecureStore is part of the installed Expo stack; AsyncStorage is not.
  await SecureStore.setItemAsync(EXAM_IN_PROGRESS_KEY, "1");
  await SecureStore.setItemAsync(ACTIVE_ASSIGNMENT_KEY, assignmentId);
}

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
    if (guard) await guard.stop();
  } catch {
    // Continue cleanup even if the native module has already been torn down.
  }
  guard = null;
  try {
    await ExpoScreenCapture.allowScreenCaptureAsync();
  } catch {
    // Screen capture may not have been blocked on this runtime.
  }
  await Promise.all([
    SecureStore.deleteItemAsync(EXAM_IN_PROGRESS_KEY),
    SecureStore.deleteItemAsync(ACTIVE_ASSIGNMENT_KEY),
  ]);
}

export async function reportAppReopened({
  api,
  assignmentId,
}: {
  api: (path: string, init?: RequestInit) => Promise<any>;
  assignmentId: string;
}): Promise<void> {
  const [flag, savedAssignmentId] = await Promise.all([
    SecureStore.getItemAsync(EXAM_IN_PROGRESS_KEY),
    SecureStore.getItemAsync(ACTIVE_ASSIGNMENT_KEY),
  ]);
  if (flag !== "1") return;
  if (savedAssignmentId && savedAssignmentId !== assignmentId) return;
  pushViolation("APP_REOPENED", "App was reopened after process death during an active exam.");
  await flushEvents(api, assignmentId);
  await Promise.all([
    SecureStore.deleteItemAsync(EXAM_IN_PROGRESS_KEY),
    SecureStore.deleteItemAsync(ACTIVE_ASSIGNMENT_KEY),
  ]);
}

export async function flushGuardEvents({
  api,
  assignmentId,
}: {
  api: (path: string, init?: RequestInit) => Promise<any>;
  assignmentId: string;
}): Promise<void> {
  await flushEvents(api, assignmentId);
}

export function isExamInProgress(): boolean {
  return examInProgress;
}
