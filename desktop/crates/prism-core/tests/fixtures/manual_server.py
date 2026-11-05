#!/usr/bin/env python3
"""Protocol fixture. Does not run commands or contact a real model."""
import sys,json
from pathlib import Path
base=Path(__file__).parent
count=0
thread=""
def send(v): print(json.dumps(v),flush=True)
def event(method,params):send(dict(method=method,params=params))
def done(status):event('turn/completed',{'threadId':thread,'turn':{'id':'turn','status':status}})
for line in sys.stdin:
    q=json.loads(line)
    with (base/'requests.jsonl').open('a') as f:f.write(json.dumps(q)+'\n')
    method=q.get('method');p=q.get('params',{});r={}
    if not method or 'id' not in q:continue
    if method=='config/read':r={'config':{'mcp_servers':{'unsafe-filesystem':{'command':'unused'}}}}
    if method in ('thread/start','thread/resume'):
        count+=1;thread=f'thread-{count}';r={'thread':{'id':thread},'sandbox':{'type':'readOnly' if not (base/'unsafe').exists() else 'dangerFullAccess'},'approvalPolicy':'never'}
    if method=='turn/start':r={'turn':{'id':'turn'}}
    send({'id':q['id'],'result':r})
    if method=='turn/start':
        event('turn/started',{'threadId':thread,'turn':{'id':'turn'}})
        send({'id':900,'method':'item/fileChange/requestApproval','params':{'threadId':thread}})
        if not (base/'hold').exists():
            answer={'outcome':'gap','findings':[{'path':'main.tex','line':1,'issue':'missing hypothesis','repair':'Consider adding a hypothesis; unverified.'}],'limitations':'Synthetic fixture only'}
            event('item/completed',{'threadId':thread,'item':{'type':'agentMessage','phase':'final_answer','text':json.dumps(answer)}})
            done('completed')
    if method=='turn/interrupt':done('interrupted')
