import {invoke as nativeInvoke} from '@tauri-apps/api/core';
import {PrismRemoteTransport,type RemoteProject} from './prism-remote';
export class IpadConnection {
 address:string;projects:RemoteProject[]=[];
 constructor(address:string,private token:string){const u=new URL(address);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))))throw Error('Use this iPad NodeBaby loopback URL or HTTPS');this.address=u.origin;}
 request=async(path:string,method='GET',body?:unknown)=>{const r=await nativeInvoke<{status:number;data:any}>('mps_http',{address:this.address,endpoint:path,token:this.token,method,body:body??null});if(r.status<200||r.status>=300)throw Object.assign(Error(r.data?.error??'Prism host request failed'),{status:r.status});return r.data;};
 async probe(){const r=await nativeInvoke<{status:number;data:any}>('mps_http',{address:this.address,endpoint:'/health',token:'',method:'GET',body:null});if(r.status!==401&&!(r.status===200&&r.data?.protocol==='mps-paper-v1'))throw Error('新入口尚未通过无令牌可达检查');}
 async connect(){const health=await this.request('/health');if(health.protocol!=='mps-paper-v1'||!health.capabilities?.includes('prism-workbench-v1'))throw Error('Mac 执行端尚未升级为正式 Prism 工作台适配服务');this.projects=(await this.request('/projects')).projects;return new PrismRemoteTransport(this.request,this.projects,health.prismLedgerId);}
 close(){this.token='';}
}
export const ipadVault={load:()=>nativeInvoke<string|null>('mps_vault_load'),save:(token:string)=>nativeInvoke<void>('mps_vault_save',{token}),forget:()=>nativeInvoke<void>('mps_vault_forget')};
