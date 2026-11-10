export type PracticeDifficulty = "any" | "easy" | "medium" | "hard";
export interface PracticeConfig {
  subjects: string[];
  topicFilters: { subject: string; topic: string }[];
  count: number;
  difficulty: PracticeDifficulty;
}

export function buildPracticeConfig(subjects: string[], selectedTopicKeys: string[], count: number, difficulty: PracticeDifficulty): PracticeConfig {
  const selectedSubjectSet = new Set(subjects);
  const seenFilters = new Set<string>();
  const topicFilters = selectedTopicKeys.flatMap((key) => {
    try {
      const parsed: unknown = JSON.parse(key);
      if (!Array.isArray(parsed) || parsed.length !== 2) return [];
      const [subject, topic] = parsed;
      if (typeof subject !== "string" || typeof topic !== "string" || !subject.trim() || !topic.trim()) return [];
      if (!selectedSubjectSet.has(subject)) return [];
      const identity = JSON.stringify([subject, topic]);
      if (seenFilters.has(identity)) return [];
      seenFilters.add(identity);
      return [{ subject, topic }];
    } catch {
      return [];
    }
  });
  return { subjects: [...subjects], topicFilters, count, difficulty };
}
