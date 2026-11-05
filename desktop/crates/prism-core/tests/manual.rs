#![cfg(unix)]
use prism_core::{Backend,BackendConfig,RecordingEventSink};
use serde_json::{json,Value};
use std::{fs,os::unix::fs::PermissionsExt,sync::Arc,time::Duration};

async fn setup()->(tempfile::TempDir,Backend,String) {
    let dir=tempfile::tempdir().unwrap();
    let b=Backend::new(BackendConfig{data_dir:dir.path().join("data"),home_dir:dir.path().join("home"),temp_dir:dir.path().join("tmp")},Arc::new(RecordingEventSink::default())).unwrap();
    let script=dir.path().join("fake");fs::write(&script,include_str!("fixtures/manual_server.py")).unwrap();fs::set_permissions(&script,fs::Permissions::from_mode(0o755)).unwrap();
    b.codex_set_path(script.to_string_lossy().into()).await.unwrap();
    let root=dir.path().join("paper");fs::create_dir(&root).unwrap();fs::write(root.join("main.tex"),"original\nsecond line").unwrap();
    let id=b.project_register(root.to_string_lossy().into()).unwrap().id;(dir,b,id)
}
async fn op(b:&Backend,id:&str,action:&str,mut args:Value)->Result<Value,String>{
 if action=="save" {let state=b.manual_operation(id.into(),"get".into(),json!({})).await?;args["expectedHeads"]=state["storageHeads"].clone();}
 b.manual_operation(id.into(),action.into(),args).await
}
async fn terminal(b:&Backend,id:&str)->Value {
    tokio::time::timeout(Duration::from_secs(5),async {loop {let d=op(b,id,"get",json!({})).await.unwrap();if d["reviews"].as_array().unwrap().iter().all(|r|r["state"]!="running"){return d;}tokio::time::sleep(Duration::from_millis(10)).await;}}).await.unwrap()
}
#[tokio::test]
async fn manual_reviews_never_use_legacy_edit_paths_and_preserve_sources() {
    let (dir,b,id)=setup().await;
    op(&b,&id,"save",json!({"mode":"manual","outline":[{"id":"one","title":"Lemma","kind":"lemma","status":"check","path":"main.tex","line":1}]})).await.unwrap();
    assert!(b.codex_send(id.clone(),None,"rewrite the paper".into(),None,None,None).await.unwrap_err().contains("Manual mode"));
    fs::write(dir.path().join("data/sessions.json"),serde_json::to_vec(&json!([{"projectId":id,"id":"legacy","title":"Legacy writing session"}])).unwrap()).unwrap();
    assert!(b.codex_control(id.clone(),"legacy".into(),"old-turn".into(),Some("edit the paper".into())).await.unwrap_err().contains("Manual mode"));
    for kind in ["language","proof","calculation"] {
        op(&b,&id,"start",json!({"kind":kind})).await.unwrap();let d=terminal(&b,&id).await;
        let r=d["reviews"].as_array().unwrap().last().unwrap();assert_eq!(r["state"],"completed");assert_eq!(r["result"]["outcome"],"gap");assert_eq!(r["sources"]["main.tex"],"original\nsecond line");
    }
    let requests=fs::read_to_string(dir.path().join("requests.jsonl")).unwrap();let requests:Vec<Value>=requests.lines().map(|l|serde_json::from_str(l).unwrap()).collect();
    for q in requests.iter().filter(|q|q["method"]=="thread/start") {assert_eq!(q["params"]["sandbox"],"read-only");assert_eq!(q["params"]["approvalPolicy"],"never");assert_eq!(q["params"]["config"]["mcp_servers"]["unsafe-filesystem"]["enabled"],false);assert!(q["params"]["cwd"].as_str().unwrap().contains("/tmp/manual-"));}
    for q in requests.iter().filter(|q|q["method"]=="turn/start") {assert_eq!(q["params"]["sandboxPolicy"]["type"],"readOnly");assert_eq!(q["params"]["approvalPolicy"],"never");}
    assert!(!requests.iter().any(|q|q["method"]=="turn/steer"));
    assert!(!requests.iter().any(|q|q["id"]==900 && q.get("result").is_some()));
    assert!(requests.iter().any(|q|q["id"]==900 && q.get("error").is_some()));
    assert_eq!(fs::read_to_string(dir.path().join("paper/main.tex")).unwrap(),"original\nsecond line");
    let before=op(&b,&id,"get",json!({})).await.unwrap()["currentRevision"].clone();fs::write(dir.path().join("paper/main.tex"),"human update").unwrap();
    let d=op(&b,&id,"get",json!({})).await.unwrap();assert_ne!(before,d["currentRevision"]);assert_eq!(d["reviews"][0]["revision"],before);
    op(&b,&id,"save",json!({"mode":"agent"})).await.unwrap();assert!(b.codex_send(id.clone(),None,"normal".into(),None,None,None).await.is_ok());
    b.shutdown().await;
}
#[tokio::test]
async fn repeated_start_cancel_restart_and_failed_safety_handshake() {
    let (dir,b,id)=setup().await;op(&b,&id,"save",json!({"mode":"manual"})).await.unwrap();
    fs::write(dir.path().join("hold"),"").unwrap();
    op(&b,&id,"start",json!({"kind":"proof"})).await.unwrap();
    assert!(op(&b,&id,"start",json!({"kind":"proof"})).await.is_err());assert!(op(&b,&id,"save",json!({"mode":"agent"})).await.is_err());
    op(&b,&id,"cancel",json!({})).await.unwrap();let d=terminal(&b,&id).await;assert_eq!(d["reviews"][0]["state"],"cancelled");
    op(&b,&id,"cancel",json!({})).await.unwrap();fs::remove_file(dir.path().join("hold")).unwrap();
    op(&b,&id,"start",json!({"kind":"language"})).await.unwrap();terminal(&b,&id).await;
    fs::write(dir.path().join("unsafe"),"").unwrap();assert!(op(&b,&id,"start",json!({"kind":"proof"})).await.unwrap_err().contains("no model turn started"));
    assert!(op(&b,&id,"start",json!({"kind":"research"})).await.is_err());
    b.shutdown().await;
    let b2=Backend::new(BackendConfig{data_dir:dir.path().join("data"),home_dir:dir.path().join("home"),temp_dir:dir.path().join("tmp")},Arc::new(RecordingEventSink::default())).unwrap();
    let d=op(&b2,&id,"get",json!({})).await.unwrap();assert_eq!(d["mode"],"manual");assert_eq!(d["reviews"].as_array().unwrap().len(),2);b2.shutdown().await;
}

