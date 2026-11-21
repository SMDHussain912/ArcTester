/** Toggle one option in a multi-select response without mutating the input. */
export function toggleMultiSelectAnswer(
  current: unknown,
  selectedIndex: number,
  optionCount: number,
): number[] {
  if (!Number.isInteger(optionCount) || optionCount < 2 || optionCount > 4) {
    throw new Error("Multi-select option count must be between 2 and 4.");
  }
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= optionCount) {
    throw new Error("Selected option is out of range.");
  }
  const selected = Array.isArray(current)
    ? current.filter((value): value is number =>
        Number.isInteger(value) && value >= 0 && value < optionCount,
      )
    : [];
  const unique = new Set(selected);
  if (unique.has(selectedIndex)) unique.delete(selectedIndex);
  else unique.add(selectedIndex);
  return [...unique].sort((a, b) => a - b);
}
