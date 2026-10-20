import { describe, expect, it } from "vitest";
import { friendlyError, fromSaved, toSubmitPayload } from "./answers";

describe("toSubmitPayload", () => {
  it("maps answers in question order and defaults to null", () => {
    const payload = toSubmitPayload({ 10: 2, 12: 0 }, [10, 11, 12]);
    expect(payload.answers).toEqual([
      { questionId: 10, selectedIndex: 2 },
      { questionId: 11, selectedIndex: null },
      { questionId: 12, selectedIndex: 0 },
    ]);
  });

  it("keeps explicit nulls (cleared answers)", () => {
    const payload = toSubmitPayload({ 5: null }, [5]);
    expect(payload.answers).toEqual([{ questionId: 5, selectedIndex: null }]);
  });
});

describe("fromSaved", () => {
  it("restores server-saved selections keyed by question id", () => {
    const restored = fromSaved([
      { questionId: 10, selectedIndex: 2 },
      { questionId: 11, selectedIndex: null },
    ]);
    expect(restored).toEqual({ 10: 2, 11: null });
  });

  it("round-trips with toSubmitPayload", () => {
    const saved = [
      { questionId: 1, selectedIndex: 3 },
      { questionId: 2, selectedIndex: null },
    ];
    expect(toSubmitPayload(fromSaved(saved), [1, 2]).answers).toEqual(saved);
  });
});

describe("friendlyError", () => {
  it("returns a friendly sentence for known statuses", () => {
    expect(friendlyError(404)).toContain("could not find");
    expect(friendlyError(409)).toContain("already submitted");
    expect(friendlyError(500)).toContain("our side");
  });

  it("falls back for unknown statuses", () => {
    expect(friendlyError(418, "Teapot.")).toBe("Teapot.");
    expect(friendlyError(418)).toBe("Something went wrong.");
  });
});
