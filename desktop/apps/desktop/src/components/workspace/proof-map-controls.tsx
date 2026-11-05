import { useState } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useAgentChatStore } from "@/stores/agent-chat-store";
import { Button } from "@/components/ui/button";
import { paperEntries, mapsForPaper, generateProofMap, showProofMap } from "@/lib/proof-map-actions";

export function ProofMapControls() {
  const files = useDocumentStore(s => s.files);
  const activeFileId = useDocumentStore(s => s.activeFileId);
  const active = useAgentChatStore(s => s.review.active);
  const streaming = useAgentChatStore(s => s.isStreaming);
  const [expanded,setExpanded] = useState(false);
  const [mainChoice,setMain] = useState("");
  const [mapChoice,setMap] = useState("");
  const [mode,setMode] = useState<"dependency"|"route">("dependency");
  const [theorem,setTheorem] = useState("");
  const [submitting,setSubmitting] = useState(false);
  const [error,setError] = useState("");
  const papers = paperEntries(files);
  const activePath = files.find(f=>f.id===activeFileId)?.relativePath ?? "";
  const activePaper = [...papers].sort((a,b)=>b.relativePath.length-a.relativePath.length).find(f=>activePath.startsWith(f.relativePath.slice(0,-"main.tex".length)));
  const main = papers.find(f => f.relativePath === mainChoice)?.relativePath ?? activePaper?.relativePath ?? papers[0]?.relativePath ?? "";
  const maps = main ? mapsForPaper(files,main) : [];
  const selected = maps.find(f => f.relativePath === mapChoice)?.relativePath ?? maps[0]?.relativePath ?? "";
  const busy = active || streaming || submitting;
  async function show() {
    setError("");
    try { await showProofMap(selected); } catch(e) { setError(String(e)); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSubmitting(true);
    try { await generateProofMap(main,mode,theorem,selected || undefined); setMap(""); setExpanded(false); }
    catch(e) { setError(String(e)); }
    finally { setSubmitting(false); }
  }
  return <div className="shrink-0 border-b bg-background px-2 py-1 text-xs" aria-label="证明图工具">
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy || !main}
        aria-expanded={expanded} title="调用 draw-proof-map；论文更新后可再次生成新版本"
        onClick={() => {setExpanded(!expanded);setError("");}}>{maps.length ? "生成/更新证明图" : "生成证明图"}</Button>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!selected} onClick={show}
        title={selected || "尚无证明图，请先生成"}>显示证明图</Button>
      {maps.length > 0 && <select aria-label="选择证明图" className="h-7 min-w-0 max-w-52 rounded border bg-background" value={selected} onChange={e=>setMap(e.target.value)}>
        {maps.map(f=><option key={f.id} value={f.relativePath}>{f.relativePath.split("/").pop()}</option>)}
      </select>}
      <button className="px-1 underline" title="刷新证明图列表" aria-label="刷新证明图列表" onClick={()=>{void useDocumentStore.getState().refreshFiles().catch(e=>setError(String(e)));}}>刷新</button>
    </div>
    {expanded && <form onSubmit={submit} className="my-2 grid gap-2">
      <label>论文 <select aria-label="选择论文" className="w-full rounded border bg-background p-1" value={main} onChange={e=>{setMain(e.target.value);setMap("");}}>
        {papers.map(f=><option key={f.id} value={f.relativePath}>{f.relativePath}</option>)}
      </select></label>
      <label>图类型 <select aria-label="证明图类型" className="rounded border bg-background p-1" value={mode} onChange={e=>setMode(e.target.value as "dependency"|"route")}>
        <option value="dependency">全文依赖图</option><option value="route">单定理路线图</option>
      </select></label>
      {mode==="route" && <input aria-label="定理编号或 label" placeholder="例如 Theorem 1.1 或 thm:uniform" value={theorem} onChange={e=>setTheorem(e.target.value)} required className="rounded border bg-background p-1"/>}
      <p className="text-muted-foreground">{selected ? "参考所选图更新，保留布局和旧版本。" : "读取当前正文并绘制新图。"} 论文更新后可再次生成；使用当前 Codex 会话。</p>
      <Button type="submit" size="sm" className="justify-self-start" disabled={busy || !main || (mode==="route" && !theorem.trim())}>开始生成新版本</Button>
    </form>}
    {error && <p role="alert" className="py-1 text-destructive">{error}</p>}
    {!main && <p className="text-muted-foreground">打开包含 main.tex 的论文项目后可生成证明图。</p>}
  </div>;
}
