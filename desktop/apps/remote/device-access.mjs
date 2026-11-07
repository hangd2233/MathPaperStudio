// Local operator tool. Implementing/inspecting this command does not grant a device access.
import fs from 'node:fs';import path from 'node:path';import {randomBytes} from 'node:crypto';import {fileURLToPath} from 'node:url';import {inspectConfiguration} from './config.mjs';import {atomicJSON,digest} from './service.mjs';
export function issueDevice(configFile,tokenOutput,{makeToken=()=>randomBytes(32).toString('base64url')}={}){
 const {cfg,deviceCount}=inspectConfiguration(configFile,{allowUnpaired:true});if(deviceCount!==0)throw Error('A device grant already exists; do not create an additional grant silently');if(fs.existsSync(path.join(cfg.runtimeDir,'mps-owner.lock')))throw Error('Stop the dedicated MPS service before issuing its initial grant');
 if(!path.isAbsolute(tokenOutput))throw Error('Use an absolute private handoff-file path');const rel=path.relative(cfg.runtimeDir,tokenOutput);if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Handoff file must stay inside the MPS runtime');
 let current=cfg.runtimeDir;for(const part of rel.split(path.sep).slice(0,-1)){current=path.join(current,part);const s=fs.lstatSync(current);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0)throw Error('Handoff parents must be private real directories');}
 const token=makeToken();if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('Invalid device-token generator');const fd=fs.openSync(tokenOutput,'wx',0o600);try{fs.writeFileSync(fd,token+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd)}
 atomicJSON(cfg.deviceHashesFile,[digest(token)]);return {authorizedDevices:1,tokenPrinted:false,handoffFile:tokenOutput,scope:'all explicitly registered MPS project copies',expires:'until locally revoked'};
}
export function revokeDevices(configFile){const {cfg}=inspectConfiguration(configFile,{allowUnpaired:true});atomicJSON(cfg.deviceHashesFile,[]);return {authorizedDevices:0,newRequestsDenied:true,existingAdmittedTasksAutomaticallyCancelled:false};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [mode,file,output,confirmation]=process.argv.slice(2);if(!file)throw Error('Usage: device-access.mjs inspect <config> | issue <config> <private-handoff-file> --confirmed-device-grant | revoke <config> --confirmed-revocation');
  if(mode==='inspect'){const {summary}=inspectConfiguration(path.resolve(file),{allowUnpaired:true});console.log(JSON.stringify(summary,null,2));}
  else if(mode==='issue'){if(confirmation!=='--confirmed-device-grant')throw Error('Initial persistent device access requires explicit user authorization');console.log(JSON.stringify(issueDevice(path.resolve(file),output),null,2));}
  else if(mode==='revoke'){if(output!=='--confirmed-revocation')throw Error('Revocation requires explicit operator intent');console.log(JSON.stringify(revokeDevices(path.resolve(file)),null,2));}
  else throw Error('Unknown device-access operation');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
