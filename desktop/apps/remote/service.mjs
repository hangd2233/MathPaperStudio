import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {sourceMatches} from './network-binding.mjs';
export const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)||value instanceof Uint8Array?value:JSON.stringify(value)).digest('hex');
export function relative(value){
 if(typeof value!=='string'||!value||value.length>512||/[\\:\x00-\x1f]/.test(value)||value.split('/').some(x=>!x||x.startsWith('.')))throw error(400,'无效的项目相对路径');
 return value;
}
const protectedMaterial=p=>/^(attachments|imports|releases|reviews)\//.test(p);
const editable=p=>/\.(tex|bib|sty|cls|bst|md|txt|json|csv)$/i.test(p);
const error=(status,message)=>Object.assign(Error(message),{status});
export function atomicJSON(file,value){const tmp=file+'.'+randomUUID()+'.tmp';const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd)}fs.renameSync(tmp,file);}
export function createPaperService({backend,projects,journal,tokenHashes,origins=[],enableModel=false,legacyWriteEnabled=enableModel,allowedSource,prismRPC,prismEvents,prismReceipt,prismLedgerId,projectSerial}){
 const registry=new Map(projects.map(p=>[p.id,p]));
 const tasks=new Map((fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal,'utf8')):[]).map(t=>[t.id,t]));
 const active=t=>['accepted','running','cancelling'].includes(t.state);
 for(const t of tasks.values())if(active(t)){t.state='interrupted';t.message='Mac 服务重启；原任务未自动重放。';}
 const persist=()=>atomicJSON(journal,[...tasks.values()]);persist();
 const locks=new Map();let draining=false,storageFault=false;
 const commit=()=>{try{persist()}catch(e){storageFault=true;throw e}};
 const serial=projectSerial??localSerial;
 async function localSerial(id,fn){const previous=locks.get(id)??Promise.resolve();const next=previous.catch(()=>{}).then(fn);locks.set(id,next);try{return await next}finally{if(locks.get(id)===next)locks.delete(id)}}
 function idle(id){if(storageFault)throw error(503,'任务日志写入失败；请在 Mac 检查。');if([...tasks.values()].some(t=>t.projectId===id&&(active(t)||t.state==='interrupted')))throw error(423,'项目存在运行中或待核实的任务');}
 async function noReview(id){const r=await backend.call('project_review',{projectId:id});if(r.active||r.changes?.length)throw error(423,'请先审阅并保留或撤销已有变更');}
 async function snapshot(id){
  const p=registry.get(id),listing=await backend.call('project_list',{projectId:id}),files=[];
  const output=p.mainFile.replace(/\.tex$/i,'.pdf');
  for(const entry of listing.files??[]){if(entry.path.split('/').some(x=>x.startsWith('.')))continue;const name=relative(entry.path);if(name===output||/\.(aux|log|out|toc|fls|fdb_latexmk|synctex|gz|bcf|bbl|blg|run\.xml)$/i.test(name))continue;
   if(entry.size>32*1024*1024)throw error(413,'项目单文件超过当前远程快照上限');
   const f=await backend.call('project_read',{projectId:id,path:name});files.push([name,f.revision]);
  }
  files.sort((a,b)=>a[0].localeCompare(b[0]));return {revision:digest(files),files};
 }
 function publicTask(t,owner){if(t.owner!==owner)throw error(404,'未找到此设备的任务');const {owner:_,payload:__,pdf:___,...v}=t;return v;}
 async function execute(t){
  try{
   t.state='running';commit();
   const result=await backend.execute(t,event=>{if(event.type==='started'){t.threadId=event.threadId;t.turnId=event.turnId;}if(event.type==='message')t.output=(t.output+(event.text??'')).slice(-120000);commit();});
   if(!['completed','cancelled','failed'].includes(result.state))throw Error('Unconfirmed terminal status');
   t.state=result.state;t.result=result.result;
   if(t.action==='compile'&&t.state==='completed'){
    t.afterSnapshot=(await snapshot(t.projectId)).revision;
    t.pdfCurrent=t.afterSnapshot===t.expectedSnapshot;
    // Bytes belong to a task-bound receipt; never substitute a later on-disk PDF.
    if(t.pdfCurrent){t.pdf=Array.isArray(t.result)?t.result:null;}else{t.pdf=null;t.state='failed';t.message='源文件在编译期间变化，请刷新并重新编译。';}
    t.result={compiled:t.pdfCurrent};
   }
   commit();
  }catch(e){if(t.action==='compile'&&e.backendRejected){t.state='failed';t.message='TeX 编译失败；请修改论文后重试，现有文件保留。';}else{t.state='interrupted';t.message='执行结果未确认，请检查 Mac 任务日志和变更，勿重复提交。';}try{commit()}catch{}}
 }
 async function dispatch({method,url,headers={},body}){
  if(draining)throw error(503,'服务正在停止');
  const origin=headers.origin;if(origin&&!origins.includes(origin))throw error(403,'来源未获准');
  const m=/^Bearer ([A-Za-z0-9_-]{32,200})$/.exec(headers.authorization??'');
  const owner=m?digest(m[1]):'';
  if(!owner||!tokenHashes().some(h=>/^[a-f0-9]{64}$/.test(h)&&timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(owner,'hex'))))throw error(401,'设备未授权或令牌已撤销');
  const u=new URL(url,'http://local.invalid');const parts=u.pathname.split('/').filter(Boolean);
  if(method==='GET'&&u.pathname==='/health')return {protocol:'mps-paper-v1',modelEnabled:enableModel&&legacyWriteEnabled,prismModelEnabled:enableModel,...(prismRPC?{capabilities:['prism-workbench-v1'],prismLedgerId}: {})};
  if(method==='GET'&&u.pathname==='/projects')return {projects};
  if(parts[0]!=='projects'||!registry.has(parts[1]))throw error(404,'项目未登记');const id=parts[1],op=parts.slice(2).join('/');
  if(method==='POST'&&op==='prism'){if(!prismRPC)throw error(503,'Prism host adapter is not configured');return prismRPC({owner,projectId:id,command:body?.command,args:body?.args});}
  if(method==='GET'&&op==='prism/receipts'){if(!prismReceipt)throw error(503,'Prism recovery unavailable');return prismReceipt(owner,id,null,u.searchParams.get('key'));}
  if(method==='GET'&&/^prism\/receipts\/[a-f0-9-]{36}$/.test(op)){if(!prismReceipt)throw error(503,'Prism receipt recovery unavailable');return prismReceipt(owner,id,op.split('/')[2]);}
  if(method==='GET'&&op==='prism/events'){if(!prismEvents)throw error(503,'Prism events are unavailable');const after=Number(u.searchParams.get('after')??0);if(!Number.isSafeInteger(after)||after<0)throw error(400,'Invalid event cursor');return prismEvents(owner,id,after);}
  if(method==='GET'&&op==='files'){const list=await backend.call('project_list',{projectId:id});return {files:(list.files??[]).filter(x=>!x.path.split('/').some(p=>p.startsWith('.'))),folders:(list.folders??[]).filter(x=>!x.split('/').some(p=>p.startsWith('.')))};}
  if(method==='GET'&&op==='snapshot')return serial(id,()=>snapshot(id));
  if(method==='GET'&&op==='review')return backend.call('project_review',{projectId:id});
  if(method==='POST'&&op==='review')return serial(id,async()=>{
   idle(id);const r=await backend.call('project_review',{projectId:id});
   if(r.active||body.expectedReview!==digest(r))throw error(409,'审阅已变化，请刷新后再决定');
   const file=relative(body.path);if(!r.changes?.some(x=>x.path===file)||typeof body.undo!=='boolean')throw error(400,'请选择当前审阅中的文件');
   await backend.call('project_resolve_review',{projectId:id,path:file,undo:body.undo});return {resolved:true};
  });
  if(method==='GET'&&op==='reference-pdf'){
   const file=relative(u.searchParams.get('path'));if(!/\.pdf$/i.test(file))throw error(403,'请选择项目 PDF 资料');
   const listing=await backend.call('project_list',{projectId:id});const entry=listing.files?.find(x=>x.path===file);
   if(!entry)throw error(404,'PDF 资料不存在');if(entry.size>16*1024*1024)throw error(413,'资料 PDF 超过 16 MiB');
   const f=await backend.call('project_read',{projectId:id,path:file});if(f.bytes.length>16*1024*1024||Buffer.from(f.bytes).subarray(0,5).toString()!=='%PDF-')throw error(400,'无效的 PDF 资料');
   return {bytes:f.bytes,revision:f.revision,path:file,readOnly:true};
  }
  if(op==='file'){
   const file=relative(u.searchParams.get('path'));if(!editable(file))throw error(403,'此文件类型只通过 PDF 或审阅访问');
   if(method==='GET'){
    const f=await backend.call('project_read',{projectId:id,path:file});if(f.bytes.length>2*1024*1024)throw error(413,'文本文件过大');
    return {text:new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(f.bytes)),revision:f.revision};
   }
   if(method==='PUT'&&protectedMaterial(file))throw error(403,'原始资料只读');
   if(method==='PUT')return serial(id,async()=>{
    idle(id);await noReview(id);if(typeof body.text!=='string'||Buffer.byteLength(body.text)>2*1024*1024||typeof body.expectedRevision!=='string')throw error(400,'保存需要文本和原修订');
    const f=await backend.call('project_read',{projectId:id,path:file});if(f.revision!==body.expectedRevision)throw error(409,'Mac 文件已变化；保留本机草稿');
    const revision=await backend.call('project_write',{projectId:id,path:file,bytes:[...Buffer.from(body.text)],expectedRevision:body.expectedRevision});return {revision};
   });
  }
  if(method==='GET'&&op==='tasks'){
   const t=[...tasks.values()].find(t=>t.projectId===id&&t.owner===owner&&t.key===u.searchParams.get('key'));if(!t)throw error(404,'原任务尚未登记');return publicTask(t,owner);
  }
  const match=/^tasks\/([a-f0-9-]{36})(?:\/(pdf|cancel))?$/.exec(op);
  if(match){const t=tasks.get(match[1]);if(!t||t.projectId!==id)throw error(404,'任务不存在');publicTask(t,owner);
   if(method==='GET'&&match[2]==='pdf'){
    if(t.action!=='compile'||t.state!=='completed'||!t.pdf||!t.pdfCurrent)throw error(409,'此任务没有已确认的 PDF');
    const now=await serial(id,()=>snapshot(id));return {bytes:t.pdf,current:now.revision===t.afterSnapshot,snapshot:t.afterSnapshot};
   }
   if(method==='POST'&&match[2]==='cancel')return serial(id,async()=>{
    if(!active(t))return publicTask(t,owner);if(!t.threadId||!t.turnId)throw error(409,'尚未收到可取消的执行标识');
    await backend.cancel(t);t.state='cancelling';commit();return publicTask(t,owner);
   });
   if(method==='GET'&&!match[2]){const v=publicTask(t,owner);delete v.pdf;return v;}
  }
  if(method==='POST'&&op==='tasks')return serial(id,async()=>{
   if(!body||!['compile','write'].includes(body.action)||!/^[\w-]{16,100}$/.test(body.key??'')||!/^[a-f0-9]{64}$/.test(body.expectedSnapshot??''))throw error(400,'任务需要动作、幂等键和快照');
   if(body.action==='compile'&&body.mainFile!==undefined){relative(body.mainFile);if(!body.mainFile.endsWith('.tex'))throw error(400,'Compile target must be TeX');}
   if(body.action==='write'&&(!enableModel||!legacyWriteEnabled||typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>20000))throw error(403,'写作任务未获本机启用或提示词无效');
   const payload=digest(body),existing=[...tasks.values()].find(t=>t.projectId===id&&t.owner===owner&&t.key===body.key);
   if(existing){if(existing.payload!==payload)throw error(409,'同一幂等键的内容不能改变');const v=publicTask(existing,owner);delete v.pdf;return v;}
   idle(id);if(body.action==='write')await noReview(id);else if((await backend.call('project_review',{projectId:id})).active)throw error(423,'任务仍在运行');if((await snapshot(id)).revision!==body.expectedSnapshot)throw error(409,'论文已变化，请刷新后重新确认任务');
   const t={id:randomUUID(),projectId:id,owner,payload,key:body.key,action:body.action,...(body.action==='compile'&&body.mainFile?{mainFile:body.mainFile}:{}),prompt:body.prompt??'',expectedSnapshot:body.expectedSnapshot,state:'accepted',output:'',createdAt:new Date().toISOString()};tasks.set(t.id,t);commit();
   // Journal admission precedes model or compiler execution, independent of HTTP lifetime.
   queueMicrotask(()=>void execute(t));return publicTask(t,owner);
  });
  throw error(404,'不支持的论文接口');
 }
 const server=http.createServer(async(req,res)=>{
  // Like MRC's network-guard: trust the TCP peer, never forwarding headers.
  // Reject before reading a body, CORS preflight or contacting the paper backend.
  if(allowedSource!==undefined&&!sourceMatches(req.socket.remoteAddress,allowedSource)){
   res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store','Connection':'close'});
   res.end(JSON.stringify({error:'仅允许已批准的 NAS 来源'}));return;
  }
  const origin=req.headers.origin;
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin&&origins.includes(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})};
  if(req.method==='OPTIONS'){
   if(!origin||!origins.includes(origin)){res.writeHead(403,headers);res.end('{}');return;}
   res.writeHead(204,{...headers,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, PUT, POST, OPTIONS'});res.end();return;
  }
  try{
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>(req.url?.split('?')[0].endsWith('/prism')?16:3)*1024*1024)throw error(413,'请求过大');chunks.push(chunk)}
   let body;try{body=size?JSON.parse(Buffer.concat(chunks).toString()):undefined}catch{throw error(400,'JSON 无效')}
   const value=await dispatch({method:req.method,url:req.url,headers:req.headers,body});res.writeHead(200,headers);res.end(JSON.stringify(value));
  }catch(e){res.writeHead(e.status??500,headers);res.end(JSON.stringify({error:e.status?e.message:'Mac 执行未完成，请检查本地状态'}));}
 });
 return {server,dispatch,tasks,assertIdle:idle,async close(){draining=true;for(const t of tasks.values())if(active(t)&&t.threadId)try{await backend.cancel(t)}catch{}await backend.close();await new Promise(resolve=>server.listening?server.close(resolve):resolve());}};
}
