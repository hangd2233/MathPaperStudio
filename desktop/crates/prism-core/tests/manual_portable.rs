use prism_core::{Backend,BackendConfig,RecordingEventSink};
use serde_json::{json,Value};
use std::{fs,path::Path,sync::Arc};

fn backend(base:&Path)->Backend {Backend::new(BackendConfig{data_dir:base.join("data"),home_dir:base.join("home"),temp_dir:base.join("tmp")},Arc::new(RecordingEventSink::default())).unwrap()}
fn paper(path:&Path){fs::create_dir_all(path).unwrap();fs::write(path.join("main.tex"),b"Human source\r\nUnchanged\r\n").unwrap();}
fn copy(from:&Path,to:&Path){fs::create_dir_all(to).unwrap();for e in fs::read_dir(from).unwrap(){let e=e.unwrap();let d=to.join(e.file_name());if e.file_type().unwrap().is_dir(){copy(&e.path(),&d);}else if d.exists(){assert_eq!(fs::read(&d).unwrap(),fs::read(e.path()).unwrap());}else{fs::copy(e.path(),d).unwrap();}}}
async fn get(b:&Backend,id:&str)->Value{b.manual_operation(id.into(),"get".into(),json!({})).await.unwrap()}
async fn save(b:&Backend,id:&str,mut args:Value)->Value{args["expectedHeads"]=get(b,id).await["storageHeads"].clone();b.manual_operation(id.into(),"save".into(),args).await.unwrap();get(b,id).await}
fn item(title:&str)->Value{json!({"id":"outline-one","title":title,"kind":"theorem","status":"check","path":"main.tex","line":1})}

#[tokio::test]
async fn portable_outline_survives_reopen_rename_and_other_device_copy_without_source_writes(){
 let d=tempfile::tempdir().unwrap();let root=d.path().join("paper");paper(&root);let original=fs::read(root.join("main.tex")).unwrap();let b=backend(&d.path().join("device-a"));let id=b.project_register(root.to_string_lossy().into()).unwrap().id;
 let first=save(&b,&id,json!({"mode":"manual","outline":[item("Author's theorem")]})).await;assert_eq!(first["storageStatus"],"portable");let stable=first["stableProjectId"].clone();
 assert_eq!(fs::read(root.join("main.tex")).unwrap(),original);assert!(!d.path().join(format!("device-a/data/manual-{id}.json")).exists());b.shutdown().await;
 let renamed=d.path().join("renamed-paper");fs::rename(&root,&renamed).unwrap();let other=d.path().join("device-b-paper");copy(&renamed,&other);let b2=backend(&d.path().join("device-b"));let id2=b2.project_register(other.to_string_lossy().into()).unwrap().id;let state=get(&b2,&id2).await;
 assert_eq!(state["stableProjectId"],stable);assert_eq!(state["outline"][0]["title"],"Author's theorem");assert_eq!(state["currentRevision"],first["currentRevision"]);assert_eq!(fs::read(other.join("main.tex")).unwrap(),original);
 for f in fs::read_dir(other.join(".mps/revisions")).unwrap(){let text=fs::read_to_string(f.unwrap().path()).unwrap();assert!(!text.contains(&d.path().to_string_lossy().to_string()));assert!(!text.contains("apiKey"));}
 b2.shutdown().await;
}

