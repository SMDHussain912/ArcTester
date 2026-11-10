export type PracticeDifficulty = "any" | "easy" | "medium" | "hard";
export interface PracticeConfig {
  subjects: string[];
  topicFilters: { subject: string; topic: string }[];
  count: number;
  difficulty: PracticeDifficulty;
}
export function buildPracticeConfig(subjects: string[], selectedTopicKeys: string[], count: number, difficulty: PracticeDifficulty): PracticeConfig {
  const topicFilters = selectedTopicKeys.flatMap((key) => {
    try {
      const parsed = JSON.parse(key) as [string, string];
      return [{ subject: parsed[0], topic: parsed[1] }];
    } catch { return []; }
  });
  return { subjects: [...subjects], topicFilters, count, difficulty };
}
