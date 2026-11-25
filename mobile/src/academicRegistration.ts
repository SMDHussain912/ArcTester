import { AP_DIPLOMA_BRANCHES, AP_POLYTECHNIC_COLLEGES } from "./polytechnicCatalog";

export type AcademicRegistration = {
  fullName: string;
  collegeName: string;
  collegeCode: string;
  postalPin: string;
  branchName: string;
  branchCode: string;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function searchColleges(query: string, limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  return AP_POLYTECHNIC_COLLEGES.filter((college) =>
    normalize(college.name).includes(q) || college.code.toLocaleLowerCase().includes(q) || normalize(college.district ?? "").includes(q)
  ).slice(0, limit);
}

export function searchBranches(query: string, limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  return AP_DIPLOMA_BRANCHES.filter((branch) =>
    normalize(branch.name).includes(q) || branch.code.toLocaleLowerCase().includes(q)
  ).slice(0, limit);
}

export function getCollegeCode(name: string): string {
  return AP_POLYTECHNIC_COLLEGES.find((college) => normalize(college.name) === normalize(name))?.code ?? "";
}

export function getBranchCode(name: string): string {
  const matches = AP_DIPLOMA_BRANCHES.filter((branch) => normalize(branch.name) === normalize(name));
  const codes = [...new Set(matches.map((branch) => branch.code))];
  return codes.length === 1 ? codes[0] : "";
}

export function validateAcademicRegistration(profile: AcademicRegistration): string | null {
  if (profile.fullName.trim().length < 2) return "Enter your full name.";
  if (profile.collegeName.trim().length < 2) return "Search or enter your college name.";
  if (!profile.collegeCode.trim()) return "Enter your college PIN / institute code.";
  if (profile.postalPin && !/^\d{6}$/.test(profile.postalPin.trim())) return "Postal PIN must contain 6 digits.";
  if (profile.branchName.trim().length < 2) return "Search or enter your diploma branch.";
  return null;
}
