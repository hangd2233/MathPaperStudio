import {createPortableSync} from './prism-portable-sync.mjs';
import fs from 'node:fs';import path from 'node:path';import {PrismSync} from './prism-sync.mjs';import {prismSyncIO} from './prism-sync-io.mjs';import {privateStore} from './private-state.mjs';
const eligible=p=>/\.(tex|bib|sty|cls|bst)$/i.test(p)&&!p.split('/').some(s=>s.startsWith('.')||['attachments','imports','reviews','releases'].includes(s));
function originalFiles(root){const result=[];function walk(dir,prefix=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('.')||['attachments','imports','reviews','releases','node_modules','target'].includes(e.name))continue;if(e.isSymbolicLink())continue;const relative=prefix+e.name;if(e.isDirectory())walk(path.join(dir,e.name),relative+'/');else if(eligible(relative))result.push(relative);}}walk(root);return result;}
export function createPrismSyncService({core,mappings=[],runtime,originalWriteApproved=false,serial,beforeMutation=()=>{}}){
 const lookup=new Map(mappings.map(m=>[m.workingProjectId,m]));
 return async({owner,projectId,action,args={}})=>{
  const mapping=lookup.get(projectId);if(!owner||!mapping)throw Object.assign(Error('This registered paper has no approved original mapping'),{status:403});
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(mapping.id))throw Error('Invalid configured mapping identity');
  const allowOriginalWrite=originalWriteApproved&&mapping.allowWrite===true;
  const io=prismSyncIO({core,mapping,runtime,allowOriginalWrite,owner,originalHistory:(mappingId,message)=>core.call('sync_history_snapshot',{mappingId,message})});const sync=new PrismSync(io),configured={id:mapping.id,originalProjectId:'original:'+mapping.id,workingProjectId:projectId};
  if(action==='transactions'){const transactions=fs.readdirSync(runtime).filter(f=>/^(sync|portable)-transaction-[a-f0-9-]{36}\.json$/.test(f)).map(f=>privateStore(path.join(runtime,f)).load()).filter(t=>t.owner===owner&&t.mappingId===mapping.id).map(t=>({id:t.id,kind:t.operations?'source':'portable',state:t.state}));return {transactions};}
  if(action.startsWith('portable'))return serial(projectId,async()=>{beforeMutation(projectId);if((await core.call('project_review',{projectId})).active)throw Error('Wait for active Prism writer');return createPortableSync({core,mapping,runtime,allowOriginalWrite})({owner,action,args});});
  if(action==='preview'){
   const working=await core.call('project_list',{projectId});const paths=[...new Set([...mapping.initialFiles.map(f=>f.path),...working.files.map(f=>f.path),...originalFiles(mapping.originalRoot)])].filter(eligible);
   const review=await sync.preview(configured,paths);privateStore(path.join(runtime,'sync-review-'+review.fingerprint+'.json')).save({owner,review});
   return {...review,originalWriteEnabled:allowOriginalWrite,changes:review.entries.filter(e=>e.status!=='equal').map(e=>({path:e.path,status:e.status,originalRevision:e.original?.revision??null,workingRevision:e.working?.revision??null,originalText:e.original?new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(e.original.bytes)):null,workingText:e.working?new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(e.working.bytes)):null}))};
  }
  if(action==='apply'){
   if(!/^[a-f0-9]{64}$/.test(args.review??''))throw Error('Choose a current sync comparison');const stored=privateStore(path.join(runtime,'sync-review-'+args.review+'.json')).load();if(stored.owner!==owner||stored.review.mappingId!==mapping.id)throw Object.assign(Error('Comparison belongs to another device/project'),{status:403});
   return serial(projectId,async()=>{beforeMutation(projectId);if((await core.call('project_review',{projectId})).active)throw Error('Wait for the active Prism writer');return sync.apply(stored.review,{...args,allowOriginalWrite:allowOriginalWrite&&args.allowOriginalWrite===true});});
  }
  if(action==='inspect'||action==='rollback'){
   if(!/^[a-f0-9-]{36}$/.test(args.transactionId??''))throw Error('Choose a known sync transaction');const tx=privateStore(path.join(runtime,'sync-transaction-'+args.transactionId+'.json')).load();if(tx.owner!==owner||tx.mappingId!==mapping.id)throw Error('Wrong sync transaction mapping');
   if(action==='inspect')return sync.inspect(tx);
   return serial(projectId,async()=>{beforeMutation(projectId);return sync.rollback(tx,{...args,allowOriginalWrite:allowOriginalWrite&&args.allowOriginalWrite===true});});
  }
  throw Error('Unsupported sync operation');
 };
}
