import { beforeEach,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({compile:vi.fn(),pdf:vi.fn(),error:vi.fn(),busy:vi.fn(),show:vi.fn(),nav:vi.fn(),target:null as null | {projectRoot:string},doc:{projectId:"p",projectRoot:"/paper",files:[{id:"main",relativePath:"main.tex"}],activeFileId:"graph",isCompiling:false,contentGeneration:0}}));
vi.mock("@/stores/document-store",()=>({useDocumentStore:{getState:()=>({...m.doc,setPdfData:m.pdf,setCompileError:m.error,setIsCompiling:m.busy})},getCurrentPdfRootId:()=>"old"}));
vi.mock("@/lib/latex-compiler",()=>({compileLatex:m.compile,resolveCompileTarget:(id:string)=>({rootId:id,targetPath:"main.tex"}),formatCompileError:String}));
vi.mock("@/lib/proof-pdf-links",()=>({useProofPdfNavigation:{getState:()=>({target:m.target}),setState:m.nav}}));
vi.mock("@/stores/preview-store",()=>({usePreviewStore:{getState:()=>({setVisible:m.show})}}));
import { refreshPaperPreview } from "@/lib/refresh-paper-preview";
beforeEach(()=>{vi.clearAllMocks();m.doc.projectId="p";m.doc.isCompiling=false;m.doc.contentGeneration=0;m.target=null;});
it("compiles the paper root while a proof map is selected and updates the right preview",async()=>{
 const bytes=new Uint8Array([37,80,68,70]);m.compile.mockResolvedValue(bytes);
 await refreshPaperPreview("p",()=>true);
 expect(m.compile).toHaveBeenCalledWith("/paper","main.tex");expect(m.pdf).toHaveBeenCalledWith(bytes,"main");
 expect(m.nav).not.toHaveBeenCalled();expect(m.show).toHaveBeenCalledWith(true);
});
it("retains the previous preview and reports compiler failure",async()=>{
 m.compile.mockRejectedValue(new Error("bad TeX"));await refreshPaperPreview("p",()=>true);
 expect(m.error).toHaveBeenCalled();expect(m.pdf).not.toHaveBeenCalled();expect(m.nav).not.toHaveBeenCalled();expect(m.busy).toHaveBeenLastCalledWith(false);
});
it("does not publish into a different project or a newly running turn",async()=>{
 m.compile.mockImplementation(async()=>{m.doc.projectId="other";return new Uint8Array();});
 await refreshPaperPreview("p",()=>true);expect(m.pdf).not.toHaveBeenCalled();expect(m.nav).not.toHaveBeenCalled();
 m.compile.mockClear();m.doc.projectId="p";await refreshPaperPreview("p",()=>false);expect(m.compile).not.toHaveBeenCalled();
});

it("returns from an old linked PDF to the ordinary recompiled preview",async()=>{
 m.target={projectRoot:"/paper"};m.compile.mockResolvedValue(new Uint8Array([37,80,68,70]));
 await refreshPaperPreview("p",()=>true);
 expect(m.pdf).toHaveBeenCalled();expect(m.nav).toHaveBeenCalledExactlyOnceWith({target:null});
});

it("does not publish a compile that predates an intervening editor change",async()=>{
 m.compile.mockImplementation(async()=>{m.doc.contentGeneration++;return new Uint8Array([37]);});
 await refreshPaperPreview("p",()=>true);expect(m.pdf).not.toHaveBeenCalled();expect(m.busy).toHaveBeenLastCalledWith(false);
});
