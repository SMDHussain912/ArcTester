import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminLiveMonitor, { type LiveSession } from "./AdminLiveMonitor";

const session: LiveSession = {
  id: "session-1", status: "ACTIVE", student: { id: 7, email: "student@example.test" },
  exam: { id: "exam-1", title: "AP ECET Mock" }, assignmentId: "assignment-1",
  startedAt: "2026-11-10T08:00:00.000Z", lastHeartbeatAt: "2026-11-10T08:01:00.000Z",
  connectivity: "CONNECTED", heartbeatCount: 12, focusLossCount: 2, disconnectCount: 1,
  submission: null, events: [{ id: "event-1", type: "FOCUS_LOST", detail: "Window lost focus", createdAt: "2026-11-10T08:00:30.000Z", actor: null }],
};

describe("AdminLiveMonitor", () => {
  it("renders session totals, connectivity and integrity counts", () => {
    render(<AdminLiveMonitor sessions={[session]} total={3} loading={false} updatedAt="2026-11-10T08:02:00.000Z" selectedSessionId={null} onSelectSession={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Live invigilation" })).toBeTruthy();
    expect(screen.getAllByText("3")).toHaveLength(2);
    expect(screen.getByText("1 of 3 sessions")).toBeTruthy();
    expect(screen.getByText("CONNECTED")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("shows loading and empty states", () => {
    const { rerender } = render(<AdminLiveMonitor sessions={[]} total={0} loading={true} updatedAt={null} selectedSessionId={null} onSelectSession={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("Loading live sessions");
    rerender(<AdminLiveMonitor sessions={[]} total={0} loading={false} updatedAt={null} selectedSessionId={null} onSelectSession={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText("No active or interrupted exam sessions right now.")).toBeTruthy();
  });

  it("delegates refresh and opens the selected session timeline", () => {
    const onRefresh = vi.fn(), onSelectSession = vi.fn();
    render(<AdminLiveMonitor sessions={[session]} total={1} loading={false} updatedAt={null} selectedSessionId={null} onSelectSession={onSelectSession} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh sessions" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect session →" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onSelectSession).toHaveBeenCalledWith(expect.any(Function));
  });
});
