import { describe, expect, it } from "vitest";
import { formatMs, remainingMs } from "./timer";

describe("remainingMs", () => {
  const deadline = "2026-01-01T03:00:00.000Z";
  const serverNow = "2026-01-01T01:00:00.000Z"; // paper built with 2h left

  it("returns the full gap right after the paper is built", () => {
    const state = remainingMs({ deadline, serverNow, elapsedMs: 0 });
    expect(state.remainingMs).toBe(2 * 3600 * 1000);
    expect(state.expired).toBe(false);
  });

  it("ticks down by the elapsed time (60s later)", () => {
    const state = remainingMs({ deadline, serverNow, elapsedMs: 60_000 });
    expect(state.remainingMs).toBe(2 * 3600 * 1000 - 60_000);
  });

  it("ignores a wrong absolute clock: only client DELTAS count", () => {
    // A client clock stuck in 1999 still ticks correctly: we never read it.
    const early = remainingMs({ deadline, serverNow, elapsedMs: 0 });
    const later = remainingMs({ deadline, serverNow, elapsedMs: 5_000 });
    expect(early.remainingMs - later.remainingMs).toBe(5_000);
  });

  it("clamps at 0 and flags expired once time runs out", () => {
    const state = remainingMs({ deadline, serverNow, elapsedMs: 3 * 3600 * 1000 });
    expect(state.remainingMs).toBe(0);
    expect(state.expired).toBe(true);
  });

  it("defaults elapsedMs to 0", () => {
    expect(remainingMs({ deadline, serverNow }).remainingMs).toBe(2 * 3600 * 1000);
  });

  it("handles invalid dates safely", () => {
    const state = remainingMs({ deadline: "not-a-date", serverNow, elapsedMs: 0 });
    expect(state.remainingMs).toBe(0);
    expect(state.expired).toBe(true);
  });
});

describe("formatMs", () => {
  it("shows hours when 1h or more", () => {
    expect(formatMs(3 * 3600 * 1000 + 7 * 60 * 1000 + 9 * 1000)).toBe("03:07:09");
  });

  it("shows mm:ss under an hour", () => {
    expect(formatMs(4 * 60 * 1000 + 5 * 1000)).toBe("04:05");
  });

  it("never goes negative", () => {
    expect(formatMs(-5000)).toBe("00:00");
  });
});
