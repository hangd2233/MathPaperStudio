import {useDocumentStore} from '@/stores/document-store';import type {PrismRemoteTransport} from './prism-remote';
/** Persist each actual Prism document edit before the debounce/network save. */
export function installPrismDraftObserver(transport:PrismRemoteTransport){return useDocumentStore.subscribe((state,previous)=>{
 if(state.files===previous.files)return;
 for(const file of state.files){if(!file.isDirty||typeof file.content!=='string'||file.content===previous.files.find(f=>f.id===file.id)?.content)continue;
  try{transport.persistDraft(file.ref,file.content);}catch(error){window.dispatchEvent(new CustomEvent('prism-local-draft-error',{detail:String(error)}));}
 }
});}
