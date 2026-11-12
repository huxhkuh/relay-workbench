const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {EventEmitter}=require('node:events');
const {AgentRouter,handoffText}=require('../desktop/agent-router.cjs');
class FakeCodex extends EventEmitter{constructor(){super();this.status={state:'stopped'};}async start(options){this.status={state:'ready',cwd:options.cwd};this.emit('status',this.status);}async stop(){this.status={state:'stopped'};this.emit('status',this.status);}async request(method){if(method==='thread/list')return {data:[]};return {fromCodex:true};}async respond(){return {};}}
function setup(t,runner){const root=fs.mkdtempSync(path.join(os.tmpdir(),'boau-routing-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const router=new AgentRouter(path.join(root,'state'),{codex:new FakeCodex(),claude:runner,antigravity:runner});router.on('error',()=>{});return {root,router};}
function completed(router){return new Promise(resolve=>{const on=n=>{if(n.method==='turn/completed'){router.off('notification',on);resolve(n.params.turn);}};router.on('notification',on);});}
async function newThread(router,cwd,provider='claude'){router.selected=provider;return (await router.request('thread/start',{cwd,sandbox:'workspace-write'})).thread;}
test('agent binding, visible history and persistence survive restart',async t=>{
 const {root,router}=setup(t,async({emit,onSession})=>{onSession('provider-session');emit({type:'text',id:'answer',text:'תשובה'});});
 const thread=await newThread(router,root);const end=completed(router);await router.request('turn/start',{threadId:thread.id,input:[{text:'שלום'}]});assert.equal((await end).status,'completed');
 const saved=router.thread(thread.id);assert.equal(saved.provider,'claude');assert.equal(saved.sessionId,'provider-session');assert.equal(saved.turns[0].items[1].text,'תשובה');
 const restored=new AgentRouter(path.join(root,'state'),{codex:new FakeCodex()});assert.equal(restored.thread(thread.id).provider,'claude');assert.equal((await restored.request('thread/list',{cwd:root})).data.length,1);
 assert.equal((await restored.request('thread/list',{cwd:path.join(root,'other')})).data.length,0);
});
test('permissions require explicit response and cannot survive cancellation',async t=>{
 let permitted;
 const {root,router}=setup(t,async({permission,signal})=>{permitted=await permission('Write',{path:'hello.txt'},signal.signal);});
 const thread=await newThread(router,root);const request=new Promise(resolve=>router.once('serverRequest',resolve));const end=completed(router);
 await router.request('turn/start',{threadId:thread.id,input:[{text:'write'}]});const approval=await request;
 assert.equal(router.running.threadId,thread.id);await router.respond(approval.id,{decision:'decline'});await end;assert.equal(permitted,false);
 const nextRequest=new Promise(resolve=>router.once('serverRequest',resolve));const nextEnd=completed(router);
 const {turn}=await router.request('turn/start',{threadId:thread.id,input:[{text:'write again'}]});await nextRequest;
 await router.request('turn/interrupt',{threadId:thread.id,turnId:turn.id});assert.equal((await nextEnd).status,'interrupted');assert.equal(router.approvals.size,0);
});
test('running tasks prevent switching and failure is surfaced as failed',async t=>{
 const {root,router}=setup(t,async()=>{throw Error('provider authentication required');});const thread=await newThread(router,root,'antigravity');const end=completed(router);
 await router.request('turn/start',{threadId:thread.id,input:[{text:'hello'}]});await assert.rejects(router.select('codex'));
 const turn=await end;assert.equal(turn.status,'failed');assert.match(turn.error.message,/התחברות/);assert.equal(router.running,null);
});
test('handoff includes bounded visible history, instructions and changed file names',()=>{
 const text=handoffText({provider:'claude',messages:[{role:'user',text:'בקשה'},{role:'assistant',text:'ביצוע'}],changes:[{name:'src/main.js'}],notes:'בדוק בדיקות'});
 for(const term of ['Claude','בקשה','ביצוע','src/main.js','בדוק בדיקות'])assert.ok(text.includes(term));
 assert.throws(()=>handoffText({provider:'unknown',messages:[],changes:[]}));
 assert.throws(()=>handoffText({provider:'claude',messages:[{role:'system',text:'secret'}],changes:[]}));
 const bounded=handoffText({provider:'claude',messages:Array.from({length:200},()=>({role:'assistant',text:'a'.repeat(10000)})),changes:[]});assert.ok(bounded.length<=115000);
});
test('streaming text and final text produce a single saved message',async t=>{
 const {root,router}=setup(t,async({emit})=>{emit({type:'delta',id:'m1',text:'hel'});emit({type:'delta',id:'m1',text:'lo'});emit({type:'text',id:'m1',text:'hello'});emit({type:'tool',id:'t1',name:'Read'});});
 const thread=await newThread(router,root);const end=completed(router);await router.request('turn/start',{threadId:thread.id,input:[{text:'hello'}]});await end;
 const items=router.thread(thread.id).turns[0].items;assert.equal(items.filter(i=>i.type==='agentMessage').length,1);assert.equal(items.find(i=>i.id==='m1').text,'hello');assert.equal(items.find(i=>i.id==='t1').status,'completed');
});
test('Antigravity error text fails the task even when ACP returns end_turn',async()=>{
 const {runAntigravity}=require('../desktop/agent-providers.cjs');
 class Client extends EventEmitter{
   async request(method){
     if(method==='initialize')return {agentCapabilities:{}};
     if(method==='session/new')return {sessionId:'test',modes:{availableModes:[{id:'plan'}]}};
     if(method==='session/prompt'){this.emit('notification',{method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'⚠ Agent execution terminated due to error.'}}}});return {stopReason:'end_turn'};}
     return {};
   }
   async close(){}
 }
 const emitted=[];
 await assert.rejects(runAntigravity({thread:{cwd:os.tmpdir(),permissions:'read-only',turns:[]},text:'test',signal:new AbortController(),permission:async()=>false,emit:e=>emitted.push(e),onSession:()=>{},clientFactory:()=>new Client()}),/שגיאת הרצה/);
 assert.equal(emitted.length,0);
});
test('Claude read-only mode denies writes and repeated session events are persisted once',async()=>{
 const {runClaude}=require('../desktop/agent-providers.cjs');const thread={cwd:os.tmpdir(),permissions:'read-only',turns:[]};let writes=0,options;
 const queryImpl=({options:value})=>{options=value;return {async interrupt(){},async *[Symbol.asyncIterator](){yield {type:'system',session_id:'same'};yield {type:'system',session_id:'same'};yield {type:'result',is_error:false};}};};
 await runClaude({thread,text:'test',signal:new AbortController(),permission:async()=>{throw Error('Write must not reach approval');},emit:()=>{},onSession:id=>{thread.sessionId=id;writes++;},queryImpl,claudeExecutable:process.execPath});
 assert.equal(writes,1);assert.equal(options.permissionMode,'plan');assert.deepEqual(options.tools,['Read','Glob','Grep']);assert.equal((await options.canUseTool('Write',{file_path:'outside'},{})).behavior,'deny');
});
