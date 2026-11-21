export const QUESTION_TYPES = ["mcq","multi_select","true_false","fill_blank","numeric","matching"] as const;
export type QuestionType = typeof QUESTION_TYPES[number];
export type AnswerData = Record<string, unknown>;
export function gradeQuestion(type:QuestionType,correctIndex:number,data:AnswerData,response:unknown):boolean{
 if(response===null||response===undefined)return false;
 if(type==="mcq"||type==="true_false")return typeof response==="number"&&Number.isInteger(response)&&response===correctIndex;
 if(type==="multi_select"){if(!Array.isArray(response)||!Array.isArray(data.correctIndices))return false;const n=(a:unknown[])=>[...new Set(a)].sort((x,y)=>Number(x)-Number(y)).join(",");return response.every(x=>Number.isInteger(x)&&Number(x)>=0&&Number(x)<4)&&n(response)===n(data.correctIndices);}
 if(type==="fill_blank"){if(typeof response!=="string"||!Array.isArray(data.acceptedAnswers))return false;const n=(s:string)=>data.caseSensitive===true?s.trim():s.trim().toLowerCase();return data.acceptedAnswers.some(x=>typeof x==="string"&&n(x)===n(response));}
 if(type==="numeric"){if(typeof response!=="number"||!Number.isFinite(response)||typeof data.value!=="number"||!Number.isFinite(data.value))return false;const t=typeof data.tolerance==="number"&&Number.isFinite(data.tolerance)&&data.tolerance>=0?data.tolerance:0;return Math.abs(response-data.value)<=t;}
 if(type==="matching"){if(!Array.isArray(response)||!Array.isArray(data.pairs))return false;const n=(a:unknown[])=>a.map(p=>Array.isArray(p)?p.join(":"):"").sort().join("|");return n(data.pairs)===n(response.map((right,left)=>[left,right]));}
 return false;
}
