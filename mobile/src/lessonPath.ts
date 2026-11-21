import type { LearningPathSubject } from "./learningPath";

export function availableLessonSubjects(subjects: LearningPathSubject[]) {
  return subjects.filter((item) => (item.practiceCount ?? item.count) > 0);
}

export function availableLessonTopics(subject: LearningPathSubject | undefined) {
  return (subject?.topics ?? []).filter((item) => (item.practiceCount ?? item.count) > 0);
}
