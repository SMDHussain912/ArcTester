import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppSplash from "./AppSplash";

describe("AppSplash", () => {
  afterEach(() => vi.useRealTimers());

  it("remains visible until session restoration is complete", () => {
    vi.useFakeTimers();
    const { rerender } = render(<AppSplash visible />);
    expect(screen.getByRole("status", { name: "Restoring your session" })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByRole("status", { name: "Restoring your session" })).toBeInTheDocument();
    rerender(<AppSplash visible={false} />);
    expect(screen.queryByRole("status", { name: "Restoring your session" })).not.toBeInTheDocument();
  });
});
