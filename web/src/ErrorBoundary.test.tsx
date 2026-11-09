import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./ErrorBoundary";

function BrokenScreen(): never {
  throw new Error("render failure");
}

afterEach(() => vi.restoreAllMocks());

describe("AppErrorBoundary", () => {
  it("shows a recoverable fallback when a child render fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<AppErrorBoundary><BrokenScreen /></AppErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload ArcTester" })).toBeInTheDocument();
  });
});
