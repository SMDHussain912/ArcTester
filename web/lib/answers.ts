// Pure mapping between UI state (array of choices keyed by question id) and
// the API's submit payload. Also maps API errors to friendly sentences.

export interface SubmitAnswer {
  questionId: number;
  selectedIndex: number | null;
}

/**
 * Convert {questionId -> selectedIndex|null} into the submit payload.
 * Drops unknown ids? No — keeps them, the server rejects foreign ones (400),
 * which is the correct safety behaviour; the UI just never produces them.
 */
export function toSubmitPayload(
  answersById: Readonly<Record<number, number | null>>,
  questionIds: readonly number[]
): { answers: SubmitAnswer[] } {
  return {
    answers: questionIds.map((id) => ({
      questionId: id,
      selectedIndex: answersById[id] ?? null,
    })),
  };
}

/** Reverse: server `saved[]` -> {questionId -> choice} for restore-on-refresh. */
export function fromSaved(
  saved: readonly { questionId: number; selectedIndex: number | null }[]
): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const row of saved) out[row.questionId] = row.selectedIndex;
  return out;
}

/** Friendly sentence for any API failure. Never leaks raw error text. */
export function friendlyError(status: number, fallback = "Something went wrong."): string {
  switch (status) {
    case 400:
      return "That request was not valid. Please check your choices.";
    case 401:
      return "Please sign in to continue.";
    case 403:
      return "You cannot view that yet.";
    case 404:
      return "We could not find that. It may have been deleted.";
    case 409:
      return "That test was already submitted.";
    case 500:
      return "Something went wrong on our side. Please try again.";
    case 503:
      return "The server is starting up. Please try again in a moment.";
    default:
      return fallback;
  }
}
