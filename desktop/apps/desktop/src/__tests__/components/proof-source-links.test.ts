import { expect, it, vi } from "vitest";
vi.mock("@/stores/document-store", () => ({ useDocumentStore: { getState: vi.fn() } }));
vi.mock("@/lib/project-file-links", () => ({ openProjectFile: vi.fn() }));
import { sourceTarget } from "@/lib/proof-source-links";
const files = [{id:"a", relativePath:"papers/中文 论文/sections/a.tex", content:"intro\n\\label{thm:one}\nProof text."}];
const link = (params: Record<string,string>) => "prism-source://open?" + new URLSearchParams(params);
it("resolves a portable Unicode path and a stable label after lines move", () => {
  const href=link({file:"中文 论文/sections/a.tex",label:"thm:one"});
  expect(sourceTarget(href,files).offset).toBe(6);
  expect(sourceTarget(href,[{...files[0],content:"new\n"+files[0].content}]).offset).toBe(10);
});
it("resolves an unlabeled proof by exact paragraph anchor", () => {
  expect(sourceTarget(link({file:"sections/a.tex",anchor:"Proof text."}),files).offset).toBe(22);
});
it("rejects ambiguous papers, changed labels and escaping paths", () => {
  const href=link({file:"sections/a.tex",label:"thm:one"});
  expect(()=>sourceTarget(href,[...files,{...files[0],id:"b"}])).toThrow("ambiguous");
  expect(()=>sourceTarget(link({file:"sections/a.tex",label:"missing"}),files)).toThrow("Label");
  for(const path of ["../sections/a.tex","/sections/a.tex","C:/a.tex","sections/a.pdf"]) expect(()=>sourceTarget(link({file:path,label:"thm:one"}),files)).toThrow();
});
