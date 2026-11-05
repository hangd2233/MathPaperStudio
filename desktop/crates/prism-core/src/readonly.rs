//! Isolated, tool-free model sessions shared by reviewing and report planning.
use crate::Backend;
use serde_json::{json,Value};
pub(crate) async fn thread(app:&Backend,run:&str,model:Option<&str>,instructions:&str)->Result<(String,Value),String>{
 let cwd=app.inner.config.temp_dir.join(format!("readonly-{run}"));std::fs::create_dir_all(&cwd).map_err(|e|e.to_string())?;
 let mut config=json!({"cwd":cwd,"approvalPolicy":"never","sandbox":"read-only","ephemeral":true,"config":{"features.shell_tool":false,"features.apply_patch":false},"developerInstructions":instructions});
 if let Some(model)=model.filter(|m|!m.is_empty()){config["model"]=json!(model);}
 let inherited=crate::codex::manual_rpc(app,"config/read",json!({"includeLayers":false})).await?;
 for field in ["mcp_servers","plugins"] {if let Some(entries)=inherited["config"][field].as_object(){config["config"][field]=json!(entries.keys().map(|k|(k.clone(),json!({"enabled":false}))).collect::<serde_json::Map<String,Value>>());}}
 config["config"]["web_search"]=json!("disabled");config["config"]["features.apps"]=json!(false);
 let started=crate::codex::manual_rpc(app,"thread/start",config).await?;
 if started["sandbox"]["type"]!="readOnly" || started["sandbox"]["networkAccess"]==true || started["approvalPolicy"]!="never" {return Err("Model did not confirm read-only sandbox and disabled approvals; no turn started".into());}
 let policy=json!({"sandbox":{"type":started["sandbox"]["type"],"networkAccess":started["sandbox"]["networkAccess"]},"approvalPolicy":started["approvalPolicy"],"model":started["model"]});
 Ok((started["thread"]["id"].as_str().ok_or("Missing isolated thread")?.into(),policy))
}
