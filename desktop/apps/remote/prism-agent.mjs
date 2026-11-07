import {createHash,randomUUID} from 'node:crypto';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const deny=message=>{throw Object.assign(Error(message),{status:403})};
/** Durable admission around actual Prism Codex sessions. Core owns model calls,
 * approvals, review snapshots and Keep/Undo. This layer never substitutes its
 * own writing/reading business model, retries a turn, or copies credentials.
 */
export class PrismAgentGateway {
 constructor({core,store,policy,projects}){
  this.locks=new Map();this.earlyEvents=[];this.core=core;this.store=store;this.policy=policy;this.projects=new Set(projects);const loaded=store.load();this.ledgerId=Array.isArray(loaded)?randomUUID():loaded.ledgerId;if(!this.ledgerId)throw Error('Prism admission ledger identity missing');this.records=new Map((Array.isArray(loaded)?loaded:loaded.records).map(r=>[r.id,r]));
  for(const r of this.records.values())if(['admitted','starting','running'].includes(r.state)){r.state='uncertain';r.message='Host restarted. Inspect the original Prism thread; do not replay.';}
  store.save({ledgerId:this.ledgerId,records:[...this.records.values()]});
 }
 check(project){if(!this.projects.has(project))deny('Unregistered Prism project');if(this.policy.accountAccessApproved!==true)deny('Existing Mac Codex account access requires approval');}
 persist(){this.store.save({ledgerId:this.ledgerId,records:[...this.records.values()]});}
 view(r){const {owner,prompt,...v}=r;return {...v,ledgerId:this.ledgerId};}
 async status(project){this.check(project);const status=await this.core.call('codex_status',{});if(this.policy.model){const limit=m=>({...m,isDefault:true,defaultReasoningEffort:this.policy.effort,supportedReasoningEfforts:(m.supportedReasoningEfforts??[]).filter(e=>e.reasoningEffort===this.policy.effort)});if(Array.isArray(status.models))status.models=status.models.filter(m=>m.id===this.policy.model||m.model===this.policy.model).map(limit);else if(status.models?.data)status.models={...status.models,data:status.models.data.filter(m=>m.id===this.policy.model||m.model===this.policy.model).map(limit),nextCursor:null};}return status;}
 async sessions(project){this.check(project);return this.core.call('codex_sessions',{projectId:project});}
 async thread(project,threadId){this.check(project);const known=await this.sessions(project);if(!known.some(s=>s.id===threadId))deny('Thread does not belong to this Prism project');return this.core.call('codex_thread',{projectId:project,threadId,action:'read'});}
 send(request){
  const id=request.projectId,prior=this.locks.get(id)??Promise.resolve();
  const next=prior.catch(()=>{}).then(()=>this.submit(request));this.locks.set(id,next);
  return next.finally(()=>{if(this.locks.get(id)===next)this.locks.delete(id)});
 }
 async submit({owner,projectId,key,threadId=null,prompt,mainDocument,images=[],model,effort}){
  this.check(projectId);model??=this.policy.model;effort??=this.policy.effort;
  if(!Array.isArray(images)||images.length>8||images.some(x=>typeof x!=='string'||x.length>4*1024*1024||!/^data:image\/(png|jpeg);base64,/.test(x)))deny('Only bounded project image data is allowed');
  if(this.policy.modelExecutionApproved!==true||!this.policy.modelProjects?.includes(projectId)||!this.policy.model||model!==this.policy.model||effort!==this.policy.effort)deny('Explicit provider/model/effort policy required');
  if(typeof owner!=='string'||!owner||!/^[-\w]{16,100}$/.test(key??'')||typeof prompt!=='string'||!prompt.trim()||prompt.length>20000)deny('Invalid confirmed writing request');
  await this.reconcileProject(projectId);
  const payload=digest({projectId,threadId,prompt,mainDocument,images,model,effort});
  const existing=[...this.records.values()].find(r=>r.owner===owner&&r.projectId===projectId&&r.key===key);
  if(existing){if(existing.payload!==payload)deny('Idempotency key payload changed');return this.view(existing);}
  if([...this.records.values()].some(r=>r.projectId===projectId&&['admitted','starting','running','uncertain'].includes(r.state)))deny('Inspect the original Prism turn before another submission');
  if(threadId){const known=await this.sessions(projectId);if(!known.some(s=>s.id===threadId))deny('Thread does not belong to this project');}
  const r={id:randomUUID(),owner,projectId,key,payload,prompt,threadId,turnId:null,state:'admitted',createdAt:new Date().toISOString()};this.records.set(r.id,r);this.persist();
  try{
   r.state='starting';this.persist();
   const started=await this.core.call('codex_send',{projectId,threadId,prompt,mainDocument,model,effort,images});
   if(!started.threadId||!started.turn?.id)throw Error('Prism did not confirm turn identity');
   r.threadId=started.threadId;r.turnId=started.turn.id;r.state='running';this.persist();const early=this.earlyEvents.splice(0);for(const event of early)this.acceptCoreEvent(event);
  }catch(error){r.state='uncertain';r.message='Admission outcome unknown; inspect original Prism session. No automatic retry.';this.persist();}
  return this.view(r);
 }
 query(owner,id){const r=this.records.get(id);if(!r||r.owner!==owner)throw Object.assign(Error('No receipt for this device'),{status:404});return this.view(r);}
 acceptCoreEvent(event){
  const p=event.params??{},terminal=event.method==='turn/completed',interaction=event.id!==undefined;
  if(!terminal&&!interaction)return;
  const r=[...this.records.values()].find(r=>r.threadId===p.threadId&&(terminal?r.turnId===p.turn?.id:(!p.turnId||r.turnId===p.turnId)));
  if(!r){this.earlyEvents.push(event);if(this.earlyEvents.length>1000)this.earlyEvents.shift();return;}
  if(interaction){const request={id:event.id,method:event.method,params:p,review:digest({receipt:r.id,id:event.id,method:event.method,params:p})};r.pendingRequests=(r.pendingRequests??[]).filter(q=>q.id!==event.id);r.pendingRequests.push(request);event.remoteRequestReview=request.review;event.remoteReceiptId=r.id;this.persist();this.onBoundInteraction?.(event,{projectId:r.projectId,threadId:r.threadId});return;}
  const state=p.turn.status;if(['completed','failed','interrupted'].includes(state)){r.state=state;r.pendingRequests=[];r.finishedAt=new Date().toISOString();this.persist();}
 }
 async respond(owner,projectId,id,result,expectedRequest){
  this.check(projectId);const r=[...this.records.values()].find(r=>r.owner===owner&&r.projectId===projectId&&(r.pendingRequests??[]).some(q=>q.id===id));
  const request=r?.pendingRequests.find(q=>q.id===id);if(!request||request.review!==expectedRequest)deny('Request changed or belongs to another device/turn');
  const decline=['decline','cancel'].includes(result?.decision)||result?.action==='cancel'||(result?.permissions&&Object.keys(result.permissions).length===0&&result.scope==='turn');
  const answer=request.method==='item/tool/requestUserInput'&&result?.answers&&JSON.stringify(result).length<=20000;
  if(!decline&&!answer)deny('Additional system/network permissions are outside the approved paper scope; a separate approval is required');
  await this.core.call('codex_respond',{projectId,id,result});r.pendingRequests=r.pendingRequests.filter(q=>q.id!==id);this.persist();return null;
 }
 operation(request){const id=request.projectId,prior=this.locks.get(id)??Promise.resolve(),next=prior.catch(()=>{}).then(()=>this.submitOperation(request));this.locks.set(id,next);return next.finally(()=>{if(this.locks.get(id)===next)this.locks.delete(id)});}
 async submitOperation({owner,projectId,key,command,action,args={}}){
  this.check(projectId);if(this.policy.modelExecutionApproved!==true||!this.policy.modelProjects?.includes(projectId))deny('Read-only model operation is not approved for this paper');
  const model=args.model||this.policy.model,effort=args.effort||this.policy.effort;if(model!==this.policy.model||effort!==this.policy.effort)deny('Model policy mismatch');
  if(!['manual_operation','planning_operation'].includes(command)||!['start','startThemes','startOutline','startMacros'].includes(action)||!/^[-\w]{16,100}$/.test(key??''))deny('Invalid native Prism model operation');
  args={...args,model,effort};const payload=digest({command,action,args});await this.reconcileProject(projectId);
  const existing=[...this.records.values()].find(r=>r.owner===owner&&r.projectId===projectId&&r.key===key);if(existing){if(existing.payload!==payload)deny('Operation key changed');return {receipt:this.view(existing),result:await this.core.call(command,{projectId,action:'get',args:{}})};}
  if([...this.records.values()].some(r=>r.projectId===projectId&&['admitted','starting','running','uncertain'].includes(r.state)))deny('Inspect the original Prism operation first');
  const previous=await this.core.call(command,{projectId,action:'get',args:{}}),list=command==='manual_operation'?previous.reviews:previous.runs;
  const r={id:randomUUID(),owner,projectId,key,payload,kind:command,action,previousRuns:(list??[]).map(x=>x.id),runId:null,state:'admitted',createdAt:new Date().toISOString()};this.records.set(r.id,r);this.persist();
  try{r.state='starting';this.persist();await this.core.call(command,{projectId,action,args});}catch{r.state='uncertain';this.persist();}
  await this.reconcileOperation(r);return {receipt:this.view(r),result:await this.core.call(command,{projectId,action:'get',args:{}})};
 }
 async reconcileOperation(r){const data=await this.core.call(r.kind,{projectId:r.projectId,action:'get',args:{}}),runs=r.kind==='manual_operation'?(data.reviews??[]):(data.runs??[]);if(!r.runId){const created=runs.filter(x=>!r.previousRuns.includes(x.id));if(created.length===1)r.runId=created[0].id;}const run=runs.find(x=>x.id===r.runId);if(run){r.state=run.state;this.persist();}return this.view(r);}
 async reconcileProject(projectId){for(const r of this.records.values())if(r.projectId===projectId&&['admitted','starting','running','uncertain'].includes(r.state)){if(r.kind)await this.reconcileOperation(r);}}
 find(owner,projectId,key){const r=[...this.records.values()].find(r=>r.owner===owner&&r.projectId===projectId&&r.key===key);if(!r)throw Object.assign(Error('Original admission not found'),{status:404});return this.view(r);}
 async cancelOperation(owner,projectId,command){const r=[...this.records.values()].find(r=>r.owner===owner&&r.projectId===projectId&&r.kind===command&&['running','uncertain'].includes(r.state));if(!r)deny('No owned active native Prism operation');await this.core.call(command,{projectId,action:'cancel',args:{}});return this.reconcileOperation(r);}
 async reconcile(owner,id){
  const r=this.records.get(id);this.query(owner,id);this.check(r.projectId);
  if(r.kind)return this.reconcileOperation(r);
  if(!r.threadId||!r.turnId)return this.view(r);
  const result=await this.thread(r.projectId,r.threadId),turn=result.thread?.turns?.find(t=>t.id===r.turnId);
  if(turn&&['completed','failed','interrupted'].includes(turn.status)){r.state=turn.status;this.persist();}
  return this.view(r);
 }
 async controlIdentified(owner,projectId,threadId,turnId){const r=[...this.records.values()].find(r=>r.owner===owner&&r.projectId===projectId&&r.threadId===threadId&&r.turnId===turnId);if(!r)deny('Original turn receipt not found');return this.control(owner,r.id,'cancel');}
 async control(owner,id,action){
  const r=this.records.get(id);this.query(owner,id);this.check(r.projectId);
  if(action!=='cancel'||!r.threadId||!r.turnId)deny('Only the identified original turn may be cancelled');
  return this.core.call('codex_control',{projectId:r.projectId,threadId:r.threadId,turnId:r.turnId});
 }
 async review(project){if(!this.projects.has(project))deny('Unregistered Prism project');return this.core.call('project_review',{projectId:project});}
 async resolve(project,path,undo,expectedReview){
  if(!this.projects.has(project))deny('Unregistered Prism project');
  const review=await this.review(project);
  if(review.active||digest(review)!==expectedReview||!review.changes.some(c=>c.path===path)||typeof undo!=='boolean')deny('Review changed; inspect the original Prism comparison again');
  return this.core.call('project_resolve_review',{projectId:project,path,undo});
 }
}
