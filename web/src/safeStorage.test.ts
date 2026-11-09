import { afterEach, describe, expect, it, vi } from "vitest";
import { safeStorage } from "./safeStorage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("safe browser storage", () => {
  it("reads, writes and removes values when storage is available", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
    });
    expect(safeStorage.setItem("theme", "dark")).toBe(true);
    expect(safeStorage.getItem("theme")).toBe("dark");
    expect(safeStorage.removeItem("theme")).toBe(true);
    expect(safeStorage.getItem("theme")).toBeNull();
  });

  it("does not crash when browser storage is blocked", () => {
    vi.stubGlobal("window", {
      get localStorage() { throw new Error("Storage access denied"); },
    });
    expect(safeStorage.getItem("answers")).toBeNull();
    expect(safeStorage.setItem("answers", "{}")).toBe(false);
    expect(safeStorage.removeItem("answers")).toBe(false);
  });
});
