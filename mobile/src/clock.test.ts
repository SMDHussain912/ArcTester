import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("offline exam monotonic clock", () => {
  it("ignores wall-clock changes while the JavaScript process is alive", async () => {
    const wallClock = vi.spyOn(Date, "now").mockReturnValue(100_000);
    const runtimeClock = vi.spyOn(performance, "now").mockReturnValue(500);
    vi.resetModules();

    const { monotonicNow, wallNow } = await import("./clock");
    expect(monotonicNow()).toBe(100_000);

    wallClock.mockReturnValue(9_000_000);
    runtimeClock.mockReturnValue(1_500);
    expect(monotonicNow()).toBe(101_000);
    expect(wallNow()).toBe(9_000_000);

    wallClock.mockReturnValue(1);
    runtimeClock.mockReturnValue(2_500);
    expect(monotonicNow()).toBe(102_000);
  });

  it("never moves backward when the runtime clock reports a lower value", async () => {
    vi.spyOn(Date, "now").mockReturnValue(50_000);
    const runtimeClock = vi.spyOn(performance, "now").mockReturnValue(100);
    vi.resetModules();

    const { monotonicNow } = await import("./clock");
    expect(monotonicNow()).toBe(50_000);
    runtimeClock.mockReturnValue(90);
    expect(monotonicNow()).toBe(50_000);
    runtimeClock.mockReturnValue(200);
    expect(monotonicNow()).toBe(50_100);
  });
});
