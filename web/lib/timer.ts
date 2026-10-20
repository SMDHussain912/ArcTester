// Pure timer math — no DOM, no timers, fully unit-testable.
//
// Why "elapsed" instead of raw clientNow: a wrong local clock cannot be
// trusted for ABSOLUTE time, but its DELTAS (how many ms passed since page
// load) are always correct. So the API sends {deadline, serverNow} once and
// the client subtracts its own elapsed time from that authoritative gap.

export interface TimerInput {
  /** ISO string or Date from the API (authoritative deadline). */
  deadline: Date | string;
  /** ISO string or Date from the API ("now" at the moment the paper was built). */
  serverNow: Date | string;
  /** Milliseconds elapsed on the client since the paper was fetched. */
  elapsedMs?: number;
}

export interface TimerState {
  /** Milliseconds left; never negative. */
  remainingMs: number;
  expired: boolean;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Time the paper had when the API built it, minus time since. */
export function remainingMs({ deadline, serverNow, elapsedMs = 0 }: TimerInput): TimerState {
  const d = toDate(deadline).getTime();
  const s = toDate(serverNow).getTime();
  if (!Number.isFinite(d) || !Number.isFinite(s) || !Number.isFinite(elapsedMs)) {
    return { remainingMs: 0, expired: true };
  }
  const initial = d - s;
  const left = initial - Math.max(0, elapsedMs);
  return { remainingMs: Math.max(0, left), expired: left <= 0 };
}

/** "01:03:07" for 3h7m; "04:05" under an hour. */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
