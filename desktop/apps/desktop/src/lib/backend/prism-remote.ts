import type {PrismHostTransport} from './runtime-transport';
import type {UnlistenFn} from '@tauri-apps/api/event';
export type RemoteProject={id:string;name:string;mainFile:string};
export type Request=(path:string,method?:string,body?:unknown)=>Promise<any>;
const scopedCommands=new Set(['prism_sync','project_list','project_read','project_write','project_mutate','project_rename','project_review','project_resolve_review','project_service','manual_operation','planning_operation','codex_sessions','codex_thread','codex_send','codex_control']);
const rootFor=(p:RemoteProject)=>'/mps/projects/'+p.id+'/'+p.name.replace(/[/\\]/g,'_');
/** Remote transport for the formal Prism facade. It never reimplements editor,
 * manual workbench, review/history, project state or Codex business semantics.
 * Server must enforce the same command/project/policy allowlist independently.
 */
export class PrismRemoteTransport implements PrismHostTransport {
 readonly kind='remote-ipad' as const;
 private generation=0;private disconnected=false;private bases=new Map<string,{text:string;revision:string}>();
 private approvals=new Map<string,{projectId:string;review:string}>();
 private reviews=new Map<string,string>();
 private handlers=new Map<string,Set<(event:{payload:any})=>void>>();
 private epochs=new Map<string,string>();private cursors=new Map<string,number>();
 private timer:ReturnType<typeof setInterval>|undefined;
 private pollGeneration=0;private inFlight:number|undefined;private closed=false;
 // iOS can suspend a native HTTP request until after a new connection is ready.
 // Only polling is invalidated by visibility changes; writes are never replayed.
 private invalidatePolling(){this.pollGeneration++;this.inFlight=undefined;}
 private onVisibilityChange=()=>{this.invalidatePolling();if(!document.hidden)void this.poll();};
 private stopPolling(){if(this.timer)clearInterval(this.timer);this.timer=undefined;document.removeEventListener('visibilitychange',this.onVisibilityChange);window.removeEventListener('pageshow',this.onVisibilityChange);this.invalidatePolling();}
 constructor(private requester:Request,readonly projects:RemoteProject[],public ledgerId?:string){if(!projects.length)throw Error('No registered Prism project copies');}
 private async request(path:string,method?:string,body?:unknown){const generation=this.generation,result=await this.requester(path,method,body);if(generation!==this.generation)throw Error('连接已更新，先核对原请求状态；不要重复提交');return result;}
 rebind(requester:Request,projects:RemoteProject[],ledgerId?:string){if(JSON.stringify(projects.map(p=>p.id).sort())!==JSON.stringify(this.projects.map(p=>p.id).sort()))throw Error('新入口的登记项目不符');this.generation++;this.requester=requester;this.ledgerId=ledgerId;this.invalidatePolling();for(const project of this.projects)this.emit('project-review',{projectId:project.id});if(this.timer)void this.poll();}
 private draftKey(projectId:string,path:string){return 'mps-draft-v1:'+JSON.stringify(['prism-native-workspace-v1',projectId,path]);}
 persistDraft(ref:{projectId:string;path:string},text:string){
  if(!this.projects.some(p=>p.id===ref.projectId))throw Error('草稿项目未登记');const key=this.draftKey(ref.projectId,ref.path),old=localStorage.getItem(key),previous=old?JSON.parse(old):null,base=this.bases.get(ref.projectId+':'+ref.path);
  const record={...previous,text,baseText:previous?.baseText??base?.text??'',baseRevision:previous?.baseRevision??base?.revision??null,dirty:true,saveState:previous?.saveState??'local',updatedAt:Date.now()};
  try{localStorage.setItem(key,JSON.stringify(record));}catch{throw Error('本机草稿存储失败；保存已暂停，请保留界面并导出文字');}
  window.dispatchEvent(new Event('prism-local-drafts-changed'));
 }
 project(root:string){const p=this.projects.find(p=>rootFor(p)===root);if(!p)throw Error('Only explicitly registered Prism project roots are available');return {...p,root:rootFor(p)};}
 file(path:string){const p=this.projects.find(p=>path.startsWith(rootFor(p)+'/'));if(!p)throw Error('File is outside the registered Prism workspace');const relative=path.slice(rootFor(p).length+1);if(!relative||relative.split('/').some(x=>!x||x.startsWith('.'))||/[\\:\x00-\x1f]/.test(relative))throw Error('Invalid project file reference');return {projectId:p.id,path:relative};}
 async invoke<T>(command:string,args:Record<string,unknown>={}):Promise<T>{
  if(this.closed)throw Error('Prism connection has been disconnected');
  if(command==='list_default_projects')return this.projects.map(p=>({path:rootFor(p),name:p.name,last_modified:0,has_main_tex:true})) as T;
  if(command==='project_register')return this.project(String(args.root)) as T;
  if(command==='allow_project_directory'){this.project(String(args.rootPath));return undefined as T;}
  if(command==='set_native_window_theme'||command==='js_log')return undefined as T;
  let id=String(args.projectId??'');
  if(command==='codex_status')id=this.projects[0].id;
  if(command==='codex_respond'){const request=this.approvals.get(String(args.id));if(!request)throw Error('请求已过期，请刷新 Prism 原任务');id=request.projectId;args={...args,expectedRequest:request.review};}
  if(!this.projects.some(p=>p.id===id))throw Error('Operation is outside the registered Prism project scope');
  if(!scopedCommands.has(command)&&command!=='codex_status'&&command!=='codex_respond')throw Error('This host capability requires Mac-side setup: '+command);
  // Agent mutations remain unavailable until the durable gateway admission
  // contract is wired; generic RPC must never admit an untracked model turn.
  if(command==='project_service'&&args.operation==='compile_latex')return await this.compile(id,args.args as Record<string,unknown>) as T;
  if((command==='manual_operation'||command==='planning_operation')&&['start','startThemes','startOutline','startMacros'].includes(String(args.action)))return await this.nativeModelOperation(id,command,args) as T;
  if(command==='codex_send')return await this.sendAgent(id,args) as T;
  const data={...args};delete data.projectId;if(command==='project_resolve_review'){const revision=this.reviews.get(id);if(!revision)throw Error('Refresh the original Prism comparison before deciding');data.expectedReview=revision;}
  let sentText:string|undefined;const draftKey=typeof args.path==='string'?this.draftKey(id,args.path):'';
  if(command==='project_write'&&/\.(tex|bib|sty|cls|bst|md|txt|json|csv)$/i.test(String(args.path))){sentText=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(args.bytes as number[]));if(!localStorage.getItem(draftKey))this.persistDraft({projectId:id,path:String(args.path)},sentText);}
  let result:any;try{result=await this.request('/projects/'+encodeURIComponent(id)+'/prism','POST',{command,args:data});}catch(error:any){let acknowledged=false;if(command==='project_write'&&error.status!==401&&error.status!==403){try{const current=await this.request('/projects/'+encodeURIComponent(id)+'/prism','POST',{command:'project_read',args:{path:args.path}});if(JSON.stringify(current.bytes)===JSON.stringify(args.bytes)){result=current.revision;acknowledged=true;}}catch{}}if(!acknowledged){if(sentText!==undefined){const saved=localStorage.getItem(draftKey);if(saved){const record=JSON.parse(saved);record.saveState='uncertain';try{localStorage.setItem(draftKey,JSON.stringify(record));}catch{}window.dispatchEvent(new Event('prism-local-drafts-changed'));}}throw error;}}
  if(command==='project_read'&&result.bytes&&typeof args.path==='string'){try{this.bases.set(id+':'+args.path,{text:new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(result.bytes)),revision:result.revision});}catch{}}
  if(command==='project_write'&&sentText!==undefined){this.bases.set(id+':'+args.path,{text:sentText,revision:result});const raw=localStorage.getItem(draftKey);if(raw){const record=JSON.parse(raw);if(record.text===sentText)localStorage.removeItem(draftKey);else{record.baseText=sentText;record.baseRevision=result;localStorage.setItem(draftKey,JSON.stringify(record));}window.dispatchEvent(new Event('prism-local-drafts-changed'));}}
  if(command==='project_review'&&result.remoteRevision)this.reviews.set(id,result.remoteRevision);return result as T;
 }
 private async compile(id:string,args:Record<string,unknown>){
  const mainFile=String(args?.mainFile??this.projects.find(p=>p.id===id)?.mainFile),key='prism-ipad-compile-v1:'+id,base='/projects/'+encodeURIComponent(id);
  const raw=localStorage.getItem(key);let pending=raw?JSON.parse(raw):null;
  if(pending&&pending.mainFile!==mainFile)throw Error('先恢复原编译任务，再切换编译主文件');
  if(!pending){const snapshot=await this.request(base+'/snapshot');pending={key:crypto.randomUUID(),action:'compile',mainFile,expectedSnapshot:snapshot.revision};localStorage.setItem(key,JSON.stringify(pending));}
  let task;
  try{task=await this.request(base+(pending.id?'/tasks/'+pending.id:'/tasks?key='+encodeURIComponent(pending.key)));}
  catch(error:any){if(error.status!==404)throw error;const {key:requestKey,action,mainFile,expectedSnapshot}=pending;task=await this.request(base+'/tasks','POST',{key:requestKey,action,mainFile,expectedSnapshot});}
  pending.id=task.id;localStorage.setItem(key,JSON.stringify(pending));const deadline=Date.now()+120000;
  while(['accepted','running','cancelling'].includes(task.state)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,1000));task=await this.request(base+'/tasks/'+task.id);}
  if(task.state!=='completed'){if(['failed','cancelled','reconciled'].includes(task.state))localStorage.removeItem(key);throw Error(task.message??'原编译结果待确认；再次编译将恢复原任务，不重复提交');}
  const result=await this.request(base+'/tasks/'+task.id+'/pdf');localStorage.removeItem(key);if(!result.current)throw Error('编译期间源文件已变化，请保存并重新编译');return result.bytes;
 }
 private async existingReceipt(id:string,pending:any){if(pending.ledgerId!==this.ledgerId)throw Error('Mac 写作账本已变化；先核验原任务，不重复提交');try{return await this.request('/projects/'+encodeURIComponent(id)+'/prism/receipts'+(pending.receiptId?'/'+pending.receiptId:'?key='+encodeURIComponent(pending.key)));}catch(error:any){if(error.status===404)return null;throw error;}}
 private async nativeModelOperation(id:string,command:string,args:Record<string,unknown>){
  if(!this.ledgerId)throw Error('Mac 未确认持久写作账本');const raw=JSON.stringify({command,args}),bytes=new TextEncoder().encode(raw),fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join(''),key='prism-ipad-native-operation-v1:'+id;
  const stored=localStorage.getItem(key);let pending=stored?JSON.parse(stored):null;if(pending){const old=await this.existingReceipt(id,pending);if(old&&['completed','failed','interrupted','cancelled'].includes(old.state)){localStorage.removeItem(key);pending=null;}}
  if(pending&&pending.fingerprint!==fingerprint)throw Error('原审查/规划任务尚未确认；请先查看其历史');if(!pending){pending={key:crypto.randomUUID(),fingerprint,ledgerId:this.ledgerId};localStorage.setItem(key,JSON.stringify(pending));}
  const response=await this.request('/projects/'+encodeURIComponent(id)+'/prism','POST',{command,args:{...args,key:pending.key}});localStorage.setItem(key,JSON.stringify({...pending,receiptId:response.receipt.id}));if(['completed','failed','interrupted','cancelled'].includes(response.receipt.state))localStorage.removeItem(key);return response.result;
 }
 private pendingKey(id:string){return 'prism-ipad-agent-admission-v1:'+id;}
 private async sendAgent(id:string,args:Record<string,unknown>){
  if(!this.ledgerId)throw Error('Mac 未确认持久写作账本');
  const payload=JSON.stringify(args),bytes=new TextEncoder().encode(payload),fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const key=this.pendingKey(id),raw=localStorage.getItem(key);let pending=raw?JSON.parse(raw):null;
  if(pending){const receipt=await this.existingReceipt(id,pending);if(receipt&&['completed','failed','interrupted','cancelled'].includes(receipt.state)){localStorage.removeItem(key);pending=null;}}
  if(pending&&pending.fingerprint!==fingerprint)throw Error('原 Prism 写作任务尚未确认；先恢复原任务，不重复提交');
  if(!pending){pending={key:crypto.randomUUID(),fingerprint,ledgerId:this.ledgerId};localStorage.setItem(key,JSON.stringify(pending));}
  const receipt=await this.request('/projects/'+encodeURIComponent(id)+'/prism','POST',{command:'codex_send',args:{...args,key:pending.key}});
  localStorage.setItem(key,JSON.stringify({...pending,receiptId:receipt.id,threadId:receipt.threadId,turnId:receipt.turnId}));
  if(!receipt.threadId||!receipt.turnId||receipt.state==='uncertain')throw Error('原 Prism 任务结果未确认；已保存查询凭据，请勿再次新建任务');
  if(['completed','failed','interrupted'].includes(receipt.state)){localStorage.removeItem(key);setTimeout(()=>this.emit('codex-event',{method:'turn/completed',params:{threadId:receipt.threadId,turn:{id:receipt.turnId,status:receipt.state}}}),0);}
  return {threadId:receipt.threadId,turn:{id:receipt.turnId},receiptId:receipt.id};
 }
 async listen<T>(event:string,handler:(event:{payload:T})=>void):Promise<UnlistenFn>{
  const set=this.handlers.get(event)??new Set();set.add(handler);this.handlers.set(event,set);
  if(!this.timer){
   this.timer=setInterval(()=>void this.poll(),1000);
   document.addEventListener('visibilitychange',this.onVisibilityChange);
   window.addEventListener('pageshow',this.onVisibilityChange);
  }
  return ()=>{set.delete(handler);if([...this.handlers.values()].every(s=>!s.size))this.stopPolling();};
 }
 private emit(name:string,payload:unknown){for(const fn of this.handlers.get(name)??[])fn({payload});}
 private async poll(){
  if(this.closed||this.inFlight!==undefined||document.hidden)return;
  const generation=this.pollGeneration;
  const current=()=>!this.closed&&!document.hidden&&generation===this.pollGeneration;
  this.inFlight=generation;
  try{
   for(const p of this.projects){
    const data=await this.request('/projects/'+encodeURIComponent(p.id)+'/prism/events?after='+(this.cursors.get(p.id)??0));
    if(!current())return;
    const previous=this.epochs.get(p.id);
    if(previous&&previous!==data.epoch){
     this.emit('remote-host-restarted',{projectId:p.id});
     this.emit('codex-event',{method:'connection/closed',params:{reason:'remote-host-restarted'}});
     this.emit('project-review',{projectId:p.id});
     if(!current())return;
     this.cursors.set(p.id,0);
    }
    this.epochs.set(p.id,data.epoch);
    for(const event of data.events??[]){
     if(!current())return;
     if(event.id<=(this.cursors.get(p.id)??0))continue;
     if(event.name==='codex-event'&&event.payload?.id!==undefined&&event.payload.remoteRequestReview)this.approvals.set(String(event.payload.id),{projectId:p.id,review:event.payload.remoteRequestReview});
     this.emit(event.name,event.payload);
     if(!current())return;
     if(event.name==='codex-event'&&event.payload?.method==='turn/completed'){
      const raw=localStorage.getItem(this.pendingKey(p.id));
      if(raw){const pending=JSON.parse(raw);if(pending.threadId===event.payload.params?.threadId&&pending.turnId===event.payload.params?.turn?.id)localStorage.removeItem(this.pendingKey(p.id));}
     }
     this.cursors.set(p.id,event.id);
    }
   }
   // Receiving even an empty event batch proves this transport has recovered.
   // It does not prove the Codex process (or a failed turn) has recovered.
   if(current()&&this.disconnected){
    this.disconnected=false;
    this.emit('codex-event',{method:'connection/restored',params:{reason:'remote-connection-restored'}});
   }
  }catch{
   if(!current())return;
   if(!this.disconnected)this.emit('codex-event',{method:'connection/interrupted',params:{reason:'remote-connection-interrupted'}});
   this.disconnected=true;
   this.emit('remote-connection-interrupted',{});
  }finally{
   // A late request must not unlock a newer poll started after resume/rebind.
   if(this.inFlight===generation)this.inFlight=undefined;
  }
 }
 close(){this.closed=true;this.stopPolling();this.handlers.clear();}
}
