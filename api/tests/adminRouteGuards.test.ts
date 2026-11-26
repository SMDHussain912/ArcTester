import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const adminRouteFiles = [
  "adminStudentRoutes.ts",
  "examRoutes.ts",
  "questionRoutes.ts",
  "sessionRoutes.ts",
  "submissionRoutes.ts",
  "questionAdminRoutes.ts",
  "announcementRoutes.ts",
  "studyMaterialRoutes.ts",
  "lessonGenerationRoutes.ts",
  "lessonPackageAdminRoutes.ts",
  "learningPathRoutes.ts",
  "adminInstitutionRoutes.ts",
  "adminMcpRoutes.ts",
  "studentAuditRoutes.ts",
];

describe("admin route authentication guard inventory", () => {
  it("requires route-level admin middleware, router-level admin guard, or admin MCP key auth", () => {
    const failures: string[] = [];
    for (const file of adminRouteFiles) {
      const source = readFileSync(resolve(sourceDirectory, file), "utf8");
      const routerGuard = /router\.use\(\s*["']\/admin["']\s*,\s*requireAuth\s*,\s*requireAdmin\s*\(/.test(source);
      const starts = [...source.matchAll(/router\.(?:get|post|put|patch|delete)\s*\(/g)];
      for (const match of starts) {
        const index = match.index ?? 0;
        const snippet = source.slice(index, index + 1200);
        const asyncIndex = snippet.search(/\basync\s*\(/);
        const middleware = asyncIndex >= 0 ? snippet.slice(0, asyncIndex) : snippet;
        if (!/["'`][^"'`]*\/admin/.test(middleware)) continue;
        if (routerGuard || (middleware.includes("requireAuth") && middleware.includes("requireAdmin"))) continue;
        if (file === "adminMcpRoutes.ts" && middleware.includes('"/mcp/admin"') && middleware.includes("authAdminKey")) continue;
        failures.push(file + ": " + middleware.slice(0, 180).replace(/\s+/g, " "));
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
