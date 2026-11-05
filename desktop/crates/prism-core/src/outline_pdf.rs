//! Saved-outline PDF export: immutable snapshot, no manuscript access, no model.
use crate::Backend;
use serde_json::{json,Value};
use std::collections::BTreeMap;

fn text(v:&Value)->&str {v.as_str().unwrap_or("")}
fn rows(v:&Value)->&[Value] {v.as_array().map(Vec::as_slice).unwrap_or(&[])}
fn symbol(c:char)->Option<&'static str>{Some(match c {
 'Γ'=>"\\Gamma",'Δ'=>"\\Delta",'Λ'=>"\\Lambda",'Σ'=>"\\Sigma",'α'=>"\\alpha",'β'=>"\\beta",'γ'=>"\\gamma",'δ'=>"\\delta",'ε'=>"\\epsilon",'θ'=>"\\theta",'λ'=>"\\lambda",'μ'=>"\\mu",'ν'=>"\\nu",'π'=>"\\pi",'ρ'=>"\\rho",'σ'=>"\\sigma",'τ'=>"\\tau",'φ'=>"\\phi",'ψ'=>"\\psi",'χ'=>"\\chi",'ω'=>"\\omega",'ℓ'=>"\\ell",'→'=>"\\to",'↦'=>"\\mapsto",'←'=>"\\leftarrow",'−'=>"-",'∩'=>"\\cap",'∪'=>"\\cup",'≅'=>"\\cong",'≤'=>"\\leq",'≥'=>"\\geq",'≠'=>"\\neq",'∈'=>"\\in",'⊂'=>"\\subset",'⊆'=>"\\subseteq",'⊗'=>"\\otimes",'⊕'=>"\\oplus",'∞'=>"\\infty",'×'=>"\\times",'·'=>"\\cdot",_=>return None})}
