mod connection_vault;
use tauri::Manager;
#[derive(serde::Deserialize,serde::Serialize)]
struct Pairing {address:String,token:String}
// Only an explicitly copied app-container handoff is consumed. No URL, clipboard,
// network discovery or credential enumeration. The file is removed before return.
#[tauri::command]
fn mps_import_pairing(app:tauri::AppHandle)->Result<Option<Pairing>,String>{
 let file=app.path().document_dir().map_err(|_|"PAIRING_DIRECTORY")?.join("MPS-Pairing.json");
 if !file.exists(){return Ok(None)}
 let metadata=std::fs::symlink_metadata(&file).map_err(|_|"PAIRING_READ")?;
 if !metadata.is_file()||metadata.file_type().is_symlink()||metadata.len()>2048{return Err("PAIRING_INVALID".into())}
 let data=std::fs::read(&file).map_err(|_|"PAIRING_READ")?;
 let p:Pairing=serde_json::from_slice(&data).map_err(|_|"PAIRING_INVALID")?;
 let url=tauri::Url::parse(&p.address).map_err(|_|"PAIRING_INVALID")?;
 if !(url.scheme()=="https"||(url.scheme()=="http"&&matches!(url.host_str(),Some("127.0.0.1")|Some("localhost")|Some("[::1]")|Some("::1"))))||url.host_str().is_none()||!url.username().is_empty()||url.password().is_some()||url.query().is_some()||url.fragment().is_some()||url.path()!="/"||p.token.len()!=43||!p.token.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-'){return Err("PAIRING_INVALID".into())}
 std::fs::remove_file(file).map_err(|_|"PAIRING_REMOVE")?;Ok(Some(p))
}

// Native HTTP avoids the shortcut proxy rewriting browser Origin/CORS headers.
// Redirects, cookies, arbitrary headers and insecure certificates are forbidden.
#[tauri::command]
async fn mps_http(app:tauri::AppHandle,address:String,endpoint:String,token:String,method:String,body:Option<serde_json::Value>)->Result<serde_json::Value,String>{
 let origin=tauri::Url::parse(&address).map_err(|_|"INVALID_ADDRESS")?;
 if !(origin.scheme()=="https"||(origin.scheme()=="http"&&matches!(origin.host_str(),Some("127.0.0.1")|Some("localhost")|Some("[::1]")|Some("::1"))))||origin.host_str().is_none()||!origin.username().is_empty()||origin.password().is_some()||origin.query().is_some()||origin.fragment().is_some()||origin.path()!="/" {return Err("INVALID_ADDRESS".into())}
 if !endpoint.starts_with('/')||endpoint.starts_with("//")||endpoint.contains('\\')||!(endpoint=="/health"||endpoint=="/projects"||endpoint.starts_with("/projects/")){return Err("INVALID_ENDPOINT".into())}
 if !token.is_empty()&&(token.len()!=43||!token.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-')){return Err("INVALID_TOKEN".into())}
 let verb=match method.as_str(){"GET"=>reqwest::Method::GET,"PUT"=>reqwest::Method::PUT,"POST"=>reqwest::Method::POST,_=>return Err("INVALID_METHOD".into())};
 let url=origin.join(&endpoint).map_err(|_|"INVALID_ENDPOINT")?;if url.origin()!=origin.origin(){return Err("INVALID_ENDPOINT".into())}
 let client=reqwest::Client::builder().user_agent("MPS-iPad/0.1.2").redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(20)).build().map_err(|_|"HTTP_UNAVAILABLE")?;
 let mut request=client.request(verb,url);if !token.is_empty(){request=request.bearer_auth(token)}if let Some(data)=body{request=request.json(&data)}
 let mut response=request.send().await.map_err(|_|"连接未完成，请检查节点小宝入口是否过期；请从同一 MPS 卡片重新获取地址")?;
 let content_type=response.headers().get("content-type").and_then(|v|v.to_str().ok()).unwrap_or("unknown").to_owned();let status=response.status().as_u16();if (300..400).contains(&status){return Err("拒绝重定向；请从同一 MPS 卡片重新获取入口".into())}
 let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"HTTP_INTERRUPTED")?{if bytes.len()+chunk.len()>64*1024*1024{return Err("RESPONSE_TOO_LARGE".into())}bytes.extend_from_slice(&chunk)}
 let data:serde_json::Value=match serde_json::from_slice(&bytes){Ok(v)=>v,Err(_)=>{
 if let Ok(dir)=app.path().app_local_data_dir(){let _=std::fs::create_dir_all(&dir);let diagnostic=serde_json::json!({"status":status,"contentType":content_type,"endpoint":endpoint,"nonJsonResponse":String::from_utf8_lossy(&bytes[..bytes.len().min(12000)])});let _=std::fs::write(dir.join("mps-connection-diagnostic.json"),diagnostic.to_string());}
 return Err(format!("HTTP {} ({}) - endpoint did not return MPS JSON",status,content_type))
 }};
 Ok(serde_json::json!({"status":status,"data":data}))
}
#[tauri::command] fn mps_vault_load()->Result<Option<String>,String>{connection_vault::load()}
#[tauri::command] fn mps_vault_save(token:String)->Result<(),String>{connection_vault::save(&token)}
#[tauri::command] fn mps_vault_forget()->Result<(),String>{connection_vault::forget()}
#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){tauri::Builder::default().invoke_handler(tauri::generate_handler![mps_vault_load,mps_vault_save,mps_vault_forget,mps_import_pairing,mps_http]).run(tauri::generate_context!()).expect("MPS mobile runtime failed");}
