export type LearningPathSubject = {
  subject: string;
  count: number;
  practiceCount?: number;
  topics?: { topic: string; count: number; practiceCount?: number }[];
};
export type LearningPathSubjectProgress = {
  subject: string;
  seen: number;
  accuracy: number | null;
};

export function calculateLearningPathProgress(
  subjects: LearningPathSubject[],
  progress: LearningPathSubjectProgress[],
) {
  const availableSubjects = subjects.filter((item) => (item.practiceCount ?? item.count) > 0);
  const totalAvailable = availableSubjects.reduce((sum, item) => sum + (item.practiceCount ?? item.count), 0);
  const totalSeen = availableSubjects.reduce((sum, item) => {
    const subjectProgress = progress.find((entry) => entry.subject === item.subject);
    return sum + Math.min(Math.max(0, subjectProgress?.seen ?? 0), item.practiceCount ?? item.count);
  }, 0);
  return {
    totalAvailable,
    totalSeen,
    ratio: totalAvailable > 0 ? Math.min(1, totalSeen / totalAvailable) : 0,
  };
}

export function selectNextLearningSubject(
  subjects: LearningPathSubject[],
  progress: LearningPathSubjectProgress[],
): LearningPathSubject | undefined {
  const available = subjects.filter((item) => (item.practiceCount ?? item.count) > 0);
  return available.find((item) => {
    const itemProgress = progress.find((entry) => entry.subject === item.subject);
    return (itemProgress?.seen ?? 0) < (item.practiceCount ?? item.count);
  }) ?? available[0];
}
