import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {privateStore} from './private-state.mjs';
const sha=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');
function scoped(root,relative){if(typeof relative!=='string'||!relative||relative.split('/').some(s=>!s||s.startsWith('.'))||/[\\:\x00-\x1f]/.test(relative))throw Error('Invalid sync relative path');const canonical=fs.realpathSync(root);if(canonical!==root)throw Error('Use canonical original root');let current=root;for(const part of relative.split('/')){current=path.join(current,part);try{if(fs.lstatSync(current).isSymbolicLink())throw Error('Sync symlinks are refused')}catch(e){if(e.code!=='ENOENT')throw e;}}return current;}
function originalRead(root,file){const target=scoped(root,file);try{const bytes=fs.readFileSync(target);if(bytes.length>2*1024*1024)throw Error('Sync text file exceeds limit');return {bytes:[...bytes],revision:sha('sha1',bytes)}}catch(e){if(e.code==='ENOENT')return null;throw e;}}
/** Strictly configured original mapping, never a path supplied by the iPad. */
export function prismSyncIO({core,mapping,runtime,allowOriginalWrite=false,originalHistory,owner}){
 const originalId='original:'+mapping.id,baseStore=privateStore(path.join(runtime,'sync-base-'+mapping.id+'.json'),{});let baselines=baseStore.load();
 const read=async(projectId,file)=>{if(projectId===originalId)return originalRead(mapping.originalRoot,file);if(projectId!==mapping.workingProjectId)throw Error('Sync project not mapped');try{return await core.call('project_read',{projectId,path:file})}catch(error){const list=await core.call('project_list',{projectId});if(!list.files.some(f=>f.path===file))return null;throw error;}};
 return {
  read,
  async base(_,file){if(Object.hasOwn(baselines,file))return baselines[file];const initial=mapping.initialFiles.find(f=>f.path===file);if(!initial)return null;const expected=initial.sha256;const original=originalRead(mapping.originalRoot,file);const result=original&&expected&&sha('sha256',Buffer.from(original.bytes))===expected?original.revision:'unknown-initial-baseline';return result;},
  async setBase(_,file,revision){baselines={...baselines,[file]:revision};baseStore.save(baselines);},
  async journal(transaction){privateStore(path.join(runtime,'sync-transaction-'+transaction.id+'.json')).save({...transaction,owner});},
  async historySnapshot(projectId,message){
   if(projectId===originalId){if(!allowOriginalWrite||!originalHistory)throw Error('Original history/write scope is not approved');return originalHistory(mapping.id,message);}
   if(projectId!==mapping.workingProjectId)throw Error('Unknown sync project');await core.call('project_service',{projectId,operation:'history_init',args:{}});return core.call('project_service',{projectId,operation:'history_snapshot',args:{message}});
  },
  async remove(projectId,file,expectedRevision){
   if(projectId!==originalId){if(projectId!==mapping.workingProjectId)throw Error('Unknown sync destination');await core.call('sync_delete_checked',{projectId,path:file,expectedRevision});return null;}
   if(!allowOriginalWrite||!originalHistory)throw Error('Original deletion scope is not approved');const target=scoped(mapping.originalRoot,file),current=originalRead(mapping.originalRoot,file);if(current?.revision!==expectedRevision)throw Error('Original changed before sync deletion');fs.unlinkSync(target);const dir=fs.openSync(path.dirname(target),'r');try{fs.fsyncSync(dir)}finally{fs.closeSync(dir)}return null;
  },
  async write(projectId,file,bytes,expectedRevision){
   if(projectId!==originalId){if(projectId!==mapping.workingProjectId)throw Error('Unknown sync destination');return core.call('project_write',{projectId,path:file,bytes,expectedRevision});}
   if(!allowOriginalWrite||!originalHistory)throw Error('Original writeback is disabled until explicit scope approval');
   const target=scoped(mapping.originalRoot,file),old=originalRead(mapping.originalRoot,file);if((old?.revision??null)!==expectedRevision)throw Error('Original changed after comparison');
   if(fs.existsSync(target)&&(fs.statSync(target).mode&0o200)===0)throw Error('Original file is read-only');
   const data=Buffer.from(bytes),parent=path.dirname(target),temporary=path.join(parent,'.prism-sync-'+randomUUID()+'.tmp');fs.mkdirSync(parent,{recursive:true});const fd=fs.openSync(temporary,'wx',0o600);
   try{fs.writeFileSync(fd,data);if(fs.existsSync(target))fs.fchmodSync(fd,fs.statSync(target).mode&0o777);fs.fsyncSync(fd);}finally{fs.closeSync(fd)}
   try{if((originalRead(mapping.originalRoot,file)?.revision??null)!==expectedRevision)throw Error('Original changed during staging');if(expectedRevision===null){fs.linkSync(temporary,target);fs.unlinkSync(temporary);}else fs.renameSync(temporary,target);const dir=fs.openSync(parent,'r');try{fs.fsyncSync(dir)}finally{fs.closeSync(dir)}}catch(error){try{fs.unlinkSync(temporary)}catch{}throw error;}
   return sha('sha1',data);
  }
 };
}
