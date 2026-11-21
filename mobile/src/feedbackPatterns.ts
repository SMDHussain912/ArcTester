export type HapticKind = "success" | "error" | "complete";

export function hapticPattern(kind: HapticKind): number[] {
  if (kind === "error") return [0, 35, 25, 35];
  if (kind === "complete") return [0, 25, 35, 25, 35, 45];
  return [0, 25, 30, 25];
}