#[tokio::test]
async fn reopening_retained_real_reply_recovers_optional_repairs_without_changing_paper() {
    let (dir,b,id)=setup().await;
    let raw=include_str!("fixtures/manual_optional_repair.json");
    let record=json!({"mode":"manual","outline":[],"reviews":[{
        "id":"retained","kind":"proof","state":"completed","revision":"old-version",
        "sources":{"main.tex":"line\n".repeat(18)},"raw":raw,
        "result":{"outcome":"unable_to_assess","findings":[],"limitations":"old parser rejected optional field"}
    }]});
    fs::write(dir.path().join(format!("data/manual-{id}.json")),serde_json::to_vec(&record).unwrap()).unwrap();
    let reopened=op(&b,&id,"get",json!({})).await.unwrap();
    assert_eq!(reopened["reviews"][0]["result"]["outcome"],"gap");
    assert_eq!(reopened["reviews"][0]["result"]["findings"].as_array().unwrap().len(),4);
    assert_eq!(reopened["reviews"][0]["result"]["findings"][1]["repair"],"");
    assert_eq!(reopened["reviews"][0]["raw"],raw);
    assert_eq!(fs::read_to_string(dir.path().join("paper/main.tex")).unwrap(),"original\nsecond line");
    b.shutdown().await;
}
