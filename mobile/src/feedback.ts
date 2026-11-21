import { Vibration } from "react-native";
import { hapticPattern, type HapticKind } from "./feedbackPatterns";

export { hapticPattern, type HapticKind } from "./feedbackPatterns";

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
