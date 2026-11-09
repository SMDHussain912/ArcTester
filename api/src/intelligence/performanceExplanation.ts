export interface PerformanceEvidenceRow {
  subject: string;
  topic: string | null;
  seen: number;
  correct: number;
  wrong: number;
  accuracy: number | null;
}

export interface PerformanceExplanation {
  headline: string;
  details: string[];
  answeredQuestions: number;
  incorrectAnswers: number;
  evidenceThreshold: number;
  weakAccuracyThreshold: number;
}

export function buildPerformanceExplanation(
  topics: PerformanceEvidenceRow[],
  minimumAnswers: number,
  weakAccuracyThreshold: number,
): PerformanceExplanation {
  const answeredQuestions = topics.reduce((sum, row) => sum + row.seen, 0);
  const incorrectAnswers = topics.reduce((sum, row) => sum + row.wrong, 0);
  const topicRows = topics.filter((row) => row.topic !== null && row.seen > 0);
  const evidencedWeakTopics = topicRows
    .filter((row) => row.accuracy !== null && row.seen >= minimumAnswers && row.accuracy < weakAccuracyThreshold)
    .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1) || b.wrong - a.wrong)
    .slice(0, 3);

  if (answeredQuestions === 0) {
    return {
      headline: "There is not enough completed practice data to explain your performance yet.",
      details: ["Complete a practice session and answer some questions to establish a reliable baseline."],
      answeredQuestions,
      incorrectAnswers,
      evidenceThreshold: minimumAnswers,
      weakAccuracyThreshold,
    };
  }

  if (evidencedWeakTopics.length > 0) {
    const details = evidencedWeakTopics.map((row) =>
      `${row.topic} in ${row.subject}: ${Math.round((row.accuracy ?? 0) * 100)}% accuracy across ${row.seen} answered questions, with ${row.wrong} incorrect.`
    );
    return {
      headline: `Your clearest revision gap is ${evidencedWeakTopics[0].topic} in ${evidencedWeakTopics[0].subject}.`,
      details: [
        ...details,
        `This analysis uses ${answeredQuestions} answered practice questions. Unanswered questions are excluded from accuracy.`,
      ],
      answeredQuestions,
      incorrectAnswers,
      evidenceThreshold: minimumAnswers,
      weakAccuracyThreshold,
    };
  }

  const topicsWithEnoughEvidence = topicRows.filter((row) => row.seen >= minimumAnswers);
  const details = topicsWithEnoughEvidence.length > 0
    ? [`No topic with at least ${minimumAnswers} answered questions is currently below ${Math.round(weakAccuracyThreshold * 100)}% accuracy.`]
    : [`No topic has reached the minimum of ${minimumAnswers} answered questions yet.`];
  details.push(`The summary is based on ${answeredQuestions} answered practice questions; unanswered questions are not counted as incorrect.`);
  return {
    headline: topicsWithEnoughEvidence.length > 0
      ? "No confirmed weak topic meets the current evidence rules."
      : "More topic-level practice is needed before identifying a reliable revision gap.",
    details,
    answeredQuestions,
    incorrectAnswers,
    evidenceThreshold: minimumAnswers,
    weakAccuracyThreshold,
  };
}
