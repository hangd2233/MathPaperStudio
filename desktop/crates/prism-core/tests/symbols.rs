use prism_core::{Backend,BackendConfig,RecordingEventSink};
use serde_json::{json,Value};
use std::{fs,path::Path,sync::Arc};
fn backend(p:&Path)->Backend{Backend::new(BackendConfig{data_dir:p.join("data"),home_dir:p.join("home"),temp_dir:p.join("tmp")},Arc::new(RecordingEventSink::default())).unwrap()}
async fn save(b:&Backend,id:&str,mut args:Value)->Result<Value,String>{let current=b.manual_operation(id.into(),"get".into(),json!({})).await?;args["expectedHeads"]=current["storageHeads"].clone();b.manual_operation(id.into(),"save".into(),args).await}
fn copy_tree(from:&Path,to:&Path){fs::create_dir_all(to).unwrap();for e in fs::read_dir(from).unwrap(){let e=e.unwrap();if e.file_type().unwrap().is_dir(){copy_tree(&e.path(),&to.join(e.file_name()));}else{fs::copy(e.path(),to.join(e.file_name())).unwrap();}}}
#[tokio::test]
async fn custom_symbols_are_portable_inert_and_preserve_other_manual_data(){
 let d=tempfile::tempdir().unwrap();let b=backend(d.path());let paper=d.path().join("paper");fs::create_dir(&paper).unwrap();fs::write(paper.join("main.tex"),b"Original paper\r\n").unwrap();let id=b.project_register(paper.to_string_lossy().into()).unwrap().id;
 let library=json!({"templates":[{"id":"custom-canonical","name":"Canonical sheaf","category":"Custom","keywords":"典范 canonical","latex":"\\omega_{ {{X}} }","requires":"LaTeX core"}],"favorites":["custom-canonical","alpha"],"recent":["alpha"]});
 save(&b,&id,json!({"mode":"manual","symbols":library})).await.unwrap();
 let s=b.manual_operation(id.clone(),"get".into(),json!({})).await.unwrap();assert_eq!(s["symbols"],library);
 save(&b,&id,json!({"outline":[{"id":"human","title":"Human outline","kind":"section","status":"draft","path":"main.tex","line":1}]})).await.unwrap();
 assert_eq!(b.manual_operation(id.clone(),"get".into(),json!({})).await.unwrap()["symbols"],library);
 // A concurrent edit must fail rather than erase another device's records.
 assert!(b.manual_operation(id.clone(),"save".into(),json!({"symbols":library,"expectedHeads":s["storageHeads"]})).await.is_err());
 let copy=d.path().join("copied-paper");copy_tree(&paper,&copy);let other=backend(&d.path().join("other"));let id2=other.project_register(copy.to_string_lossy().into()).unwrap().id;let moved=other.manual_operation(id2,"get".into(),json!({})).await.unwrap();assert_eq!(moved["symbols"],library);assert_eq!(moved["outline"][0]["title"],"Human outline");assert_eq!(fs::read(paper.join("main.tex")).unwrap(),b"Original paper\r\n");assert_eq!(fs::read_dir(&paper).unwrap().count(),2);
 other.shutdown().await;b.shutdown().await;
}
#[tokio::test]
async fn malformed_libraries_fail_without_creating_files_or_changing_manuscript(){
 let d=tempfile::tempdir().unwrap();let b=backend(d.path());let p=d.path().join("paper");fs::create_dir(&p).unwrap();fs::write(p.join("main.tex"),"Human text").unwrap();let id=b.project_register(p.to_string_lossy().into()).unwrap().id;
 for symbols in [json!({"templates":[],"favorites":[],"recent":[],"secret":"no"}),json!({"templates":[{"id":"alpha"}],"favorites":[],"recent":[]}),json!({"templates":[],"favorites":[null],"recent":[]})]{assert!(save(&b,&id,json!({"symbols":symbols})).await.is_err());}
 assert!(!p.join(".mps").exists());assert_eq!(fs::read_to_string(p.join("main.tex")).unwrap(),"Human text");b.shutdown().await;
}
