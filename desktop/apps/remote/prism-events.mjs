import {randomUUID} from 'node:crypto';
/** Preserve native Prism event names/payloads. Only identified registered project
 * events enter the per-project remote stream; unknown thread events stay private.
 */
export class PrismEvents{
 constructor(store,projects){this.store=store;this.projects=new Set(projects);this.threads=new Map();this.pending=[];this.state=store.load();this.state.epoch=randomUUID();this.state.events??=[];this.state.cursor??=0;this.state.threads??={};this.threads=new Map(Object.entries(this.state.threads).filter(([,id])=>this.projects.has(id)));store.save(this.state);}
 bindThread(threadId,projectId){if(!this.projects.has(projectId))throw Error('Unregistered event project');this.threads.set(threadId,projectId);this.state.threads[threadId]=projectId;}
 append(projectId,name,payload){if(!this.projects.has(projectId))return;this.state.events.push({id:++this.state.cursor,projectId,name,payload});if(this.state.events.length>2000)this.state.events.splice(0,this.state.events.length-2000);this.store.save(this.state);}
 accept({name,payload}){
  if(name==='project-review'){this.append(payload.projectId,name,payload);return;}
  if(name!=='codex-event')return;const params=payload.params??{},thread=params.threadId??params.thread?.id;
  if(payload.method==='prism/session'&&this.projects.has(params.projectId)&&thread){this.bindThread(thread,params.projectId);const pending=this.pending.splice(0);for(const packet of pending)this.accept(packet);}
  const projectId=this.projects.has(params.projectId)?params.projectId:this.threads.get(thread);
  if(!projectId){this.pending.push({name,payload});if(this.pending.length>1000)this.pending.shift();return;}
  this.append(projectId,name,payload);
 }
 read(projectId,after){if(!this.projects.has(projectId))throw Error('Unregistered project');return {epoch:this.state.epoch,cursor:this.state.cursor,events:this.state.events.filter(e=>e.projectId===projectId&&e.id>after)};}
}