fn literal(s:&str)->Result<String,String>{
 let mut out=String::new();
 for c in s.chars(){
  if let Some(m)=symbol(c){out.push_str(&format!("\\({m}\\)"));continue;}
  out.push_str(&match c {
   '\\'=>"\\textbackslash{}".into(),'{'=>"\\{".into(),'}'=>"\\}".into(),'$'=>"\\$".into(),'&'=>"\\&".into(),'%'=>"\\%".into(),'#'=>"\\#".into(),'_'=>"\\_".into(),'^'=>"\\textasciicircum{}".into(),'~'=>"\\textasciitilde{}".into(),
   ','|'+'|'='=>format!("{c}\\allowbreak{{}}"),'–'|'—'|'‑'=>"-".into(),'’'|'‘'=>"'".into(),'“'|'”'=>"``".into(),'\n'|'\r'|'\t'=>" ".into(),
   c if c.is_ascii()&&!c.is_control()=>c.to_string(),
   c if ('\u{00a0}'..='\u{017f}').contains(&c)=>c.to_string(),
   c=>return Err(format!("Unsupported outline character U+{:04X}. Use supported LaTeX math notation or transliterate this character; nothing was exported.",c as u32)),
  });
 }
 Ok(out)
}
// Deliberately a data-math subset, never arbitrary TeX. Custom macros are not
// expanded from the project. Unsupported/unsafe fragments are printed literally.
fn safe_math(s:&str)->bool{
 if s.len()>4000{return false;}
 let allowed=["frac","dfrac","tfrac","sqrt","sum","prod","int","iint","lim","log","exp","sin","cos","tan","min","max","inf","sup","ker","dim","det","gcd","hom","Hom","Pr","alpha","beta","gamma","delta","epsilon","varepsilon","zeta","eta","theta","vartheta","iota","kappa","lambda","mu","nu","xi","pi","rho","sigma","tau","upsilon","phi","varphi","chi","psi","omega","Gamma","Delta","Theta","Lambda","Xi","Pi","Sigma","Upsilon","Phi","Psi","Omega","mathbb","mathcal","mathfrak","mathrm","mathbf","mathsf","mathit","operatorname","text","left","right","big","Big","bigl","bigr","Bigl","Bigr","langle","rangle","lvert","rvert","lVert","rVert","vert","Vert","mid","cdot","times","otimes","oplus","cap","cup","bigcap","bigcup","in","notin","subset","subseteq","supset","supseteq","cong","simeq","sim","equiv","le","leq","ge","geq","ne","neq","to","rightarrow","leftarrow","leftrightarrow","mapsto","hookrightarrow","twoheadrightarrow","Rightarrow","Leftarrow","Leftrightarrow","infty","partial","nabla","forall","exists","emptyset","ell","circ","pm","mp","cdots","ldots","vdots","ddots","overline","underline","widehat","widetilde","hat","tilde","bar","vec","underbrace","overbrace","substack"];
 let chars:Vec<char>=s.chars().collect();let mut i=0;let mut depth=0i32;
 while i<chars.len(){match chars[i]{
  '\\'=>{i+=1;let start=i;while i<chars.len()&&chars[i].is_ascii_alphabetic(){i+=1;}
   if i==start{if i>=chars.len()||!" ,;:!{}|_".contains(chars[i]){return false;}i+=1;}else{let command:String=chars[start..i].iter().collect();if !allowed.contains(&command.as_str()){return false;}}continue;},
  '{'=>{depth+=1;if depth>30{return false;}},'}'=>{depth-=1;if depth<0{return false;}},
  c if c.is_ascii_alphanumeric()||" +-*/=()[]<>.,;:!|_^'\n\t".contains(c)=>{},
  _=>return false,
 }i+=1;}depth==0
}
fn rich(s:&str,warnings:&mut bool)->Result<String,String>{
 let mut out=String::new();let mut rest=s;
 while !rest.is_empty(){
  let marker=[("$","$"),("\\(","\\)"),("\\[","\\]")].iter().filter_map(|(a,b)|rest.find(a).map(|p|(p,*a,*b))).min_by_key(|x|x.0);
  let Some((p,open,close))=marker else {out.push_str(&literal(rest)?);break;};
  out.push_str(&literal(&rest[..p])?);let after=&rest[p+open.len()..];
  if let Some(end)=after.find(close){let math=&after[..end];if !math.is_empty()&&safe_math(math){out.push_str(&format!("\\({math}\\)"));}else{*warnings=true;out.push_str(&literal(&rest[p..p+open.len()+end+close.len()])?);}rest=&after[end+close.len()..];}
  else {*warnings=true;out.push_str(&literal(&rest[p..])?);break;}
 }
 Ok(out)
}
fn paragraph(out:&mut String,label:&str,content:&str,warn:&mut bool)->Result<(),String>{out.push_str(&format!("\\field{{{label}}}{}\n",rich(content,warn)?));Ok(())}
fn items(out:&mut String,label:&str,items:&Value,numbered:bool,warn:&mut bool)->Result<(),String>{if rows(items).is_empty(){return Ok(());}let env=if numbered{"enumerate"}else{"itemize"};out.push_str(&format!("\\field{{{label}}}\\begin{{{env}}}\n"));for x in rows(items){out.push_str(&format!("\\item {}\n",rich(text(x),warn)?));}out.push_str(&format!("\\end{{{env}}}\n"));Ok(())}
fn citations(v:&Value,reports:&BTreeMap<String,(usize,String)>)->String{rows(v).iter().map(|c|{let code=reports.get(text(&c["sourceId"])).map(|r|r.0).unwrap_or(0);format!("[R{code}] PDF p. {}, {}",c["page"],text(&c["section"]))}).collect::<Vec<_>>().join("; ")}
pub(crate) fn render(run:&Value,p:&Value)->Result<(String,bool),String>{
 let o=&run["result"];crate::planning::validate_result(o,p,"outline")?;
 let reports:BTreeMap<_,_>=rows(&p["reports"]).iter().enumerate().map(|(i,r)|(text(&r["id"]).to_string(),(i+1,text(&r["name"]).to_string()))).collect();
 let mut warn=false;let mut out=String::from(r#"\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[margin=23mm,headheight=15pt]{geometry}
\usepackage{amsmath,amssymb,xcolor,enumitem,fancyhdr,needspace}
\usepackage[unicode,colorlinks=true,linkcolor=blue!45!black]{hyperref}
\emergencystretch=4em
\setlength{\parindent}{0pt}\setlength{\parskip}{5pt}
\setlist{nosep,leftmargin=1.6em,topsep=3pt}
\pagestyle{fancy}\fancyhf{}\fancyhead[L]{\small Detailed English Paper Outline}\fancyfoot[C]{\thepage}
\newcommand{\field}[1]{\par\Needspace{3\baselineskip}\smallskip\textbf{#1}\par}
\newcommand{\result}[1]{\par\Needspace{6\baselineskip}\subsubsection*{#1}}
\begin{document}
\begin{titlepage}\raggedright\hyphenpenalty=10000
{\large MATHEMATICS / WRITING OUTLINE}\par\vspace{18mm}
{\huge\bfseries "#);
 out.push_str(&literal(text(&o["title"]))?);out.push_str("}\\par\\vspace{10mm}{\\Large Detailed English Paper Outline}\\par\\vfill\n");
 paragraph(&mut out,"Saved outline version",&format!("{} | {}",text(&run["id"]),text(&run["createdAt"])),&mut warn)?;
 out.push_str("This is an outline, not a completed paper or independently verified proof. Original result labels and stable module IDs are retained for dependency tracking. Source notation is preserved; ambiguous extracted formulas are not silently reconstructed.\\par\n");
 out.push_str("\\end{titlepage}\\tableofcontents\\clearpage\\section*{Reading guide}\\addcontentsline{toc}{section}{Reading guide}\n");
 paragraph(&mut out,"Mainline",text(&o["mainline"]),&mut warn)?;
 out.push_str("\\field{Source reports}\n");let mut ordered:Vec<_>=reports.values().collect();ordered.sort_by_key(|r|r.0);for (i,name) in ordered {out.push_str(&format!("[R{i}] {}\\par\n",literal(name)?));}
 out.push_str("Page references are 1-based pages of the imported reports. REPORT ARGUMENT means an argument is supplied in a report, not independently verified. EXTERNAL THEOREM requires checking the original source. CONJECTURE, RESEARCH PLAN and GAP are not established results. Novelty remains not assessed. Custom project macros are not loaded.\\par\n");
 items(&mut out,"Scope and limitations",&o["limitations"],false,&mut warn)?;
 for s in rows(&o["sections"]){let heading=if s["level"]=="subsection"{"subsection"}else{"section"};out.push_str(if heading=="section"{"\\clearpage\n"}else{"\\Needspace{8\\baselineskip}\n"});out.push_str(&format!("\\{heading}{{{}}}\n",literal(text(&s["title"]))?));
  paragraph(&mut out,"Stable module",text(&s["id"]),&mut warn)?;paragraph(&mut out,"Purpose",text(&s["purpose"]),&mut warn)?;
  items(&mut out,"Section dependencies (stable IDs)",&s["dependencies"],false,&mut warn)?;items(&mut out,"Section roadmap",&s["proofSteps"],true,&mut warn)?;paragraph(&mut out,"Sources",&citations(&s["sources"],&reports),&mut warn)?;items(&mut out,"Section open checks",&s["openQuestions"],false,&mut warn)?;
  for c in rows(&s["claims"]){out.push_str(&format!("\\result{{{}}}\n",literal(text(&c["label"]))?));let unresolved=["conjecture","research_plan","gap"].contains(&text(&c["status"]));let color=if unresolved{"red!65!black"}else{"blue!45!black"};out.push_str(&format!("{{\\small\\sffamily\\color{{{color}}}STATUS: {}}}\\par\n",literal(&text(&c["status"]).replace('_'," ").to_uppercase())?));paragraph(&mut out,"Recorded result type",text(&c["kind"]),&mut warn)?;paragraph(&mut out,"Proposed statement / task",text(&c["statement"]),&mut warn)?;items(&mut out,"Proof roadmap / planned steps (not a written proof)",&c["proofSteps"],true,&mut warn)?;items(&mut out,"Dependencies",&c["dependsOn"],false,&mut warn)?;paragraph(&mut out,"Sources",&citations(&c["sources"],&reports),&mut warn)?;items(&mut out,"Open checks / unresolved issues",&c["openQuestions"],false,&mut warn)?;}
 }
 if warn {out.push_str("\\clearpage\\section*{Notation export notice}Some unsupported or unsafe LaTeX fragments were printed literally, not executed. Custom macros are not expanded. Check the saved outline notation before using the formulas.\n");}
 out.push_str("\\end{document}\n");Ok((out,warn))
}
pub(crate) async fn export(app:Backend,id:String,args:Value)->Result<Value,String>{
 let p=crate::planning::operation_snapshot(&app,&id,&args)?;
 let run=rows(&p["runs"]).iter().find(|r|r["id"]==args["runId"]&&r["kind"]=="outline"&&r["state"]=="completed").ok_or("Select a saved completed outline version")?;
 let (source,warnings)=render(run,&p)?;let run_id=run["id"].clone();let title=run["result"]["title"].clone();let work=app.inner.config.temp_dir.join(format!("outline-pdf-{}",uuid::Uuid::new_v4()));
 tokio::fs::create_dir_all(&work).await.map_err(|e|e.to_string())?;
 let result=async {tokio::fs::write(work.join("outline.tex"),&source).await.map_err(|e|e.to_string())?;let bytes=crate::latex::compile_outline_pdf(&app.inner.latex,&work,app.inner.cancel.subscribe()).await?;Ok(json!({"runId":run_id,"title":title,"bytes":bytes,"warnings":if warnings {vec!["Unsupported or unsafe LaTeX fragments were printed literally; custom macros were not expanded."]}else{vec![]}}))}.await;
 let _=tokio::fs::remove_dir_all(&work).await;result
}

#[cfg(test)]
mod tests {
 use super::*;
 fn fixture()->(Value,Value){let id="a".repeat(40);let source=json!([{"sourceId":id,"page":1,"section":"Scope"}]);let section=json!({"id":"s1","title":"Introduction","purpose":"Describe geometry.","claims":[{"label":"Question 1","kind":"question","status":"gap","statement":"Compute $H^3(X,\\mathbb Q)$.","proofSteps":["First step."],"dependsOn":["Input theorem."],"sources":source,"openQuestions":["Unresolved gluing."]}],"proofSteps":["Explain scope."],"dependencies":[],"sources":source,"openQuestions":[]});let mut sections=vec![section.clone()];for i in 2..=3 {let mut s=section.clone();s["id"]=json!(format!("s{i}"));sections.push(s);}
 let result=json!({"title":"Saved title","mainline":"Geometry first.","sections":sections,"limitations":["Not verified."],"noveltyStatus":"not_assessed"});(json!({"id":"run","createdAt":"2026-10-30","result":result}),json!({"reports":[{"id":id,"name":"report.pdf","pages":[{"status":"readable"}]}]}))}
 #[test] fn exports_hierarchy_all_fields_and_legacy_without_promoting_gaps(){let(mut r,p)=fixture();let s=r["result"]["sections"][0].clone();let mut child=s.clone();child["id"]=json!("detail");child["level"]=json!("subsection");child["parentId"]=json!("s1");r["result"]["sections"].as_array_mut().unwrap().insert(1,child);let(t,w)=render(&r,&p).unwrap();assert!(!w);assert_eq!(t.matches("\\section{Introduction}").count(),3);assert_eq!(t.matches("\\subsection{Introduction}").count(),1);for term in ["Saved title","run | 2026-10-30","STATUS: GAP","Unresolved gluing.","First step.","Input theorem.","[R1] PDF p. 1","Not verified.","H^3(X,\\mathbb Q)"]{assert!(t.contains(term),"{term}");}}
 #[test] fn embedded_file_or_process_commands_never_become_tex_instructions(){for attack in ["$\\input{/private/secret}$","$\\write18{touch sentinel}$","\\immediate\\write18{touch sentinel}","$\\csname input\\endcsname$","$\\def\\x{\\input{secret}}$","$\\begin{document}$"]{let mut w=false;let t=rich(attack,&mut w).unwrap();assert!(!t.contains("\\input{"));assert!(!t.contains("\\write18{"));assert!(!t.contains("\\csname "));assert!(t.contains("\\textbackslash{}"));}}
 #[test] fn supported_math_and_unsupported_macros_are_explicit(){assert!(safe_math(r"\frac{a_1}{\sqrt{b}} + \operatorname{Aut}_{\mathbb Q}(X)"));for x in [r"\newcommand{\x}{Y}",r"\myProjectMacro",r"\catcode`\%=1",r"\input|whoami",r"\frac{x}{y",r"\special{ps:run}"]{assert!(!safe_math(x),"{x}");}let mut w=false;let t=rich("Custom $\\authorMacro(X)$ and $unclosed",&mut w).unwrap();assert!(w);assert!(t.contains("authorMacro"));assert!(literal("汉").unwrap_err().contains("U+6C49"));}
 #[test] fn escape_all_data_fields_and_keep_source_identity(){let(mut r,p)=fixture();r["result"]["title"]=json!(r"Title \input{secret} % # &");let(t,_)=render(&r,&p).unwrap();assert!(t.contains(r"Title \textbackslash{}input\{secret\} \% \# \&"));assert!(!t.contains(r"\input{secret}"));}
 #[tokio::test] async fn export_rejects_stale_heads_and_wrong_run_without_writes(){
  let(dir,b)=crate::test_backend();let root=dir.path().join("paper");std::fs::create_dir_all(&root).unwrap();std::fs::write(root.join("main.tex"),"AUTHOR CONTENT").unwrap();let id=b.project_register(root.to_string_lossy().into()).unwrap().id;
  let(mut r,mut p)=fixture();r["id"]=json!(uuid::Uuid::new_v4().to_string());r["kind"]=json!("outline");r["state"]=json!("completed");r["raw"]=json!("");p["requirements"]=json!("English");p["mainline"]=json!("Geometry");p["selectionConfirmed"]=json!(true);p["options"]=json!([]);p["runs"]=json!([r]);p["applied"]=json!([]);p["reports"][0]["path"]=json!(format!(".mps/reports/{}.pdf","a".repeat(40)));p["reports"][0]["warnings"]=json!([]);p["reports"][0]["pages"][0]["page"]=json!(1);p["reports"][0]["pages"][0]["text"]=json!("Source");
  crate::manual_storage::save(&b,&id,&json!({"mode":"manual","outline":[],"reviews":[],"planning":p})).unwrap();
  let data=crate::manual_storage::load(&b,&id).unwrap();let count=std::fs::read_dir(root.join(".mps/revisions")).unwrap().count();
  assert!(export(b.clone(),id.clone(),json!({"runId":r["id"],"expectedHeads":[]})).await.unwrap_err().contains("changed"));
  assert!(export(b.clone(),id.clone(),json!({"runId":"wrong","expectedHeads":data["storageHeads"]})).await.unwrap_err().contains("Select a saved"));
  assert_eq!(std::fs::read_dir(root.join(".mps/revisions")).unwrap().count(),count);assert_eq!(std::fs::read_to_string(root.join("main.tex")).unwrap(),"AUTHOR CONTENT");assert_eq!(std::fs::read_dir(&b.inner.config.temp_dir).unwrap().count(),0);b.shutdown().await;
 }

}
