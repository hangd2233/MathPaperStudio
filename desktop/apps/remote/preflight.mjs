import path from 'node:path';import {inspectConfiguration} from './config.mjs';
try{const {summary}=inspectConfiguration(path.resolve(process.argv[2]??''),{allowUnpaired:true});console.log(JSON.stringify(summary,null,2));if(!summary.readyToStart)process.exitCode=2;}catch(e){console.error(e.message);process.exitCode=1;}
