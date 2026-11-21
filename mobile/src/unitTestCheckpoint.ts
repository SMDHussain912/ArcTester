export function allUnitCheckpointAnswersSaved(questionIds: number[], saved: Record<number, boolean>): boolean {
  return questionIds.length === 10 && questionIds.every((questionId) => saved[questionId] === true);
}

export function unitCheckpointPassed(scorePct: number, passScorePct = 70): boolean {
  return Number.isFinite(scorePct) && scorePct >= passScorePct;
}
