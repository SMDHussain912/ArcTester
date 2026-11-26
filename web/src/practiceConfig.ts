export type PracticeDifficulty = "any" | "easy" | "medium" | "hard";
export type PracticeQuestionType = "mcq" | "multi_select" | "true_false" | "fill_blank" | "numeric" | "matching";
export interface PracticeConfig {
  subjects: string[];
  topicFilters: { subject: string; topic: string }[];
  count: number;
  difficulty: PracticeDifficulty;
  durationMinutes: number;
  questionTypes: PracticeQuestionType[];
}

export function buildPracticeConfig(subjects: string[], selectedTopicKeys: string[], count: number, difficulty: PracticeDifficulty, durationMinutes = 20, questionTypes: PracticeQuestionType[] = []): PracticeConfig {
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
  return { subjects: [...new Set(subjects.filter((subject) => typeof subject === "string" && subject.trim()))], topicFilters, count: Math.max(1, Math.min(200, Math.floor(count || 1))), difficulty, durationMinutes: Math.max(5, Math.min(180, Math.floor(durationMinutes || 20))), questionTypes: [...new Set(questionTypes)] };
}
