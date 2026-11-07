import {useAgentChatStore} from '@/stores/agent-chat-store';
import {useDocumentStore} from '@/stores/document-store';
import {useEffect,useRef,useState} from 'react';import {App} from '@/App';
import {LegacyDraftRecovery} from './legacy-draft-recovery';import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {installPrismTransport} from '@/lib/backend/runtime-transport';import {IpadConnection,ipadVault} from '@/lib/backend/ipad-rest-connection';import {installPrismDraftObserver} from '@/lib/backend/prism-draft-observer';import type {PrismRemoteTransport} from '@/lib/backend/prism-remote';
/** Connection-only gate. Port replacement keeps the actual Prism App/store mounted. */
export function PrismIpadConnection(){
 const [address,setAddress]=useState(()=>{try{return JSON.parse(localStorage.getItem('mps-connection-v1')??'{}').address??''}catch{return ''}}),[token,setToken]=useState(''),[sameCard,setSameCard]=useState(false),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[settings,setSettings]=useState(false),[error,setError]=useState(''),[projectIds,setProjectIds]=useState<string[]>([]),[warning,setWarning]=useState('');
 const transport=useRef<PrismRemoteTransport|null>(null),connection=useRef<IpadConnection|null>(null),cleanup=useRef<(()=>void)|null>(null);
 useEffect(()=>{const draftError=(e:Event)=>setWarning((e as CustomEvent).detail);window.addEventListener('prism-local-draft-error',draftError);return()=>window.removeEventListener('prism-local-draft-error',draftError)},[]);
 async function connect(saved:boolean){setBusy(true);setError('');try{
  const previous=JSON.parse(localStorage.getItem('mps-connection-v1')??'{}'),clean=new URL(address).origin;
  if(saved&&clean!==previous.address&&!sameCard)throw Error('请确认新地址来自同一 MPS 节点小宝卡片');
  await new IpadConnection(address,'').probe();
  const credential=saved?await ipadVault.load():token;if(!credential)throw Error('没有已保存设备令牌');const next=new IpadConnection(address,credential),candidate=await next.connect();
  if(saved&&previous.projectIds?.length&&JSON.stringify(previous.projectIds.slice().sort())!==JSON.stringify(next.projects.map(p=>p.id).sort()))throw Error('新入口的登记项目不符，未替换连接');
  if(transport.current){transport.current.rebind(next.request,next.projects,candidate.ledgerId);candidate.close();connection.current?.close();await useDocumentStore.getState().refreshFiles();}
  else{installPrismTransport(candidate);useAgentChatStore.setState({selectedModel:'gpt-6.1-sol',effortLevel:'medium'});transport.current=candidate;cleanup.current=installPrismDraftObserver(candidate);}
  connection.current=next;if(saved)localStorage.setItem('mps-connection-v1',JSON.stringify({address:clean,projectIds:next.projects.map(p=>p.id)}));
  setProjectIds(next.projects.map(p=>p.id));setToken('');setReady(true);setSettings(false);setSameCard(false);setWarning('');
 }catch(e){setError(String(e));}finally{setBusy(false)}}
 const restored=useRef(false);useEffect(()=>{if(!restored.current&&address){restored.current=true;void connect(true);}},[]);
 const form=<div className="flex flex-col gap-4"><p>在此 iPad 的节点小宝中打开同一 MPS 卡片，填写本机代理地址。端口变化后恢复连接，Prism 编辑状态和原任务不重置。</p><label>节点小宝本机代理地址<input className="mt-2 w-full rounded border p-3" value={address} onChange={e=>setAddress(e.target.value)} autoCapitalize="none" autoCorrect="off"/></label><label>本次设备令牌（已配对可留空）<input className="mt-2 w-full rounded border p-3" type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off"/></label><label><input type="checkbox" checked={sameCard} onChange={e=>setSameCard(e.target.checked)}/> 新地址来自同一 MPS 节点小宝卡片</label><button className="rounded border p-3" disabled={busy} onClick={()=>void connect(true)}>恢复 Keychain 连接</button><button className="rounded border p-3" disabled={busy} onClick={()=>void connect(false)}>使用本次令牌连接</button><p role="status">{error}</p></div>;
 if(!ready)return <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-8"><h1 className="text-2xl font-semibold">MPS · Prism iPad</h1>{form}</main>;
 return <><App/><LegacyDraftRecovery projectIds={projectIds}/><button className="fixed bottom-3 right-3 z-[9997] rounded border bg-background px-3 py-2 text-xs" onClick={()=>setSettings(true)}>节点小宝连接</button>{warning&&<p role="alert" className="fixed bottom-14 right-3 z-[9997] max-w-md rounded border bg-background p-3 text-sm">{warning}</p>}<Dialog open={settings} onOpenChange={setSettings}><DialogContent><DialogHeader><DialogTitle>更新节点小宝入口</DialogTitle></DialogHeader>{form}</DialogContent></Dialog></>;
}
