import fs from 'node:fs';import path from 'node:path';
import {mergePortable} from './prism-portable.mjs';
import {createPrismSyncService} from './prism-sync-service.mjs';
import {inspectConfiguration} from './config.mjs';import {createPaperService} from './service.mjs';
import {PrismCoreBridge} from './prism-core-bridge.mjs';import {PrismAgentGateway} from './prism-agent.mjs';import {PrismEvents} from './prism-events.mjs';import {createPrismRPC} from './prism-rpc.mjs';import {privateStore,projectSerializer} from './private-state.mjs';
const file=path.resolve(process.argv[2]??''),{cfg,binding}=inspectConfiguration(file),runtime=fs.realpathSync(cfg.runtimeDir),lock=path.join(runtime,'mps-owner.lock');
const fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,String(process.pid));fs.fsyncSync(fd);fs.closeSync(fd);
const core=new PrismCoreBridge(cfg.binary,file);let service;
try{
 const init=await core.init(),projects=init.projects.map(p=>p.id),serial=projectSerializer();
 // Seed the real Prism paper workbench using only its immutable portable data.
 // Preserve independent working metadata if identities diverge; never overwrite.
 for(const mapping of cfg.syncMappings??[]){const working=cfg.projects.find(p=>p.root===mapping.workingRoot);if(!working)throw Error('Portable mapping outside registered copies');
  try{const registered=init.projects.find(p=>p.id===mapping.workingProjectId);if(!registered)throw Error('Portable mapping project identity changed');await mergePortable({sourceRoot:mapping.originalRoot,destinationRoot:working.root,validateSource:()=>core.call('sync_manual_status',{mappingId:mapping.id}),validateDestination:()=>core.call('manual_operation',{projectId:registered.id,action:'get',args:{}})});}catch(error){console.error('Portable workbench data retained; explicit comparison required for mapping '+mapping.id);}
 }
 const gateway=new PrismAgentGateway({core,store:privateStore(path.join(runtime,'prism-agent-admissions.json')),policy:{accountAccessApproved:cfg.accountAccessApproved===true,modelExecutionApproved:cfg.enableModel===true,modelProjects:init.projects.filter(p=>p.modelAllowed).map(p=>p.id),model:cfg.model,effort:cfg.effort},projects});
 const events=new PrismEvents(privateStore(path.join(runtime,'prism-events.json'),{events:[],cursor:0}),projects);
 gateway.onBoundInteraction=(event,{projectId,threadId})=>{events.bindThread(threadId,projectId);events.accept({name:'codex-event',payload:event});};
 core.listeners.add(packet=>{if(packet.name==='codex-event')gateway.acceptCoreEvent(packet.payload);if(packet.name!=='codex-event'||packet.payload.id===undefined)events.accept(packet);});
 const sync=createPrismSyncService({core,mappings:cfg.syncMappings??[],runtime,originalWriteApproved:cfg.originalSyncWriteApproved===true,serial,beforeMutation:id=>service.assertIdle(id)});
 const rpc=createPrismRPC({core,projects,gateway,serial,sync,beforeMutation:id=>service.assertIdle(id)});
 const tokenHashes=()=>JSON.parse(fs.readFileSync(cfg.deviceHashesFile,'utf8'));
 service=createPaperService({backend:core,projects:init.projects,journal:path.join(runtime,'mps-tasks.json'),tokenHashes,origins:cfg.origins,enableModel:cfg.enableModel===true,legacyWriteEnabled:false,allowedSource:binding.allowedSource,projectSerial:serial,prismLedgerId:gateway.ledgerId,prismRPC:rpc,prismEvents:(_,id,after)=>events.read(id,after),prismReceipt:async(owner,project,id,key)=>{const r=id?gateway.query(owner,id):gateway.find(owner,project,key);if(r.projectId!==project)throw Object.assign(Error('Wrong receipt project'),{status:404});return gateway.reconcile(owner,r.id);}});
 await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(cfg.port,cfg.host,resolve)});
 console.log(JSON.stringify({phase:'running',product:'formal-prism-host',projectCount:projects.length,modelEnabled:cfg.enableModel===true,listenMode:binding.listenMode,port:cfg.port}));
 let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await service.close();fs.unlinkSync(lock);};process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
}catch(error){try{await core.close()}finally{fs.unlinkSync(lock)}throw error;}
