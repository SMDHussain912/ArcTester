import { describe, expect, it } from "vitest";
import { fitExamSessionIsolationForest, scoreExamSessionAnomaly } from "./examSessionAnomaly.js";

const normalRows = Array.from({ length: 80 }, (_, index) => [
  index % 4, index % 3, index % 2, 2 + index % 5,
  index % 5, index % 2, index % 3, 0.8 + (index % 4) * 0.05, (index % 5) / 10,
]);
const telemetry = {
  focus_loss_count: 1, disconnect_count: 0, heartbeat_gap_count: 1, heartbeat_gap_max_seconds: 5,
  answer_change_count: 2, rapid_answer_burst_count: 0, submission_retry_count: 0,
  session_duration_ratio: 0.9, event_rate_deviation: 0, client_kind: "web" as const, telemetry_coverage: 1,
};

describe("exam session anomaly detection", () => {
  it("fits a deterministic isolation forest and scores a normal session", () => {
    const first = fitExamSessionIsolationForest(normalRows, { trees: 32, seed: 12 });
    expect(first).toEqual(fitExamSessionIsolationForest(normalRows, { trees: 32, seed: 12 }));
    const result = scoreExamSessionAnomaly(first, telemetry);
    expect(result.anomalyScore).toBeGreaterThanOrEqual(0);
    expect(result.anomalyScore).toBeLessThanOrEqual(1);
    expect(result.modelVersion).toBe(1);
  });

  it("does not treat missing telemetry as suspicious", () => {
    const model = fitExamSessionIsolationForest(normalRows, { trees: 32 });
    const result = scoreExamSessionAnomaly(model, { ...telemetry, telemetry_coverage: 0.3 });
    expect(result).toMatchObject({ severity: "LOW", reviewRequired: false, reasonCodes: ["TELEMETRY_INCOMPLETE"] });
  });

  it("uses policy signals only for human review and validates telemetry", () => {
    const model = fitExamSessionIsolationForest(normalRows, { trees: 32 });
    const result = scoreExamSessionAnomaly(model, { ...telemetry, rapid_answer_burst_count: 10, submission_retry_count: 5 });
    expect(result.reasonCodes).toContain("RAPID_ANSWER_BURSTS");
    expect(result.reasonCodes).not.toContain("CHEATING");
    expect(() => scoreExamSessionAnomaly(model, { ...telemetry, focus_loss_count: -1 })).toThrow("invalid values");
  });
});
