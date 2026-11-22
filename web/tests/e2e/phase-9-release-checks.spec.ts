import { test, expect } from "@playwright/test";

test.describe("Phase 9 release checks", () => {
  test("student-facing gallery has basic accessible structure", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/design-system-gallery.html");

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Learn with clarity. Grow with confidence." })).toBeVisible();

    const unlabeledButtons = await page.locator("button").evaluateAll((buttons) =>
      buttons.filter((button) => {
        const element = button as HTMLButtonElement;
        return !(element.innerText.trim() || element.getAttribute("aria-label") || element.getAttribute("aria-labelledby"));
      }).length,
    );
    expect(unlabeledButtons, "Every button should have an accessible name").toHaveLength(0);

    const imagesWithoutAlt = await page.locator("img").evaluateAll((images) =>
      images.filter((image) => !image.hasAttribute("alt")).length,
    );
    expect(imagesWithoutAlt, "Images must declare alt text (empty is valid for decorative images)").toHaveLength(0);

    const viewport = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth, "320px layout must not overflow horizontally").toBeLessThanOrEqual(viewport.width);
  });

  test("student shell remains responsive under throttled low-end conditions", async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      connectionType: "cellular3g",
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    const started = Date.now();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/design-system-gallery.html", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Learn with clarity. Grow with confidence." })).toBeVisible();
    const domReadyMs = Date.now() - started;
    expect(domReadyMs, "DOM and primary heading should appear within 12 seconds under CI throttling").toBeLessThan(12_000);

    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await cdp.detach();
  });
});
