import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {buildApp} from "../src/index.js";
import {signUp,startTestServer,type TestServer} from "./server.js";

describe("study materials API",()=>{
 let server:TestServer;let adminCookie="";let studentCookie="";
 beforeAll(async()=>{server=await startTestServer(buildApp);const admin=await signUp(server.baseUrl,"materials-admin@example.com");adminCookie=admin.cookie;await server.db.user.update({where:{id:admin.userId},data:{role:"ADMIN"}});studentCookie=(await signUp(server.baseUrl,"materials-student@example.com")).cookie;});
 afterAll(async()=>{await server.close();});
 async function call(path:string,method="GET",body?:unknown,cookie=adminCookie){return fetch(server.baseUrl+path,{method,headers:{cookie,...(body===undefined?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
 const resource={title:"Data Structures Unit 1",description:"Arrays and linked lists revision notes.",subject:"Computer Science",topic:"Data Structures",url:"https://example.org/data-structures.pdf"};
 it("keeps links private until publication and returns the URL after publish",async()=>{
  const response=await call("/admin/study-materials","POST",resource);expect(response.status).toBe(201);
  const created=await response.json() as{material:{id:string;status:string;url:string}};
  expect(created.material).toMatchObject({status:"DRAFT",url:resource.url});
  const hidden=await call("/study-materials","GET",undefined,studentCookie);expect((await hidden.json() as{materials:unknown[]}).materials).toHaveLength(0);
  expect((await call("/admin/study-materials/"+created.material.id,"PATCH",{status:"PUBLISHED"})).status).toBe(200);
  const visible=await call("/study-materials","GET",undefined,studentCookie);
  const materials=(await visible.json() as{materials:Array<Record<string,unknown>>}).materials;
  expect(materials).toHaveLength(1);expect(materials[0]).toMatchObject({title:resource.title,url:resource.url});
  expect(materials[0]).not.toHaveProperty("contentBase64");
  expect((await call("/admin/study-materials/"+created.material.id,"DELETE")).status).toBe(200);
 });
 it("accepts an admin file upload, hides it until published, then streams it to students",async()=>{
  const bytes=Buffer.from("%PDF-1.4 ArcTester test pdf");
  const query=new URLSearchParams({title:"PDF Notes",description:"Uploaded file",subject:"Computer Science",topic:"Files",fileName:"notes.pdf"});
  const upload=await fetch(server.baseUrl+"/admin/study-materials/upload?"+query.toString(),{method:"POST",headers:{cookie:adminCookie,"content-type":"application/pdf"},body:bytes});
  expect(upload.status).toBe(201);
  const created=await upload.json() as{material:{id:string;status:string;fileName:string;sizeBytes:number}};
  expect(created.material.status).toBe("DRAFT");
  expect(created.material.fileName).toBe("notes.pdf");
  expect(created.material.sizeBytes).toBe(bytes.length);
  expect((await call("/study-materials","GET",undefined,studentCookie).then(r=>r.json()) as{materials:unknown[]}).materials).toHaveLength(0);
  expect((await call("/admin/study-materials/"+created.material.id,"PATCH",{status:"PUBLISHED"})).status).toBe(200);
  const list=await call("/study-materials","GET",undefined,studentCookie).then(r=>r.json()) as{materials:Array<Record<string,unknown>>};
  expect(list.materials[0]).toMatchObject({title:"PDF Notes",fileName:"notes.pdf"});expect(list.materials[0]).not.toHaveProperty("contentBase64");
  const download=await call("/study-materials/"+created.material.id+"/file","GET",undefined,studentCookie);
  expect(download.status).toBe(200);expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
 });
 it("rejects non-HTTPS and credential-bearing resource links",async()=>{
  expect((await call("/admin/study-materials","POST",{...resource,url:"http://example.org/notes"})).status).toBe(400);
  expect((await call("/admin/study-materials","POST",{...resource,url:"https://user:pass@example.org/notes"})).status).toBe(400);
 });
 it("requires administrator access to create resources",async()=>{expect((await call("/admin/study-materials","POST",resource,studentCookie)).status).toBe(403);});
});
