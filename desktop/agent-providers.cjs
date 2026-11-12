'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { EventEmitter } = require('node:events');
const { StringDecoder } = require('node:string_decoder');
const { sanitizeDiagnostic } = require('./productivity.cjs');
const crypto = require('node:crypto');
const {tool}=require('./local-tools.cjs');
const exec = promisify(execFile);
const NAMES = Object.freeze(Object.fromEntries(Object.entries(require('./agent-catalog.cjs').BUILTINS).map(([id,d])=>[id,d.name])));
function executable(provider) {
  const name = provider === 'claude' ? 'claude.exe' : 'agy.exe';
  const known = provider === 'claude' ? [path.join(os.homedir(), '.local/bin', name)]
    : [path.join(process.env.LOCALAPPDATA || os.homedir(), 'agy/bin', name)];
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {const clean=dir.replace(/^"|"$/g, '');if(path.isAbsolute(clean))known.push(path.join(clean,name));}
  const found = known.find(file => fs.existsSync(file) && fs.statSync(file).isFile());
  if (!found) throw Error(`${NAMES[provider]} אינו מותקן. התקן את כלי ההפעלה הרשמי ונסה שוב.`);
  return found;
}
async function providerInfo(provider) {
  if (provider === 'codex') return { id: provider, name: NAMES[provider], installed: true };
  try {
    const binary = executable(provider);
    const { stdout } = await exec(binary, ['--version'], { windowsHide: true, timeout: 10000 });
    let authenticated = null;
    if (provider === 'claude') {
      try { const result = await exec(binary, ['auth', 'status'], { windowsHide: true, timeout: 10000 }); authenticated = JSON.parse(result.stdout).loggedIn === true; }
      catch { authenticated = false; }
    }
    return { id: provider, name: NAMES[provider], installed: true, version: stdout.trim().slice(0,100), authenticated };
  } catch (error) { return { id: provider, name: NAMES[provider], installed: false, message: error.message }; }
}
// ACP uses JSON-RPC lines. No shell, credential extraction, or permissive flags.
class AcpClient extends EventEmitter {
  constructor(binary, cwd, spawnImpl = spawn, logFile) {
    super(); this.pending = new Map(); this.id = 0; this.closed = false;
    const spec=typeof binary==='string'?{command:binary,args:['acp','--stdio']}:binary;
    this.child = spawnImpl(spec.command, [...spec.args, ...(logFile ? ['--log-file',logFile] : [])], { cwd, windowsHide: true, shell: false, env:{...process.env,...spec.env}, stdio: ['pipe','pipe','pipe'] });
    this.on('error', () => {});
    let buffer = ''; const decoder = new StringDecoder('utf8');
    this.child.stdout.on('data', chunk => {
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer) > 8 * 1024 * 1024) { this.fail(Error('תגובת Antigravity גדולה מדי.')); this.close(); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0,newline).trim(); buffer = buffer.slice(newline+1);
        if (!line) continue;
        try { this.receive(JSON.parse(line)); } catch { this.fail(Error('התקבלה תגובת ACP לא תקינה.')); this.close(); }
      }
    });
    this.child.stderr.on('data', chunk => this.emit('diagnostic', sanitizeDiagnostic(chunk.toString()).replace(/https?:\/\/\S+/g,'[URL]')));
    this.child.on('error', error => this.fail(error));
    this.child.on('close', () => { this.closed = true; this.fail(Error('חיבור Antigravity נסגר.')); });
    this.child.stdin.on('error', error => this.fail(error));
  }
  write(value) { if (this.closed || this.child.stdin.destroyed) throw Error('החיבור לסוכן סגור.'); this.child.stdin.write(JSON.stringify(value)+'\n'); }
  receive(message) {
    if (message.method) { this.emit(message.id === undefined ? 'notification' : 'request', message); return; }
    const pending = this.pending.get(message.id); if (!pending) return;
    this.pending.delete(message.id); clearTimeout(pending.timer);
    if (message.error) pending.reject(Error(message.error.message || 'שגיאת Antigravity')); else pending.resolve(message.result);
  }
  request(method, params, timeout = 30000) {
    const id = ++this.id;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`Antigravity לא השיב בזמן (${method}).`)); },timeout);
      this.pending.set(id,{resolve,reject,timer});
      try { this.write({jsonrpc:'2.0',id,method,params}); } catch(error) {clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  respond(id,result) {this.write({jsonrpc:'2.0',id,result});}
  fail(error) { for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);} this.pending.clear(); this.emit('error',error); }
  async close() {
    if(this.closed)return; this.closed=true;this.fail(Error('החיבור נעצר.'));
    this.child.stdin.end();
    await new Promise(resolve=>{
      const timer=setTimeout(()=>{if(process.platform==='win32'&&this.child.pid){void exec(tool('taskkill'),['/PID',String(this.child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{this.child.kill();}).finally(resolve);}else{this.child.kill();resolve();}},1500);
      this.child.once('close',()=>{clearTimeout(timer);resolve();});
    });
  }
}
async function runClaude({ thread, text, signal, permission, emit, onSession, queryImpl,claudeExecutable }) {
  const { query } = queryImpl ? {query:queryImpl} : await import(require('node:url').pathToFileURL(require('./claude-runtime.cjs').resolveClaudeSDK()).href);
  const options = {
    cwd: thread.cwd, pathToClaudeCodeExecutable: claudeExecutable||executable('claude'),
    abortController: signal, includePartialMessages: true,
    permissionMode: thread.permissions === 'read-only' ? 'plan' : 'default',
    settingSources: ['user','project','local'],
    systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Respond in clear Hebrew unless the user asks otherwise.\n'+(thread.instructions||'') },
    ...(thread.model?{model:thread.model}:{}),
    ...(thread.mcpServers?.length?{mcpServers:Object.fromEntries(thread.mcpServers.map(s=>[s.name,s.type==='http'?{type:'http',url:s.url}:{command:s.command,args:s.args}]))}:{}),
    canUseTool: async (name, input, context) => {
      if(signal.signal.aborted)return {behavior:'deny',message:'המשימה נעצרה.'};
      if(thread.permissions==='read-only' && !['Read','Glob','Grep'].includes(name))return {behavior:'deny',message:'השיחה מוגדרת לקריאה בלבד.'};
      const approved = await permission(name,input,context.signal);
      return approved ? {behavior:'allow',updatedInput:input} : {behavior:'deny',message:'המשתמש לא אישר את הפעולה.'};
    },
    ...(thread.sessionId ? {resume:thread.sessionId} : {}),
    ...(thread.permissions==='read-only' ? {tools:['Read','Glob','Grep'],disallowedTools:['Bash','Write','Edit','NotebookEdit']} : {}),
  };
  const stream = query({prompt:text,options}); let completed = false, streamingId = null;
  signal.signal.addEventListener('abort',()=>{void stream.interrupt().catch(()=>{});},{once:true});
  for await (const message of stream) {
    if(message.session_id && message.session_id !== thread.sessionId) onSession(message.session_id);
    if(message.type==='stream_event') {
      const event=message.event;
      if(event?.type==='message_start')streamingId=event.message?.id;
      if(event?.type==='content_block_delta'&&event.delta?.type==='text_delta')emit({type:'delta',text:event.delta.text,id:streamingId});
    }
    if(message.type==='assistant') {
      const textParts=(message.message?.content||[]).filter(part=>part.type==='text').map(part=>part.text);
      if(textParts.length)emit({type:'text',text:textParts.join('\n'),id:message.message?.id||message.uuid});
      for(const part of message.message?.content || []) {
        if(part.type==='tool_use')emit({type:'tool',name:part.name,input:part.input,id:part.id});
      }
    }
    if(message.type==='result') {
      if(message.is_error) throw Error((message.errors||[]).join('\n') || message.result || 'Claude לא השלים את המשימה.');
      completed=true;
    }
  }
  if(!completed&&!signal.signal.aborted)throw Error('Claude נסגר ללא תוצאת משימה.');
}
async function runAntigravity({thread,text,signal,permission,emit,onSession,clientFactory,spec,provider='antigravity',onMetadata=()=>{}}) {
  const label=NAMES[provider]||provider;
  const logFile = path.join(os.tmpdir(),'boau-acp-'+crypto.randomUUID()+'.log');
  const client = clientFactory ? clientFactory() : new AcpClient(spec||executable('antigravity'),thread.cwd,undefined,provider==='antigravity'?logFile:undefined);
  const updates = new Map(); let providerError = false,prompting=false;
  client.on('notification', message => {
    if(message.method!=='session/update')return;
    const update = message.params?.update;
    if(update?.sessionUpdate==='available_commands_update')onMetadata({commands:update.availableCommands||[]});
    if(prompting && update?.sessionUpdate==='agent_message_chunk' && update.content?.type==='text') {
      if(/Agent execution terminated due to error/i.test(update.content.text)) providerError = true;
      else emit({type:'delta',text:update.content.text});
    }
    if(prompting && (update?.sessionUpdate==='tool_call' || update?.sessionUpdate==='tool_call_update')) {
      const old=updates.get(update.toolCallId)||{}; const full={...old,...update};updates.set(update.toolCallId,full);
      emit({type:'tool',id:update.toolCallId,name:full.title||full.kind||'פעולת Antigravity',input:full.rawInput||{},status:full.status});
    }
  });
  client.on('request', message => {
    void (async()=>{
      if(message.method!=='session/request_permission') {client.write({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Unsupported client operation'}});return;}
      const p=message.params||{};
      const readOnly=thread.permissions==='read-only';
      const safeRead=['read','search'].includes(p.toolCall?.kind);
      const allowed=(!readOnly||safeRead)&&await permission(p.toolCall?.title||'Antigravity',p.toolCall?.rawInput||p.toolCall,signal.signal);
      const option=(p.options||[]).find(o=>o.kind===(allowed?'allow_once':'reject_once'));
      client.respond(message.id,{outcome:option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}});
    })().catch(()=>{try{client.respond(message.id,{outcome:{outcome:'cancelled'}});}catch{}});
  });
  const cancel=()=>{try{client.write({jsonrpc:'2.0',method:'session/cancel',params:{sessionId:thread.sessionId}});}catch{};void client.close();};
  signal.signal.addEventListener('abort',cancel,{once:true});
  try {
    const init=await client.request('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'relay-workbench',version:require('../package.json').version}});
    onMetadata({capabilities:init.agentCapabilities||{}});
    const mcpServers=(thread.mcpServers||[]).map(s=>s.type==='http'?{name:s.name,type:'http',url:s.url,headers:[]}:{name:s.name,command:s.command,args:s.args,env:[]});
    if(mcpServers.some(s=>s.type==='http')&&!init.agentCapabilities?.mcpCapabilities?.http)throw Error(label+' אינו מצהיר על תמיכה בשרתי MCP מסוג HTTP.');
    let session;
    if(thread.sessionId && init.agentCapabilities?.loadSession) {
      session=await client.request('session/load',{sessionId:thread.sessionId,cwd:thread.cwd,mcpServers});
    } else {
      // If the provider cannot resume, include only this conversation's visible history.
      if(thread.sessionId) text=thread.turns.flatMap(t=>t.items.filter(i=>i.type==='userMessage'||i.type==='agentMessage').map(i=>i.type==='userMessage'?'User: '+i.content.map(c=>c.text).join('\n'):'Assistant: '+i.text)).join('\n\n')+'\n\nUser: '+text;
      session=await client.request('session/new',{cwd:thread.cwd,mcpServers});
      thread.sessionId=session.sessionId;onSession(session.sessionId);
    }
    onMetadata({modes:session.modes||{},models:session.models||{}});
    if(thread.model){
      const models=session.models?.availableModels||[];
      if(!models.some(m=>m.modelId===thread.model))throw Error('המודל שבחרת אינו זמין אצל '+label+'.');
      await client.request('session/set_model',{sessionId:thread.sessionId,modelId:thread.model});
    }
    if(thread.permissions==='read-only') {
      const plan=session.modes?.availableModes?.find(m=>m.id==='plan');
      if(!plan)throw Error(label+' אינו מציע מצב תכנון שניתן לאמת. אין להתחיל שיחה בקריאה בלבד עם סוכן זה.');
      await client.request('session/set_mode',{sessionId:thread.sessionId,modeId:plan.id});
    }
    prompting=true;
    const result=await client.request('session/prompt',{sessionId:thread.sessionId,prompt:[{type:'text',text:'ענה בעברית אלא אם המשתמש ביקש אחרת.\n'+(thread.instructions?thread.instructions+'\n':'')+text}]},30*60*1000);
    if(providerError) {
      let blocked = false;
      try { if(fs.statSync(logFile).size<2*1024*1024)blocked=/blockByNetFree|netfree\.link/i.test(fs.readFileSync(logFile,'utf8')); } catch {}
      throw Error(blocked ? 'נטפרי חוסם את שירות Antigravity. נדרשת פתיחת גישה ל־daily-cloudcode-pa.googleapis.com דרך ספק הסינון. המשימה לא הושלמה.' : label+' דיווח על שגיאת הרצה בשירות. בדוק את ההתחברות ואת זמינות המודל בכלי הרשמי; המשימה לא הושלמה.');
    }
    if(result.stopReason!=='end_turn'&&!signal.signal.aborted)throw Error('Antigravity עצר לפני השלמת המשימה: '+result.stopReason);
  } finally {signal.signal.removeEventListener('abort',cancel);await client.close();try{fs.unlinkSync(logFile);}catch{}}
}
module.exports={NAMES,executable,providerInfo,AcpClient,runClaude,runAntigravity};
