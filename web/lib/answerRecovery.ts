/**
 * Merge a browser's synchronous answer backup with the last server snapshot.
 * Local selections take precedence because they are written immediately while
 * server autosaves are debounced; this preserves the latest click after a
 * reload that happens before the next autosave request completes.
 */
export function mergeAssignedExamAnswers(
  serverAnswers: Record<string, number>,
  localAnswers: Record<string, number>,
): Record<string, number> {
  return { ...serverAnswers, ...localAnswers };
}
