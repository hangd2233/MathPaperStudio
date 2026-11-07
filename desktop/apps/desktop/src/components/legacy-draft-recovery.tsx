import {useState,useEffect} from 'react';import {backend} from '@/lib/backend';import {FileReview} from '@/components/agent-chat/proposed-changes-panel';import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
type Draft={key:string;projectId:string;path:string;text:string;baseText:string;};
function readDrafts(includeSaving=true){const result:Draft[]=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith('mps-draft-v1:'))continue;try{const [,projectId,path]=JSON.parse(key.slice('mps-draft-v1:'.length)),d=JSON.parse(localStorage.getItem(key)!);if(typeof d.text==='string'&&typeof d.baseText==='string'&&(d.dirty===true||d.text!==d.baseText)&&(includeSaving||d.saveState==='uncertain'||d.saveState===undefined))result.push({key,projectId,path,text:d.text,baseText:d.baseText});}catch{}}return result;}
/** Preserve older app drafts. Recovery creates a NEW registered project file;
 * it never silently writes a draft over the Mac's current file or deletes storage.
 */
export function LegacyDraftRecovery({projectIds}:{projectIds:string[]}){
 const [drafts,setDrafts]=useState(()=>readDrafts()),[open,setOpen]=useState(drafts.length>0),[expanded,setExpanded]=useState<string|null>(drafts[0]?.key??null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{const refresh=()=>setDrafts(readDrafts(false));window.addEventListener('prism-local-drafts-changed',refresh);return()=>window.removeEventListener('prism-local-drafts-changed',refresh)},[]);
 async function recover(d:Draft){setBusy(true);setMessage('');try{
  if(!projectIds.includes(d.projectId))throw Error('This draft belongs to a project not registered with the selected Mac');
  const marker='prism-draft-recovery-v1:'+d.key,old=localStorage.getItem(marker);const safe=d.path.split('/').pop()!.replace(/[^A-Za-z0-9_.-]/g,'_');
  const intent=old?JSON.parse(old):{path:'recovered-drafts/'+crypto.randomUUID()+'-'+safe};localStorage.setItem(marker,JSON.stringify(intent));const ref={projectId:d.projectId,path:intent.path};
  const list=await backend.files.list(d.projectId);if(list.files.some(f=>f.path===intent.path)){const f=await backend.files.read(ref);if(new TextDecoder().decode(Uint8Array.from(f.bytes))!==d.text)throw Error('恢复稿已出现新修改，保留两份文字，不覆盖');}
  else await backend.files.write(ref,[...new TextEncoder().encode(d.text)],null);
  setMessage('已保存恢复稿：'+intent.path+'；旧记录仍保留，可在 Prism 文件树中打开并合并。');
 }catch(e){setMessage(String(e));}finally{setBusy(false)}}
 if(!drafts.length)return null;
 return <><button className="fixed right-3 top-3 z-[10000] rounded border bg-background p-2 text-xs" onClick={()=>setOpen(true)}>待恢复草稿 {drafts.length}</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] max-w-3xl overflow-auto"><DialogHeader><DialogTitle>保留旧版未保存草稿</DialogTitle><DialogDescription>旧草稿没有覆盖当前论文。可另存为恢复稿，再在 Prism 中比较合并；旧记录不会被删除。</DialogDescription></DialogHeader>{drafts.map(d=><section key={d.key}><FileReview change={{path:d.path,kind:'modified',binary:false,oldContent:d.baseText,newContent:d.text}} expanded={expanded===d.key} toggle={()=>setExpanded(s=>s===d.key?null:d.key)} disabled={busy} pending={false} decide={async()=>{}} showActions={false}/><button disabled={busy||!projectIds.includes(d.projectId)} onClick={()=>void recover(d)}>另存到此论文的 recovered-drafts</button></section>)}<p role="status">{message}</p><button onClick={()=>setOpen(false)}>保留记录，稍后处理</button></DialogContent></Dialog></>;
}
