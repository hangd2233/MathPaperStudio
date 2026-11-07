export async function join(...parts:string[]){if(parts.some(p=>p.split('/').some(x=>x==='..')||p.includes('\\')))throw Error('Project path escape refused');return parts.join('/').replace(/\/{2,}/g,'/');}
export async function homeDir():Promise<string>{throw Error('The iPad accesses only registered Mac Prism projects; no home-directory browsing');}
