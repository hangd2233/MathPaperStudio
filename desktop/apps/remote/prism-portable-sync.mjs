import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {readPortable,mergePortable,mergePortableBundle} from './prism-portable.mjs';import {privateStore} from './private-state.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fileDigest=bundle=>bundle?{id:bundle.projectId,files:bundle.files.map(f=>[f.path,createHash('sha256').update(Buffer.from(f.bytes)).digest('hex')]).sort()}:null;
const body=s=>({outline:s.outline??[],symbols:s.symbols??null,reviews:s.reviews??[],planning:s.planning??null});
export function createPortableSync({core,mapping,runtime,allowOriginalWrite}){
 const original=()=>core.call('sync_manual_status',{mappingId:mapping.id}),working=()=>core.call('manual_operation',{projectId:mapping.workingProjectId,action:'get',args:{}});
 const inspect=async()=>{const [a,b]=await Promise.all([original(),working()]);const result={mappingId:mapping.id,originalFiles:fileDigest(readPortable(mapping.originalRoot)),workingFiles:fileDigest(readPortable(mapping.workingRoot)),originalState:a,workingState:b};return {...result,fingerprint:digest(result)};};
 const snapshot=async direction=>{if(direction==='push')return core.call('sync_history_snapshot',{mappingId:mapping.id,message:'Before confirmed portable Prism sync'});await core.call('project_service',{projectId:mapping.workingProjectId,operation:'history_init',args:{}});return core.call('project_service',{projectId:mapping.workingProjectId,operation:'history_snapshot',args:{message:'Before confirmed portable Prism sync'}});};
 return async({owner,action,args={}})=>{
  if(action==='portablePreview'){const result=await inspect();privateStore(path.join(runtime,'portable-review-'+result.fingerprint+'.json')).save({owner,result});return {fingerprint:result.fingerprint,originalWriteEnabled:allowOriginalWrite,originalStatus:result.originalState.storageStatus,workingStatus:result.workingState.storageStatus,originalHeads:result.originalState.storageHeads??[],workingHeads:result.workingState.storageHeads??[],originalState:body(result.originalState),workingState:body(result.workingState),samePaperIdentity:!result.originalFiles||!result.workingFiles||result.originalFiles.id===result.workingFiles.id};}
  if(action==='portableApply'){
   if(args.confirmed!==true||args.noOtherWriter!==true||!['push','pull'].includes(args.direction)||!/^[a-f0-9]{64}$/.test(args.review??''))throw Error('Confirm current portable comparison and single writer');
   if(args.direction==='push'&&!allowOriginalWrite)throw Error('Original portable writeback is not approved');const saved=privateStore(path.join(runtime,'portable-review-'+args.review+'.json')).load();if(saved.owner!==owner||saved.result.mappingId!==mapping.id)throw Error('Wrong device or paper comparison');const current=await inspect();if(current.fingerprint!==args.review)throw Error('Portable versions changed; compare again');if(current.originalState.storageStatus==='conflict'||current.workingState.storageStatus==='conflict')throw Error('Resolve native Prism competing heads before transferring');
   const push=args.direction==='push',tx={id:randomUUID(),owner,mappingId:mapping.id,direction:args.direction,beforeState:push?current.originalState:current.workingState,state:'prepared',review:args.review,approvedBundle:readPortable(push?mapping.workingRoot:mapping.originalRoot),beforeFiles:push?current.originalFiles:current.workingFiles};const journal=privateStore(path.join(runtime,'portable-transaction-'+tx.id+'.json'));journal.save(tx);await snapshot(args.direction);
   try{const result=await mergePortable({sourceRoot:push?mapping.workingRoot:mapping.originalRoot,destinationRoot:push?mapping.originalRoot:mapping.workingRoot,validateSource:push?working:original,validateDestination:push?original:working});tx.state='committed';tx.result=result;tx.afterFingerprint=(await inspect()).fingerprint;journal.save(tx);return {id:tx.id,state:tx.state,result};}catch(error){tx.state='interrupted';journal.save(tx);throw Object.assign(error,{transactionId:tx.id});}
  }
  if(['portableInspect','portableRecover','portableRollback'].includes(action)){
   if(!/^[a-f0-9-]{36}$/.test(args.transactionId??''))throw Error('Choose a portable transaction');const journal=privateStore(path.join(runtime,'portable-transaction-'+args.transactionId+'.json')),tx=journal.load();if(tx.owner!==owner||tx.mappingId!==mapping.id)throw Error('Wrong transaction owner or paper');
   const destinationRoot=tx.direction==='push'?mapping.originalRoot:mapping.workingRoot;
   const currentFiles=fileDigest(readPortable(destinationRoot)),wanted=new Map([...(tx.beforeFiles?.files??[]),...(fileDigest(tx.approvedBundle)?.files??[])]);
   const unexpected=currentFiles?.files.some(([name,hash])=>wanted.get(name)!==hash)??false;
   const complete=!unexpected&&currentFiles&&currentFiles.files.length===wanted.size;
   if(action==='portableRecover'){
    if(args.confirmed!==true||args.noOtherWriter!==true||args.review!==digest({transactionId:tx.id,currentFiles}))throw Error('Fresh recovery inspection required');if(tx.direction==='push'&&!allowOriginalWrite)throw Error('Original scope not approved');
    if(unexpected)throw Error('New portable versions appeared; preserve and compare them before recovery');
    await mergePortableBundle({bundle:tx.approvedBundle,destinationRoot,validateDestination:tx.direction==='push'?original:working});tx.state='recovered-committed';tx.afterFingerprint=(await inspect()).fingerprint;journal.save(tx);return {id:tx.id,state:tx.state,modelReplayed:false,immutableHistoryRetained:true};
   }
   if(action==='portableInspect'){
    if(complete&&!tx.afterFingerprint){tx.afterFingerprint=(await inspect()).fingerprint;tx.state='recovered-committed';journal.save(tx);}
    return {transactionId:tx.id,review:digest({transactionId:tx.id,currentFiles}),state:tx.state,complete:!!complete,unexpectedVersions:unexpected,automaticReplay:false};
   }
   const current=await inspect();if(args.review!==digest({transactionId:tx.id,currentFiles})||args.confirmed!==true||args.noOtherWriter!==true)throw Error('Fresh rollback comparison required');
   if(!tx.afterFingerprint||tx.afterFingerprint!==current.fingerprint)throw Error('Portable outcome is unconfirmed or new versions appeared; do not overwrite');if(tx.direction==='push'&&!allowOriginalWrite)throw Error('Original rollback scope is not approved');await snapshot(tx.direction);
   const parameters={data:tx.beforeState,expectedHeads:tx.direction==='push'?current.originalState.storageHeads:current.workingState.storageHeads};if(tx.direction==='push')await core.call('sync_manual_restore',{mappingId:mapping.id,args:parameters});else await core.call('manual_restore_snapshot',{projectId:mapping.workingProjectId,args:parameters});tx.state='rolled-back-with-new-revision';journal.save(tx);return {id:tx.id,state:tx.state,immutableHistoryRetained:true};
  }
  throw Error('Unsupported portable synchronization action');
 };
}
