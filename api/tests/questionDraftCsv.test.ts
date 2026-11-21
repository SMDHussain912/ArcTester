import { describe, expect, it } from "vitest";
import { validateQuestionDraftCsv } from "../src/questionDraftCsv.js";

const header = "subject,topic,text,optionA,optionB,optionC,optionD,correctIndex";
const catalog = { Mathematics: ["Algebra", "Trigonometry"], Physics: ["Mechanics"] };

describe("question-draft CSV validation", () => {
  it("accepts four unique options and a valid correct index with existing taxonomy", () => {
    const csv = header + '\nMathematics,Algebra,"What is 2 + 2?",1,2,3,4,3';
    expect(validateQuestionDraftCsv(csv, catalog)).toEqual([]);
  });
  it("rejects missing options and invalid correct indices", () => {
    const csv = header + '\nMathematics,Algebra,"Three options?",a,b,,d,4';
    const issues = validateQuestionDraftCsv(csv, catalog);
    expect(issues.some((issue) => issue.reason.includes("four non-empty options"))).toBe(true);
    expect(issues.some((issue) => issue.reason.includes("correctIndex"))).toBe(true);
  });
  it("rejects duplicate options and duplicate question text", () => {
    const csv = header + '\nMathematics,Algebra,"Duplicate text?",a,b,b,d,0\nMathematics,Algebra," duplicate   text? ",x,y,z,w,1';
    const issues = validateQuestionDraftCsv(csv, catalog);
    expect(issues.filter((issue) => issue.reason.toLowerCase().includes("duplicate")).length).toBeGreaterThanOrEqual(2);
  });
  it("requires subject and topic to already exist", () => {
    const csv = header + '\nBiology,New topic,"Catalog missing?",a,b,c,d,0\nPhysics,Algebra,"Wrong subject topic?",a,b,c,d,0';
    const issues = validateQuestionDraftCsv(csv, catalog);
    expect(issues).toEqual([
      { row: 2, reason: "Subject does not exist in the catalog." },
      { row: 3, reason: "Topic does not exist under the selected subject." },
    ]);
  });
});
