/** Returns null for untimed practice; otherwise computes time from the monotonic client clock anchored to server time. */
export function getRemainingPracticeSeconds(deadlineMs: number, monotonicNowMs: number, serverOffsetMs: number): number | null {
  if (!Number.isFinite(deadlineMs)) return null;
  return Math.max(0, Math.ceil((deadlineMs - (monotonicNowMs + serverOffsetMs)) / 1000));
}
