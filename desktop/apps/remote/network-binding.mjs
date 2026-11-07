import os from 'node:os';
import {isIP} from 'node:net';

const privateIPv4=value=>isIP(value)===4&&(/^(10\.|192\.168\.)/.test(value)||(/^172\./.test(value)&&Number(value.split('.')[1])>=16&&Number(value.split('.')[1])<=31));
export const sourceMatches=(actual,expected)=>typeof actual==='string'&&actual.replace(/^::ffff:/,'')===expected;

/** MRC's exact-interface/single-NAS source pattern; never discovers or changes routes. */
export function inspectBinding(cfg,interfaces=os.networkInterfaces()){
 if(cfg.networkMode===undefined||cfg.networkMode==='loopback'){
  if(!['127.0.0.1','::1'].includes(cfg.host))throw Error('Only loopback binding is enabled without explicit NAS ingress configuration');
  if(cfg.nasSourceIP!==undefined||cfg.networkInterface!==undefined)throw Error('NAS fields require the explicit nas-lan mode');
  return {listenMode:'loopback-only'};
 }
 if(cfg.networkMode!=='nas-lan'||cfg.nasIngressApproved!==true)throw Error('NAS LAN ingress requires separately confirmed exact network scope');
 if(!privateIPv4(cfg.host)||!privateIPv4(cfg.nasSourceIP)||cfg.host===cfg.nasSourceIP)throw Error('NAS ingress requires distinct exact private IPv4 host and source addresses');
 if(!/^en[0-9]+$/.test(cfg.networkInterface??''))throw Error('NAS ingress requires an exact physical Mac interface');
 if(!(interfaces[cfg.networkInterface]??[]).some(a=>!a.internal&&a.address===cfg.host))throw Error('Approved NAS ingress address is not on the selected Mac interface');
 return {listenMode:'single-nas-lan',allowedSource:cfg.nasSourceIP};
}
