import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindLocalExamBackupOwner,
  clearLocalExamBackupsOnLogout,
} from "./localExamBackup";

function createStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
    clear() { values.clear(); },
    values,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local exam backup account isolation", () => {
  it("clears exam backups when a different user signs in but preserves unrelated preferences", () => {
    const storage = createStorage();
    vi.stubGlobal("window", { localStorage: storage });
    storage.setItem("arctester:exam-backup-owner", "12");
    storage.setItem("arctester:assigned-exam:assignment-1", JSON.stringify({ answers: { q1: 0 } }));
    storage.setItem("arctester-assignment-answers-assignment-1", JSON.stringify({ q1: 0 }));
    storage.setItem("arctester-theme", "dark");

    bindLocalExamBackupOwner(13);

    expect(storage.getItem("arctester:assigned-exam:assignment-1")).toBeNull();
    expect(storage.getItem("arctester-assignment-answers-assignment-1")).toBeNull();
    expect(storage.getItem("arctester:exam-backup-owner")).toBe("13");
    expect(storage.getItem("arctester-theme")).toBe("dark");
  });

  it("clears every local exam backup on logout and removes the owner marker", () => {
    const storage = createStorage();
    vi.stubGlobal("window", { localStorage: storage });
    storage.setItem("arctester:exam-backup-owner", "12");
    storage.setItem("arctester:assigned-exam:assignment-1", "backup");
    storage.setItem("arctester-assigned-attempt-assignment-2", "attempt");
    storage.setItem("arctester-theme", "light");

    clearLocalExamBackupsOnLogout();

    expect(storage.getItem("arctester:assigned-exam:assignment-1")).toBeNull();
    expect(storage.getItem("arctester-assigned-attempt-assignment-2")).toBeNull();
    expect(storage.getItem("arctester:exam-backup-owner")).toBeNull();
    expect(storage.getItem("arctester-theme")).toBe("light");
  });
});
