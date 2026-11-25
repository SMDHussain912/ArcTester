import { describe, expect, it } from "vitest";
import { isContentAudienceVisible } from "./contentAudience.js";

describe("content audience matching", () => {
  const student = { collegeCode: "010", collegeName: "Andhra Polytechnic, Kakinada", branchCode: "CM", branchName: "Diploma in Computer Engineering" };

  it("keeps legacy and global content visible to everyone", () => {
    expect(isContentAudienceVisible({}, {})).toBe(true);
    expect(isContentAudienceVisible({ audienceScope: "ALL" }, student)).toBe(true);
  });

  it("matches college targets by institute code or normalized name", () => {
    expect(isContentAudienceVisible({ audienceScope: "COLLEGE", targetCollegeCode: "010" }, student)).toBe(true);
    expect(isContentAudienceVisible({ audienceScope: "COLLEGE", targetCollegeName: "  ANDHRA POLYTECHNIC, KAKINADA " }, student)).toBe(true);
    expect(isContentAudienceVisible({ audienceScope: "COLLEGE", targetCollegeCode: "999" }, student)).toBe(false);
  });

  it("requires the matching branch and, when specified, matching college", () => {
    expect(isContentAudienceVisible({ audienceScope: "BRANCH", targetBranchCode: "CM" }, student)).toBe(true);
    expect(isContentAudienceVisible({ audienceScope: "BRANCH", targetBranchName: "Diploma in Computer Engineering" }, student)).toBe(true);
    expect(isContentAudienceVisible({ audienceScope: "BRANCH", targetBranchCode: "CM", targetCollegeCode: "010" }, student)).toBe(true);
    expect(isContentAudienceVisible({ audienceScope: "BRANCH", targetBranchCode: "CM", targetCollegeCode: "011" }, student)).toBe(false);
    expect(isContentAudienceVisible({ audienceScope: "BRANCH", targetBranchCode: "EC" }, student)).toBe(false);
  });

  it("fails closed for unknown scopes and missing student profile fields", () => {
    expect(isContentAudienceVisible({ audienceScope: "BRANCH", targetBranchCode: "CM" }, {})).toBe(false);
    expect(isContentAudienceVisible({ audienceScope: "COLLEGE", targetCollegeCode: "010" }, {})).toBe(false);
    expect(isContentAudienceVisible({ audienceScope: "SOME_UNKNOWN_SCOPE" }, student)).toBe(false);
  });
});
