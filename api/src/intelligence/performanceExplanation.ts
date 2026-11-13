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

function sortEvidence(a: PerformanceEvidenceRow, b: PerformanceEvidenceRow): number {
  return (a.accuracy ?? 1) - (b.accuracy ?? 1) || b.wrong - a.wrong || b.seen - a.seen;
}

export function buildPerformanceExplanation(
  topics: PerformanceEvidenceRow[],
  minimumAnswers: number,
  weakAccuracyThreshold: number,
  subjects: PerformanceEvidenceRow[] = [],
): PerformanceExplanation {
  const answeredRows = topics.length > 0 ? topics : subjects;
  const answeredQuestions = answeredRows.reduce((sum, row) => sum + row.seen, 0);
  const incorrectAnswers = answeredRows.reduce((sum, row) => sum + row.wrong, 0);
  const topicRows = topics.filter((row) => row.topic !== null && row.topic.trim().length > 0 && row.seen > 0);
  const subjectRows = subjects.filter((row) => row.seen > 0);
  const evidencedWeakTopics = topicRows
    .filter((row) => row.accuracy !== null && row.seen >= minimumAnswers && row.accuracy < weakAccuracyThreshold)
    .sort(sortEvidence)
    .slice(0, 3);
  const subjectsWithSufficientTopics = new Set(
    topicRows
      .filter((row) => row.seen >= minimumAnswers)
      .map((row) => row.subject),
  );
  const evidencedWeakSubjects = subjectRows
    .filter((row) =>
      !subjectsWithSufficientTopics.has(row.subject) &&
      row.accuracy !== null &&
      row.seen >= minimumAnswers &&
      row.accuracy < weakAccuracyThreshold
    )
    .sort(sortEvidence)
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

  if (evidencedWeakSubjects.length > 0) {
    const details = evidencedWeakSubjects.map((row) =>
      `${row.subject}: ${Math.round((row.accuracy ?? 0) * 100)}% accuracy across ${row.seen} answered questions, with ${row.wrong} incorrect.`
    );
    return {
      headline: `Your clearest revision gap is ${evidencedWeakSubjects[0].subject}.`,
      details: [
        ...details,
        "Topic labels are not available for this evidence, so start with a mixed subject practice set.",
        `This analysis uses ${answeredQuestions} answered practice questions. Unanswered questions are excluded from accuracy.`,
      ],
      answeredQuestions,
      incorrectAnswers,
      evidenceThreshold: minimumAnswers,
      weakAccuracyThreshold,
    };
  }

  const topicsWithEnoughEvidence = topicRows.filter((row) => row.seen >= minimumAnswers);
  const subjectsWithEnoughEvidence = subjectRows.filter((row) => row.seen >= minimumAnswers);
  const hasTopicEvidence = topicsWithEnoughEvidence.length > 0;
  const hasSubjectEvidence = subjectsWithEnoughEvidence.length > 0;
  const details = hasTopicEvidence
    ? [`No topic with at least ${minimumAnswers} answered questions is currently below ${Math.round(weakAccuracyThreshold * 100)}% accuracy.`]
    : hasSubjectEvidence
      ? [`No subject with at least ${minimumAnswers} answered questions is currently below ${Math.round(weakAccuracyThreshold * 100)}% accuracy.`]
      : [`No topic or subject has reached the minimum of ${minimumAnswers} answered questions yet.`];
  details.push(`The summary is based on ${answeredQuestions} answered practice questions; unanswered questions are not counted as incorrect.`);
  return {
    headline: hasTopicEvidence
      ? "No confirmed weak topic meets the current evidence rules."
      : hasSubjectEvidence
        ? "No confirmed weak subject meets the current evidence rules."
        : "More topic-level practice is needed before identifying a reliable revision gap.",
    details,
    answeredQuestions,
    incorrectAnswers,
    evidenceThreshold: minimumAnswers,
    weakAccuracyThreshold,
  };
}
