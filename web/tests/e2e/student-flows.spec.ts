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
  const setCookie = res.headers()["set-cookie"] || res.headers()["Set-Cookie"] || "";
  return Array.isArray(setCookie) ? setCookie[0]?.split(";")[0] || "" : setCookie.split(";")[0] || "";
}

/** Helper: login via UI */
async function loginUi(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign in")');
  await page.getByRole("navigation", { name: "Student navigation" }).waitFor({ state: "visible", timeout: 15000 });
}

/** Setup test data: create admin, student, questions, exam, assignment */
async function setupExamData(page: Page) {
  // The CI workflow provisions this administrator before starting the API.
  const adminCookie = await loginApi(page, "admin@arctester.test", "ArcTester-CI-Admin-2026!");
  if (!adminCookie) throw new Error("E2E administrator login failed.");

  // Create subject
  await apiRequest(page, "/admin/subjects", "POST", { name: "Mathematics" }, adminCookie);

  // Create topic
  await apiRequest(page, "/admin/subjects/1/topics", "POST", { name: "Algebra" }, adminCookie);

  // Create questions
  await apiRequest(page, "/admin/questions", "POST", {
    subject: "Mathematics",
    topic: "Algebra",
    text: "What is 2 + 2?",
    options: ["3", "4", "5", "6"],
    correctIndex: 1,
    explanation: "2 + 2 = 4",
    source: "test",
    difficulty: "easy",
  }, adminCookie);

  await apiRequest(page, "/admin/questions", "POST", {
    subject: "Mathematics",
    topic: "Algebra",
    text: "What is 3 * 3?",
    options: ["6", "9", "12", "15"],
    correctIndex: 1,
    explanation: "3 * 3 = 9",
    source: "test",
    difficulty: "easy",
  }, adminCookie);

  // Create exam
  const examRes = await apiRequest(page, "/admin/exams", "POST", {
    title: "ECET Mathematics Mock",
    description: "A practice mathematics exam",
    instructions: "Answer all questions.",
    durationMinutes: 30,
    shuffleQuestions: false,
    shuffleOptions: false,
    questions: [{ questionId: 1, marks: 2, negativeMarks: 0 }],
  }, adminCookie);

  const examId = examRes.json.exam?.id;

  // Publish exam
  if (examId) {
    await apiRequest(page, `/admin/exams/${examId}/publish`, "POST", {}, adminCookie);

    // Create student user via invitation flow
    // First create invitation as admin
    const studentEmail = `student-${Date.now()}@arctester.test`;
    const inviteRes = await apiRequest(page, "/auth/invitations", "POST", {
      email: studentEmail,
    }, adminCookie);
    const inviteToken = inviteRes.json.invitation?.token;

    // Register student
    await apiRequest(page, "/auth/register", "POST", {
      email: studentEmail,
      password: "StudentPass123!",
      invitationToken: inviteToken || "",
    });

    // Assign exam to student (need student id - hardcode 2 for now, or get from API)
    const studentCookie = await loginApi(page, studentEmail, "StudentPass123!");
    const studentSession = await apiRequest(page, "/auth/me", "GET", undefined, studentCookie);
    const studentId = studentSession.json.user?.id;
    if (!Number.isSafeInteger(studentId)) throw new Error("Could not resolve E2E student ID.");
    await apiRequest(page, `/admin/exams/${examId}/assign`, "POST", {
      studentIds: [studentId],
    }, adminCookie);
  }

  return { examId, studentEmail };
}

test.describe("Student Practice Flow", () => {
  test("student can create, take, and submit a practice test", async ({ page }) => {
    const { studentEmail } = await setupExamData(page);

    // Login as student through UI
    await loginUi(page, studentEmail, "StudentPass123!");

    // Should be on dashboard
    await expect(page.getByRole("navigation", { name: "Student navigation" })).toBeVisible();

    // Navigate to practice
    await page.getByRole("button", { name: "Practice", exact: true }).click();

    // Select subject
    await page.click('text=Mathematics');

    // Create practice paper
    await page.click('button:has-text("Create")');

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
      await submitBtn.first().click();

      // Handle confirmation dialog if present
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });

      // Should see results
      await page.waitForSelector("text=Result, text=Score, text=result, text=score", { timeout: 10000 });
      await expect(page.locator("text=Result, text=Score, text=result, text=score")).toBeVisible();
    }
  });
});

test.describe("Formal Exam Flow", () => {
  test("student can take and submit an assigned exam", async ({ page }) => {
    const { studentEmail } = await setupExamData(page);

    // Login as student through UI
    await loginUi(page, studentEmail, "StudentPass123!");

    // Should see assigned exams
    await expect(page.getByRole("navigation", { name: "Student navigation" })).toBeVisible();
    await page.getByRole("button", { name: /Assigned exams/ }).click();
    await expect(page.getByText("ECET Mathematics Mock")).toBeVisible({ timeout: 10000 });

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
      await submitBtn.first().click();

      // Handle confirmation dialog
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });

      // Should see result or review-required message
      await page.waitForSelector("text=Result, text=Score, text=Awaiting, text=review", { timeout: 10000 });
      await expect(page.locator("text=Result, text=Score, text=Awaiting, text=review")).toBeVisible();
    }
  });
});
