#!/usr/bin/env python3
"""Synthetic protocol fixture only; no model and no executable tools."""
import sys,json
from pathlib import Path
base=Path(__file__).parent
number=0
thread=''
def send(v):print(json.dumps(v),flush=True)
def event(method,params):send({'method':method,'params':params})
def done(status):event('turn/completed',{'threadId':thread,'turn':{'id':'turn','status':status}})
for line in sys.stdin:
 q=json.loads(line)
 with (base/'requests.jsonl').open('a') as f:f.write(json.dumps(q)+'\n')
 method=q.get('method');p=q.get('params',{});r={}
 if not method or 'id' not in q:continue
 if method=='config/read':r={'config':{'mcp_servers':{'unsafe-filesystem':{'command':'unused'}},'plugins':{'unsafe-plugin':{'enabled':True}}}}
 if method=='thread/start':
  number+=1;thread=f'planning-{number}';r={'thread':{'id':thread},'sandbox':{'type':'dangerFullAccess' if (base/'unsafe').exists() else 'readOnly','networkAccess':False},'approvalPolicy':'never','model':'fixture-only'}
 if method=='turn/start':r={'turn':{'id':'turn'}}
 send({'id':q['id'],'result':r})
 if method=='turn/start':
  event('turn/started',{'threadId':thread,'turn':{'id':'turn'}})
  send({'id':900,'method':'item/fileChange/requestApproval','params':{'threadId':thread}})
  if (base/'hold').exists():continue
  prompt=p['input'][0]['text'];data=json.loads(prompt[prompt.index('{'):]);source=data['reports'][0]['id'];citation=[{'sourceId':source,'page':1,'section':'Synthetic section'}]
  if data.get('confirmedOutline'):
   answer={'items':[{'command':'pqAutQ','kind':'newcommand','arity':1,'body':r'\operatorname{Aut}_{\mathbb{Q}}(#1)','usage':r'\pqAutQ{X}','meaning':'Full rational cohomology kernel, subject to source hypotheses.','sourceNotation':'Aut_Q(X)','sources':citation,'packages':['amsmath','amsfonts'],'notes':'Suggested name; synthetic fixture only.','selected':False,'provenance':'proposed_macro'}],'limitations':['Synthetic protocol test, no actual model.']}
  elif not data['confirmedMainline']:
   answer={'options':[{'id':str(i),'title':f'Framework choice {i}','coreQuestion':'Organize the quotient geometry and cohomology.','usableResults':['Report argument only.'],'tradeoffs':['Classification is excluded.'],'gaps':['External theorem applicability needs checking.'],'sources':citation} for i in [1,2]],'limitations':['Synthetic protocol fixture only.']}
  else:
   sections=[]
   for i in range(3):
    claims=[] if i==0 else [{'label':f'Proposed result {i}','kind':'question' if i==2 else 'theorem','status':'research_plan' if i==2 else 'report_argument','statement':'Investigate singular curve gluing.' if i==2 else 'Under the stated hypotheses the report supplies an equivariant decomposition.','proofSteps':['Check all stated hypotheses against the report.'],'dependsOn':['Finite quotient invariants.'],'sources':citation,'openQuestions':['Verify the cited theorem in its original source.']}]
    sections.append({'id':f's{i+1}','level':'section','title':['Introduction and scope','Equivariant quotient cohomology','Further questions'][i],'purpose':'Separate established arguments from remaining tasks.','claims':claims,'proofSteps':['Use the supplied report argument as a roadmap.'],'dependencies':[] if i==0 else [f's{i}'],'sources':citation,'openQuestions':['No novelty claim is established.']})
   answer={'title':'Geometry and equivariant cohomology','mainline':'General unmixed quotient geometry as the main thread.','sections':sections,'limitations':['Synthetic protocol fixture only.'],'noveltyStatus':'not_assessed'}
  if (base/'bad-page').exists():
   if 'sections' in answer:answer['sections'][0]['sources'][0]['page']=999
   else:answer['options'][0]['sources'][0]['page']=999
  reply='not JSON' if (base/'malformed').exists() else json.dumps(answer)
  event('item/completed',{'threadId':thread,'item':{'type':'agentMessage','phase':'final_answer','text':reply}});done('completed')
 if method=='turn/interrupt':done('interrupted')
