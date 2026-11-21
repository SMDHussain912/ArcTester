import { test, expect } from "@playwright/test";

test.describe("design system gallery", () => {
  test("shows the component gallery and interactive progress preview", async ({ page }) => {
    await page.goto("/design-system-gallery.html");
    await expect(page.getByRole("heading", { name: "Learn with clarity. Grow with confidence." })).toBeVisible();
    await expect(page.getByRole("img", { name: "Aster, ArcTester’s study owl holding an open book" })).toBeVisible();
    await expect(page.getByText("2 of 5 sample steps complete")).toBeVisible();
    await page.getByRole("button", { name: "Complete sample step" }).click();
    await expect(page.getByText("3 of 5 sample steps complete")).toBeVisible();
    await expect(page.locator("#demo-progress")).toHaveAttribute("aria-valuenow", "3");
  });

  test("theme and reduced-motion controls are accessible and responsive", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design-system-gallery.html");
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Disable reduced motion" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    await expect(page.getByRole("button", { name: "Disable reduced motion" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "Design system component examples" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Design system component examples" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Buttons & states" })).toBeVisible();
  });
});
