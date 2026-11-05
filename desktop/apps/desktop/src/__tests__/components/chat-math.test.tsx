import { renderToStaticMarkup } from "react-dom/server";
import { expect,it,vi } from "vitest";
vi.mock("@/lib/project-file-links",()=>({openProjectLink:vi.fn(),projectUrlTransform:(s:string)=>s}));
import { normalizeChatMath } from "@/lib/chat-math";
import { Message } from "@/components/agent-chat/chat-message";
it("renders TeX parenthesis, bracket and dollar math as KaTeX",()=>{
 const text=String.raw`映射 \(A\in\operatorname{GL}_2(\mathbb C)\) 与 $x^2$。
\[\mathcal S \longmapsto A_t\]`;
 const html=renderToStaticMarkup(<Message item={{id:"a",type:"agentMessage",text}}/>);
 expect((html.match(/class="katex"/g)??[]).length).toBe(3);
 expect(html).toContain("katex-display");expect(html).not.toContain("katex-error");
});
it("preserves literal LaTeX in code and already supported dollar delimiters",()=>{
 for(const text of [String.raw`\`\(x\)\``,"```tex\n\\[x\\]\n```","~~~tex\n\\(x\\)\n~~~","$x$ and $$y$$"]) {
  expect(normalizeChatMath(text)).toBe(text);
 }
});
