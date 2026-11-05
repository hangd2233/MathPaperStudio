//! Portable manual-writing metadata. Immutable revisions retain concurrent heads.
//! This module writes only .mps/ and a private backup of legacy application records.
use crate::{projects, Backend};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::{collections::{BTreeMap, BTreeSet}, fs, io::Write, path::{Component, Path, PathBuf}};

fn empty() -> Value { json!({"mode":"agent","outline":[],"reviews":[]}) }
fn legacy(app:&Backend,id:&str)->Result<PathBuf,String> {
    projects::get(app,id)?;
    Ok(projects::data_dir(app)?.join(format!("manual-{id}.json")))
}
fn directory(app:&Backend,id:&str)->Result<PathBuf,String> {
    projects::resolve(&projects::get(app,id)?.root,".mps")
}
fn read(path:&Path)->Result<Value,String> {
    let meta=fs::symlink_metadata(path).map_err(|e|e.to_string())?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len()>64_000_000 {return Err("Unsafe or oversized manual metadata file".into());}
    serde_json::from_slice(&fs::read(path).map_err(|e|e.to_string())?).map_err(|e|format!("Damaged manual metadata {}: {e}; file retained, nothing overwritten",path.display()))
}
fn digest(data:&Value)->Result<String,String> {Ok(format!("{:x}",Sha1::digest(serde_json::to_vec(data).map_err(|e|e.to_string())?)))}
fn relative(path:&str)->bool {
    !path.is_empty() && !path.contains(['\\',':']) && Path::new(path).components().all(|c|matches!(c,Component::Normal(_)))
}
// Whitelist the complete manual record format, never application settings or credentials.
fn body(value:&Value)->Result<Value,String> {
    if value["mode"]!="agent" && value["mode"]!="manual" {return Err("Invalid manual writing mode".into());}
    let outline=value["outline"].as_array().ok_or("Invalid manual outline")?;
    let reviews=value["reviews"].as_array().ok_or("Invalid manual reviews")?;
    if outline.len()>500 || reviews.len()>1000 {return Err("Manual metadata item limit exceeded".into());}
    let mut items=vec![];
    for i in outline {
        if !i["title"].is_string() || !i["id"].is_string() || !i["line"].is_u64() || !["section","subsection","theorem","lemma","proof"].contains(&i["kind"].as_str().unwrap_or("")) || !["todo","draft","check","confirmed"].contains(&i["status"].as_str().unwrap_or("")) {return Err("Invalid portable outline item".into());}
        let path=i["path"].as_str().unwrap_or("");if !path.is_empty() && !relative(path){return Err("Outline paths must be project-relative".into());}
        let mut item=json!({"id":i["id"],"title":i["title"],"kind":i["kind"],"status":i["status"],"path":path,"line":i["line"]});if let Some(parent)=i.get("parentId"){let parent=parent.as_str().ok_or("Invalid navigation parent")?;if parent.is_empty()||parent.len()>300{return Err("Invalid navigation parent".into());}item["parentId"]=json!(parent);}items.push(item);
    }
    let mut records=vec![];
    for r in reviews {
        if !r["id"].is_string() || !["language","proof","calculation"].contains(&r["kind"].as_str().unwrap_or("")) || !r["state"].is_string() {return Err("Invalid portable review record".into());}
        let sources=r["sources"].as_object().ok_or("Missing review source snapshot")?;
        let mut size=0;
        for (path,text) in sources {
            if !relative(path) || path.split('/').any(|p|p.starts_with('.')) || !["tex","bib","sty","cls"].contains(&path.rsplit('.').next().unwrap_or("")) {return Err("Review snapshots may contain only relative manuscript source files".into());}
            size+=text.as_str().ok_or("Invalid source snapshot text")?.len();
        }
        if size>2_000_000 {return Err("Review source snapshot exceeds 2 MB".into());}
        let mut record=json!({});
        for key in ["id","kind","state","revision","sources","createdAt","updatedAt","completedAt","raw","result","error"] {if let Some(v)=r.get(key){record[key]=v.clone();}}
        if let Some(p)=r.get("policy") {record["policy"]=json!({"model":p["model"],"sandbox":{"type":p["sandbox"]["type"],"networkAccess":p["sandbox"]["networkAccess"]},"approvalPolicy":p["approvalPolicy"]});}
        records.push(record);
    }
    let mut data=json!({"mode":value["mode"],"outline":items,"reviews":records});
    if let Some(p)=value.get("planning"){data["planning"]=crate::planning::sanitize(p)?;}
    if let Some(s)=value.get("symbols"){data["symbols"]=crate::symbols::sanitize(s)?;}
    Ok(data)
}
struct Graph { project:String, revisions:BTreeMap<String,Value>, heads:Vec<String> }
fn graph(dir:&Path)->Result<Graph,String> {
    for e in fs::read_dir(dir).map_err(|e|e.to_string())? {
        let e=e.map_err(|e|e.to_string())?;let name=e.file_name().to_string_lossy().into_owned();
        if name.contains("sync-conflict") {return Err("Manual metadata has a synchronization conflict copy; retain and compare it before writing".into());}
    }
    let manifest=read(&dir.join("project.json"))?;
    let project=manifest["projectId"].as_str().ok_or("Missing portable project identity")?.to_string();
    uuid::Uuid::parse_str(&project).map_err(|_|"Invalid portable project identity")?;
    if manifest["schemaVersion"]!=1 {return Err("Unsupported portable metadata version".into());}
    let rd=dir.join("revisions");
    if fs::symlink_metadata(&rd).map(|m|m.file_type().is_symlink()).unwrap_or(false) {return Err("Symlink metadata directories are forbidden".into());}
    let mut revisions=BTreeMap::new();let mut referenced=BTreeSet::new();
    if rd.exists(){for e in fs::read_dir(&rd).map_err(|e|e.to_string())? {
        let e=e.map_err(|e|e.to_string())?;let name=e.file_name().to_string_lossy().into_owned();
        if name.contains("sync-conflict") {return Err("Manual metadata revision has a synchronization conflict copy; nothing overwritten".into());}
        if name.ends_with(".tmp") {continue;}
        if !name.ends_with(".json") {return Err("Unexpected file in manual revision directory; inspect it before writing".into());}
        let revision=read(&e.path())?;let id=revision["id"].as_str().ok_or("Missing revision identity")?.to_string();
        uuid::Uuid::parse_str(&id).map_err(|_|"Invalid manual revision identity")?;
        if name!=format!("{id}.json") || revision["projectId"]!=project || revision["schemaVersion"]!=1 {return Err("Portable metadata identity/version mismatch".into());}
        let canonical=body(&revision["data"])?;
        if canonical!=revision["data"] {return Err("Unexpected portable metadata fields; record retained for inspection".into());}
        if digest(&canonical)?!=revision["dataDigest"] {return Err("Manual revision checksum mismatch; damaged record retained".into());}
        for parent in revision["parents"].as_array().ok_or("Invalid revision ancestry")? {referenced.insert(parent.as_str().ok_or("Invalid parent identity")?.to_string());}
        revisions.insert(id,revision);
        if revisions.len()>10_000 {return Err("Too many manual metadata revisions; archive with author review before continuing".into());}
    }}
    // A sync can deliver a child before its parents: do not accept a partial graph.
    if referenced.iter().any(|id|!revisions.contains_key(id)) {return Err("Manual metadata is still syncing: parent revision missing; retry after synchronization".into());}
    let heads=revisions.keys().filter(|id|!referenced.contains(*id)).cloned().collect::<Vec<_>>();
    if !revisions.is_empty() && heads.is_empty() {return Err("Invalid manual revision graph".into());}
    Ok(Graph{project,revisions,heads})
}
fn decorate(mut data:Value,status:&str,heads:Vec<String>,project:Option<&str>)->Value {
    data["storageStatus"]=json!(status);data["storageHeads"]=json!(heads);data["stableProjectId"]=json!(project);data
}
fn local_mode(app:&Backend,project:&str)->Result<Value,String> {
    let path=projects::data_dir(app)?.join(format!("manual-mode-{project}.json"));
    if !path.exists(){return Ok(json!("manual"));}
    let mode=read(&path)?;
    if mode["mode"]!="manual" && mode["mode"]!="agent" {return Err("Invalid local writing mode preference".into());}
    Ok(mode["mode"].clone())
}
fn save_local_mode(app:&Backend,project:&str,mode:&Value)->Result<(),String> {
    let path=projects::data_dir(app)?.join(format!("manual-mode-{project}.json"));
    if path.exists() && read(&path)?["mode"]==*mode {return Ok(());}
    projects::save_json(&path,&json!({"mode":mode}))
}
pub(crate) fn load(app:&Backend,id:&str)->Result<Value,String> {
    let dir=directory(app,id)?;
    if dir.exists() {
        let g=graph(&dir)?;
        if g.heads.len()>1 {
            let mut conflict=decorate(json!({"mode":"manual","outline":[],"reviews":[]}),"conflict",g.heads.clone(),Some(&g.project));
            conflict["storageChoices"]=json!(g.heads.iter().map(|h|json!({"id":h,"createdAt":g.revisions[h]["createdAt"],"data":g.revisions[h]["data"]})).collect::<Vec<_>>());return Ok(conflict);
        }
        let mut data=g.heads.first().map(|h|g.revisions[h]["data"].clone()).unwrap_or_else(empty);
        // A remote record must never enable an agent-writing mode on this device.
        data["mode"]=local_mode(app,&g.project)?;
        return Ok(decorate(data,"portable",g.heads,Some(&g.project)));
    }
    let old=legacy(app,id)?;
    if old.exists(){let mut data=decorate(body(&read(&old)?)?,"legacy",vec![],None);data["legacyDigest"]=json!(digest(&read(&old)?)?);return Ok(data);}
    Ok(decorate(empty(),"new",vec![],None))
}
fn append(app:&Backend,id:&str,data:&Value,parents:Vec<String>)->Result<(),String> {
    let canonical=body(data)?;let dir=directory(app,id)?;
    fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    let mp=dir.join("project.json");
    if !mp.exists(){
        let manifest=json!({"schemaVersion":1,"projectId":uuid::Uuid::new_v4().to_string(),"createdAt":chrono::Utc::now().to_rfc3339()});
        match fs::OpenOptions::new().write(true).create_new(true).open(&mp) {
            Ok(mut file)=>{file.write_all(&serde_json::to_vec_pretty(&manifest).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;file.sync_all().map_err(|e|e.to_string())?;},
            Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>{},
            Err(e)=>return Err(e.to_string())
        }
    }
    let g=graph(&dir)?;
    if parents.iter().any(|p|!g.revisions.contains_key(p)) {return Err("The expected manual metadata revision is no longer available".into());}
    let rid=uuid::Uuid::new_v4().to_string();let rd=dir.join("revisions");fs::create_dir_all(&rd).map_err(|e|e.to_string())?;
    let revision=json!({"schemaVersion":1,"projectId":g.project,"id":rid,"parents":parents,"createdAt":chrono::Utc::now().to_rfc3339(),"dataDigest":digest(&canonical)?,"data":canonical});
    projects::save_json(&rd.join(format!("{rid}.json")),&revision)
}
pub(crate) fn save(app:&Backend,id:&str,data:&Value)->Result<(),String> {
    let old=legacy(app,id)?;
    if !directory(app,id)?.exists() && old.exists() {return projects::save_json(&old,&body(data)?);}
    let parents=serde_json::from_value::<Vec<String>>(data["storageHeads"].clone()).unwrap_or_default();
    append(app,id,data,parents)?;
    let project=graph(&directory(app,id)?)?.project;
    save_local_mode(app,&project,&data["mode"])
}
pub(crate) fn check_expected(data:&Value,args:&Value)->Result<(),String> {
    if data["storageStatus"]=="conflict" {return Err("Concurrent manual metadata versions retained. Compare and explicitly choose a version before editing.".into());}
    if data["storageStatus"]=="portable" && data["storageHeads"]!=args["expectedHeads"] {return Err("Manual metadata changed on another writer. Refresh before saving; no version was overwritten.".into());}
    Ok(())
}
pub(crate) fn migrate(app:&Backend,id:&str,args:&Value)->Result<Value,String> {
    if directory(app,id)?.exists() {return load(app,id);}
    let path=legacy(app,id)?;if !path.exists(){return Err("No legacy manual metadata for this project".into());}
    let original=read(&path)?;
    if args["legacyDigest"]!=digest(&original)? {return Err("Legacy records changed; refresh and verify before migrating".into());}
    let backup=projects::data_dir(app)?.join("manual-migration-backups");fs::create_dir_all(&backup).map_err(|e|e.to_string())?;
    let bp=backup.join(format!("{id}-{}.json",uuid::Uuid::new_v4()));fs::copy(&path,&bp).map_err(|e|e.to_string())?;
    if fs::read(&path).map_err(|e|e.to_string())?!=fs::read(&bp).map_err(|e|e.to_string())? {return Err("Legacy backup verification failed; migration stopped".into());}
    let canonical=body(&original)?;append(app,id,&canonical,vec![])?;
    save_local_mode(app,&graph(&directory(app,id)?)?.project,&canonical["mode"])?;
    let result=load(app,id)?;if body(&result)?!=canonical {return Err("Portable migration validation failed; legacy original and backup retained".into());}
    Ok(result)
}
pub(crate) fn resolve(app:&Backend,id:&str,args:&Value)->Result<Value,String> {
    let dir=directory(app,id)?;let g=graph(&dir)?;
    if args["expectedHeads"]!=json!(g.heads) {return Err("Conflict versions changed; refresh before resolving".into());}
    let chosen=args["revisionId"].as_str().ok_or("Select a revision explicitly")?;
    if !g.heads.iter().any(|h|h==chosen) {return Err("Selected conflict revision is no longer a current head".into());}
    append(app,id,&g.revisions[chosen]["data"],g.heads)?;load(app,id)
}
pub(crate) fn load_for_review(app:&Backend,id:&str,run:&str)->Result<Value,String> {
    let data=load(app,id)?;
    if data["storageStatus"]!="conflict" {return Ok(data);}
    // Finish only a branch that contains this run. Other concurrent heads remain
    // unresolved, so no concurrent author changes are silently merged away.
    for choice in data["storageChoices"].as_array().ok_or("Invalid conflict data")? {
        if choice["data"]["reviews"].as_array().map(|rs|rs.iter().any(|r|r["id"]==run)).unwrap_or(false) {
            let mut selected=choice["data"].clone();selected["mode"]=local_mode(app,data["stableProjectId"].as_str().ok_or("Missing project identity")?)?;
            return Ok(decorate(selected,"portable",vec![choice["id"].as_str().ok_or("Invalid revision identity")?.to_string()],data["stableProjectId"].as_str()));
        }
    }
    Err("Review result needs recovery: no retained branch contains the running review".into())
}

pub(crate) fn load_for_planning(app:&Backend,id:&str,run:&str)->Result<Value,String>{
 let data=load(app,id)?;if data["storageStatus"]!="conflict"{return Ok(data);}
 for choice in data["storageChoices"].as_array().ok_or("Invalid conflict data")?{
  if choice["data"]["planning"]["runs"].as_array().is_some_and(|rs|rs.iter().any(|r|r["id"]==run)){
   let mut selected=choice["data"].clone();selected["mode"]=local_mode(app,data["stableProjectId"].as_str().ok_or("Missing project identity")?)?;
   return Ok(decorate(selected,"portable",vec![choice["id"].as_str().ok_or("Missing revision id")?.into()],data["stableProjectId"].as_str()));
  }
 }Err("Planning result needs recovery: no retained branch contains the run".into())
}
