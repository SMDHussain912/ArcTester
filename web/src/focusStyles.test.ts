import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "styles.css"), "utf8");

describe("global keyboard focus styling", () => {
  it("shows an accent outline for keyboard focus on native and custom interactive controls", () => {
    expect(styles).toMatch(/:where\(button,a,input,select,textarea,\[role="button"\],\[tabindex\]:not\(\[tabindex="-1"\]\)\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--accent\)/);
    expect(styles).toContain("outline-offset:2px");
  });
});
