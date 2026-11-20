import * as ExpoScreenCapture from "expo-screen-capture";
import * as SecureStore from "expo-secure-store";
import { requireNativeModule } from "expo";

const EXAM_IN_PROGRESS_KEY = "arctester-exam-in-progress";
const ACTIVE_ASSIGNMENT_KEY = "arctester-active-assignment";
const PENDING_EVENTS_KEY = "arctester-pending-integrity-events";

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
  OVERLAY_ATTEMPT: 3,
} as const;

let guard: any = null;
let examInProgress = false;
let activeAssignmentId: string | null = null;
let eventQueue: Array<{ type: string; at: string; detail?: string }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let subscription: { remove: () => void } | null = null;

const lastRef: Record<string, number> = {};
export const lastRefForTest = lastRef;
export const eventQueueForTest = eventQueue;

type IntegrityEvent = { type: string; at: string; detail?: string };

let persistenceQueue: Promise<void> = Promise.resolve();

async function readPersistedQueues(legacyAssignmentId = activeAssignmentId): Promise<Record<string, IntegrityEvent[]>> {
  const raw = await SecureStore.getItemAsync(PENDING_EVENTS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      // Migrate the first version of the queue, which was not assignment-scoped.
      return legacyAssignmentId ? { [legacyAssignmentId]: parsed as IntegrityEvent[] } : {};
    }
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, IntegrityEvent[]>;
  } catch {
    await SecureStore.deleteItemAsync(PENDING_EVENTS_KEY);
    return {};
  }
}

async function persistEventQueue(): Promise<void> {
  const assignmentId = activeAssignmentId;
  if (!assignmentId) return;
  const snapshot = [...eventQueue];

  // SecureStore has no transaction primitive. Serialize read/modify/write so
  // concurrent native events cannot overwrite a newer queue with an older one.
  persistenceQueue = persistenceQueue.catch(() => undefined).then(async () => {
    const queues = await readPersistedQueues(assignmentId);
    if (snapshot.length === 0) delete queues[assignmentId];
    else queues[assignmentId] = snapshot;
    if (Object.keys(queues).length === 0) {
      await SecureStore.deleteItemAsync(PENDING_EVENTS_KEY);
    } else {
      await SecureStore.setItemAsync(PENDING_EVENTS_KEY, JSON.stringify(queues));
    }
  });
  await persistenceQueue;
}

async function restorePersistedEvents(assignmentId: string): Promise<void> {
  await persistenceQueue.catch(() => undefined);
  const queues = await readPersistedQueues(assignmentId);
  const saved = queues[assignmentId] ?? [];
  const known = new Set(eventQueue.map((event) => `${event.type}:${event.at}`));
  for (const event of saved) {
    if (event && typeof event.type === "string" && typeof event.at === "string") {
      const key = `${event.type}:${event.at}`;
      if (!known.has(key)) eventQueue.push(event);
    }
  }
}

export function pushViolation(type: string, detail?: string): void {
  const now = Date.now();
  if (now - (lastRef[type] ?? 0) < 2000) return;
  lastRef[type] = now;
  eventQueue.push({ type, at: new Date().toISOString(), detail: detail ?? "" });
  void persistEventQueue().catch(() => undefined);
}

async function flushEvents(api: (path: string, init?: RequestInit) => Promise<any>, assignmentId: string): Promise<boolean> {
  if (activeAssignmentId && activeAssignmentId !== assignmentId) return false;
  await restorePersistedEvents(assignmentId);
  if (activeAssignmentId && activeAssignmentId !== assignmentId) return false;

  // The API validates at most 20 events per request. Drain larger offline
  // queues in bounded batches and retain the failed batch plus remaining work.
  while (eventQueue.length > 0) {
    if (activeAssignmentId && activeAssignmentId !== assignmentId) return false;
    const batch = eventQueue.splice(0, 20);
    try {
      await api(`/exams/assignments/${encodeURIComponent(assignmentId)}/session/integrity`, {
        method: "POST",
        body: JSON.stringify({ events: batch }),
      });
      await persistEventQueue();
    } catch {
      eventQueue.unshift(...batch);
      await persistEventQueue().catch(() => undefined);
      return false;
    }
  }
  return true;
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
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  if (guard) {
    try { await guard.stop(); } catch { /* Native activity may already be gone. */ }
    guard = null;
  }
  activeAssignmentId = assignmentId;
  eventQueue.length = 0;
  await restorePersistedEvents(assignmentId);
  examInProgress = true;
  try {
    guard = requireNativeModule("ExamGuard");
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
  await persistEventQueue();
  eventQueue.length = 0;
  activeAssignmentId = null;
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
  activeAssignmentId = assignmentId;
  await restorePersistedEvents(assignmentId);
  pushViolation("APP_REOPENED", "App was reopened after process death during an active exam.");
  const delivered = await flushEvents(api, assignmentId);
  if (!delivered) return;
  eventQueue.length = 0;
  activeAssignmentId = null;
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
