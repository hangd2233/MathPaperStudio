import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
/** Owner-private durable state; no tokens, credentials or originals are copied. */
export function privateStore(file,initial=[]){
 const parent=path.dirname(file);const stat=fs.lstatSync(parent);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('Private runtime directory required');
 function load(){if(!fs.existsSync(file))return structuredClone(initial);const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0)throw Error('State file must be owner-private');return JSON.parse(fs.readFileSync(file,'utf8'));}
 function save(value){const temporary=file+'.'+randomUUID()+'.tmp';const fd=fs.openSync(temporary,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd)}fs.renameSync(temporary,file);const dir=fs.openSync(parent,'r');try{fs.fsyncSync(dir)}finally{fs.closeSync(dir)}}
 return {load,save};
}
export function projectSerializer(){const locks=new Map();return async(id,fn)=>{const previous=locks.get(id)??Promise.resolve(),next=previous.catch(()=>{}).then(fn);locks.set(id,next);try{return await next}finally{if(locks.get(id)===next)locks.delete(id)}};}
