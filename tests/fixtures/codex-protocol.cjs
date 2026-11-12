// Deterministic protocol server fixture. Never imported by production code.
const {EventEmitter}=require('node:events');
module.exports=class ProtocolFixture extends EventEmitter{
 constructor(){super();this.status={state:'stopped'};this.threads=[];this.pending=new Map();this.responses=[];this.counter=0;this.ready=false;globalThis.protocolFixture=this;}
 async start(options){this.cwd=options.cwd;this.status={state:'ready',cwd:this.cwd};this.emit('status',this.status);return this.status;}
 async stop(){this.status={state:'stopped'};this.emit('status',this.status);return this.status;}
 note(method,params){this.emit('notification',{method,params});}
 finish(thread,turn,text){
  const item={id:'answer-'+turn.id,type:'agentMessage',text:text||'FIXTURE_DONE_'+turn.prompt};
  this.note('item/agentMessage/delta',{threadId:thread.id,itemId:item.id,delta:'partial'});
  turn.items.push(item);this.note('item/completed',{threadId:thread.id,turnId:turn.id,item});
  turn.status='completed';this.note('turn/plan/updated',{threadId:thread.id,plan:[{step:'בדיקת מקור',status:'completed'}]});
  this.note('turn/diff/updated',{threadId:thread.id,diff:'diff --git a/fixture.txt b/fixture.txt\n+fixture'});
  this.note('turn/completed',{threadId:thread.id,turn:{id:turn.id,status:turn.status}});
 }
 async request(method,p={}){
  if(method==='account/read')return {account:{type:'chatgpt',email:'fixture@example.test',planType:'test'},requiresOpenaiAuth:true};
  if(method==='account/login/start')return {loginId:'fixture-login',authUrl:'https://auth.openai.com/authorize?state=fixture'};
  if(method==='account/rateLimits/read')return {rateLimits:{primary:{usedPercent:12}}};
  if(method==='config/read')return {config:{model:'fixture-model',sandbox_mode:'workspace-write'}};
  if(method==='model/list')return {data:[{id:'fixture-model',model:'fixture-model',displayName:'Fixture model',supportedReasoningEfforts:[{reasoningEffort:'medium'}]}]};
  if(method==='windowsSandbox/readiness')return {status:this.ready?'ready':'notReady'};
  if(method==='windowsSandbox/setupStart'){this.ready=true;this.note('windowsSandbox/setupCompleted',{});return {};}
  if(method==='thread/list')return {data:this.threads.filter(t=>!!t.archived===!!p.archived),nextCursor:null};
  if(method==='thread/start'){const t={id:'fixture-thread-'+(++this.counter),cwd:p.cwd,name:'שיחה חדשה',turns:[],preview:''};this.threads.push(t);return {thread:t};}
  const thread=this.threads.find(t=>t.id===p.threadId);
  if(method==='thread/resume')return {thread};
  if(method==='thread/turns/list'){const offset=Number(p.cursor||0),turns=[...thread.turns].reverse();return {data:turns.slice(offset,offset+2),nextCursor:turns.length>offset+2?String(offset+2):null};}
  if(method==='thread/name/set'){thread.name=p.name;return {};}
  if(method==='thread/archive'){thread.archived=true;return {};}
  if(method==='turn/interrupt'){const turn=thread.turns.find(t=>t.id===p.turnId);turn.status='interrupted';this.note('turn/completed',{threadId:thread.id,turn:{id:turn.id,status:'interrupted'}});return {};}
  if(method==='turn/start'){
   const prompt=p.input[0].text;if(prompt==='REJECT_START')throw Error('fixture rejected before start');
   const turn={id:'fixture-turn-'+(++this.counter),status:'inProgress',items:[],prompt};thread.turns.push(turn);thread.preview=prompt;
   setImmediate(()=>{
    this.note('turn/started',{threadId:thread.id,turn:{id:turn.id,status:'inProgress'}});
    const user={id:'user-'+turn.id,type:'userMessage',content:[{type:'text',text:prompt}]};turn.items.push(user);this.note('item/completed',{threadId:thread.id,item:user});
    const base={threadId:thread.id,turnId:turn.id,cwd:thread.cwd,reason:'protocol fixture'},id='request-'+turn.id;
    const definitions={
     COMMAND:['item/commandExecution/requestApproval',{command:'Read fixture.txt',availableDecisions:['accept','decline']}],
     FILE:['item/fileChange/requestApproval',{changes:[{path:'fixture.txt',diff:'+fixture'}],availableDecisions:['accept','decline']}],
     PERMISSIONS:['item/permissions/requestApproval',{permissions:{network:{enabled:true},fileSystem:{read:['C:/fixture']}}}],
     QUESTION:['item/tool/requestUserInput',{questions:[{id:'choice',header:'בחירה',question:'מה לבחור?',options:[{label:'אפשרות א',description:'תיאור'}]}]}],
     LEGACY_QUESTION:['tool/requestUserInput',{questions:[{id:'choice',header:'בחירה',question:'מה לבחור?'}]}],
     MCP_FORM:['mcpServer/elicitation/request',{mode:'form',message:'פרטים לשרת הבדיקה',requestedSchema:{type:'object',required:['nickname','count'],properties:{nickname:{type:'string',title:'כינוי',minLength:2},count:{type:'integer',title:'כמות',minimum:1},enabled:{type:'boolean',title:'פעיל'},plan:{type:'string',title:'מסלול',enum:['small','large']}}}}],
     MCP_URL:['mcpServer/elicitation/request',{mode:'url',message:'אימות בדיקה',url:'https://example.test/verify'}]
    };
    if(prompt==='WAIT')return;
    if(prompt==='FAIL'){turn.status='failed';this.note('turn/completed',{threadId:thread.id,turn:{id:turn.id,status:'failed',error:{message:'fixture model failure'}}});return;}
    if(definitions[prompt]){const [method,extra]=definitions[prompt];this.pending.set(id,{thread,turn});this.emit('serverRequest',{id,method,params:{...base,...extra}});}
    else this.finish(thread,turn,'# Source renderer\n\n**Formatted response**\n\n    const safe = 1;\n\n<script>unsafe()</script>\n\n![image](https://example.test/pixel)\n\nFIXTURE_MARKDOWN_OK');
   });
   return {turn:{id:turn.id,status:'inProgress'}};
  }
  return {};
 }
 async respond(id,result){this.responses.push({id,result});const request=this.pending.get(id);if(!request)throw Error('unknown fixture request');this.pending.delete(id);this.note('serverRequest/resolved',{requestId:id});setImmediate(()=>this.finish(request.thread,request.turn));return {};}
 async respondError(){return {};}
};
