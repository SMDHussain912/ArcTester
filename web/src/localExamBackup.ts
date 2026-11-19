const OWNER_KEY = "arctester:exam-backup-owner";
const BACKUP_PREFIXES = [
  "arctester:assigned-exam:",
  "arctester-assignment-answers-",
  "arctester-assigned-attempt-",
];

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Remove only exam-answer backups; preserve theme, device identity and other preferences. */
export function clearLocalExamBackups(): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => Boolean(key));
    for (const key of keys) {
      if (BACKUP_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable or blocked by the browser.
  }
}

/** Bind local exam data to one account and discard it when the account changes. */
export function bindLocalExamBackupOwner(userId: number | string): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    const nextOwner = String(userId);
    if (storage.getItem(OWNER_KEY) !== nextOwner) clearLocalExamBackups();
    storage.setItem(OWNER_KEY, nextOwner);
  } catch {
    // Local backups are best-effort; server persistence remains available.
  }
}

/** Logout clears all exam backups and the account marker. */
export function clearLocalExamBackupsOnLogout(): void {
  const storage = browserStorage();
  if (!storage) return;
  clearLocalExamBackups();
  try {
    storage.removeItem(OWNER_KEY);
  } catch {
    // Ignore blocked storage.
  }
}
