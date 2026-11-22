import{fireEvent,render,screen,waitFor}from"@testing-library/react";import{afterEach,beforeEach,describe,expect,it,vi}from"vitest";import StudentMaterials from"./StudentMaterials";import{request}from"./apiClient";vi.mock("./apiClient",()=>({request:vi.fn()}));afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});describe("StudentMaterials",()=>{beforeEach(()=>vi.mocked(request).mockReset());it("opens published HTTPS resources at their original destination",async()=>{vi.mocked(request).mockResolvedValue({materials:[{id:"1",title:"Maths notes",description:"Algebra",subject:"Mathematics",topic:"Algebra",url:"https://example.org/math.pdf",createdAt:"2026-11-18"},{id:"2",title:"Physics notes",description:"Motion",subject:"Physics",topic:"Motion",url:"https://example.org/physics.md",createdAt:"2026-11-18"}]});render(<StudentMaterials setActivePage={vi.fn()}/>);const links=await screen.findAllByRole("link",{name:"Open resource ↗"});expect(links).toHaveLength(2);expect(links[0]).toHaveAttribute("href","https://example.org/math.pdf");expect(links[0]).toHaveAttribute("target","_blank");expect(links[0]).toHaveAttribute("rel","noopener noreferrer");expect(screen.getAllByText("example.org")).toHaveLength(2);});
 it("downloads the complete practice-only package with its question payload",async()=>{
  const pack={schemaVersion:3,practiceOnly:true,exportedAt:"2026-11-22T00:00:00.000Z",total:1,subjects:["Computer Science"],questions:[{id:7,subject:"Computer Science",topic:"Stacks",text:"Which operation removes the top item?",options:["Push","Pop"],difficulty:1}]};
  vi.mocked(request).mockImplementation(async(path)=>path==="/study-materials"?({materials:[]} as never):(pack as never));
  let blob:Blob|null=null;
  const urlApi={createObjectURL:vi.fn((value:Blob)=>{blob=value;return "blob:offline-package"}),revokeObjectURL:vi.fn()};
  vi.stubGlobal("URL",urlApi);
  vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});
  render(<StudentMaterials setActivePage={vi.fn()}/>);
  const downloadButton=await screen.findByRole("button",{name:"Download offline question bank"});
  await waitFor(()=>expect(downloadButton).toBeEnabled());
  fireEvent.click(downloadButton);
  await waitFor(()=>expect(blob).not.toBeNull());
  const exportedText=await new Promise<string>((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result??""));
   reader.onerror=()=>reject(reader.error);
   reader.readAsText(blob as Blob);
  });
  const exported=JSON.parse(exportedText);
  expect(exported).toMatchObject({schemaVersion:3,practiceOnly:true,total:1,subjects:["Computer Science"],questions:pack.questions});
  expect(await screen.findByText(/1 questions across 1 subjects/)).toBeInTheDocument();
 });
});