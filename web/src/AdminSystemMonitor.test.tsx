import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminSystemMonitor from "./AdminSystemMonitor";

const response = {
  ok: true, databaseStatus: "ready", serverTime: "2026-11-26T00:00:00.000Z",
  servers: [{
    instanceId: "instance-1", hostname: "api-node-a", version: "0.1.0", buildSha: "abc123456789",
    startedAt: "2026-11-25T00:00:00.000Z", lastSeenAt: "2026-11-26T00:00:00.000Z", ageSeconds: 2,
    status: "healthy", cpuPercent: 12.5, rssBytes: 1048576, heapUsedBytes: 524288,
    uptimeSeconds: 3600, activeRequests: 3, requestsTotal: 1200, errorsTotal: 4,
    requestRatePerMinute: 25, p50LatencyMs: 18, p95LatencyMs: 72, dbLatencyMs: 4,
  }],
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("AdminSystemMonitor", () => {
  it("renders actual fleet snapshot metrics and healthy status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));
    render(<AdminSystemMonitor />);
    await waitFor(() => expect(screen.getByText("api-node-a")).toBeTruthy());
    expect(screen.getByText("HEALTHY")).toBeTruthy();
    expect(screen.getByText("12.5%")).toBeTruthy();
    expect(screen.getByText("72 ms")).toBeTruthy();
    expect(screen.getByText(/shared PostgreSQL/)).toBeTruthy();
  });

  it("shows an authorization or service error without fabricating metrics", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })));
    render(<AdminSystemMonitor />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Administrator access"));
    expect(screen.queryByText("HEALTHY")).toBeNull();
  });

  it("supports manual refresh", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminSystemMonitor />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Refresh metrics" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
