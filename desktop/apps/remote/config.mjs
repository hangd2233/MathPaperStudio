import fs from 'node:fs';import path from 'node:path';import {digest} from './service.mjs';
import {inspectBinding} from './network-binding.mjs';
const origins=new Set(['tauri://localhost','http://tauri.localhost','https://tauri.localhost']);
function privatePath(p,kind){const s=fs.lstatSync(p);if(s.isSymbolicLink()||(s.mode&0o077)!==0||(process.getuid&&s.uid!==process.getuid()))throw Error('MPS runtime/config must be owner-private and not a symlink');if(kind==='directory'&&!s.isDirectory()||kind==='file'&&!s.isFile())throw Error('Unexpected MPS configuration path type');return s;}
function absolute(p){if(typeof p!=='string'||!path.isAbsolute(p))throw Error('All configured MPS paths must be absolute');return path.normalize(p);}
function inside(runtime,p,{exists=false,kind='directory'}={}){
 const target=absolute(p),relative=path.relative(runtime,target);if(!relative||relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw Error('MPS state and paper copies must stay inside the isolated runtime');
 let current=runtime;const parts=relative.split(path.sep);for(let i=0;i<parts.length;i++){current=path.join(current,parts[i]);try{const s=fs.lstatSync(current);if(s.isSymbolicLink())throw Error('Symlink components are forbidden in MPS state paths');if(i<parts.length-1&&!s.isDirectory())throw Error('MPS state parent must be a directory');}catch(e){if(e.code!=='ENOENT')throw e;if(exists)throw Error('Required MPS path is missing');break;}}
 if(exists)privatePath(target,kind);return target;
}
/** Read-only. allowUnpaired is for staging review; start always requires an authorized device. */
export function inspectConfiguration(configPath,{allowUnpaired=false}={}){
 const file=absolute(configPath);privatePath(file,'file');const cfg=JSON.parse(fs.readFileSync(file,'utf8'));const runtime=absolute(cfg.runtimeDir);privatePath(runtime,'directory');if(fs.realpathSync(runtime)!==runtime)throw Error('Use the canonical runtime path, without symlink ancestors');
 const binding=inspectBinding(cfg);
 if(!Number.isInteger(cfg.port)||cfg.port<1024||cfg.port>65535)throw Error('Choose a dedicated unprivileged port');
 if(!Array.isArray(cfg.origins)||!cfg.origins.length||cfg.origins.some(x=>!origins.has(x)))throw Error('Explicit native app origins required');
 if(cfg.enableModel!==false&&cfg.enableModel!==true)throw Error('enableModel must be an explicit boolean');if(cfg.enableModel&&(!cfg.model||typeof cfg.model!=='string'))throw Error('Choose an explicitly approved model before enabling inference');
 const binary=absolute(cfg.binary);const stat=fs.lstatSync(binary);if(!stat.isFile()||stat.isSymbolicLink()||!/^[a-f0-9]{64}$/.test(cfg.binarySha256??'')||digest(fs.readFileSync(binary))!==cfg.binarySha256)throw Error('Host binary must match the reviewed regular executable');fs.accessSync(binary,fs.constants.X_OK);
 const projectRoot=inside(runtime,cfg.projectRoot,{exists:true});inside(runtime,cfg.coreDataDir);inside(runtime,cfg.tempDir);absolute(cfg.homeDir);
 if(!Array.isArray(cfg.projects)||!cfg.projects.length)throw Error('Explicit dedicated paper copies required');
 for(const p of cfg.projects){const target=inside(runtime,p.root,{exists:true});if(!target.startsWith(projectRoot+path.sep))throw Error('Paper is outside the dedicated project-copy root');if(typeof p.mainFile!=='string'||!p.mainFile.endsWith('.tex')||p.mainFile.split('/').some(x=>!x||x.startsWith('.'))||/[\\:]/.test(p.mainFile))throw Error('Main document must be a project-relative TeX file');inside(target,path.join(target,p.mainFile),{kind:'file'});if(!fs.statSync(path.join(target,p.mainFile)).isFile())throw Error('Configured main document is missing');}
 const hashesFile=inside(runtime,cfg.deviceHashesFile,{kind:'file'});let hashes=[];if(fs.existsSync(hashesFile)){privatePath(hashesFile,'file');hashes=JSON.parse(fs.readFileSync(hashesFile,'utf8'));if(!Array.isArray(hashes)||hashes.some(x=>!/^[a-f0-9]{64}$/.test(x)))throw Error('Invalid device-hash store');}
 if(!allowUnpaired&&!hashes.length)throw Error('No MPS device authorization configured; start refused');
 return {cfg,binding,deviceCount:hashes.length,summary:{protocol:'mps-paper-v1',port:cfg.port,listenMode:binding.listenMode,projects:cfg.projects.length,modelEnabled:cfg.enableModel,authorizedDeviceCount:hashes.length,readyToStart:hashes.length>0,remaining:hashes.length?[]:['explicit device-credential authorization']}};
}
