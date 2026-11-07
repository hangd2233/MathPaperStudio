// Platform-only adaptation. Paper/project/agent behavior stays in formal Prism.
import {open as nativeExternal} from '@tauri-apps/plugin-shell';
import * as dialog from '@tauri-apps/plugin-dialog';
import {getCurrentWindow as nativeWindow} from '@tauri-apps/api/window';
import {getCurrentWebview as nativeWebview} from '@tauri-apps/api/webview';
import {isRemotePrism} from './runtime-transport';
export const openExternal:typeof nativeExternal=(...args)=>isRemotePrism()?Promise.reject(Error('Open this external link on the Mac host')):nativeExternal(...args);
export const open:typeof dialog.open=(...args)=>isRemotePrism()?Promise.reject(Error('Import files using the registered Mac Prism project')):dialog.open(...args);
export const save:typeof dialog.save=(...args)=>isRemotePrism()?Promise.reject(Error('Export to the registered Mac Prism project')):dialog.save(...args);
export const ask:typeof dialog.ask=(message,...args)=>isRemotePrism()?Promise.resolve(window.confirm(message)):dialog.ask(message,...args);
export const confirm:typeof dialog.confirm=(message,...args)=>isRemotePrism()?Promise.resolve(window.confirm(message)):dialog.confirm(message,...args);
export const message:typeof dialog.message=(text,...args)=>isRemotePrism()?Promise.resolve().then(()=>{window.alert(text);return 'Ok' as const;}):dialog.message(text,...args);
export function getCurrentWindow(){const win=nativeWindow();if(!isRemotePrism())return win;return new Proxy(win,{get(target,key,receiver){if(['setTitle','setTheme','show','hide','startDragging'].includes(String(key)))return async()=>{};const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;}});}
export function getCurrentWebview(){const webview=nativeWebview();if(!isRemotePrism())return webview;return new Proxy(webview,{get(target,key,receiver){if(key==='setZoom')return async(value:number)=>document.documentElement.style.setProperty('zoom',String(value));if(key==='onDragDropEvent')return async()=>()=>{};const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;}});}
