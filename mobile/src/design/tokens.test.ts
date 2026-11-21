import { describe, expect, it } from "vitest";
import { design, mobilePalette, motion, radius, spacing, typeScale } from "./tokens";

describe("shared design tokens", () => {
  it("keeps brand and light palette aligned with the root source", () => {
    expect(mobilePalette.light.primary).toBe(design.brand.primary);
    expect(mobilePalette.light.background).toBe(design.colors.light.canvas);
    expect(mobilePalette.light.text).toBe(design.colors.light.text);
  });

  it("exposes complete dark mode colors without falling back to light brand values", () => {
    expect(mobilePalette.dark.primary).toBe(design.brand.dark.primary);
    expect(mobilePalette.dark.background).toBe(design.colors.dark.canvas);
    expect(mobilePalette.dark.onPrimary).toBe(design.brand.dark.onPrimary);
    expect(mobilePalette.dark.primary).not.toBe(mobilePalette.light.primary);
  });

  it("shares spacing, radius, type and motion scales", () => {
    expect(spacing["4"]).toBe(16);
    expect(radius.lg).toBe(16);
    expect(typeScale.size.md).toBe(16);
    expect(motion.durationMs.normal).toBe(200);
  });
});
