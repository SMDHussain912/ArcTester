import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const routeFiles = [
  "testRoutes.ts", "auth.ts", "sessionRoutes.ts", "studentAuditRoutes.ts",
  "adminStudentRoutes.ts", "examRoutes.ts", "questionRoutes.ts", "submissionRoutes.ts",
  "questionAdminRoutes.ts", "announcementRoutes.ts", "studyMaterialRoutes.ts",
  "conceptLibraryRoutes.ts", "lessonGenerationRoutes.ts", "lessonCatalogRoutes.ts",
  "lessonPackageAdminRoutes.ts", "learningPathRoutes.ts", "gamificationRoutes.ts",
  "masteryRoutes.ts", "studentMcpRoutes.ts", "adminInstitutionRoutes.ts",
  "adminMcpRoutes.ts", "modelInferenceRoutes.ts", "analyticsRoutes.ts",
];
const selfAuthenticatingPublicAuthPaths = new Set([
  "/register", "/login", "/token", "/login/2fa", "/token/2fa",
  "/passkeys/login/options", "/passkeys/login/verify", "/me", "/logout", "/captcha/challenge",
]);

describe("API route authentication coverage", () => {
  it("protects every non-public route with auth, admin, or MCP key middleware", () => {
    const failures: string[] = [];
    for (const file of routeFiles) {
      const source = readFileSync(resolve(sourceDirectory, file), "utf8");
      const adminRouterGuard = /router\.use\(\s*["']\/admin["']\s*,\s*requireAuth\s*,\s*requireAdmin\s*\(/.test(source);
      const starts = [...source.matchAll(/router\.(?:get|post|put|patch|delete)\s*\(/g)];
      for (const match of starts) {
        const index = match.index ?? 0;
        const snippet = source.slice(index, index + 1200);
        const doubleQuoteIndex = snippet.indexOf('"');
        const singleQuoteIndex = snippet.indexOf("'");
        const quoteIndex = doubleQuoteIndex < 0 ? singleQuoteIndex : singleQuoteIndex < 0 ? doubleQuoteIndex : Math.min(doubleQuoteIndex, singleQuoteIndex);
        if (quoteIndex < 0) continue;
        const quote = snippet[quoteIndex]!;
        const pathEnd = snippet.indexOf(quote, quoteIndex + 1);
        if (pathEnd < 0) continue;
        const routePath = snippet.slice(quoteIndex + 1, pathEnd).split(",")[0]!.trim();
        if (file === "auth.ts" && selfAuthenticatingPublicAuthPaths.has(routePath)) continue;
        const asyncIndex = snippet.search(/\basync\s*\(/);
        const middleware = asyncIndex >= 0 ? snippet.slice(0, asyncIndex) : snippet;
        if (adminRouterGuard || /requireAuth|requireAdmin|requireStudent|requireRecentAuth|authenticateMcp|authAdminKey/.test(middleware)) continue;
        failures.push(file + " " + routePath + ": " + middleware.slice(0, 160).replace(/\s+/g, " "));
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
