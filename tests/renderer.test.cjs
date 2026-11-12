const {test}=require('node:test'),assert=require('node:assert/strict');
async function fixture(overrides={}){
 const {createWorkspace}=await import('../src/workspace-state.js');
 let listener=()=>{},failTurn=false;const calls=[];
 const project={id:'project',path:'C:/fixture',name:'fixture'};
 const api={getAppInfo:async()=>({version:'0.6.0'}),getSettings:async()=>({theme:'light',permissions:'workspace-write',reasoningEffort:'medium'}),
  getProjects:async()=>[project],getStatus:async()=>({state:'stopped',connected:false}),getGitDiff:async()=>({diff:''}),
  connect:async()=>({connected:true,state:'ready',cwd:project.path,provider:'claude',providerName:'Claude'}),selectAgent:async()=>{},disconnect:async()=>({connected:false}),
  openExternal:async url=>{calls.push(['openExternal',url]);},respond:async(id,result)=>{calls.push(['respond',id,result]);},
  onEvent:fn=>{listener=fn;return()=>{listener=()=>{};};},
  request:async(method,params)=>{
   calls.push([method,params]);
   if(method==='thread/list')return {data:[],nextCursor:null};
   if(method==='thread/start')return {thread:{id:'claude:conversation'}};
   if(method==='account/read')return {requiresOpenaiAuth:false,account:{type:'external'}};
   if(method==='model/list')return {data:[]};
   if(method==='windowsSandbox/readiness')return {status:'notApplicable'};
   if(method==='turn/start'){if(failTurn)throw Error('fixture failure');return {turn:{id:'turn'}};}
   if(method==='thread/turns/list')return {data:[],nextCursor:null};
   return {};
  },...overrides};
 const w=createWorkspace(api);await w.initialize();return {w,api,calls,project,emit:event=>listener(event),fail:()=>{failTurn=true;}};
}
const event=(method,params)=>({type:'notification',method,params});
test('streaming, canonical final messages and optimistic input produce one copy each',async()=>{
 const f=await fixture();await f.w.send('hello');
 f.emit(event('item/completed',{threadId:'claude:conversation',item:{id:'user',type:'userMessage',content:[{text:'hello'}]}}));
 f.emit(event('item/agentMessage/delta',{threadId:'claude:conversation',itemId:'answer',delta:'part'}));
 f.emit(event('item/completed',{threadId:'claude:conversation',item:{id:'answer',type:'agentMessage',text:'complete answer'}}));
 assert.deepEqual(f.w.session.messages.map(m=>[m.role,m.text]),[['user','hello'],['assistant','complete answer']]);
 f.emit(event('turn/completed',{threadId:'claude:conversation',turn:{status:'completed'}}));
 assert.equal(f.w.session.busy,false);assert.equal(f.w.session.lastStatus,'completed');f.w.dispose();
});
test('failed submit removes optimistic input and enables retry without replay',async()=>{
 const f=await fixture();f.fail();await assert.rejects(f.w.send('preserve this draft'),/fixture failure/);
 assert.equal(f.w.session.busy,false);assert.equal(f.w.session.messages.length,0);assert.equal(f.calls.filter(c=>c[0]==='turn/start').length,1);f.w.dispose();
});
test('requests and deltas from other conversations are ignored; active work cannot be switched',async()=>{
 const f=await fixture();await f.w.send('run');
 f.emit({type:'request',id:'other',method:'item/commandExecution/requestApproval',params:{threadId:'wrong'}});
 f.emit(event('item/agentMessage/delta',{threadId:'wrong',itemId:'other',delta:'private-other-chat'}));
 assert.equal(f.w.session.approvals.length,0);assert.equal(f.w.session.messages.some(m=>m.text.includes('private-other')),false);
 await assert.rejects(f.w.selectProject(f.project),/יש להמתין/);
 f.emit({type:'request',id:'own',method:'item/commandExecution/requestApproval',params:{threadId:'claude:conversation'}});
 await f.w.answer('own',{decision:'decline'});assert.equal(f.w.session.approvals.length,0);
 await f.w.interrupt();assert.equal(f.calls.at(-1)[0],'turn/interrupt');f.w.dispose();
});
test('device login opens verification URL and preserves device code until completion',async()=>{
 const f=await fixture();f.api.request=async method=>method==='account/login/start'?{loginId:'login',verificationUrl:'https://auth.openai.com/device',userCode:'EXAMPLE'}:{account:{email:'user@example.test'}};
 await f.w.loginAccount('chatgptDeviceCode');assert.deepEqual(f.calls.at(-1),['openExternal','https://auth.openai.com/device']);assert.equal(f.w.login.userCode,'EXAMPLE');
 f.emit(event('account/login/completed',{success:true}));await new Promise(setImmediate);assert.equal(f.w.login,null);assert.equal(f.w.account.email,'user@example.test');f.w.dispose();
});
test('historical pages preserve chronological order and deduplicate shared items',async()=>{
 const f=await fixture();f.api.request=async(method,params)=>{
  if(method==='thread/turns/list')return params.cursor?{data:[{items:[{id:'one',type:'agentMessage',text:'older'},{id:'two',type:'agentMessage',text:'newer'}]}],nextCursor:null}:{data:[{status:'completed',items:[{id:'two',type:'agentMessage',text:'newer'}]}],nextCursor:'previous'};
  if(method==='account/read')return {account:{type:'external'}};return {data:[]};
 };
 await f.w.openThread({id:'claude:conversation',cwd:f.project.path,provider:'claude'});
 await f.w.loadOlderTurns();assert.deepEqual(f.w.session.messages.map(m=>m.text),['older','newer']);assert.equal(f.w.session.turnCursor,null);f.w.dispose();
});
test('late conversation navigation cannot overwrite a subsequently selected project',async()=>{
 const f=await fixture();let release;f.api.connect=()=>new Promise(resolve=>{release=resolve;});
 const opening=f.w.openThread({id:'claude:old',cwd:f.project.path,provider:'claude'});await new Promise(setImmediate);
 const other={id:'other',path:'C:/other',name:'other'};await f.w.selectProject(other);release({connected:true,cwd:'C:/fixture'});await opening;
 assert.equal(f.w.project.id,'other');assert.equal(f.w.session.threadId,null);f.w.dispose();
});
test('markdown preserves formatted code and tables while rejecting executable HTML and remote images',async()=>{
 const {renderMarkdown}=await import('../src/markdown.js');
 const html=renderMarkdown('# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n    const a = 1;\n\n<script>alert(1)</script>\n\n![remote](https://example.test/pixel)\n\n[x](javascript:alert(1))');
 assert.match(html,/<h1>Title/);assert.match(html,/<table>/);assert.match(html,/const a = 1/);assert.equal(html.includes('<script>'),false);assert.equal(html.includes('<img'),false);assert.equal(html.includes('href="javascript:'),false);
});
test('all renderer assets are generated from maintained source and contain no legacy assets',()=>{
 const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/BUILD-SOURCES.json'),'utf8'));
 assert.ok(manifest.sources.some(s=>s.path==='src/app.js'));assert.ok(manifest.sources.some(s=>s.path==='src/workspace-state.js'));
 for(const s of manifest.sources)assert.match(s.path,/^(src|tools)\//);
 const assets=fs.readdirSync(path.join(root,'dist/assets'));assert.deepEqual(assets.sort(),['app.css','app.js']);
 assert.equal(fs.existsSync(path.join(root,'desktop/vendor/claude-sdk.mjs')),false);
});
test('reasoning history retains the public summary and omits private raw content',async()=>{
 const {applyItem,emptySession}=await import('../src/workspace-state.js');const session=emptySession();
 applyItem(session,{id:'reason',type:'reasoning',summary:[{text:'public summary'}],content:['private raw content'],text:'private text'});
 assert.equal(JSON.stringify(session).includes('private'),false);assert.equal(session.activities[0].summary[0].text,'public summary');
});
