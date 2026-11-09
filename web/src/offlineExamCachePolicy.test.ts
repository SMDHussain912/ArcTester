import { describe, expect, it } from "vitest";
import { canReplaceCachedExamPackage } from "../../mobile/src/offline/examCachePolicy";

describe("offline exam package version policy", () => {
  it("allows refreshing a cached package before an attempt starts", () => {
    expect(canReplaceCachedExamPackage(false, "old-sha", "new-sha")).toBe(true);
  });

  it("keeps the existing package when an active attempt uses the same version", () => {
    expect(canReplaceCachedExamPackage(true, "ABC123", "abc123")).toBe(true);
  });

  it("rejects a package update after an attempt has started", () => {
    expect(canReplaceCachedExamPackage(true, "old-sha", "new-sha")).toBe(false);
    expect(canReplaceCachedExamPackage(true, null, "new-sha")).toBe(false);
  });
});
