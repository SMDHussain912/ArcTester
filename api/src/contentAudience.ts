export type ContentAudienceScope = "ALL" | "COLLEGE" | "BRANCH";

export type ContentAudience = {
  audienceScope?: string | null;
  targetCollegeCode?: string | null;
  targetCollegeName?: string | null;
  targetBranchCode?: string | null;
  targetBranchName?: string | null;
};

export type AcademicAudienceProfile = {
  collegeCode?: string | null;
  collegeName?: string | null;
  branchCode?: string | null;
  branchName?: string | null;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function matchesOneOf(profileValues: Array<string | null | undefined>, targetValues: Array<string | null | undefined>): boolean {
  const targets = targetValues.map(normalize).filter(Boolean);
  if (targets.length === 0) return false;
  return profileValues.map(normalize).filter(Boolean).some((value) => targets.includes(value));
}

/**
 * Fail closed for institution/branch-scoped content. Missing or legacy student
 * profile fields can see only global material, never another college's content.
 */
export function isContentAudienceVisible(
  audience: ContentAudience,
  profile: AcademicAudienceProfile,
): boolean {
  const scope = audience.audienceScope ?? "ALL";
  if (scope === "ALL") return true;

  const collegeMatches = () => matchesOneOf(
    [profile.collegeCode, profile.collegeName],
    [audience.targetCollegeCode, audience.targetCollegeName],
  );

  if (scope === "COLLEGE") return collegeMatches();
  if (scope === "BRANCH") {
    const branchMatches = matchesOneOf(
      [profile.branchCode, profile.branchName],
      [audience.targetBranchCode, audience.targetBranchName],
    );
    const hasCollegeTarget = Boolean(normalize(audience.targetCollegeCode) || normalize(audience.targetCollegeName));
    return branchMatches && (!hasCollegeTarget || collegeMatches());
  }

  // Unknown scope values are not public.
  return false;
}
