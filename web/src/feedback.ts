import { safeStorage } from "./safeStorage";

export type FeedbackKind = "success" | "error" | "complete";
export interface FeedbackPreferences {
  sound: boolean;
  haptics: boolean;
}
const SOUND_KEY = "arctester-feedback-sound";
const HAPTICS_KEY = "arctester-feedback-haptics";

export function readFeedbackPreferences(): FeedbackPreferences {
  return {
    sound: safeStorage.getItem(SOUND_KEY) === "true",
    haptics: safeStorage.getItem(HAPTICS_KEY) === "true",
  };
}

export function saveFeedbackPreference(key: keyof FeedbackPreferences, enabled: boolean): boolean {
  return safeStorage.setItem(key === "sound" ? SOUND_KEY : HAPTICS_KEY, String(enabled));
}

const TONES: Record<FeedbackKind, number[]> = {
  success: [660, 880],
  error: [220],
  complete: [523, 659, 784],
};

/** Plays a short, synthesized cue only when explicitly enabled by the user.
 * It uses no downloaded audio assets and is safe to call where Web Audio is unavailable. */
export function playFeedback(kind: FeedbackKind, preferences = readFeedbackPreferences()): void {
  if (preferences.haptics && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(kind === "error" ? [35, 25, 35] : kind === "complete" ? [25, 35, 25, 35, 45] : 25); } catch { /* Device/browser may deny vibration. */ }
  }
  if (!preferences.sound || typeof window === "undefined") return;
  const AudioContextConstructor = window.AudioContext;
  if (typeof AudioContextConstructor !== "function") return;
  try {
    const context = new AudioContextConstructor();
    const now = context.currentTime;
    let remaining = TONES[kind].length;
    TONES[kind].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.105;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        remaining -= 1;
        if (remaining === 0) void context.close().catch(() => undefined);
      };
      oscillator.start(start);
      oscillator.stop(start + 0.09);
    });
  } catch { /* Audio is optional; never interrupt learning if unavailable. */ }
}
