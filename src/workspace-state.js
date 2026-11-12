// Maintained application state. UI-independent and tested with protocol fixtures.
export function emptySession() {
  return {threadId:null,turnId:null,busy:false,messages:[],activities:[],approvals:[],plan:[],diff:'',lastStatus:'',error:null,turnCursor:null};
}
export function itemText(item) {
  if (typeof item.text === 'string') return item.text;
  const content=item.content || item.summary || [];
  return Array.isArray(content)?content.map(part=>typeof part==='string'?part:part.text||'').join('\n'):'';
}
export function applyItem(session,item) {
  if (!item || typeof item.id!=='string') return;
  if(item.type==='reasoning')item={id:item.id,type:item.type,summary:item.summary||[],status:item.status};
  if (['userMessage','agentMessage'].includes(item.type)) {
    const text=itemText(item), role=item.type==='userMessage'?'user':'assistant';
    const existing=session.messages.find(m=>m.id===item.id);
    const optimistic=role==='user'&&session.messages.find(m=>m.optimistic&&m.text===text);
    if(existing) Object.assign(existing,{text,role});
    else if(optimistic) Object.assign(optimistic,{id:item.id,optimistic:false});
    else session.messages.push({id:item.id,role,text});
  } else {
    const existing=session.activities.find(a=>a.id===item.id);
    if(existing)Object.assign(existing,item);else session.activities.push({...item});
  }
}
function merge(first,next){const map=new Map(first.map(t=>[t.id,t]));for(const t of next)map.set(t.id,t);return [...map.values()];}
function samePath(a,b){return typeof a==='string'&&typeof b==='string'&&a.replaceAll('\\','/').toLowerCase()===b.replaceAll('\\','/').toLowerCase();}
export function createWorkspace(api,onChange=()=>{}) {
  const w={status:{state:'stopped',connected:false},settings:{theme:'light',permissions:'workspace-write',model:'',reasoningEffort:'medium'},info:{},
    projects:[],project:null,threads:[],threadCursor:null,archived:false,loadingHistory:false,connecting:false,
    session:emptySession(),account:null,requiresAuth:false,models:[],sandbox:{status:'unknown'},gitInfo:null,error:null,login:null,usage:null};
  let navigation=0,historyRevision=0,disposed=false;
  const emit=()=>{if(!disposed)onChange(w);};
  const error=e=>{w.error=String(e?.message||e).replace(/^Error invoking remote method '[^']+': Error: /,'');emit();};
  const safe=async fn=>{try{return await fn();}catch(e){error(e);return null;}};
  const guard=()=>{if(w.session.busy)throw Error('יש להמתין לסיום המשימה או לעצור אותה.');};
  w.clearError=()=>{w.error=null;emit();};
  w.refreshProjects=async()=>{w.projects=await api.getProjects();if(w.project)w.project=w.projects.find(p=>p.id===w.project.id)||null;emit();};
  w.refreshDiff=async()=>{if(!w.project)return;const id=w.project.id,result=await api.getGitDiff(id);if(w.project?.id===id){w.gitInfo=result;emit();}};
  async function history(cursor) {
    if(!w.project){w.threads=[];w.threadCursor=null;emit();return;}
    const revision=++historyRevision,id=w.project.id;w.loadingHistory=true;emit();
    try{
      const result=await api.request('thread/list',{cwd:w.project.path,limit:50,archived:w.archived,...(cursor?{cursor}:{})});
      if(revision===historyRevision&&w.project?.id===id){w.threads=cursor?merge(w.threads,result.data||[]):result.data||[];w.threadCursor=result.nextCursor||null;}
    } finally{if(revision===historyRevision){w.loadingHistory=false;emit();}}
  }
  w.refreshThreads=()=>history();
  w.loadMoreThreads=()=>w.threadCursor?history(w.threadCursor):Promise.resolve();
  w.showArchived=async value=>{guard();w.archived=!!value;await history();};
  w.newChat=()=>{guard();navigation++;w.loadingHistory=false;w.session=emptySession();w.error=null;emit();};
  w.selectProject=async project=>{
    guard();navigation++;historyRevision++;w.project=project;w.session=emptySession();w.gitInfo=null;w.threads=[];w.threadCursor=null;emit();
    await Promise.all([safe(()=>history()),safe(()=>w.refreshDiff())]);
  };
  w.chooseFolder=async()=>{guard();const project=await api.chooseFolder();if(project){await w.refreshProjects();await w.selectProject(project);}return project;};
  w.removeProject=async id=>{guard();w.projects=await api.removeProject(id);if(w.project?.id===id){w.project=null;w.session=emptySession();w.threads=[];}emit();};
  w.refreshAccount=async()=>{
    const result=await api.request('account/read',{refreshToken:false});w.account=result.account||null;w.requiresAuth=result.requiresOpenaiAuth===true;emit();return result;
  };
  w.refreshSandbox=async()=>{w.sandbox=await api.request('windowsSandbox/readiness');emit();};
  w.refreshModels=async()=>{const result=await api.request('model/list',{limit:100});w.models=result.data||[];emit();};
  w.loginAccount=async(type='chatgpt')=>{
    const result=await api.request('account/login/start',{type});w.login=result;emit();
    const url=result.authUrl||result.verificationUrl;if(url)await api.openExternal(url);return result;
  };
  w.cancelLogin=async()=>{if(w.login?.loginId)await api.request('account/login/cancel',{loginId:w.login.loginId});w.login=null;emit();};
  w.reopenLogin=async()=>{const url=w.login?.authUrl||w.login?.verificationUrl;if(url)await api.openExternal(url);};
  w.logout=async()=>{guard();await api.request('account/logout');w.account=null;w.login=null;emit();};
  w.connect=async()=>{
    if(w.connecting)return w.status;guard();w.connecting=true;w.error=null;emit();
    try{
      w.status=await api.connect(w.project?{projectId:w.project.id}:{});
      await w.refreshAccount();
      await Promise.all([safe(()=>w.refreshModels()),safe(()=>w.refreshSandbox()),safe(()=>history())]);
      if(!w.account&&w.requiresAuth&&!w.login)await w.loginAccount();
      emit();return w.status;
    }finally{w.connecting=false;emit();}
  };
  w.disconnect=async()=>{guard();w.status=await api.disconnect();emit();};
  w.saveSettings=async value=>{w.settings=await api.saveSettings(value);emit();return w.settings;};
  w.setupSandbox=async mode=>{guard();if(!w.project)throw Error('יש לבחור פרויקט.');await api.request('windowsSandbox/setupStart',{mode,cwd:w.project.path});await w.refreshSandbox();};
  w.refreshUsage=async()=>{w.usage=await api.request('account/rateLimits/read');emit();};
  async function readTurns(threadId,cursor) {
    const result=await api.request('thread/turns/list',{threadId,limit:25,itemsView:'full',sortDirection:'desc',...(cursor?{cursor}:{})});
    return {turns:[...(result.data||[])].reverse(),cursor:result.nextCursor||null};
  }
  w.openThread=async thread=>{
    guard();const project=w.projects.find(p=>samePath(p.path,thread.cwd))||w.project;if(!project)throw Error('תיקיית השיחה אינה פתוחה.');
    const serial=++navigation;w.project=project;w.session=emptySession();w.session.threadId=thread.id;w.loadingHistory=true;emit();
    try{
      const provider=thread.provider||(thread.id.includes(':')?thread.id.split(':')[0]:'codex');
      await api.selectAgent(provider);if(serial!==navigation)return;
      w.status=await api.connect({projectId:project.id});if(serial!==navigation)return;
      await api.request('thread/resume',{threadId:thread.id,cwd:project.path,excludeTurns:true});if(serial!==navigation)return;
      const result=await readTurns(thread.id);if(serial!==navigation)return;
      const session=emptySession();session.threadId=thread.id;session.turnCursor=result.cursor;
      for(const turn of result.turns){for(const item of turn.items||[])applyItem(session,item);session.lastStatus=turn.status||'';}
      w.session=session;
      await Promise.all([safe(()=>w.refreshAccount()),safe(()=>w.refreshModels()),safe(()=>w.refreshSandbox()),safe(()=>history()),safe(()=>w.refreshDiff())]);
    }finally{if(serial===navigation){w.loadingHistory=false;emit();}}
  };
  w.loadOlderTurns=async()=>{
    if(!w.session.turnCursor||w.loadingHistory)return;const id=w.session.threadId;w.loadingHistory=true;emit();
    try{const result=await readTurns(id,w.session.turnCursor);if(w.session.threadId!==id)return;const older=emptySession();for(const turn of result.turns)for(const item of turn.items||[])applyItem(older,item);w.session.messages=merge(older.messages,w.session.messages);w.session.activities=merge(older.activities,w.session.activities);w.session.turnCursor=result.cursor;}
    finally{w.loadingHistory=false;emit();}
  };
  w.renameThread=async(thread,name)=>{guard();await api.request('thread/name/set',{threadId:thread.id,name});await history();};
  w.archiveThread=async thread=>{guard();await api.request('thread/archive',{threadId:thread.id});if(w.session.threadId===thread.id)w.newChat();await history();};
  w.send=async text=>{
    guard();if(!text.trim())return false;if(!w.project)throw Error('יש לבחור תיקיית פרויקט.');
    if(w.loadingHistory||w.connecting)throw Error('יש להמתין לסיום טעינת השיחה.');
    if(!w.status.connected||!samePath(w.status.cwd,w.project.path))await w.connect();
    if(w.requiresAuth&&!w.account)throw Error('יש להשלים את ההתחברות לפני שליחת הודעה.');
    w.session.busy=true;w.session.error=null;w.error=null;emit();
    try{
      if(!w.session.threadId){const result=await api.request('thread/start',{cwd:w.project.path,...(w.settings.model?{model:w.settings.model}:{})});w.session.threadId=result.thread.id;emit();}
      const optimistic={id:'pending-'+Date.now(),role:'user',text,optimistic:true};w.session.messages.push(optimistic);emit();
      try{const result=await api.request('turn/start',{threadId:w.session.threadId,input:[{type:'text',text}],...(w.settings.model?{model:w.settings.model}:{}),...(w.settings.reasoningEffort?{effort:w.settings.reasoningEffort}:{})});
        if(w.session.busy)w.session.turnId=result.turn.id;
      }catch(e){w.session.messages=w.session.messages.filter(m=>m!==optimistic);throw e;}
      emit();return true;
    }catch(e){w.session.busy=false;w.session.error=String(e.message||e);emit();throw e;}
  };
  w.interrupt=async()=>{if(w.session.threadId&&w.session.turnId)await api.request('turn/interrupt',{threadId:w.session.threadId,turnId:w.session.turnId});};
  w.answer=async(id,result)=>{await api.respond(id,result);w.session.approvals=w.session.approvals.filter(a=>a.id!==id);emit();};
  const unsubscribe=api.onEvent(event=>{
    if(disposed)return;
    if(event.type==='status'){w.status=event;}
    else if(event.type==='exit'){w.status={state:'stopped',connected:false};w.session.busy=false;w.session.approvals=[];}
    else if(event.type==='error'){w.error=event.message;}
    else if(event.type==='request'){
      if(event.params?.threadId===w.session.threadId&&!w.session.approvals.some(a=>a.id===event.id))w.session.approvals.push(event);
    } else if(event.type==='notification'){
      const p=event.params||{},method=event.method,s=w.session;
      if(method==='account/login/completed'){w.login=null;void safe(()=>w.refreshAccount());if(p.success===false)w.error=p.error||'ההתחברות לא הושלמה.';}
      if(method==='account/updated')void safe(()=>w.refreshAccount());
      if(method==='windowsSandbox/setupCompleted')void safe(()=>w.refreshSandbox());
      if(method==='serverRequest/resolved')s.approvals=s.approvals.filter(a=>a.id!==p.requestId);
      if(p.threadId===s.threadId){
        if(method==='turn/started'){s.busy=true;s.turnId=p.turn?.id;s.lastStatus='inProgress';s.error=null;}
        if(method==='turn/completed'){s.busy=false;s.turnId=null;s.lastStatus=p.turn?.status||'completed';s.error=p.turn?.error?.message||null;s.approvals=[];void safe(()=>history());void safe(()=>w.refreshDiff());}
        if(method==='item/started'||method==='item/completed')applyItem(s,p.item);
        if(method==='item/agentMessage/delta'){
          let message=s.messages.find(m=>m.id===p.itemId);if(!message){message={id:p.itemId,role:'assistant',text:''};s.messages.push(message);}message.text=(message.text+(p.delta||'')).slice(0,240000);
        }
        if(method==='item/commandExecution/outputDelta'){
          let item=s.activities.find(a=>a.id===p.itemId);if(!item){item={id:p.itemId,type:'commandExecution',status:'inProgress'};s.activities.push(item);}item.aggregatedOutput=((item.aggregatedOutput||'')+(p.delta||'')).slice(-240000);
        }
        if(method==='turn/plan/updated')s.plan=p.plan||[];
        if(method==='turn/diff/updated')s.diff=p.diff||'';
      }
    }
    emit();
  });
  w.initialize=async()=>{
    const [info,settings,projects,status]=await Promise.all([api.getAppInfo(),api.getSettings(),api.getProjects(),api.getStatus()]);
    Object.assign(w,{info,settings,projects,status});w.project=projects[0]||null;if(info.warning)w.error=info.warning;emit();
    if(w.project)await Promise.all([safe(()=>history()),safe(()=>w.refreshDiff())]);
  };
  w.dispose=()=>{disposed=true;unsubscribe();};
  return w;
}
