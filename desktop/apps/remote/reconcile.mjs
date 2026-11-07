// Local-only recovery. Stop this dedicated MPS service first; do not remove a live owner lock.
import fs from 'node:fs';import path from 'node:path';import {CoreBridge} from './bridge.mjs';import {atomicJSON,digest} from './service.mjs';
const [mode,file,id,expectedTask,expectedReview]=process.argv.slice(2);
if(!['inspect','reconcile'].includes(mode)||!file||!id)throw Error('Usage: reconcile.mjs inspect|reconcile <config> <task-id> [task-fingerprint review-fingerprint]');
const cfg=JSON.parse(fs.readFileSync(file,'utf8')),lock=path.join(cfg.runtimeDir,'mps-owner.lock');const fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);
let backend;
try{
 const journal=path.join(cfg.runtimeDir,'mps-tasks.json'),tasks=JSON.parse(fs.readFileSync(journal,'utf8')),task=tasks.find(t=>t.id===id);if(!task||task.state!=='interrupted')throw Error('Only a persisted interrupted task can be reconciled');
 if(digest(fs.readFileSync(cfg.binary))!==cfg.binarySha256)throw Error('Reviewed host binary hash changed');
 backend=new CoreBridge(cfg.binary,path.resolve(file));const init=await backend.call('init');if(init.protocol!=='mps-paper-v1'||!init.projects.some(p=>p.id===task.projectId))throw Error('Task project is not registered');
 const review=await backend.call('project_review',{projectId:task.projectId});if(review.active)throw Error('Core still reports active work');
 const taskFingerprint=digest(task),reviewFingerprint=digest(review);
 if(mode==='inspect')console.log(JSON.stringify({taskId:id,state:task.state,taskFingerprint,reviewFingerprint,review},null,2));
 else{
  if(expectedTask!==taskFingerprint||expectedReview!==reviewFingerprint)throw Error('Inspection changed; inspect again before acknowledging');
  task.state='reconciled';task.message='Locally inspected; original outcome remains unconfirmed. Review changes retained, inference not replayed.';task.reconciledAt=new Date().toISOString();atomicJSON(journal,tasks);console.log(JSON.stringify({taskId:id,state:'reconciled',reviewRetained:true,replayed:false}));
 }
}finally{if(backend)await backend.close();fs.unlinkSync(lock)}
