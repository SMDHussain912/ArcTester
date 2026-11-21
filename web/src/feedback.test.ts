import { afterEach, describe, expect, it } from "vitest";
import { playFeedback, readFeedbackPreferences, saveFeedbackPreference } from "./feedback";
import { safeStorage } from "./safeStorage";

describe("feedback preferences", () => {
  afterEach(() => {
    safeStorage.removeItem("arctester-feedback-sound");
    safeStorage.removeItem("arctester-feedback-haptics");
  });

  it("defaults sound and haptics off", () => {
    expect(readFeedbackPreferences()).toEqual({ sound: false, haptics: false });
  });

  it("persists independent opt-in preferences", () => {
    expect(saveFeedbackPreference("sound", true)).toBe(true);
    expect(saveFeedbackPreference("haptics", false)).toBe(true);
    expect(readFeedbackPreferences()).toEqual({ sound: true, haptics: false });
  });

  it("does not throw when optional browser feedback APIs are unavailable", () => {
    expect(() => playFeedback("success", { sound: true, haptics: true })).not.toThrow();
  });
});
