import { test, expect, type Page } from "@playwright/test";

const API_BASE = "http://localhost:4000";

/** Helper: make an authenticated API request */
async function apiRequest(page: Page, path: string, method = "GET", body?: Record<string, unknown>, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const res = await page.request.fetch(`${API_BASE}${path}`, {
    method,
    headers,
    data: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status(),
    json: await res.json().catch(() => ({})),
    headers: res.headers(),
  };
}

/** Helper: login via API and return session cookie */
async function loginApi(page: Page, email: string, password: string): Promise<string> {
  const res = await page.request.fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ email, password }),
  });
  if (!res.ok()) throw new Error(`E2E login failed for ${email} (${res.status()}): ${await res.text()}`);
  const setCookie = res.headers()["set-cookie"] || res.headers()["Set-Cookie"] || "";
  const cookie = Array.isArray(setCookie) ? setCookie[0]?.split(";")[0] || "" : setCookie.split(";")[0] || "";
  if (!cookie) throw new Error(`E2E login for ${email} did not return a session cookie.`);
  return cookie;
}

/** Helper: login via UI */
async function loginUi(page: Page, email: string, password: string) {
  // API setup uses the page request context; remove its cookie before exercising the UI login.
  await page.context().clearCookies();
  await page.goto("/");
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign in")');
  await page.getByRole("navigation", { name: "Student navigation" }).waitFor({ state: "visible", timeout: 15000 });
}

/** Setup a student account against the seeded question bank. */
async function setupStudent(page: Page) {
  const adminCookie = await loginApi(page, "admin@arctester.test", "ArcTester-CI-Admin-2026!");
  if (!adminCookie) throw new Error("E2E administrator login failed.");

  // The question-bank endpoint is the supported admin API. The old /admin/questions
  // route was removed during the API cleanup; this also verifies the CI seed.
  const catalog = await apiRequest(page, "/admin/question-bank?pageSize=200", "GET", undefined, adminCookie);
  if (catalog.status !== 200 || !Array.isArray(catalog.json.questions) || catalog.json.questions.length === 0) {
    throw new Error(`The seeded question bank is empty or unavailable (${catalog.status}): ${JSON.stringify(catalog.json)}`);
  }
  const question = catalog.json.questions[0] as { id: number; subject: string };
  if (!Number.isSafeInteger(question.id) || !question.subject) throw new Error("Seeded question fixture is invalid.");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const studentEmail = `student-${suffix}@arctester.test`;
  const inviteRes = await apiRequest(page, "/auth/invitations", "POST", { email: studentEmail }, adminCookie);
  const inviteToken = inviteRes.json.invitation?.token;
  if (inviteRes.status !== 201 || typeof inviteToken !== "string") {
    throw new Error(`E2E invitation creation failed: ${JSON.stringify(inviteRes.json)}`);
  }

  const register = await apiRequest(page, "/auth/register", "POST", {
    email: studentEmail,
    password: "StudentPass123!",
    invitationToken: inviteToken,
  });
  if (register.status !== 201) throw new Error(`E2E student registration failed: ${JSON.stringify(register.json)}`);
  await loginApi(page, studentEmail, "StudentPass123!");
  return { studentEmail, subjectName: question.subject };
}

test.describe("Student Practice Flow", () => {
  test("student can create, take, and submit a practice test", async ({ page }) => {
    test.setTimeout(60000);
    const { studentEmail } = await setupStudent(page);

    // Login as student through UI
    await loginUi(page, studentEmail, "StudentPass123!");

    // Should be on dashboard
    await expect(page.getByRole("navigation", { name: "Student navigation" })).toBeVisible();

    // Navigate to practice
    await page.getByRole("navigation", { name: "Student navigation" })
      .getByRole("button", { name: "Practice", exact: true }).click();

    // Select a seeded subject and request one question so the test does not
    // depend on the size or distribution of the CI starter question bank.
    const subjectChoices = page.locator(".practice-subject-choice");
    await expect(subjectChoices.first()).toBeVisible();
    await subjectChoices.first().click();
    await page.getByLabel("Number of questions").fill("1");

    // Create practice paper
    await page.getByRole("button", { name: "Create 1-question paper" }).click();

    // Confirm the practice engine actually opened a question, not just that
    // generic navigation controls remain on screen.
    await expect(page.locator(".question-card").first()).toBeVisible({ timeout: 15000 });

    // Answer the first question and submit; missing controls must fail the test.
    const options = page.locator(".question-card .option");
    await expect(options.first()).toBeVisible();
    await options.first().click();

    page.on("dialog", async (dialog) => { await dialog.accept(); });
    await page.getByRole("button", { name: "Submit answers" }).click();
    await expect(page.getByRole("heading", { name: "Your result" })).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Full Mock Test", () => {
  test("student can start, see the timer, and submit a full mock test", async ({ page }) => {
    test.setTimeout(60000);
    const { studentEmail } = await setupStudent(page);
    await loginUi(page, studentEmail, "StudentPass123!");

    await expect(page.getByRole("navigation", { name: "Student navigation" })).toBeVisible();
    await page.getByRole("navigation", { name: "Student navigation" })
      .getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("button", { name: "Start mock test" }).click();

    const question = page.locator(".question-card").first();
    await expect(question).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".exam-countdown, .timer-warning").first()).toBeVisible();

    const option = question.locator(".option").first();
    await expect(option).toBeVisible();
    await option.click();

    page.on("dialog", async (dialog) => { await dialog.accept(); });
    await page.getByRole("button", { name: "Submit answers" }).click();
    await expect(page.getByRole("heading", { name: "Your result" })).toBeVisible({ timeout: 15000 });
  });
});
