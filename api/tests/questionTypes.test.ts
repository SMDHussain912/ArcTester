import { describe, expect, it } from "vitest";
import { gradeQuestion } from "../src/questionTypes.js";
import { QuestionInputSchema } from "../src/questions.js";
describe("additive question types",()=>{
 it("grades MCQ and true/false with the stored index",()=>{expect(gradeQuestion("mcq",2,{},2)).toBe(true);expect(gradeQuestion("true_false",1,{},0)).toBe(false);});
 it("requires exact multi-select sets",()=>{expect(gradeQuestion("multi_select",0,{correctIndices:[0,2]},[2,0])).toBe(true);expect(gradeQuestion("multi_select",0,{correctIndices:[0,2]},[0,0,2])).toBe(true);expect(gradeQuestion("multi_select",0,{correctIndices:[0,2]},[0])).toBe(false);});
 it("normalizes accepted fill-blank answers",()=>{expect(gradeQuestion("fill_blank",0,{acceptedAnswers:["RAM","Random access memory"]}," random ACCESS memory ")).toBe(true);});
 it("grades numeric tolerance and rejects infinity",()=>{expect(gradeQuestion("numeric",0,{value:3.14,tolerance:0.01},3.145)).toBe(true);expect(gradeQuestion("numeric",0,{value:3.14,tolerance:0.01},Infinity)).toBe(false);});
 it("grades matching index pairs",()=>{expect(gradeQuestion("matching",0,{pairs:[[0,1],[1,0]]},[1,0])).toBe(true);expect(gradeQuestion("matching",0,{pairs:[[0,1],[1,0]]},[0,1])).toBe(false);});
 it("validates new authoring data and keeps legacy MCQ defaults",()=>{const base={subject:"Math",topic:"Algebra",text:"x",options:["a","b","c","d"],correctIndex:0};expect(QuestionInputSchema.parse(base).questionType).toBe("mcq");expect(QuestionInputSchema.safeParse({...base,questionType:"numeric",options:[],answerData:{value:5,tolerance:0.1}}).success).toBe(true);expect(QuestionInputSchema.safeParse({...base,questionType:"matching",options:[],promptData:{left:["a","b"],right:["1","2"]},answerData:{pairs:[[0,1],[1,0]]}}).success).toBe(true);expect(QuestionInputSchema.safeParse({...base,questionType:"numeric",options:[],answerData:{value:"5"}}).success).toBe(false);});
});
