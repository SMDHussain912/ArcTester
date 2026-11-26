export type ResultReviewFilter = "all" | "incorrect";

export type ReviewableQuestion = { isCorrect: boolean };

export function filterResultReview<T extends ReviewableQuestion>(
  questions: readonly T[],
  filter: ResultReviewFilter,
): T[] {
  return filter === "incorrect" ? questions.filter((question) => !question.isCorrect) : [...questions];
}
