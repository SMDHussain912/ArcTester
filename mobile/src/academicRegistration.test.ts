import { describe, expect, it } from "vitest";
import { getBranchCode, getCollegeCode, searchBranches, searchColleges, validateAcademicRegistration, type AcademicRegistration } from "./academicRegistration";

const valid: AcademicRegistration = {
  fullName: "Test Student",
  collegeName: "Andhra Polytechnic, Kakinada",
  collegeCode: "010",
  postalPin: "533001",
  branchName: "Diploma in Computer Engineering (Artificial Intelligence)",
  branchCode: "CAI",
};

describe("academic registration helpers", () => {
  it("searches institution names and codes and supports custom typed names", () => {
    expect(searchColleges("Andhra Polytechnic").some((item) => item.code === "010")).toBe(true);
    expect(searchColleges("010").some((item) => item.name === "Andhra Polytechnic, Kakinada")).toBe(true);
    expect(validateAcademicRegistration({ ...valid, collegeName: "My New Polytechnic", collegeCode: "MY-01", branchName: "Diploma in a custom branch", branchCode: "" })).toBeNull();
  });

  it("searches both legacy and C-26 diploma branches", () => {
    expect(searchBranches("cloud computing").some((item) => item.code === "CCB")).toBe(true);
    expect(searchBranches("DCME").some((item) => item.code === "DCME")).toBe(true);
  });

  it("autofills institute and unambiguous branch codes but avoids scheme ambiguity", () => {
    expect(getCollegeCode("Andhra Polytechnic, Kakinada")).toBe("010");
    expect(getBranchCode("Diploma in Computer Engineering (Artificial Intelligence)")).toBe("CAI");
    expect(getBranchCode("Diploma in Computer Engineering")).toBe("");
  });

  it("validates required identity fields and optional postal PIN", () => {
    expect(validateAcademicRegistration(valid)).toBeNull();
    expect(validateAcademicRegistration({ ...valid, collegeCode: "" })).toBe("Enter your college PIN / institute code.");
    expect(validateAcademicRegistration({ ...valid, postalPin: "1234" })).toBe("Postal PIN must contain 6 digits.");
  });
});
