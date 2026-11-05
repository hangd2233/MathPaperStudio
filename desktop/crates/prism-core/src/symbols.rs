//! Project-local, inert user-authored LaTeX templates. No commands are executed here.
use serde_json::{json,Value};
pub(crate) fn sanitize(v:&Value)->Result<Value,String>{
 let o=v.as_object().ok_or("Invalid symbol library")?;
 if o.keys().any(|k|!["templates","favorites","recent"].contains(&k.as_str())){return Err("Unknown symbol library field".into());}
 let templates=v["templates"].as_array().ok_or("Invalid symbol templates")?;
 if templates.len()>200{return Err("At most 200 custom templates are supported".into());}
 let mut ids=std::collections::BTreeSet::new();
 for t in templates {
  let obj=t.as_object().ok_or("Invalid template")?;
  if obj.len()!=6 || obj.keys().any(|k|!["id","name","category","keywords","latex","requires"].contains(&k.as_str())){return Err("Unknown template fields".into());}
  for (k,max) in [("id",100),("name",200),("category",100),("keywords",1000),("latex",8000),("requires",1000)]{let s=t[k].as_str().ok_or("Template fields must be text")?;if s.len()>max||s.contains('\0')||(["id","name","latex"].contains(&k)&&s.trim().is_empty()){return Err("Invalid or oversized template field".into());}}
  let id=t["id"].as_str().unwrap();if !id.starts_with("custom-")||!ids.insert(id){return Err("Custom template IDs must be unique and start with custom-".into());}
 }
 for (k,max) in [("favorites",300),("recent",30)] {let xs=v[k].as_array().ok_or("Invalid symbol preferences")?;if xs.len()>max||xs.iter().any(|x|x.as_str().is_none_or(|s|s.is_empty()||s.len()>100)){return Err("Invalid or oversized symbol preferences".into());}}
 Ok(json!({"templates":templates,"favorites":v["favorites"],"recent":v["recent"]}))
}
