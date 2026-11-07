import {createHash,randomUUID} from 'node:crypto';
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const absent=null;
export function classify(base,original,working){
 if(original===working)return 'equal';
 if(original===base)return working===null?'working-deletion':'push';
 if(working===base)return original===null?'original-deletion':'pull';
 return 'conflict';
}
const validPath=p=>typeof p==='string'&&p.length<512&&!/[\\:\x00-\x1f]/.test(p)&&p.split('/').every(x=>x&&!x.startsWith('.'))&&!/^(attachments|imports|reviews|releases)\//.test(p)&&p!=='AGENTS.md';
const fail=message=>{throw Error(message)};
/** IO is the Prism host boundary: registered project IDs, revision-checked writes,
 * durable journal/backup storage, and actual Prism history snapshots. It must not
 * turn user-supplied paths into unrestricted Mac filesystem access.
 */
export class PrismSync {
 constructor(io){this.io=io;}
 async preview(mapping,paths){
  if(!mapping?.id||!mapping.originalProjectId||!mapping.workingProjectId)fail('Explicit project mapping required');
  const entries=[];
  for(const path of [...new Set(paths)].sort()){
   if(!validPath(path))fail('Path outside editable sync scope');
   const [base,original,working]=await Promise.all([this.io.base(mapping.id,path),this.io.read(mapping.originalProjectId,path),this.io.read(mapping.workingProjectId,path)]);
   entries.push({path,base,original,working,status:classify(base,original?.revision??null,working?.revision??null)});
  }
  const review={version:1,mappingId:mapping.id,originalProjectId:mapping.originalProjectId,workingProjectId:mapping.workingProjectId,entries};
  return {...review,fingerprint:hash(review)};
 }
 async apply(review,decision){
  const {fingerprint,...payload}=review;
  if(hash(payload)!==fingerprint||decision?.review!==fingerprint||decision.confirmed!==true||decision.noOtherWriter!==true)fail('Explicit current review and single-writer confirmation required');
  if(!Array.isArray(decision.paths)||!decision.paths.length)fail('Choose reviewed files');
  const chosen=review.entries.filter(e=>decision.paths.includes(e.path));
  if(chosen.length!==new Set(decision.paths).size)fail('Unreviewed file selected');
  const ops=[];
  for(const e of chosen){
   if(!validPath(e.path)||!['push','pull','working-deletion','original-deletion'].includes(e.status))fail('Resolve conflicts/deletions explicitly in a fresh review');
   const push=e.status==='push'||e.status==='working-deletion';const source=push?review.workingProjectId:review.originalProjectId,destination=push?review.originalProjectId:review.workingProjectId;
   if(push&&decision.allowOriginalWrite!==true)fail('Original write permission required');
   const before=push?e.original:e.working,after=push?e.working:e.original;
   if(!before&&decision.allowCreate!==true)fail('Explicit creation confirmation required');if(!after&&decision.allowDelete!==true)fail('Explicit deletion confirmation required');
   const [a,b]=await Promise.all([this.io.read(source,e.path),this.io.read(destination,e.path)]);
   if((a?.revision??null)!==(after?.revision??null)||(b?.revision??null)!==(before?.revision??null))fail('Source or destination changed after review');
   ops.push({path:e.path,source,destination,base:e.base,before,after,beforeSha256:before?hash(Buffer.from(before.bytes)):null,afterSha256:after?hash(Buffer.from(after.bytes)):null,state:'prepared'});
  }
  const tx={id:randomUUID(),mappingId:review.mappingId,originalProjectId:review.originalProjectId,review:fingerprint,state:'prepared',operations:ops};
  // A durable backup journal precedes history and every write. No timer/restart
  // invokes this method. The host must serialize admitted transactions.
  await this.io.journal(tx);
  for(const project of new Set(ops.map(o=>o.destination)))await this.io.historySnapshot(project,'Before approved paper sync '+tx.id);
  tx.state='committing';await this.io.journal(tx);
  try{
   for(const op of tx.operations){
    if(((await this.io.read(op.source,op.path))?.revision??null)!==(op.after?.revision??null))fail('Sync source changed before commit');
    const written=op.after?await this.io.write(op.destination,op.path,op.after.bytes,op.before?.revision??null):await this.io.remove(op.destination,op.path,op.before.revision);if((written??null)!==(op.after?.revision??null))fail('Prism write revision did not match reviewed source');
    op.state='committed';await this.io.journal(tx);
   }
   tx.state='committed';await this.io.journal(tx);
   // Baselines are advanced only after committed data is durable. If this fails,
   // recovery inspects both sides; it never automatically replays writes.
   for(const op of tx.operations)await this.io.setBase(tx.mappingId,op.path,op.after?.revision??null);
   return tx;
  }catch(error){tx.state='interrupted';try{await this.io.journal(tx)}catch{}throw Object.assign(error,{transactionId:tx.id});}
 }
 async inspect(tx){
  const files=[];
  for(const op of tx.operations){const now=await this.io.read(op.destination,op.path);files.push({path:op.path,destination:op.destination,state:(now?.revision??null)===(op.after?.revision??null)?'applied':(now?.revision??null)===(op.before?.revision??null)?'not-applied':'conflict',currentRevision:now?.revision??null});}
  const result={transactionId:tx.id,transactionFingerprint:hash(tx),files};return {...result,fingerprint:hash(result),automaticReplay:false};
 }
 async rollback(tx,decision){
  const inspected=await this.inspect(tx);
  if(decision?.review!==inspected.fingerprint||decision.confirmed!==true||decision.noOtherWriter!==true)fail('Fresh rollback review required');
  if(inspected.files.some(f=>f.state==='conflict'))fail('Destination changed; do not overwrite subsequent edits');
  if(tx.operations.some(op=>op.destination===tx.originalProjectId)&&decision.allowOriginalWrite!==true)fail('Explicit original write authorization required');
  for(const op of tx.operations)if(op.before&&hash(Buffer.from(op.before.bytes))!==op.beforeSha256)fail('Backup revision mismatch');
  // Check every file before rolling back any; CAS is repeated by the host writer.
  for(const project of new Set(tx.operations.map(o=>o.destination)))await this.io.historySnapshot(project,'Before approved sync rollback '+tx.id);
  for(const op of [...tx.operations].reverse()){
   if(inspected.files.find(f=>f.path===op.path&&f.destination===op.destination)?.state!=='applied')continue;
   if(op.before)await this.io.write(op.destination,op.path,op.before.bytes,op.after?.revision??null);else await this.io.remove(op.destination,op.path,op.after.revision);
   op.state='rolled-back';await this.io.journal(tx);
  }
  tx.state='rolled-back';await this.io.journal(tx);for(const op of tx.operations)await this.io.setBase(tx.mappingId,op.path,op.base);return tx;
 }
}
