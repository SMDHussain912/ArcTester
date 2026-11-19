// Monotonic clock for offline exam timing.
//
// Anchor a monotonic runtime clock to wall time once per JS process. This
// prevents manual/NTP wall-clock changes while the app is running from
// extending or prematurely expiring an attempt. On runtimes without
// performance.now(), fall back to a non-decreasing wall clock.
//
// The persisted attempt checkpoint bridges process restarts: after a restart,
// getRemainingSeconds() never moves behind the last saved checkpoint. Offline
// code cannot know the true elapsed time if the device clock is changed while
// the app is not running; the checkpoint deliberately fails closed on rollback.

const wallClockAtStart = Date.now();
const hasMonotonicRuntimeClock =
  typeof performance !== "undefined" &&
  typeof performance.now === "function";
const monotonicClockAtStart = hasMonotonicRuntimeClock ? performance.now() : 0;

let lastValue = wallClockAtStart;

export function monotonicNow(): number {
  const candidate = hasMonotonicRuntimeClock
    ? wallClockAtStart + Math.max(0, performance.now() - monotonicClockAtStart)
    : Date.now();
  if (candidate < lastValue) return lastValue;
  lastValue = candidate;
  return candidate;
}

export function wallNow(): number {
  return Date.now();
}
