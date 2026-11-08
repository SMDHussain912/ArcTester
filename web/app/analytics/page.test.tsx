import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/tensorflowInference", () => ({
  createTensorflowBrowserPredictor: vi.fn().mockResolvedValue({
    version: 2,
    predict: vi.fn().mockResolvedValue(0.91),
    dispose: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import AnalyticsPage from "./page";
import { SessionProvider } from "../../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function overviewResponse(practiceAccuracy: number | null, questions: number, correct: number) {
  return {
    generatedAt: "2026-11-08T08:30:00.000Z",
    practice: {
      completedAttempts: questions ? 1 : 0,
      questions,
      correct,
      incorrect: questions - correct,
      unanswered: 0,
      accuracy: practiceAccuracy,
      subjects: [],
      difficulty: questions > 0 ? [{
        difficulty: "medium",
        correct,
        incorrect: questions - correct,
        unanswered: 0,
        answered: questions,
        accuracy: practiceAccuracy,
      }] : [],
      trend: [],
    },
    formalExams: {
      submissions: 0,
      graded: 0,
      reviewRequired: 0,
      score: 0,
      maximumScore: 0,
      scorePercentage: null,
      correct: 0,
      incorrect: 0,
      unanswered: 0,
      subjects: [],
    },
  };
}

describe("student analytics page", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a sign-in prompt to signed-out visitors", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).endsWith("/auth/me")
          ? jsonResponse(403, { error: "Not signed in." })
          : jsonResponse(200, {})
      )
    );

    render(
      <SessionProvider>
        <AnalyticsPage />
      </SessionProvider>
    );

    await waitFor(() =>
      expect(
        screen.getByText("Sign in to see your progress, recent attempts and areas to revise.")
      ).toBeInTheDocument()
    );
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/analytics/"))).toBe(
      false
    );
  });

  it("uses the approved TensorFlow population model and keeps the personal model as fallback", async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) return Promise.resolve(jsonResponse(200, {
        ok: true, user: { id: 8, email: "hybrid@example.com", role: "STUDENT" },
      }));
      if (path.endsWith("/analytics/weak-topics")) return Promise.resolve(jsonResponse(200, { topics: [], subjects: [], weakest: null }));
      if (path.endsWith("/analytics/overview")) return Promise.resolve(jsonResponse(200, overviewResponse(0.7, 30, 21)));
      if (path.endsWith("/analytics/question-performance")) return Promise.resolve(jsonResponse(200, {
        generatedAt: "2026-11-09T08:00:00.000Z", minimumAnswers: 5, weakAccuracyThreshold: 0.6,
        insufficientSampleCount: 0, questions: [],
      }));
      if (path.endsWith("/analytics/history")) return Promise.resolve(jsonResponse(200, {
        items: [], page: 1, limit: 10, total: 0, totalPages: 0,
      }));
      if (path.endsWith("/analytics/recommendations")) return Promise.resolve(jsonResponse(200, {
        generatedAt: "2026-11-09T08:00:00.000Z", basedOnAttempts: 3, minimumAnswers: 5,
        weakAccuracyThreshold: 0.6,
        performanceExplanation: {
          headline: "Build more practice evidence.", details: [], answeredQuestions: 30,
          incorrectAnswers: 9, evidenceThreshold: 5, weakAccuracyThreshold: 0.6,
        },
        recommendations: [],
      }));
      if (path.endsWith("/analytics/score-prediction")) return Promise.resolve(jsonResponse(200, {
        status: "ready", completedAttempts: 30, trainingSamples: 27, evaluationSamples: 9,
        predictedScorePercent: 84,
        predictionInterval: { lowerPercent: 76, upperPercent: 92, estimatedErrorPercent: 4.1, method: "walk-forward-rmse" },
        modelMae: 0.08, baselineMae: 0.15, message: "Personal statistical estimate.",
        populationFeatures: {
          completed_attempts: 30, previous_accuracy: 0.7, recent_average_accuracy: 0.68,
          overall_average_accuracy: 0.65, previous_question_count: 20,
        },
      }));
      if (path.endsWith("/models/student-score-population/active/tensorflow")) {
        return Promise.resolve(jsonResponse(200, { ok: true, artifact: { modelId: "student-score-population", version: 2 } }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(
      <SessionProvider>
        <AnalyticsPage />
      </SessionProvider>
    );

    expect(await screen.findByText("91%")).toBeInTheDocument();
    expect(screen.getByText("TensorFlow.js · v2")).toBeInTheDocument();
    expect(screen.getByText(/other learners' raw attempts are never sent to your browser/i)).toBeInTheDocument();
  });

  it("shows accuracy, weak subjects and recent practice history", async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          jsonResponse(200, {
            ok: true,
            user: { id: 7, email: "learner@example.com", role: "STUDENT" },
          })
        );
      }
      if (path.endsWith("/analytics/weak-topics")) {
        return Promise.resolve(
          jsonResponse(200, {
            topics: [],
            subjects: [
              {
                subject: "Physics",
                topic: null,
                seen: 10,
                wrong: 7,
                accuracy: 0.3,
              },
              {
                subject: "Maths",
                topic: null,
                seen: 10,
                wrong: 2,
                accuracy: 0.8,
              },
            ],
            weakest: {
              subject: "Physics",
              topic: "Mechanics",
              seen: 10,
              wrong: 7,
              accuracy: 0.3,
            },
          })
        );
      }
      if (path.endsWith("/analytics/score-prediction")) {
        return Promise.resolve(jsonResponse(200, {
          status: "ready", completedAttempts: 30, trainingSamples: 27, evaluationSamples: 7,
          predictedScorePercent: 84,
          predictionInterval: { lowerPercent: 76, upperPercent: 92, estimatedErrorPercent: 4.1, method: "walk-forward-rmse" },
          modelMae: 0.08, baselineMae: 0.15,
          message: "Estimate based on your completed practice history; actual results may differ.",
        }));
      }
      if (path.endsWith("/analytics/overview")) {
        return Promise.resolve(jsonResponse(200, overviewResponse(0.8, 10, 8)));
      }
      if (path.endsWith("/analytics/question-performance")) {
        return Promise.resolve(jsonResponse(200, {
          generatedAt: "2026-11-08T08:30:00.000Z",
          minimumAnswers: 5,
          weakAccuracyThreshold: 0.6,
          insufficientSampleCount: 0,
          questions: [{
            questionId: 41, subject: "Physics", topic: "Mechanics", difficulty: "medium",
            seen: 5, correct: 1, incorrect: 4, unanswered: 0,
            accuracy: 0.2, sampleSize: 5, sufficientData: true, weak: true,
          }],
        }));
      }
      if (path.includes("/analytics/history")) {
        return Promise.resolve(
          jsonResponse(200, {
            items: [{
              attemptId: 22,
              mode: "practice",
              startedAt: "2026-11-08T08:00:00.000Z",
              finishedAt: "2026-11-08T08:20:00.000Z",
              score: 8,
              total: 10,
              expired: false,
            }],
            page: 1, limit: 10, total: 1, totalPages: 1,
          })
        );
      }
      if (path.endsWith("/analytics/recommendations")) {
        return Promise.resolve(
          jsonResponse(200, {
            generatedAt: "2026-11-08T08:30:00.000Z",
            basedOnAttempts: 1,
            minimumAnswers: 5,
            weakAccuracyThreshold: 0.6,
            performanceExplanation: {
              headline: "Your clearest revision gap is Mechanics in Physics.",
              details: ["Mechanics in Physics: 30% accuracy across 10 answered questions, with 7 incorrect.", "This analysis uses 10 answered practice questions. Unanswered questions are excluded from accuracy."],
              answeredQuestions: 10,
              incorrectAnswers: 7,
              evidenceThreshold: 5,
              weakAccuracyThreshold: 0.6,
            },
            recommendations: [
              {
                id: "revise-topic-Physics%3AMechanics",
                priority: "high",
                title: "Revise Mechanics",
                reason: "30% accuracy across 10 answered practice questions in Physics. This meets the minimum evidence threshold; focus practice here before another full mock.",
                subject: "Physics",
                topic: "Mechanics",
                mode: "practice",
                questionCount: 15,
                evidence: {
                  answeredQuestions: 10,
                  incorrectAnswers: 7,
                  accuracy: 0.3,
                  minimumAnswers: 5,
                  weakAccuracyThreshold: 0.6,
                },
              },
            ],
          })
        );
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <AnalyticsPage />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText("80%")).toBeInTheDocument());
    expect(await screen.findByText("Next practice score estimate")).toBeInTheDocument();
    expect(screen.getByText("84%")).toBeInTheDocument();
    expect(screen.getByText(/Estimated accuracy on your next practice attempt/)).toBeInTheDocument();
    expect(screen.getByText("76%–92%")).toBeInTheDocument();
    expect(screen.getByText(/not a calibrated confidence interval/)).toBeInTheDocument();
    expect(screen.getByText("Physics")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent?.includes("Focus next on Mechanics") === true
      )
    ).toBeInTheDocument();
    expect(screen.getByText("8 / 10")).toBeInTheDocument();
    expect(screen.getByText("80% score")).toBeInTheDocument();
    expect(screen.getByText("Your next study steps")).toBeInTheDocument();
    expect(screen.getByText("Your clearest revision gap is Mechanics in Physics.")).toBeInTheDocument();
    expect(screen.getByText(/This analysis uses 10 answered practice questions/)).toBeInTheDocument();
    expect(screen.getByText("Revise Mechanics")).toBeInTheDocument();
    expect(screen.getByText(/Evidence: 7\/10 incorrect · 30% accuracy · minimum 5 answered\./)).toBeInTheDocument();
    expect(screen.getByText("high priority")).toBeInTheDocument();
    expect(screen.getByText("Practice question-level performance")).toBeInTheDocument();
    expect(screen.getByText("Performance by difficulty")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "medium difficulty accuracy" })).toHaveAttribute("aria-valuenow", "80");
    expect(screen.getByText("Question #41 · Physics")).toBeInTheDocument();
    expect(screen.getByText("20% accuracy")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Physics accuracy" })).toHaveAttribute(
      "aria-valuenow",
      "30"
    );
  });

  it("shows an empty-state message when there is no practice history", async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          jsonResponse(200, {
            ok: true,
            user: { id: 7, email: "learner@example.com", role: "STUDENT" },
          })
        );
      }
      if (path.endsWith("/analytics/weak-topics")) {
        return Promise.resolve(jsonResponse(200, { subjects: [], topics: [], weakest: null }));
      }
      if (path.includes("/analytics/history")) {
        return Promise.resolve(jsonResponse(200, { items: [], page: 1, limit: 10, total: 0, totalPages: 0 }));
      }
      if (path.endsWith("/analytics/overview")) {
        return Promise.resolve(jsonResponse(200, overviewResponse(null, 0, 0)));
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <AnalyticsPage />
      </SessionProvider>
    );

    expect(
      await screen.findByText(
        "Your practice history will appear here after your first submitted test."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Complete a practice session to unlock your subject performance breakdown.")
    ).toBeInTheDocument();
  });

  it("shows a friendly message when analytics cannot be loaded", async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          jsonResponse(200, {
            ok: true,
            user: { id: 7, email: "learner@example.com", role: "STUDENT" },
          })
        );
      }
      if (path.endsWith("/analytics/weak-topics")) {
        return Promise.resolve(
          jsonResponse(500, { error: "Analytics are temporarily unavailable." })
        );
      }
      if (path.includes("/analytics/history")) {
        return Promise.resolve(jsonResponse(200, {
          items: [], page: 1, limit: 10, total: 0, totalPages: 0,
        }));
      }
      if (path.endsWith("/analytics/overview")) {
        return Promise.resolve(jsonResponse(200, overviewResponse(0.75, 4, 3)));
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <AnalyticsPage />
      </SessionProvider>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Analytics are temporarily unavailable."
    );
    expect(screen.getByText("Formal exam performance")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it.each([
    {
      status: "insufficient_data",
      payload: {
        status: "insufficient_data", completedAttempts: 8, availableSamples: 5,
        requiredSamples: 20, requiredCompletedAttempts: 23,
        message: "Complete more practice attempts to build a reliable personal score history.",
      },
      expected: "8 / 23",
      detail: "5 of 20 required prediction samples available.",
    },
    {
      status: "baseline_not_beaten",
      payload: {
        status: "baseline_not_beaten", completedAttempts: 30, evaluationSamples: 7,
        modelMae: 0.18, baselineMae: 0.12,
        message: "There is not enough predictive improvement over a simple baseline to show a score estimate yet.",
      },
      expected: "30 attempts analyzed",
      detail: "No score estimate is shown until the model demonstrates useful predictive value.",
    },
  ])("handles the $status score prediction state without showing a number", async ({ payload, expected, detail }) => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(jsonResponse(200, {
          ok: true, user: { id: 7, email: "learner@example.com", role: "STUDENT" },
        }));
      }
      if (path.endsWith("/analytics/score-prediction")) {
        return Promise.resolve(jsonResponse(200, payload));
      }
      if (path.endsWith("/analytics/weak-topics")) {
        return Promise.resolve(jsonResponse(200, { subjects: [], topics: [], weakest: null }));
      }
      if (path.endsWith("/analytics/overview")) {
        return Promise.resolve(jsonResponse(200, overviewResponse(null, 0, 0)));
      }
      if (path.endsWith("/analytics/question-performance")) {
        return Promise.resolve(jsonResponse(200, {
          generatedAt: "2026-11-08T08:30:00.000Z", minimumAnswers: 5,
          weakAccuracyThreshold: 0.6, questions: [], insufficientSampleCount: 0,
        }));
      }
      if (path.endsWith("/analytics/recommendations")) {
        return Promise.resolve(jsonResponse(200, {
          generatedAt: "2026-11-08T08:30:00.000Z", basedOnAttempts: 0,
          minimumAnswers: 5, weakAccuracyThreshold: 0.6,
          performanceExplanation: {
            headline: "There is not enough completed practice data to explain your performance yet.",
            details: ["Complete a practice session and answer some questions to establish a reliable baseline."],
            answeredQuestions: 0, incorrectAnswers: 0, evidenceThreshold: 5, weakAccuracyThreshold: 0.6,
          },
          recommendations: [],
        }));
      }
      if (path.includes("/analytics/history")) {
        return Promise.resolve(jsonResponse(200, {
          items: [], page: 1, limit: 10, total: 0, totalPages: 0,
        }));
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <AnalyticsPage />
      </SessionProvider>
    );

    if (payload.status === "baseline_not_beaten") {
      expect(
        await screen.findByText((_, element) =>
          element?.tagName === "P" &&
          element.textContent?.includes(expected) === true &&
          element.textContent.includes(detail)
        )
      ).toBeInTheDocument();
    } else {
      expect(await screen.findByText(expected)).toBeInTheDocument();
      expect(screen.getByText(detail)).toBeInTheDocument();
    }
    expect(screen.queryByText(/^\d+%$/)).not.toBeInTheDocument();
  });

});
