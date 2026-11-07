import {invoke as nativeInvoke,convertFileSrc as nativeFileSrc} from '@tauri-apps/api/core';
import {listen as nativeListen,type UnlistenFn} from '@tauri-apps/api/event';
export interface PrismHostTransport {
 kind:'remote-ipad';
 invoke<T>(command:string,args?:Record<string,unknown>):Promise<T>;
 listen<T>(event:string,handler:(event:{payload:T})=>void):Promise<UnlistenFn>;
 fileURL?(path:string):string;
}
let installed:PrismHostTransport|null=null;
// This boundary preserves Prism's backend facade, stores and business components.
// A connection screen installs transport; it cannot register arbitrary Mac roots.
export function installPrismTransport(transport:PrismHostTransport){if(installed)throw Error('Disconnect the existing Prism transport first');installed=transport;return()=>{if(installed===transport)installed=null;};}
export function isRemotePrism(){return installed!==null;}
export function hostInvoke<T>(command:string,args?:Record<string,unknown>):Promise<T>{return installed?installed.invoke<T>(command,args):nativeInvoke<T>(command,args);}
export function hostListen<T>(event:string,handler:(event:{payload:T})=>void):Promise<UnlistenFn>{return installed?installed.listen<T>(event,handler):nativeListen<T>(event,handler);}
export function hostFileURL(path:string,protocol?:string){if(installed){if(!installed.fileURL)throw Error('Remote assets must be loaded through registered Prism file references');return installed.fileURL(path);}return nativeFileSrc(path,protocol);}
export function remoteFileReference(path:string){const t=installed as PrismHostTransport&{file?:(path:string)=>{projectId:string;path:string}};if(!t?.file)throw Error('Remote Prism file host is unavailable');return t.file(path);}
export function remoteProjectReference(path:string){const t=installed as PrismHostTransport&{project?:(root:string)=>{id:string;root:string;name:string}};if(!t?.project)throw Error('Remote Prism project host is unavailable');return t.project(path);}
