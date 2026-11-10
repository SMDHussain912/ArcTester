import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflowPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.github/workflows/ci.yml");
const workflow = readFileSync(workflowPath, "utf8");

describe("GitHub Actions pull-request workflow", () => {
  it("runs the four-job CI workflow for main and stacked chatgpt branches", () => {
    const pullRequestTrigger = workflow.match(/pull_request:\s*\n\s+branches:\s*\[([^\]]+)\]/);
    expect(pullRequestTrigger?.[1]).toContain("main");
    expect(pullRequestTrigger?.[1]).toContain("chatgpt/**");
  });
});
