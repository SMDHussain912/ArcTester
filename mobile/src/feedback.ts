import { Vibration } from "react-native";

export type HapticKind = "success" | "error" | "complete";

export function hapticPattern(kind: HapticKind): number[] {
  if (kind === "error") return [0, 35, 25, 35];
  if (kind === "complete") return [0, 25, 35, 25, 35, 45];
  return [0, 25, 30, 25];
}

/** Optional, nonessential mobile vibration. Disabled by default by the caller. */
export function triggerHapticFeedback(kind: HapticKind, enabled: boolean): boolean {
  if (!enabled) return false;
  try {
    Vibration.vibrate(hapticPattern(kind));
    return true;
  } catch {
    return false;
  }
}
