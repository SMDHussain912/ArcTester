import { describe, expect, it } from "vitest";
import { assessFeatureDrift, driftBucket, expectedDriftCounts } from "./modelDrift.js";

const baseline = Array.from({ length: 100 }, (_, index) => ({
  features: { score: index, subject: index % 2 === 0 ? "Math" : "Science" },
  target: index >= 50 ? 1 : 0,
}));

describe("model drift assessment", () => {
  it("maps numeric observations into stable training-relative quantile buckets", () => {
    const feature = { name: "score", type: "numeric" as const };
    expect(driftBucket(feature, 1, baseline)).toBe("quantile_0");
    expect(driftBucket(feature, 99, baseline)).toBe("quantile_4");
    expect(expectedDriftCounts(feature, baseline)).toEqual({
      quantile_0: 20, quantile_1: 20, quantile_2: 20, quantile_3: 20, quantile_4: 20,
    });
  });

  it("stores categorical indexes rather than raw category values", () => {
    const feature = { name: "subject", type: "categorical" as const, categories: ["Math", "Science"] };
    expect(driftBucket(feature, "Math", baseline)).toBe("category_0");
    expect(driftBucket(feature, "Other", baseline)).toBe("unknown");
  });

  it("classifies low, moderate, high and no-data drift", () => {
    expect(assessFeatureDrift("score", { a: 50, b: 50 }, { a: 50, b: 50 }).status).toBe("LOW");
    expect(assessFeatureDrift("score", { a: 50, b: 50 }, { a: 75, b: 25 }).status).toBe("MODERATE");
    expect(assessFeatureDrift("score", { a: 50, b: 50 }, { a: 99, b: 1 }).status).toBe("HIGH");
    expect(assessFeatureDrift("score", { a: 50, b: 50 }, {}).status).toBe("NO_DATA");
  });
});
