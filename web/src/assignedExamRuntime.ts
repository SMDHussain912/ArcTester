export type ServerClockAnchor = {
  deadlineMs: number;
  serverTimeMs: number;
  monotonicAt: number;
};

/** Anchor the authoritative server deadline to the browser's monotonic clock. */
export function createServerClockAnchor(
  session: { deadline: string; serverTime: string },
  monotonicAt: number
): ServerClockAnchor {
  return {
    deadlineMs: Date.parse(session.deadline),
    serverTimeMs: Date.parse(session.serverTime),
    monotonicAt,
  };
}

/** Calculate remaining time without consulting the mutable device wall clock. */
export function remainingServerSeconds(anchor: ServerClockAnchor, monotonicNow: number): number {
  const estimatedServerNow = anchor.serverTimeMs + Math.max(0, monotonicNow - anchor.monotonicAt);
  return Math.max(0, Math.ceil((anchor.deadlineMs - estimatedServerNow) / 1000));
}

export function holdServerClock(anchor: ServerClockAnchor, monotonicNow: number): number {
  return remainingServerSeconds(anchor, monotonicNow);
}

export function resumeServerClock(
  remainingSeconds: number,
  serverTime: string,
  monotonicAt: number
): ServerClockAnchor {
  const serverTimeMs = Date.parse(serverTime);
  return {
    serverTimeMs,
    monotonicAt,
    deadlineMs: serverTimeMs + Math.max(0, remainingSeconds) * 1000,
  };
}