#[tokio::test]
async fn legacy_migration_backs_up_and_validates_records_before_portable_reading(){
 let d=tempfile::tempdir().unwrap();let root=d.path().join("paper");paper(&root);let b=backend(&d.path().join("device"));let id=b.project_register(root.to_string_lossy().into()).unwrap().id;
 let source_revision=get(&b,&id).await["currentRevision"].clone();
 let old=json!({"mode":"manual","outline":[item("Legacy outline")],"reviews":[{"id":"review-one","kind":"calculation","state":"completed","createdAt":"2026-10-30T00:00:00Z","revision":source_revision,"sources":{"main.tex":"Human source\r\nUnchanged\r\n"},"raw":"retained original reply","result":{"outcome":"unable_to_assess","findings":[],"limitations":"No computation program executed"}}],"privateGlobalSetting":"MUST_NOT_SYNC"});
 let path=d.path().join(format!("device/data/manual-{id}.json"));fs::write(&path,serde_json::to_vec_pretty(&old).unwrap()).unwrap();let oldbytes=fs::read(&path).unwrap();let first=get(&b,&id).await;assert_eq!(first["storageStatus"],"legacy");assert!(!root.join(".mps").exists());
 assert!(b.manual_operation(id.clone(),"migrate".into(),json!({"legacyDigest":"stale"})).await.is_err());assert!(!root.join(".mps").exists());
 let moved=b.manual_operation(id.clone(),"migrate".into(),json!({"legacyDigest":first["legacyDigest"]})).await.unwrap();assert_eq!(moved["storageStatus"],"portable");assert_eq!(moved["outline"],old["outline"]);assert_eq!(moved["reviews"],old["reviews"]);assert_eq!(fs::read(&path).unwrap(),oldbytes);
 let backups=fs::read_dir(d.path().join("device/data/manual-migration-backups")).unwrap().collect::<Vec<_>>();assert_eq!(backups.len(),1);assert_eq!(fs::read(backups[0].as_ref().unwrap().path()).unwrap(),oldbytes);
 for f in fs::read_dir(root.join(".mps/revisions")).unwrap(){assert!(!fs::read_to_string(f.unwrap().path()).unwrap().contains("MUST_NOT_SYNC"));}
 assert_eq!(fs::read(root.join("main.tex")).unwrap(),b"Human source\r\nUnchanged\r\n");
 let remote=d.path().join("copied-paper");copy(&root,&remote);let b2=backend(&d.path().join("another-device"));let id2=b2.project_register(remote.to_string_lossy().into()).unwrap().id;let copied=get(&b2,&id2).await;assert_eq!(copied["reviews"],moved["reviews"]);assert_eq!(copied["currentRevision"],copied["reviews"][0]["revision"]);
 fs::write(remote.join("main.tex"),b"Author revised source\r\n").unwrap();let changed=get(&b2,&id2).await;assert_ne!(changed["currentRevision"],changed["reviews"][0]["revision"]);assert_eq!(changed["reviews"],copied["reviews"]);b2.shutdown().await;b.shutdown().await;
}

#[tokio::test]
async fn concurrent_device_revisions_are_retained_and_require_explicit_resolution(){
 let d=tempfile::tempdir().unwrap();let root=d.path().join("paper-a");paper(&root);let a=backend(&d.path().join("a"));let aid=a.project_register(root.to_string_lossy().into()).unwrap().id;let shared=save(&a,&aid,json!({"mode":"manual","outline":[item("Base")]})).await;
 let remote=d.path().join("paper-b");copy(&root,&remote);let b=backend(&d.path().join("b"));let bid=b.project_register(remote.to_string_lossy().into()).unwrap().id;
 let left=save(&a,&aid,json!({"outline":[item("A's independent edit")]})).await;let right=save(&b,&bid,json!({"outline":[item("B's independent edit")]})).await;
 // Merge only immutable revision files, simulating a completed two-way transfer.
 copy(&remote.join(".mps/revisions"),&root.join(".mps/revisions"));let conflict=get(&a,&aid).await;assert_eq!(conflict["storageStatus"],"conflict");assert_eq!(conflict["storageChoices"].as_array().unwrap().len(),2);
 let count=fs::read_dir(root.join(".mps/revisions")).unwrap().count();assert!(a.manual_operation(aid.clone(),"save".into(),json!({"outline":[item("stale overwrite")],"expectedHeads":shared["storageHeads"]})).await.is_err());assert_eq!(fs::read_dir(root.join(".mps/revisions")).unwrap().count(),count);
 assert!(a.codex_send(aid.clone(),None,"edit manuscript".into(),None,None,None).await.is_err());
 let resolved=a.manual_operation(aid.clone(),"resolveStorage".into(),json!({"revisionId":left["storageHeads"][0],"expectedHeads":conflict["storageHeads"]})).await.unwrap();assert_eq!(resolved["storageStatus"],"portable");assert_eq!(resolved["outline"],left["outline"]);assert_eq!(fs::read_dir(root.join(".mps/revisions")).unwrap().count(),count+1);
 let rpath=root.join(".mps/revisions").join(format!("{}.json",right["storageHeads"][0].as_str().unwrap()));assert!(rpath.exists());assert_eq!(fs::read(root.join("main.tex")).unwrap(),b"Human source\r\nUnchanged\r\n");a.shutdown().await;b.shutdown().await;
}

