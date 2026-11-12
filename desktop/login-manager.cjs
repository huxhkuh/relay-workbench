'use strict';
const {spawn}=require('node:child_process');
const {tool}=require('./local-tools.cjs');
const HOSTS={claude:['claude.com','claude.ai','platform.claude.com','console.anthropic.com','auth.anthropic.com'],antigravity:['accounts.google.com','antigravity.google','antigravity.google.com'],copilot:['github.com'],opencode:['opencode.ai','auth.opencode.ai'],cline:['app.cline.bot','cline.bot'],gemini:['accounts.google.com']};
function trustedLoginURL(provider,value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(HOSTS[provider]||[]).includes(u.hostname);}catch{return false;}}
class LoginManager{
 constructor({openExternal,spawnImpl=spawn}){this.openExternal=openExternal;this.spawn=spawnImpl;this.sessions=new Map();}
 status(p){const s=this.sessions.get(p);return s?{state:s.state,message:s.message,canReopen:!!s.url,canAcceptCode:!!s.child?.stdin?.writable&&['starting','browser-open'].includes(s.state)}:{state:'idle',message:'',canReopen:false,canAcceptCode:false};}
 submitCode(p,code){const s=this.sessions.get(p);if(!this.status(p).canAcceptCode)throw Error('אין תהליך התחברות פעיל שממתין לקוד.');if(typeof code!=='string'||code.length<6||code.length>4096||!/^[A-Za-z0-9_.~+#=/-]+$/.test(code))throw Error('קוד האימות אינו תקין.');s.child.stdin.write(code+'\n');return {ok:true};}
 async open(p,url){const s=this.sessions.get(p);if(!s||s.url===url||!trustedLoginURL(p,url))return;s.url=url;try{await this.openExternal(url);if(!['starting','browser-open'].includes(s.state))return;s.state='browser-open';s.message='הדפדפן נפתח. השלם את ההתחברות וחזור לאפליקציה.';}catch{if(s.state==='completed')return;s.state='failed';s.message='פתיחת הדפדפן נכשלה. נסה לפתוח שוב.';}}
 async reopen(p){const s=this.sessions.get(p);if(!s?.url||!trustedLoginURL(p,s.url))throw Error('עדיין לא התקבל קישור התחברות רשמי.');await this.openExternal(s.url);return this.status(p);}
 start(p,spec,args){
  if(['starting','browser-open'].includes(this.sessions.get(p)?.state))return this.status(p);
  const s={state:'starting',message:'ממתין לקישור ההתחברות הרשמי…'};this.sessions.set(p,s);
  if(['antigravity','copilot','opencode','cline','gemini'].includes(p)){
   const quote=v=>"'"+v.replace(/'/g,"''")+"'";
   const command=(spec.env?.ELECTRON_RUN_AS_NODE?"$env:ELECTRON_RUN_AS_NODE='1'; ":'')+'& '+[spec.command,...args].map(quote).join(' ');
   const encoded=Buffer.from(command,'utf16le').toString('base64');
   const launch="Start-Process -FilePath "+quote(tool('powershell'))+" -ArgumentList '-NoProfile','-NoExit','-EncodedCommand','"+encoded+"'";
   const child=this.spawn(tool('powershell'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(launch,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore'});
   child.on('error',()=>{s.state='failed';s.message='חלון ההתחברות לא נפתח.';});
   child.on('close',code=>{s.state=code===0?'terminal-open':'failed';s.message=code===0?'נפתח חלון אינטראקטיבי. בחר בו שיטת התחברות כדי לפתוח את הדפדפן.':'פתיחת חלון ההתחברות נכשלה.';});return this.status(p);
  }
  const child=this.spawn(spec.command,args,{windowsHide:true,shell:false,env:{...process.env,...spec.env},stdio:['pipe','pipe','pipe']});s.child=child;
  child.stdin?.on('error',()=>{s.state='failed';s.message='כלי ההתחברות סגר את ערוץ קוד האימות. נסה להתחבר מחדש.';});
  // URLs can span multiple pipe chunks. Never open a truncated OAuth URL.
  let buffer='';const scan=complete=>{const text=complete?buffer:buffer.slice(0,Math.max(buffer.lastIndexOf('\n'),buffer.lastIndexOf('\r'))+1);for(const match of text.matchAll(/https:\/\/[^\s<>"'\x1b]+/g))void this.open(p,match[0].replace(/[).,;]+$/,''));};
  const consume=chunk=>{buffer=(buffer+chunk.toString('utf8').replace(/\x1b\[[0-9;]*m/g,'')).slice(-32000);scan(false);};
  child.stdout.on('data',consume);child.stderr.on('data',consume);
  child.on('error',()=>{s.state='failed';s.message='הפעלת כלי ההתחברות נכשלה.';});
  child.on('close',code=>{clearTimeout(timer);s.child=null;scan(true);s.state=code===0?'completed':'failed';s.message=code===0?'כלי ההתחברות סיים בהצלחה. רענן את מצב החשבון.':'ההתחברות לא הושלמה. בדוק את החשבון ואת חיבור הרשת.';});
  const timer=setTimeout(()=>{s.state='failed';s.message='תהליך ההתחברות הסתיים עקב חוסר תגובה.';if(child.pid){const kill=this.spawn(tool('taskkill'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('error',()=>{});}},300000);timer.unref();return this.status(p);
 }
 close(){for(const s of this.sessions.values())if(s.child?.pid){const kill=this.spawn(tool('taskkill'),['/PID',String(s.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('error',()=>{});}}
}
module.exports={LoginManager,trustedLoginURL};
