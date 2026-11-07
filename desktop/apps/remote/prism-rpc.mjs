import {createHash} from 'node:crypto';
const fingerprint=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const refusal=message=>{throw Object.assign(Error(message),{status:403})};
const relative=p=>{if(typeof p!=='string'||!p||p.length>512||/[\\:\x00-\x1f]/.test(p)||p.split('/').some(s=>!s||s.startsWith('.')))refusal('Invalid relative Prism file reference');return p;};
const protectedPath=p=>['attachments','imports','reviews','releases'].some(s=>p===s||p.startsWith(s+'/'));
const services=new Set(['compile_latex','load_existing_pdf','synctex_edit','history_init','history_snapshot','history_list','history_diff','history_file_at','history_restore','history_add_label','history_remove_label']);
/** Mounted behind existing MPS device authentication, owner binding, exact CORS
 * and registered-project routing. No arbitrary RPC, filesystem root, executable,
 * account login or environment installation is accepted from the iPad.
 */
export function createPrismRPC({core,projects,gateway,admitCompile,serial,beforeMutation=()=>{},sync}){
 const registered=new Set(projects);
 return async({owner,projectId,command,args={}})=>{
  if(!owner||!registered.has(projectId))refusal('Project is not registered for this device');
  const data={...args,projectId};
  switch(command){
   case 'prism_sync':if(!sync)refusal('Original mapping/synchronization is not configured');return sync({owner,projectId,action:args.action,args:args.args});
   case 'project_list':return core.call(command,{projectId});
   case 'project_read':{
    relative(args.path);const listing=await core.call('project_list',{projectId}),entry=listing.files?.find(f=>f.path===args.path);if(!entry)throw Object.assign(Error('File not found'),{status:404});if(entry.size>16*1024*1024)refusal('File exceeds remote reading limit');return core.call(command,data);
   }
   case 'project_write':{
    beforeMutation(projectId);
    relative(args.path);if(protectedPath(args.path))refusal('Imported materials are read-only');if(!Array.isArray(args.bytes)||args.bytes.length>2*1024*1024||args.bytes.some(b=>!Number.isInteger(b)||b<0||b>255))refusal('Invalid bounded file bytes');
    if(args.expectedRevision!==null&&typeof args.expectedRevision!=='string')refusal('Revision-checked write required');return serial(projectId,()=>{beforeMutation(projectId);return core.call(command,data);});
   }
   case 'project_mutate':{
    beforeMutation(projectId);
    relative(args.path);if(protectedPath(args.path))refusal('Imported materials are protected');if(!['mkdir','delete','rename'].includes(args.action))refusal('Unknown mutation');if(args.action==='rename'){relative(args.destination);if(protectedPath(args.destination))refusal('Protected destination');}return serial(projectId,()=>{beforeMutation(projectId);return core.call(command,data);});
   }
   case 'project_rename':refusal('Project root rename requires updating its approved Mac mapping; use file/folder operations within the registered project');
   case 'project_review':{const r=await gateway.review(projectId);return {...r,remoteRevision:fingerprint(r)};}
   case 'project_resolve_review':return serial(projectId,()=>gateway.resolve(projectId,relative(args.path),args.undo,args.expectedReview));
   case 'project_service':{
    if(!services.has(args.operation))refusal('Mac environment setup is not a remote project service');for(const key of ['path','mainFile','filePath'])if(args.args?.[key]!==undefined)relative(args.args[key]);
    if(args.operation==='compile_latex'){if(!admitCompile)refusal('Durable compilation admission is not connected');return admitCompile({...args,owner,projectId});}
    return serial(projectId,()=>{beforeMutation(projectId);return core.call(command,data);});
   }
   case 'manual_operation':case 'planning_operation':{
    if(['start','startThemes','startOutline','startMacros'].includes(args.action))return gateway.operation({owner,projectId,key:args.key,command,action:args.action,args:args.args});
    if(args.action==='cancel')return gateway.cancelOperation(owner,projectId,command);
    const allowed=command==='manual_operation'?['get','save','migrate','resolveStorage']:['get','import','removeReport','requirements','mainline','editOutline','editMacros','previewMacros','applyMacros','preview','apply','exportPDF'];
    if(!allowed.includes(args.action))refusal('Unsupported native Prism operation');return serial(projectId,()=>{beforeMutation(projectId);return core.call(command,data);});
   }
   case 'codex_status':return gateway.status(projectId);
   case 'codex_sessions':return gateway.sessions(projectId);
   case 'codex_thread':if(args.action!=='read')refusal('Thread mutation requires a reviewed operation');return gateway.thread(projectId,args.threadId);
   case 'codex_send':return gateway.send({...args,owner,projectId});
   case 'codex_respond':return gateway.respond(owner,projectId,args.id,args.result,args.expectedRequest);
   case 'codex_control':return gateway.controlIdentified(owner,projectId,args.threadId,args.turnId);
   default:refusal('Unsupported remote Prism host capability');
  }
 };
}
