import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./apiClient";

export type IntegrityType =
  | "FULLSCREEN_EXIT"
  | "WINDOW_BLUR"
  | "TAB_HIDDEN"
  | "COPY_ATTEMPT"
  | "PASTE_ATTEMPT"
  | "CONTEXT_MENU"
  | "DEVTOOLS_KEY"
  | "DISPLAY_EXTENDED"
  | "EXTERNAL_DISPLAY"
  | "APP_BACKGROUND"
  | "WINDOW_FOCUS_LOST"
  | "MULTI_WINDOW"
  | "SCREEN_CAPTURE_ATTEMPT"
  | "UNPINNED"
  | "APP_REOPENED"
  | "DEVICE_CHANGED";

export interface IntegrityEvent {
  type: IntegrityType;
  at: string;
  detail: string;
}

export interface UseExamIntegrityOptions {
  assignmentId: string;
  integrityLevel: "OFF" | "BASIC" | "STRICT";
  api?: (path: string, init?: RequestInit) => Promise<Response>;
  onFlagged?: () => void;
}

export interface UseExamIntegrityResult {
  events: IntegrityEvent[];
  violationCount: number;
  maxViolations: number;
  warn: boolean;
  flagged: boolean;
  push: (type: IntegrityType, detail?: string) => void;
  flush: () => Promise<void>;
  requestFullscreen: () => Promise<void>;
  isFullscreen: boolean;
}

/**
 * Client-side integrity event collector.
 *
 * Debounces each event type at 2 seconds so rapid repeats don't flood the
 * server. Queues events and flushes every 5 seconds (or on demand). Events are
 * never dropped: if a flush fails, they remain in the queue and are retried.
 *
 * When integrityLevel is "OFF" no events are recorded and the hook is a no-op.
 * The honest limitation is stated in the overlay: web browsers cannot prove
 * cheating, only detect signals that warrant human review.
 */
export function useExamIntegrity({
  assignmentId,
  integrityLevel,
  api = request,
  onFlagged,
}: UseExamIntegrityOptions): UseExamIntegrityResult {
  const [events, setEvents] = useState<IntegrityEvent[]>([]);
  const [violationCount, setViolationCount] = useState(0);
  const [maxViolations, setMaxViolations] = useState(10);
  const [warn, setWarn] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  const queueRef = useRef<IntegrityEvent[]>([]);
  const lastRef = useRef<Record<IntegrityType, number>>({} as Record<IntegrityType, number>);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushInProgressRef = useRef(false);

  const max = integrityLevel === "OFF" ? 0 : maxViolations;

  const push = useCallback((type: IntegrityType, detail?: string) => {
    if (integrityLevel === "OFF") return;
    const now = Date.now();
    if (now - (lastRef.current[type] ?? 0) < 2000) return;
    lastRef.current[type] = now;
    const event: IntegrityEvent = { type, at: new Date().toISOString(), detail: detail ?? "" };
    queueRef.current.push(event);
    setEvents((prev) => [...prev, event]);
  }, [integrityLevel]);

  const flush = useCallback(async (): Promise<void> => {
    if (integrityLevel === "OFF" || flushInProgressRef.current) return;
    const batch = queueRef.current.splice(0, queueRef.current.length);
    if (batch.length === 0) return;
    flushInProgressRef.current = true;
    try {
      const result = await api(`/exams/assignments/${encodeURIComponent(assignmentId)}/session/integrity`, {
        method: "POST",
        body: JSON.stringify({ events: batch }),
      });
      setViolationCount(result.violationCount ?? violationCount + batch.length);
      setMaxViolations(result.max ?? maxViolations);
      setWarn(result.warn ?? false);
      setFlagged(result.flagged ?? false);
      if (result.flagged && onFlagged) onFlagged();
    } catch {
      // Re-queue failed events so they are retried on the next flush.
      queueRef.current.unshift(...batch);
    } finally {
      flushInProgressRef.current = false;
    }
  }, [assignmentId, integrityLevel, api, violationCount, maxViolations, onFlagged]);

  // Periodic flush every 5 seconds.
  useEffect(() => {
    if (integrityLevel === "OFF") return;
    flushTimerRef.current = setInterval(() => void flush(), 5000);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, [integrityLevel, flush]);

  // Flush on visibility change (page hide / tab switch).
  useEffect(() => {
    if (integrityLevel === "OFF") return;
    const handler = () => void flush();
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [integrityLevel, flush]);

  // Fullscreen tracking.
  useEffect(() => {
    if (integrityLevel === "OFF") return;
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) push("FULLSCREEN_EXIT");
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [integrityLevel, push]);

  // Tab hidden tracking.
  useEffect(() => {
    if (integrityLevel === "OFF") return;
    const onVisibilityChange = () => {
      if (document.hidden) push("TAB_HIDDEN");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [integrityLevel, push]);

  // Window blur tracking (debounced 300ms to avoid blur+focus flapping).
  useEffect(() => {
    if (integrityLevel === "OFF") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onBlur = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!document.hidden) push("WINDOW_BLUR");
      }, 300);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      if (timer) clearTimeout(timer);
    };
  }, [integrityLevel, push]);

  // Copy / paste / context menu suppression + tracking.
  useEffect(() => {
    if (integrityLevel === "OFF") return;
    for (const [ev, type] of [
      ["copy", "COPY_ATTEMPT"],
      ["paste", "PASTE_ATTEMPT"],
      ["contextmenu", "CONTEXT_MENU"],
    ] as const) {
      const handler = (e: Event) => {
        e.preventDefault();
        push(type);
      };
      document.addEventListener(ev, handler as EventListener);
    }
    return () => {
      for (const [ev] of [["copy"], ["paste"], ["contextmenu"]] as const) {
        document.removeEventListener(ev, document[`on${ev}`] as EventListener);
      }
    };
  }, [integrityLevel, push]);

  // DevTools key suppression + tracking.
  useEffect(() => {
    if (integrityLevel === "OFF") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        k === "printscreen" ||
        k === "f12" ||
        (e.ctrlKey && e.shiftKey && "ijc".includes(k)) ||
        (e.ctrlKey && "ups".includes(k))
      ) {
        e.preventDefault();
        push("DEVTOOLS_KEY", k);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [integrityLevel, push]);

  // Periodic display / focus checks every second.
  useEffect(() => {
    if (integrityLevel === "OFF") return;
    const timer = setInterval(() => {
      if (!document.hasFocus()) push("WINDOW_BLUR");
      const screenAny = screen as unknown as { isExtended?: boolean };
      if (screenAny.isExtended) push("DISPLAY_EXTENDED");
    }, 1000);
    return () => clearInterval(timer);
  }, [integrityLevel, push]);

  const requestFullscreen = useCallback(async (): Promise<void> => {
    if (integrityLevel === "OFF") return;
    const el = document.documentElement;
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else {
      const elAny = el as unknown as {
        webkitRequestFullscreen?: () => Promise<void>;
        msRequestFullscreen?: () => Promise<void>;
      };
      if (elAny.webkitRequestFullscreen) {
        await elAny.webkitRequestFullscreen();
      } else if (elAny.msRequestFullscreen) {
        await elAny.msRequestFullscreen();
      }
    }
  }, [integrityLevel]);

  return {
    events,
    violationCount,
    maxViolations: max,
    warn,
    flagged,
    push,
    flush,
    requestFullscreen,
    isFullscreen,
  };
}
