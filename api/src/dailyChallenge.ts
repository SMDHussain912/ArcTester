/** UTC-day helpers keep the daily challenge identical across users and retries. */
export function utcDayKey(value: Date = new Date()): string {
  return value.toISOString().slice(0, 10);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Pick a deterministic, duplicate-free question set for one UTC day. */
export function dailyChallengeQuestionIds(questionIds: number[], dayKey: string, limit = 10): number[] {
  const uniqueIds = [...new Set(questionIds.filter((id) => Number.isInteger(id) && id > 0))];
  const count = Math.max(0, Math.min(Math.floor(limit), uniqueIds.length));
  return uniqueIds
    .sort((a, b) => stableHash(dayKey + ":" + a) - stableHash(dayKey + ":" + b) || a - b)
    .slice(0, count);
}

export function dailyChallengeRewardKey(value: Date = new Date()): string {
  return "daily-challenge:" + utcDayKey(value);
}
