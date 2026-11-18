import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useExamIntegrity } from "./useExamIntegrity";

describe("useExamIntegrity event listener lifecycle", () => {
  it("removes the exact copy, paste and context-menu listeners on unmount", () => {
    const api = vi.fn(async () => ({
      ok: true,
      json: async () => ({ violationCount: 0, max: 10, warn: false, flagged: false }),
    } as Response));
    const { result, unmount } = renderHook(() =>
      useExamIntegrity({ assignmentId: "assignment-1", integrityLevel: "BASIC", api }),
    );

    const firstCopy = new Event("copy", { cancelable: true });
    act(() => document.dispatchEvent(firstCopy));
    expect(firstCopy.defaultPrevented).toBe(true);
    expect(result.current.events).toHaveLength(1);

    unmount();

    const laterCopy = new Event("copy", { cancelable: true });
    document.dispatchEvent(laterCopy);
    expect(laterCopy.defaultPrevented).toBe(false);
  });
});
