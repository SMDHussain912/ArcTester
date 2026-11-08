import { describe, expect, it } from "vitest";
import {
  evaluateDecisionTree, fitDecisionTree, predictDecisionTreeClass,
  predictDecisionTreeProbability, validateDecisionTreeArtifact, type DecisionTreeSample,
} from "../src/intelligence/decisionTree.js";

const samples: DecisionTreeSample[] = [
  { features: [1, 8], label: 0 }, { features: [2, 7], label: 0 },
  { features: [3, 6], label: 0 }, { features: [8, 3], label: 1 },
  { features: [9, 2], label: 1 }, { features: [10, 1], label: 1 },
];

describe("Decision tree classifier", () => {
  it("finds deterministic Gini splits and classifies separable rows", () => {
    const model = fitDecisionTree(samples);
    expect(model.algorithm).toBe("decision-tree");
    expect(model.root.type).toBe("split");
    expect(predictDecisionTreeProbability(model, [1.5, 7.5])).toBe(0);
    expect(predictDecisionTreeProbability(model, [9.5, 1.5])).toBe(1);
    expect(predictDecisionTreeClass(model, [9.5, 1.5])).toBe(1);
  });
  it("respects depth, leaf-size and impurity pre-pruning controls", () => {
    const shallow = fitDecisionTree(samples, { maxDepth: 1 });
    expect(shallow.root.type).toBe("split");
    if (shallow.root.type === "split") {
      expect(shallow.root.left.type).toBe("leaf");
      expect(shallow.root.right.type).toBe("leaf");
    }
    const constrained = fitDecisionTree(samples, { minSamplesSplit: 6, minSamplesLeaf: 3 });
    expect(constrained.root.type).toBe("split");
    expect(fitDecisionTree(samples, { minImpurityDecrease: 1 }).root.type).toBe("leaf");
  });
  it("reports classification metrics", () => {
    const metrics = evaluateDecisionTree(fitDecisionTree(samples), samples);
    expect(metrics.accuracy).toBe(1);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.f1).toBe(1);
    expect(metrics.truePositive).toBe(3);
    expect(metrics.trueNegative).toBe(3);
  });
  it("validates artifacts and rejects incompatible prediction features", () => {
    const model = fitDecisionTree(samples);
    expect(validateDecisionTreeArtifact(model)).toEqual(model);
    const invalidModel = structuredClone(model);
    if (invalidModel.root.type === "split") invalidModel.root.feature = 9;
    expect(() => validateDecisionTreeArtifact(invalidModel)).toThrow("Invalid decision tree");
    expect(() => predictDecisionTreeProbability(model, [1])).toThrow("Prediction features do not match");
  });
  it("rejects malformed training data and invalid options", () => {
    expect(() => fitDecisionTree([{ features: [1], label: 0 }])).toThrow("At least two");
    expect(() => fitDecisionTree([{ features: [1], label: 0 }, { features: [1, 2], label: 1 }])).toThrow("inconsistent feature count");
    expect(() => fitDecisionTree([{ features: [1], label: 0 }, { features: [2], label: 2 as 0 | 1 }])).toThrow("invalid binary label");
    expect(() => fitDecisionTree(samples, { maxDepth: 0 })).toThrow("maxDepth");
    expect(() => fitDecisionTree(samples, { minSamplesLeaf: 2 })).toThrow("minSamplesLeaf");
    expect(() => predictDecisionTreeClass(fitDecisionTree(samples), [1, 2], 1)).toThrow("threshold");
  });
});
