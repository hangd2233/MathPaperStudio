export async function open(..._args:any[]):Promise<any>{throw Error('Import this material into its registered Prism project on the Mac');}
export async function save(..._args:any[]):Promise<any>{throw Error('Export through the registered Prism project on the Mac');}
export async function ask(message:string,..._args:any[]){return window.confirm(message);}
export const confirm=ask;
export async function message(text:string,..._args:any[]){window.alert(text);return 'Ok' as const;}
