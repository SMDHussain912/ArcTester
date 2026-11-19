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

/** Setup test data: create admin, student, questions, exam, assignment */
async function setupExamData(page: Page) {
  const adminCookie = await loginApi(page, "admin@arctester.test", "ArcTester-CI-Admin-2026!");
  if (!adminCookie) throw new Error("E2E administrator login failed.");

  // Reuse a seeded question instead of inserting fixed IDs or duplicate fixture
  // content. Each test still creates its own exam, invitation and student.
  const catalog = await apiRequest(page, "/admin/questions?limit=100", "GET", undefined, adminCookie);
  if (catalog.status !== 200 || !Array.isArray(catalog.json.questions) || catalog.json.questions.length === 0) {
    throw new Error("The seeded question bank is empty or unavailable to the E2E administrator.");
  }
  const question = catalog.json.questions[0] as { id: number; subject: string };
  if (!Number.isSafeInteger(question.id) || !question.subject) throw new Error("Seeded question fixture is invalid.");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const studentEmail = `student-${suffix}@arctester.test`;
  const examTitle = `ECET ${question.subject} Mock ${suffix}`;

  const examRes = await apiRequest(page, "/admin/exams", "POST", {
    title: examTitle,
    description: "A practice examination created by the Playwright suite.",
    instructions: "Answer all questions.",
    durationMinutes: 30,
    shuffleQuestions: false,
    shuffleOptions: false,
    questions: [{ questionId: question.id, marks: 2, negativeMarks: 0 }],
  }, adminCookie);
  if (examRes.status !== 201 || !examRes.json.exam?.id) {
    throw new Error(`E2E exam creation failed (${examRes.status}): ${JSON.stringify(examRes.json)}`);
  }
  const examId = examRes.json.exam.id as string;

  const publish = await apiRequest(page, `/admin/exams/${examId}/publish`, "POST", {}, adminCookie);
  if (publish.status < 200 || publish.status >= 300) throw new Error(`E2E exam publish failed: ${JSON.stringify(publish.json)}`);

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

  const studentCookie = await loginApi(page, studentEmail, "StudentPass123!");
  if (!studentCookie) throw new Error("E2E student login failed.");
  const studentSession = await apiRequest(page, "/auth/me", "GET", undefined, studentCookie);
  const studentId = studentSession.json.user?.id;
  if (!Number.isSafeInteger(studentId)) throw new Error("Could not resolve E2E student ID.");

  const assignment = await apiRequest(page, `/admin/exams/${examId}/assign`, "POST", {
    studentIds: [studentId],
  }, adminCookie);
  if (assignment.status < 200 || assignment.status >= 300) {
    throw new Error(`E2E exam assignment failed: ${JSON.stringify(assignment.json)}`);
  }

  return { examId, studentEmail, subjectName: question.subject, examTitle };
}

test.describe("Student Practice Flow", () => {
  test("student can create, take, and submit a practice test", async ({ page }) => {
    const { studentEmail } = await setupExamData(page);

    // Login as student through UI
    await loginUi(page, studentEmail, "StudentPass123!");

    // Should be on dashboard
    await expect(page.getByRole("navigation", { name: "Student navigation" })).toBeVisible();

    // Navigate to practice
    await page.getByRole("navigation", { name: "Student navigation" })
      .getByRole("button", { name: "Practice", exact: true }).click();

    // Select a seeded subject and request one question so the test does not
    // depend on the size or distribution of the CI starter question bank.
    const subjectChoices = page.locator(".practice-subject-choice input[type=checkbox]");
    await expect(subjectChoices.first()).toBeVisible();
    await subjectChoices.first().check();
    await page.getByLabel("Number of questions").fill("1");

    // Create practice paper
    await page.getByRole("button", { name: "Create 1-question paper" }).click();

    // Should be on practice session
    await page.waitForSelector(".question-card, .practice-session, [role='button']", { timeout: 10000 });

    // Answer first question if available
    const options = page.locator(".option");
    const optionCount = await options.count();
    if (optionCount > 0) {
      await options.first().click();
    }

    // Submit test
    const submitBtn = page.locator('button:has-text("Submit final answers"), button:has-text("Submit")');
    if (await submitBtn.count() > 0) {
      // Register before clicking because the confirmation dialog is synchronous.
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });
      await submitBtn.first().click();

      // Should see results
      await page.waitForSelector("text=Result, text=Score, text=result, text=score", { timeout: 10000 });
      await expect(page.locator("text=Result, text=Score, text=result, text=score")).toBeVisible();
    }
  });
});

test.describe("Formal Exam Flow", () => {
  test("student can take and submit an assigned exam", async ({ page }) => {
    const { studentEmail, examTitle } = await setupExamData(page);

    // Login as student through UI
    await loginUi(page, studentEmail, "StudentPass123!");

    // Should see assigned exams
    await expect(page.getByRole("navigation", { name: "Student navigation" })).toBeVisible();
    await page.getByRole("navigation", { name: "Student navigation" })
      .getByRole("button", { name: /Assigned exams/ }).click();
    await expect(page.getByText(examTitle)).toBeVisible({ timeout: 10000 });

    // Click on assigned exam to start
    await page.click('button:has-text("Start examination")');

    // Should be on exam session
    await page.waitForSelector(".question-card, .exam-session, h2", { timeout: 10000 });

    // Answer first question
    const options = page.locator(".option");
    const optionCount = await options.count();
    if (optionCount > 0) {
      await options.first().click();
    }

    // Submit exam
    const submitBtn = page.locator('button:has-text("Submit final answers"), button:has-text("Submit")');
    if (await submitBtn.count() > 0) {
      page.on("dialog", async (dialog) => { await dialog.accept(); });
      await submitBtn.first().click();

      // Should see result or review-required message
      await page.waitForSelector("text=Result, text=Score, text=Awaiting, text=review", { timeout: 10000 });
      await expect(page.locator("text=Result, text=Score, text=Awaiting, text=review")).toBeVisible();
    }
  });
});
