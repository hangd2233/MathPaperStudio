import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
const uuid=/^[a-f0-9-]{36}$/i,sha1=bytes=>createHash('sha1').update(bytes).digest('hex');
function checked(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>20*1024*1024)throw Error('Unsafe portable paper record');return fs.readFileSync(file);}
/** Transfer only Prism's immutable paper graph and digest-named report PDFs.
 * Application state, auth files, sessions, build caches and settings are excluded.
 */
export function readPortable(root){
 const folder=path.join(root,'.mps');if(!fs.existsSync(folder))return null;if(fs.lstatSync(folder).isSymbolicLink())throw Error('Portable metadata symlink refused');
 const manifest=checked(path.join(folder,'project.json')),identity=JSON.parse(manifest);if(identity.schemaVersion!==1||!uuid.test(identity.projectId))throw Error('Unsupported portable Prism identity');const files=[{path:'project.json',bytes:[...manifest]}];
 for(const directory of ['revisions','reports']){const dir=path.join(folder,directory);if(!fs.existsSync(dir))continue;if(fs.lstatSync(dir).isSymbolicLink())throw Error('Portable subdirectory symlink refused');for(const name of fs.readdirSync(dir).sort()){
  if(directory==='revisions'&&/^[a-f0-9-]{36}\.json$/i.test(name)){const bytes=checked(path.join(dir,name)),record=JSON.parse(bytes);if(record.id!==name.slice(0,-5)||record.projectId!==identity.projectId||record.schemaVersion!==1)throw Error('Portable revision identity mismatch');files.push({path:directory+'/'+name,bytes:[...bytes]});}
  else if(directory==='reports'&&/^[a-f0-9]{40}\.pdf$/i.test(name)){const bytes=checked(path.join(dir,name));if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))||sha1(bytes)!==name.slice(0,-4))throw Error('Portable report digest mismatch');files.push({path:directory+'/'+name,bytes:[...bytes]});}
 }}if(files.length>11000||files.reduce((n,f)=>n+f.bytes.length,0)>128*1024*1024)throw Error('Portable paper metadata exceeds transfer limit');return {projectId:identity.projectId,files};
}
export async function mergePortable({sourceRoot,destinationRoot,validateSource,validateDestination}){
 // The formal Prism graph validator checks canonical data, digests, parents and
 // competing heads before transfer. No last-writer-wins metadata merge is used.
 await validateSource();const bundle=readPortable(sourceRoot);if(!bundle)return {copied:0,status:'no-portable-data'};
 return mergePortableBundle({bundle,destinationRoot,validateDestination});
}
export async function mergePortableBundle({bundle,destinationRoot,validateDestination}){
 const previous=readPortable(destinationRoot);if(previous&&previous.projectId!==bundle.projectId)throw Error('Portable project identities differ; preserve both and resolve explicitly');
 const dir=path.join(destinationRoot,'.mps');fs.mkdirSync(dir,{mode:0o700,recursive:true});let copied=0;
 // Write assets first, then immutable revisions, then a create-only manifest.
 for(const file of [...bundle.files].sort((a,b)=>(a.path.startsWith('reports/')?0:a.path==='project.json'?2:1)-(b.path.startsWith('reports/')?0:b.path==='project.json'?2:1))){
  const target=path.join(dir,file.path);fs.mkdirSync(path.dirname(target),{mode:0o700,recursive:true});const bytes=Buffer.from(file.bytes);
  if(fs.existsSync(target)){if(!checked(target).equals(bytes))throw Error('Immutable portable revision collision; neither version was overwritten');continue;}
  const staging=path.join(path.dirname(target),'.prism-'+randomUUID()+'.tmp'),fd=fs.openSync(staging,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd)}
  try{try{fs.linkSync(staging,target);copied++;}catch(error){if(error.code!=='EEXIST'||!checked(target).equals(bytes))throw error;}const directory=fs.openSync(path.dirname(target),'r');try{fs.fsyncSync(directory)}finally{fs.closeSync(directory)}}finally{fs.unlinkSync(staging)}
 }
 const parent=fs.openSync(dir,'r');try{fs.fsyncSync(parent)}finally{fs.closeSync(parent)}
 const projectDirectory=fs.openSync(destinationRoot,'r');try{fs.fsyncSync(projectDirectory)}finally{fs.closeSync(projectDirectory)}
 const data=await validateDestination();return {copied,status:data.storageStatus,heads:data.storageHeads??[],stableProjectId:data.stableProjectId};
}
