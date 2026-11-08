// Pure palette state: given answers + marked set + current index, classify
// every question for the palette button styles. No React, no DOM.

export type PaletteStatus = "current" | "answered" | "marked" | "unanswered";

export interface PaletteItem {
  index: number;
  status: PaletteStatus;
}

/**
 * - "current": the question on screen (highest priority)
 * - "answered": has a selection
 * - "marked": flagged for review (even if also answered)
 * - "unanswered": nothing selected
 */
export function paletteStatuses(
  answers: readonly (number | null)[],
  marked: ReadonlySet<number>,
  currentIndex: number
): PaletteStatus[] {
  return answers.map((choice, index) => {
    if (index === currentIndex) return "current";
    if (marked.has(index)) return "marked";
    if (choice !== null && choice !== undefined) return "answered";
    return "unanswered";
  });
}

/** Convenience: palette items with 1-based numbers for display. */
export function paletteItems(
  answers: readonly (number | null)[],
  marked: ReadonlySet<number>,
  currentIndex: number
): PaletteItem[] {
  return paletteStatuses(answers, marked, currentIndex).map((status, index) => ({
    index: index + 1,
    status,
  }));
}

/** Counts shown above the palette. */
export function paletteCounts(
  answers: readonly (number | null)[],
  marked: ReadonlySet<number>
): { answered: number; unanswered: number; marked: number; total: number } {
  let answered = 0;
  answers.forEach((choice, index) => {
    if (choice !== null && choice !== undefined) {
      answered += 1;
    }
    void index;
  });
  return {
    answered,
    unanswered: answers.length - answered,
    marked: marked.size,
    total: answers.length,
  };
}
