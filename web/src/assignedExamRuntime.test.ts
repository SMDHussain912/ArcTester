import { describe, expect, it } from "vitest";
import {
  createServerClockAnchor,
  holdServerClock,
  remainingServerSeconds,
  resumeServerClock,
  resolveAssignedExamDeadline,
} from "./assignedExamRuntime";

describe("server-authoritative assigned exam clock", () => {
  const session = {
    startedAt: "2026-11-10T10:00:00.000Z",
    serverTime: "2026-11-10T10:00:05.000Z",
    deadline: "2026-11-10T11:00:00.000Z",
  };

  it("derives remaining time from the server deadline and monotonic elapsed time", () => {
    const anchor = createServerClockAnchor(session, 1000);
    expect(remainingServerSeconds(anchor, 2000)).toBe(3594);
  });

  it("holds the timer while the invigilator has paused the session", () => {
    const anchor = createServerClockAnchor(session, 1000);
    const held = holdServerClock(anchor, 10_000);
    expect(held).toBe(3586);
    expect(held).toBe(holdServerClock(anchor, 10_000));
  });

  it("cannot be extended by changing the browser wall clock", () => {
    const anchor = createServerClockAnchor(session, 5000);
    const beforeClockChange = remainingServerSeconds(anchor, 65_000);
    // Device Date.now() is deliberately absent from the clock calculation.
    const afterWallClockChange = remainingServerSeconds(anchor, 65_000);
    expect(afterWallClockChange).toBe(beforeClockChange);
    expect(afterWallClockChange).toBe(3535);
  });

  it("uses the per-session duration deadline instead of the later assignment cutoff", () => {
    expect(resolveAssignedExamDeadline("2026-11-10T11:00:00.000Z", "2026-11-10T18:00:00.000Z")).toBe(Date.parse("2026-11-10T11:00:00.000Z"));
  });

  it("falls back to the assignment cutoff only when no session deadline exists", () => {
    expect(resolveAssignedExamDeadline(null, "2026-11-10T18:00:00.000Z")).toBe(Date.parse("2026-11-10T18:00:00.000Z"));
  });

  it("resumes from the server-issued deadline after a pause", () => {
    const anchor = resumeServerClock(120, "2026-11-10T10:30:00.000Z", 500);
    expect(remainingServerSeconds(anchor, 1500)).toBe(119);
  });
});
