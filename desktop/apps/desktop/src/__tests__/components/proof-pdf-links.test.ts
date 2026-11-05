vi.mock("@/lib/mupdf/mupdf-client",()=>({getMupdfClient:()=>({openDocument:async()=>1,countPages:async()=>10,getPageSize:async()=>({width:612,height:792}),closeDocument:m.close})}));
vi.mock("@/stores/preview-store",()=>({usePreviewStore:{getState:()=>({setVisible:m.show})}}));
import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({close:vi.fn(),read:vi.fn(),open:vi.fn(),show:vi.fn(),state:{projectRoot:"D:/Paper",files:[{id:"pdf",relativePath:"releases/中文 稿/main.pdf",ref:{projectId:"p",path:"releases/中文 稿/main.pdf"}}]}}));
vi.mock("@/stores/document-store",()=>({useDocumentStore:{getState:()=>m.state}}));
vi.mock("@/lib/project-file-links",()=>({openProjectFile:m.open}));
vi.mock("@/lib/tauri/fs",()=>({readProjectBytes:m.read}));
import { parseProofPdfLink,openProofPdfLink,useProofPdfNavigation } from "@/lib/proof-pdf-links";
const sha="0".repeat(64);
const link=(extra={})=>"prism-pdf://open?"+new URLSearchParams({file:"releases/中文 稿/main.pdf",sha256:sha,page:"5",y:"116",...extra});
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue([37,80,68,70]);vi.stubGlobal("crypto",{subtle:{digest:vi.fn().mockResolvedValue(new Uint8Array(32).buffer)}});useProofPdfNavigation.setState({target:null});});
it("opens the right preview and preserves the active proof-map file",async()=>{
  await openProofPdfLink(link()); expect(m.open).not.toHaveBeenCalled(); expect(m.show).toHaveBeenCalledWith(true);
  expect(useProofPdfNavigation.getState().target).toMatchObject({fileId:"pdf",page:5,y:116});
});
it("rejects changed PDF versions without navigation",async()=>{
  await expect(openProofPdfLink(link({sha256:"1".repeat(64)}))).rejects.toThrow("version changed");expect(m.open).not.toHaveBeenCalled();
});
it("rejects malformed destinations and escaping paths",()=>{
  for(const file of ["../main.pdf","/main.pdf","C:/main.pdf","main.tex"]) expect(()=>parseProofPdfLink(link({file}))).toThrow();
  for(const page of ["0","NaN","1.5"]) expect(()=>parseProofPdfLink(link({page}))).toThrow();
  expect(()=>parseProofPdfLink(link({y:"-1"}))).toThrow();
});

it("repeated clicks carry distinct navigation requests",async()=>{
 await openProofPdfLink(link()); const first=useProofPdfNavigation.getState().target!.requestId;
 await openProofPdfLink(link()); expect(useProofPdfNavigation.getState().target!.requestId).toBe(first+1);
 expect(m.open).not.toHaveBeenCalled();
});

it("rejects destinations outside the actual PDF and releases validation documents",async()=>{
 await expect(openProofPdfLink(link({page:"11"}))).rejects.toThrow("out of range");
 await expect(openProofPdfLink(link({y:"793"}))).rejects.toThrow("out of range");
 expect(m.close).toHaveBeenCalledTimes(2);expect(useProofPdfNavigation.getState().target).toBeNull();
});
