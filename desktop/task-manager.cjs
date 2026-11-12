'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {AgentRouter}=require('./agent-router.cjs');
const {validateRpcRequest,validateApprovalResponse,redactLog}=require('./workspace.cjs');
const {git}=require('./workbench.cjs');
class TaskManager{
 constructor({directory,store,catalog,settingsForProject,executable,send,routerFactory}){
  Object.assign(this,{directory,store,catalog,settingsForProject,executable,send,routerFactory});this.records=[];this.running=new Map();fs.mkdirSync(directory,{recursive:true});
  try{this.records=JSON.parse(fs.readFileSync(path.join(directory,'tasks.json'),'utf8'));}catch{}
  if(!Array.isArray(this.records))this.records=[];
  for(const task of this.records)if(['preparing','running','waiting'].includes(task.status)){task.status='interrupted';task.error='האפליקציה נסגרה לפני סיום המשימה. המשימה לא הופעלה מחדש אוטומטית.';task.approvals=[];}
 }
 hasRunning(){return this.running.size>0;}
 save(){const file=path.join(this.directory,'tasks.json');fs.writeFileSync(file+'.tmp',JSON.stringify(this.records.slice(-100)));fs.renameSync(file+'.tmp',file);}
 update(task){this.save();this.send({type:'taskUpdate',task:{...task}});}
 list(){return this.records.map(t=>({...t})).reverse();}
 start({projectId,provider,prompt}){
  if(this.running.size>=2)throw Error('אפשר להריץ עד שתי משימות רקע במקביל.');
  const source=this.store.requireProject(projectId);
  if(!this.catalog.names()[provider])throw Error('סוכן לא מוכר.');
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>120000)throw Error('יש להזין משימה עד 120,000 תווים.');
  const id=crypto.randomUUID(),task={id,sourceProjectId:source.id,sourceName:source.name,provider,prompt,status:'preparing',createdAt:new Date().toISOString(),approvals:[],answer:''};
  this.records.push(task);const control={router:null,canceled:false};this.running.set(id,control);this.update(task);
  setImmediate(()=>{void this.run(task,control,source);});return {...task};
 }
 async run(task,control,source){
  let router;
  try{
   const safeName=source.name.replace(/[^\p{L}\p{N}._-]/gu,'-').replace(/^\.+/,'').slice(0,32)||'project';
   const cwd=path.join(this.directory,'worktrees',safeName+'-'+task.id.slice(0,8));fs.mkdirSync(path.dirname(cwd),{recursive:true});
   const branch='codex/background-'+task.id.slice(0,8);await git(source.path,['worktree','add','-b',branch,cwd]);
   const project=this.store.addProject(cwd);task.projectId=project.id;task.cwd=cwd;task.branch=branch;
   if(control.canceled)throw Error('המשימה בוטלה לפני ההפעלה.');
   router=this.routerFactory?this.routerFactory(task):new AgentRouter(path.join(this.directory,'sessions',task.id),{catalog:this.catalog,settingsForProject:()=>this.settingsForProject(source.id)});control.router=router;
   const threadProjects=new Map();
   router.on('error',error=>{task.error=redactLog(error.message);this.update(task);});
   router.on('serverRequest',request=>{task.approvals.push(request);task.status='waiting';this.update(task);});
   router.on('notification',event=>{
    if(event.method==='item/completed'&&event.params.item?.type==='agentMessage'){task.messageTexts={...task.messageTexts,[event.params.item.id]:event.params.item.text};task.answer=Object.values(task.messageTexts).join('\n').slice(-60000);this.update(task);}
    if(event.method==='serverRequest/resolved'){task.approvals=task.approvals.filter(a=>a.id!==event.params.requestId);if(!task.approvals.length)task.status='running';this.update(task);}
   });
   await router.select(task.provider);await router.start({cwd,executable:this.executable()});
   const started=await router.request('thread/start',validateRpcRequest('thread/start',{cwd},this.store,threadProjects));task.threadId=started.thread.id;threadProjects.set(task.threadId,project.id);
   if(control.canceled)throw Error('המשימה בוטלה לפני השליחה.');
   const completed=new Promise(resolve=>{const finish=result=>{router.off('notification',callback);router.off('exit',exited);resolve(result);};const callback=event=>{if(event.method==='turn/completed')finish(event.params.turn);};const exited=()=>finish({status:control.canceled?'interrupted':'failed',error:{message:'חיבור הסוכן נסגר בזמן המשימה.'}});router.on('notification',callback);router.on('exit',exited);});
   task.status='running';this.update(task);
   await router.request('turn/start',validateRpcRequest('turn/start',{threadId:task.threadId,input:[{type:'text',text:task.prompt}]},this.store,threadProjects));
   const result=await completed;task.status=result.status;task.error=result.error?.message;task.approvals=[];
  }catch(error){task.status=control.canceled?'interrupted':'failed';task.error=redactLog(error.message);}
  finally{if(router)await router.stop().catch(()=>{});task.finishedAt=new Date().toISOString();task.approvals=[];this.running.delete(task.id);this.update(task);}
 }
 async respond(taskId,requestId,accept){if(typeof accept!=='boolean')throw Error('החלטה לא תקינה.');const task=this.records.find(t=>t.id===taskId),control=this.running.get(taskId),request=task?.approvals.find(a=>a.id===requestId);if(!request||!control?.router)throw Error('בקשת האישור אינה פעילה.');
  if(!['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(request.method)){
   await control.router.respondError(request.id,{code:-32601,message:'Unsupported background interaction'});task.approvals=task.approvals.filter(a=>a.id!==requestId);this.update(task);return {declined:true};
  }
  await control.router.respond(requestId,validateApprovalResponse(request,{decision:accept?'accept':'decline'}));task.approvals=task.approvals.filter(a=>a.id!==requestId);if(['waiting','running'].includes(task.status))task.status=task.approvals.length?'waiting':'running';this.update(task);return {ok:true};
 }
 async stop(id){const control=this.running.get(id);if(!control)return;control.canceled=true;if(control.router)await control.router.stop();}
 async close(){await Promise.all([...this.running.keys()].map(id=>this.stop(id)));}
}
module.exports={TaskManager};
