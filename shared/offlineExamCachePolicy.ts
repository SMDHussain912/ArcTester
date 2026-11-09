export function canReplaceCachedExamPackage(
  hasAttempt: boolean,
  existingSha256: string | null | undefined,
  incomingSha256: string,
): boolean {
  if (!hasAttempt) return true;
  return Boolean(
    existingSha256 &&
    existingSha256.toLowerCase() === incomingSha256.toLowerCase()
  );
}
