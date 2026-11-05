import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect,it,vi } from "vitest";
vi.mock("@/lib/project-file-links",()=>({openProjectLink:vi.fn(),projectUrlTransform:(s:string)=>s}));
import { Message } from "@/components/agent-chat/chat-message";
it("hides reasoning, commands, plans and file operations while keeping the answer",async()=>{
 const el=document.createElement("div");const root=createRoot(el);
 try {
  await act(async()=>root.render(<>{["reasoning","commandExecution","fileChange","plan"].map(type=><Message key={type} item={{id:type,type,text:"internal command text"}}/>)}<Message item={{id:"final",type:"agentMessage",text:"已完成修改"}}/></>));
  expect(el.textContent).toBe("已完成修改");
 }finally{await act(async()=>root.unmount());}
});
