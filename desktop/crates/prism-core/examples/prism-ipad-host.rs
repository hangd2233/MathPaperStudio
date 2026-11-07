//! Private host of the formal Prism Backend; never expose this stdin RPC directly.
use prism_core::{Backend,BackendConfig,BackendEvent,EventSink};
use serde_json::{json,Value};
use std::{collections::BTreeMap,io::{self,BufRead,Write},path::Path,sync::{Arc,Mutex}};
#[derive(Clone)]struct Output(Arc<Mutex<io::Stdout>>);
impl Output{fn send(&self,value:Value){if let Ok(mut out)=self.0.lock(){let _=writeln!(out,"{}",value);let _=out.flush();}}}
impl EventSink for Output{fn emit(&self,event:BackendEvent){self.send(json!({"event":{"name":event.name(),"payload":event.payload()}}));}}
fn text(v:&Value,k:&str)->Result<String,String>{v[k].as_str().map(str::to_owned).ok_or_else(||format!("Missing {k}"))}
fn relative(p:&str)->Result<(),String>{if p.is_empty()||Path::new(p).is_absolute()||p.contains('\\')||p.contains(':')||p.split('/').any(|s|s.is_empty()||s.starts_with('.')){Err("Invalid project-relative path".into())}else{Ok(())}}
fn protected(p:&str)->bool{["attachments","imports","reviews","releases"].iter().any(|s|p==*s||p.starts_with(&format!("{}/",s)))}
fn account(cfg:&Value)->Result<(),String>{if cfg["accountAccessApproved"]==true{Ok(())}else{Err("Mac Codex identity access has not been approved".into())}}
async fn dispatch(b:&Backend,registry:&BTreeMap<String,Value>,cfg:&Value,cmd:&str,a:Value)->Result<Value,String>{
 if cmd=="init"{return Ok(json!({"protocol":"prism-host-v1","projects":registry.values().collect::<Vec<_>>()}))}
 if cmd=="shutdown"{b.shutdown().await;return Ok(Value::Null)}
 if cmd=="codex_status"{account(cfg)?;return b.codex_status().await}
 if cmd=="codex_respond"{account(cfg)?;let result=&a["result"];let denial=[Some("decline"),Some("cancel")].contains(&result["decision"].as_str())||result["action"]=="cancel"||(result["permissions"].as_object().map(|p|p.is_empty()).unwrap_or(false)&&result["scope"]=="turn");let answer=result["answers"].is_object()&&result.to_string().len()<=20000;if !denial&&!answer{return Err("Permission expansion requires a bound human approval".into())}b.codex_respond(a["id"].clone(),a["result"].clone()).await?;return Ok(Value::Null)}
 if cmd=="sync_manual_status"{
  let key=text(&a,"mappingId")?;let mapping=cfg["syncMappings"].as_array().and_then(|list|list.iter().find(|m|m["id"].as_str()==Some(key.as_str()))).ok_or("Unregistered original metadata mapping")?;
  let root=std::fs::canonicalize(text(mapping,"originalRoot")?).map_err(|e|e.to_string())?;let p=b.project_register(root.to_string_lossy().into())?;
  return b.manual_operation(p.id,"get".into(),json!({})).await
 }
 if cmd=="sync_manual_restore"{
  if cfg["originalSyncWriteApproved"]!=true{return Err("Original portable write scope is disabled".into())}
  let key=text(&a,"mappingId")?;let mapping=cfg["syncMappings"].as_array().and_then(|list|list.iter().find(|m|m["id"].as_str()==Some(key.as_str())&&m["allowWrite"]==true)).ok_or("Unapproved original mapping")?;
  let root=std::fs::canonicalize(text(mapping,"originalRoot")?).map_err(|e|e.to_string())?;let p=b.project_register(root.to_string_lossy().into())?;
  return b.manual_restore_snapshot(p.id,a["args"].clone()).await
 }
 if cmd=="sync_history_snapshot"{
  if cfg["originalSyncWriteApproved"]!=true{return Err("Original history/write scope is disabled".into())}
  let key=text(&a,"mappingId")?;let mapping=cfg["syncMappings"].as_array().and_then(|list|list.iter().find(|m|m["id"].as_str()==Some(key.as_str())&&m["allowWrite"]==true)).ok_or("Unapproved original mapping")?;
  let root=std::fs::canonicalize(text(mapping,"originalRoot")?).map_err(|e|e.to_string())?;let p=b.project_register(root.to_string_lossy().into())?;
  b.project_service(p.id.clone(),"history_init".into(),json!({})).await?;
  return b.project_service(p.id,"history_snapshot".into(),json!({"message":text(&a,"message")?})).await
 }
 let id=text(&a,"projectId")?;registry.get(&id).ok_or("Unregistered project")?;
 let path=||->Result<String,String>{let p=text(&a,"path")?;relative(&p)?;Ok(p)};
 match cmd{
 "manual_restore_snapshot"=>b.manual_restore_snapshot(id,a["args"].clone()).await,
 "sync_delete_checked"=>{let p=path()?;if protected(&p){return Err("Protected material".into())}b.project_remove_checked(id,p,text(&a,"expectedRevision")?)?;Ok(Value::Null)},
 "project_list"=>b.project_list(id),
 "project_read"=>b.project_read(id,path()?),
 "project_write"=>{let p=path()?;if protected(&p){return Err("Imported materials are read-only".into())}let bytes:Vec<u8>=serde_json::from_value(a["bytes"].clone()).map_err(|_|"Invalid bytes")?;if bytes.len()>2*1024*1024{return Err("Text save exceeds limit".into())}Ok(json!(b.project_write(id,p,bytes,a["expectedRevision"].as_str().map(str::to_owned))?))},
 "project_mutate"=>{let p=path()?;if protected(&p){return Err("Imported materials are read-only".into())}let action=text(&a,"action")?;if !["mkdir","delete","rename"].contains(&action.as_str()){return Err("Invalid mutation".into())}let destination=a["destination"].as_str().map(str::to_owned);if let Some(ref d)=destination{relative(d)?;if protected(d){return Err("Imported material destination is protected".into())}}b.project_mutate(id,p,action,destination)?;Ok(Value::Null)},
 "project_rename"=>Ok(json!(b.project_rename(id,text(&a,"name")?)?)),
 "project_review"=>b.project_review(id),
 "project_resolve_review"=>{b.project_resolve_review(id,path()?,a["undo"].as_bool().ok_or("Missing undo")?)?;Ok(Value::Null)},
 "project_service"=>{let operation=text(&a,"operation")?;if !["compile_latex","load_existing_pdf","synctex_edit","history_init","history_snapshot","history_list","history_diff","history_file_at","history_restore","history_add_label","history_remove_label"].contains(&operation.as_str()){return Err("Desktop environment operations require Mac setup".into())}let args=a["args"].clone();for field in ["path","mainFile","filePath"]{if let Some(p)=args[field].as_str(){relative(p)?;}}b.project_service(id,operation,args).await},
 "manual_operation"|"planning_operation"=>{let action=text(&a,"action")?;let model=["start","startThemes","startOutline","startMacros"].contains(&action.as_str());if model{account(cfg)?;if cfg["enableModel"]!=true||registry[&id]["modelAllowed"]!=true||a["args"]["model"]!=cfg["model"]||a["args"]["effort"]!=cfg["effort"]{return Err("Unapproved native model operation".into())}}else if !["get","save","migrate","resolveStorage","cancel","import","removeReport","requirements","mainline","editOutline","editMacros","previewMacros","applyMacros","preview","apply","exportPDF"].contains(&action.as_str()){return Err("Unknown native Prism operation".into())}if cmd=="manual_operation"{b.manual_operation(id,action,a["args"].clone()).await}else{b.planning_operation(id,action,a["args"].clone()).await}},
 "codex_sessions"=>{account(cfg)?;b.codex_sessions(id).await},
 "codex_thread"=>{account(cfg)?;let action=text(&a,"action")?;if !["read","archive","rename"].contains(&action.as_str()){return Err("Invalid thread action".into())}b.codex_thread(id,text(&a,"threadId")?,action,a["title"].as_str().map(str::to_owned)).await},
 "codex_send"=>{account(cfg)?;if registry[&id]["modelAllowed"]!=true||cfg["enableModel"]!=true||a["model"]!=cfg["model"]||a["effort"]!=cfg["effort"]{return Err("Explicit model policy required".into())}let main=a["mainDocument"].as_str().map(str::to_owned);if let Some(ref p)=main{relative(p)?;}b.codex_send_project_scoped(id,a["threadId"].as_str().map(str::to_owned),text(&a,"prompt")?,cfg["model"].as_str().map(str::to_owned),cfg["effort"].as_str().map(str::to_owned),Some(serde_json::from_value(a["images"].clone()).map_err(|_|"Invalid project image data")?),main).await},
 "codex_control"=>{account(cfg)?;b.codex_control(id,text(&a,"threadId")?,text(&a,"turnId")?,None).await},
 _=>Err("Unsupported Prism host command".into())
 }
}
#[tokio::main]async fn main()->Result<(),Box<dyn std::error::Error>>{
 let file=std::env::args().nth(1).ok_or("Pass private host configuration")?;let cfg:Value=serde_json::from_slice(&std::fs::read(file)?)?;
 let root=std::fs::canonicalize(text(&cfg,"projectRoot")?)?;let output=Output(Arc::new(Mutex::new(io::stdout())));
 let b=Backend::new(BackendConfig{data_dir:text(&cfg,"coreDataDir")?.into(),home_dir:text(&cfg,"homeDir")?.into(),temp_dir:text(&cfg,"tempDir")?.into()},Arc::new(output.clone()))?;
 // Configuration may point to an approved binary, but no account/model call is
 // performed at initialization. Never enumerate or copy the user's credentials.
 if let Some(binary)=cfg["codexPath"].as_str(){b.codex_set_path(binary.into()).await?;}
 let mut registry=BTreeMap::new();
 for item in cfg["projects"].as_array().ok_or("Explicit project copies required")?{let target=std::fs::canonicalize(text(item,"root")?)?;if target==root||!target.starts_with(&root){return Err("Only isolated registered project copies are allowed".into())}let main=text(item,"mainFile")?;relative(&main)?;let p=b.project_register(target.to_string_lossy().into())?;registry.insert(p.id.clone(),json!({"id":p.id,"name":item["name"],"mainFile":main,"modelAllowed":item["allowModel"]==true}));}
 for line in io::stdin().lock().lines(){let request:Value=match serde_json::from_str(&line?){Ok(v)=>v,Err(_)=>break};let cmd=request["command"].as_str().unwrap_or("");let packet=match dispatch(&b,&registry,&cfg,cmd,request["args"].clone()).await{Ok(result)=>json!({"id":request["id"],"result":result}),Err(message)=>json!({"id":request["id"],"error":message})};output.send(packet);if cmd=="shutdown"{break;}}
 b.shutdown().await;Ok(())
}
