import { beforeEach,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({send:vi.fn(),open:vi.fn(),refresh:vi.fn(),chat:{isStreaming:false,review:{active:false},error:null},doc:{projectRoot:"D:/论文",files:[{id:"map",relativePath:"working/proof-maps/full-v028.pdf"}]}}));
vi.mock("@/stores/document-store",()=>({useDocumentStore:{getState:()=>({...m.doc,refreshFiles:m.refresh})}}));
vi.mock("@/stores/agent-chat-store",()=>({useAgentChatStore:{getState:()=>({...m.chat,sendPrompt:m.send})}}));
vi.mock("@/lib/project-file-links",()=>({openProjectFile:m.open}));
import { paperEntries,mapsForPaper,proofMapPrompt,generateProofMap,showProofMap } from "@/lib/proof-map-actions";
beforeEach(()=>{vi.clearAllMocks();m.chat.isStreaming=false;m.chat.review.active=false;m.send.mockResolvedValue(undefined);});
it("finds only the designated paper's top-level maps and orders generated versions first",()=>{
 const files=["main.tex","imports/main.tex","releases/v1/main.tex","working/proof-maps/full-v028.pdf","working/proof-maps/dependency-20261016T010203004Z.pdf","working/proof-maps/baselines/old.pdf","other/working/proof-maps/a.pdf"].map(relativePath=>({id:relativePath,relativePath}));
 expect(paperEntries(files).map(f=>f.relativePath)).toEqual(["main.tex"]);
 expect(mapsForPaper(files,"main.tex").map(f=>f.relativePath)).toEqual(["working/proof-maps/dependency-20261016T010203004Z.pdf","working/proof-maps/full-v028.pdf"]);
});
it("builds explicit skill requests for current text and a new preserved version",()=>{
 const p=proofMapPrompt("论文 A/main.tex","route","thm:one","论文 A/working/proof-maps/a.pdf",new Date("2026-10-16T01:02:03.004Z"));
 expect(p).toContain("$draw-proof-map");expect(p).toContain("thm:one");expect(p).toContain("baseline");
 expect(p).toContain("保留人工布局");expect(p).toContain("route-20261016T010203004Z");expect(p).toContain("当前正文");expect(p).toContain("PDF 正文");
 expect(()=>proofMapPrompt("main.tex","route","")).toThrow();
});
it("uses the existing chat and blocks concurrent drawing",async()=>{
 await generateProofMap("main.tex","dependency","");expect(m.send).toHaveBeenCalledOnce();
 m.chat.review.active=true;await expect(generateProofMap("main.tex","dependency","")).rejects.toThrow("等待");expect(m.send).toHaveBeenCalledOnce();
});
it("refreshes and opens the map internally without generating a new graph",async()=>{
 await showProofMap("working/proof-maps/full-v028.pdf");expect(m.refresh).toHaveBeenCalledOnce();expect(m.open).toHaveBeenCalledWith("map");expect(m.send).not.toHaveBeenCalled();
 await expect(showProofMap("missing.pdf")).rejects.toThrow("未找到");
});

it("admits exactly one request before the chat has entered its streaming state",async()=>{
 let finish!:()=>void;m.send.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve}));
 const first=generateProofMap("main.tex","dependency","");
 await expect(generateProofMap("main.tex","route","thm:sum")).rejects.toThrow("等待");
 expect(m.send).toHaveBeenCalledOnce();finish();await first;
});
