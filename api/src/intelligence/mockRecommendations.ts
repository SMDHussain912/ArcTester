export interface MockAnswerEvidence {
  subject: string;
  topic: string | null;
  chosen: unknown;
  isCorrect: boolean;
}

export interface MockStudyRecommendation {
  id: string;
  priority: "high" | "medium";
  title: string;
  reason: string;
  subject: string;
  topic: string | null;
  mode: "practice";
  questionCount: number;
  evidence: {
    answeredQuestions: number;
    incorrectAnswers: number;
    accuracy: number;
    minimumAnswers: number;
    weakAccuracyThreshold: number;
    source: "completed-full-mock";
  };
}

/**
 * Creates focused study actions from one verified 200-question full mock.
 * Unanswered items are reported separately and excluded from accuracy.
 */
export function buildFullMockRecommendations(input: {
  answers: MockAnswerEvidence[];
  minimumAnswers?: number;
  weakAccuracyThreshold?: number;
  maximumAreas?: number;
}): MockStudyRecommendation[] {
  const minimumAnswers = Math.max(1, input.minimumAnswers ?? 5);
  const threshold = Math.max(0, Math.min(1, input.weakAccuracyThreshold ?? 0.6));
  const maximumAreas = Math.max(1, input.maximumAreas ?? 3);
  if (input.answers.length !== 200) return [];

  type Counts = { subject: string; topic: string | null; answered: number; correct: number; wrong: number };
  const topics = new Map<string, Counts>();
  const subjects = new Map<string, Counts>();
  for (const answer of input.answers) {
    const subject = answer.subject.trim();
    if (!subject) continue;
    const subjectRow = subjects.get(subject) ?? { subject, topic: null, answered: 0, correct: 0, wrong: 0 };
    if (answer.chosen !== null && answer.chosen !== undefined) {
      subjectRow.answered += 1;
      if (answer.isCorrect) subjectRow.correct += 1;
      else subjectRow.wrong += 1;
    }
    subjects.set(subject, subjectRow);

    const topic = answer.topic?.trim() || null;
    if (!topic) continue;
    const key = JSON.stringify([subject, topic]);
    const topicRow = topics.get(key) ?? { subject, topic, answered: 0, correct: 0, wrong: 0 };
    if (answer.chosen !== null && answer.chosen !== undefined) {
      topicRow.answered += 1;
      if (answer.isCorrect) topicRow.correct += 1;
      else topicRow.wrong += 1;
    }
    topics.set(key, topicRow);
  }

  const topicRows = [...topics.values()];
  const eligibleTopics = topicRows
    .filter(row => row.answered >= minimumAnswers && row.correct / row.answered < threshold)
    .sort((a,b) => a.correct / a.answered - b.correct / b.answered || b.wrong - a.wrong || a.subject.localeCompare(b.subject) || (a.topic ?? "").localeCompare(b.topic ?? ""));
  const subjectsWithSampledTopics = new Set(topicRows.filter(row => row.answered >= minimumAnswers).map(row => row.subject));
  const eligibleSubjects = [...subjects.values()]
    .filter(row => !subjectsWithSampledTopics.has(row.subject) && row.answered >= minimumAnswers && row.correct / row.answered < threshold)
    .sort((a,b) => a.correct / a.answered - b.correct / b.answered || b.wrong - a.wrong || a.subject.localeCompare(b.subject));

  const selected: Counts[] = eligibleTopics.slice(0, maximumAreas);
  const remaining = Math.max(0, maximumAreas - selected.length);
  selected.push(...eligibleSubjects.slice(0, remaining));
  return selected.map(row => {
    const accuracy = row.correct / row.answered;
    const topic = row.topic;
    const area = topic ?? row.subject;
    const key = encodeURIComponent(JSON.stringify([row.subject, topic]));
    return {
      id: "full-mock-focus-" + key,
      priority: accuracy <= 0.3 ? "high" : "medium",
      title: "Practice " + area + " from your last full mock",
      reason: Math.round(accuracy * 100) + "% accuracy across " + row.answered + " answered full-mock questions in " + row.subject + (topic ? " · " + topic : "") + ". Unanswered questions are excluded from accuracy.",
      subject: row.subject,
      topic,
      mode: "practice" as const,
      questionCount: 15,
      evidence: {
        answeredQuestions: row.answered,
        incorrectAnswers: row.wrong,
        accuracy,
        minimumAnswers,
        weakAccuracyThreshold: threshold,
        source: "completed-full-mock" as const,
      },
    };
  });
}
