import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({generate:vi.fn(),show:vi.fn(),refresh:vi.fn(),files:[{id:"main",relativePath:"main.tex"},{id:"map",relativePath:"working/proof-maps/full-v028.pdf"}]}));
vi.mock("@/stores/document-store",()=>({useDocumentStore:Object.assign((f:any)=>f({files:m.files,activeFileId:"main"}),{getState:()=>({refreshFiles:m.refresh})})}));
vi.mock("@/stores/agent-chat-store",()=>({useAgentChatStore:(f:any)=>f({review:{active:false},isStreaming:false})}));
vi.mock("@/lib/proof-map-actions",()=>({paperEntries:(files:any)=>files.filter((f:any)=>f.id==="main"),mapsForPaper:(files:any)=>files.filter((f:any)=>f.id==="map"),generateProofMap:m.generate,showProofMap:m.show}));
import { ProofMapControls } from "@/components/workspace/proof-map-controls";
it("only draws after explicit submission; display only opens the selected PDF",async()=>{
 const el=document.createElement("div"),root=createRoot(el);
 try{
  await act(async()=>root.render(<ProofMapControls/>));expect(m.generate).not.toHaveBeenCalled();
  const button=(text:string)=>Array.from(el.querySelectorAll("button")).find(b=>b.textContent===text)!;
  await act(async()=>button("显示证明图").click());expect(m.show).toHaveBeenCalledWith("working/proof-maps/full-v028.pdf");expect(m.generate).not.toHaveBeenCalled();
  await act(async()=>button("生成/更新证明图").click());expect(m.generate).not.toHaveBeenCalled();
  await act(async()=>el.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(m.generate).toHaveBeenCalledWith("main.tex","dependency","","working/proof-maps/full-v028.pdf");
 }finally{await act(async()=>root.unmount());}
});
