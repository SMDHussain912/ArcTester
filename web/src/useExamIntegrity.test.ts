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

  it("records native desktop close attempts as integrity events", () => {
    let onViolation: ((event: { type?: string; detail?: string }) => void) | undefined;
    const previousBridge = window.arctesterDesktop;
    window.arctesterDesktop = {
      setExamMode: vi.fn(async () => ({ ok: true, enabled: true })),
      onIntegrityViolation: (callback) => {
        onViolation = callback;
        return () => { onViolation = undefined; };
      },
    };

    const { result, unmount } = renderHook(() =>
      useExamIntegrity({ assignmentId: "assignment-1", integrityLevel: "STRICT" }),
    );

    act(() => onViolation?.({ type: "CLOSE_ATTEMPT", detail: "Window close was blocked" }));
    expect(result.current.events).toMatchObject([
      { type: "CLOSE_ATTEMPT", detail: "Window close was blocked" },
    ]);

    unmount();
    window.arctesterDesktop = previousBridge;
  });

});

describe("web exam integrity enforcement", () => {
  it("blocks copy, paste and context-menu actions and records fullscreen, blur and DevTools signals", async () => {
    vi.useFakeTimers();
    const api = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async () => ({
      ok: true,
      json: async () => ({ violationCount: 6, max: 10, warn: true, flagged: false }),
    } as Response));
    const { result, unmount } = renderHook(() => useExamIntegrity({
      assignmentId: "assignment-guard", integrityLevel: "STRICT", api,
    }));
    const copy = new Event("copy", { cancelable: true });
    const paste = new Event("paste", { cancelable: true });
    const menu = new Event("contextmenu", { cancelable: true });
    act(() => {
      document.dispatchEvent(copy);
      document.dispatchEvent(paste);
      document.dispatchEvent(menu);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "F12", cancelable: true }));
    });
    expect(copy.defaultPrevented).toBe(true);
    expect(paste.defaultPrevented).toBe(true);
    expect(menu.defaultPrevented).toBe(true);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    act(() => document.dispatchEvent(new Event("fullscreenchange")));
    act(() => window.dispatchEvent(new Event("blur")));
    act(() => vi.advanceTimersByTime(350));
    expect(result.current.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "COPY_ATTEMPT", "PASTE_ATTEMPT", "CONTEXT_MENU", "DEVTOOLS_KEY", "FULLSCREEN_EXIT", "WINDOW_BLUR",
    ]));
    await act(async () => { await result.current.flush(); });
    expect(api).toHaveBeenCalledOnce();
    const body = JSON.parse(String((api.mock.calls[0]?.[1] as RequestInit | undefined)?.body));
    expect(body.events.map((event: { type: string }) => event.type)).toEqual(expect.arrayContaining([
      "COPY_ATTEMPT", "PASTE_ATTEMPT", "CONTEXT_MENU", "DEVTOOLS_KEY", "FULLSCREEN_EXIT", "WINDOW_BLUR",
    ]));
    unmount();
    vi.useRealTimers();
  });

  it("records a hidden-tab signal and sends it to the assignment audit", async () => {
    const api = vi.fn(async () => ({
      ok: true,
      json: async () => ({ violationCount: 1, max: 10, warn: false, flagged: false }),
    } as Response));
    const { result, unmount } = renderHook(() => useExamIntegrity({
      assignmentId: "hidden-tab-assignment", integrityLevel: "BASIC", api,
    }));
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.events).toMatchObject([{ type: "TAB_HIDDEN" }]);
    expect(api).toHaveBeenCalledOnce();
    unmount();
  });

  it("does not block or record browser actions when integrity is OFF", () => {
    const api = vi.fn();
    const { result, unmount } = renderHook(() => useExamIntegrity({
      assignmentId: "off-assignment", integrityLevel: "OFF", api,
    }));
    const copy = new Event("copy", { cancelable: true });
    document.dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(false);
    expect(result.current.events).toHaveLength(0);
    expect(api).not.toHaveBeenCalled();
    unmount();
  });
});
