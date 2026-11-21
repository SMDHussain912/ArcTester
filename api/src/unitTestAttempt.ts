export type UnitTestAnswerScoreInput = { questionId: number; isCorrect: boolean };
export type UnitTestAttemptScore = { answeredCount: number; scorePct: number };

/** Attempt-scoped namespaces prevent a retry from reading stale saved answers. */
export function unitTestAttemptScope(unitId: number, attemptKey: string): string {
  return `unit:${unitId}:${attemptKey}`;
}

export function unitTestCompletionScope(unitId: number, attemptKey: string): string {
  return `${unitTestAttemptScope(unitId, attemptKey)}:complete`;
}

/** Score only the exact question set for this checkpoint attempt. */
export function scoreUnitTestAttempt(questionIds: number[], answers: UnitTestAnswerScoreInput[]): UnitTestAttemptScore {
  const required = new Set(questionIds);
  const current = new Map(answers.filter((answer) => required.has(answer.questionId)).map((answer) => [answer.questionId, answer.isCorrect]));
  const correct = [...required].filter((questionId) => current.get(questionId) === true).length;
  return { answeredCount: current.size, scorePct: required.size ? Math.round((correct / required.size) * 100) : 0 };
}