#[tokio::test]
async fn damaged_and_syncthing_conflict_records_block_writes_without_discarding_files(){
 let d=tempfile::tempdir().unwrap();let root=d.path().join("paper");paper(&root);let b=backend(&d.path().join("device"));let id=b.project_register(root.to_string_lossy().into()).unwrap().id;let state=save(&b,&id,json!({"mode":"manual"})).await;
 let rev=root.join(".mps/revisions").join(format!("{}.json",state["storageHeads"][0].as_str().unwrap()));let bytes=fs::read(&rev).unwrap();let mut damaged:Value=serde_json::from_slice(&bytes).unwrap();damaged["data"]["mode"]=json!("agent");fs::write(&rev,serde_json::to_vec(&damaged).unwrap()).unwrap();assert!(b.manual_operation(id.clone(),"get".into(),json!({})).await.unwrap_err().contains("checksum"));assert!(b.codex_send(id.clone(),None,"write".into(),None,None,None).await.is_err());assert_eq!(fs::read(root.join("main.tex")).unwrap(),b"Human source\r\nUnchanged\r\n");
 fs::write(&rev,&bytes).unwrap();let conflict=root.join(".mps/revisions/record.sync-conflict-test.json");fs::write(&conflict,&bytes).unwrap();assert!(b.manual_operation(id.clone(),"get".into(),json!({})).await.unwrap_err().contains("conflict copy"));assert_eq!(fs::read(&conflict).unwrap(),bytes);b.shutdown().await;
}

#[tokio::test]
async fn remote_agent_mode_never_enables_writing_and_unknown_fields_fail_closed(){
 let d=tempfile::tempdir().unwrap();let root=d.path().join("paper-a");paper(&root);let a=backend(&d.path().join("a"));let aid=a.project_register(root.to_string_lossy().into()).unwrap().id;
 let first=save(&a,&aid,json!({"mode":"agent","outline":[item("Human outline")]})).await;assert_eq!(first["mode"],"agent");
 let other=d.path().join("paper-b");copy(&root,&other);let b=backend(&d.path().join("b"));let bid=b.project_register(other.to_string_lossy().into()).unwrap().id;assert_eq!(get(&b,&bid).await["mode"],"manual");assert!(b.codex_send(bid.clone(),None,"write".into(),None,None,None).await.is_err());
 let rev=other.join(".mps/revisions").join(format!("{}.json",first["storageHeads"][0].as_str().unwrap()));let bytes=fs::read(&rev).unwrap();let mut modified:Value=serde_json::from_slice(&bytes).unwrap();modified["data"]["unexpectedGlobalSetting"]=json!("must not be loaded");fs::write(&rev,serde_json::to_vec(&modified).unwrap()).unwrap();
 assert!(b.manual_operation(bid.clone(),"get".into(),json!({})).await.unwrap_err().contains("Unexpected portable metadata fields"));assert!(b.codex_send(bid.clone(),None,"write".into(),None,None,None).await.is_err());assert_eq!(fs::read(other.join("main.tex")).unwrap(),b"Human source\r\nUnchanged\r\n");
 a.shutdown().await;b.shutdown().await;
}
