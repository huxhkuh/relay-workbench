'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile,spawn}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile);
const {StringDecoder}=require('node:string_decoder');
const {tool}=require('./local-tools.cjs');
const MAX_FILE=2*1024*1024;
const IGNORED=['**/.git/**','**/node_modules/**','**/.env*','**/*.pem','**/*.key','**/dist/**','**/build/**','**/.venv/**','**/vendor/**'];
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function resolveFile(root,relative='',allowMissing=false){
 if(typeof relative!=='string'||relative.length>4096||relative.includes('\0')||path.isAbsolute(relative))throw Error('נתיב קובץ לא תקין.');
 const full=path.resolve(root,relative),rel=path.relative(root,full);
 if(rel.startsWith('..')||path.isAbsolute(rel)||rel.split(path.sep).some(p=>p.toLowerCase()==='.git'))throw Error('הקובץ מחוץ לתיקיית הפרויקט או בתוך נתוני Git.');
 const realRoot=fs.realpathSync(root);let current=root;
 for(const piece of rel.split(path.sep).filter(Boolean)){
  current=path.join(current,piece);
  if(!fs.existsSync(current)){if(allowMissing)continue;throw Error('הקובץ לא נמצא.');}
  if(fs.lstatSync(current).isSymbolicLink())throw Error('קישורים סמליים אינם נפתחים בעורך.');
  const real=fs.realpathSync(current),inside=path.relative(realRoot,real);
  if(inside.startsWith('..')||path.isAbsolute(inside))throw Error('הנתיב מפנה מחוץ לפרויקט.');
 }
 return full;
}
function readText(root,relative){
 const file=resolveFile(root,relative),stat=fs.statSync(file);if(!stat.isFile()||stat.size>MAX_FILE)throw Error('העורך תומך בקובצי טקסט עד 2MB.');
 const data=fs.readFileSync(file);if(data.includes(0))throw Error('הקובץ בינארי ואינו נתמך בעורך הטקסט.');
 const text=data.toString('utf8');if(!Buffer.from(text,'utf8').equals(data))throw Error('העורך תומך בקידוד UTF-8. יש להמיר את קידוד הקובץ לפני עריכה.');
 return {path:relative,text,hash:hash(data),bytes:data.length};
}
function saveText(root,{relative,text,expectedHash}){
 if(typeof text!=='string'||Buffer.byteLength(text)>MAX_FILE)throw Error('הטקסט גדול מדי.');
 const file=resolveFile(root,relative,true),exists=fs.existsSync(file);
 if(exists){const current=readText(root,relative);if(!expectedHash||current.hash!==expectedHash)throw Error('הקובץ השתנה מחוץ לעורך. טען אותו מחדש לפני שמירה.');}
 else if(expectedHash)throw Error('הקובץ נמחק מחוץ לעורך. טען מחדש.');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temp=path.join(path.dirname(file),'.boau-'+crypto.randomUUID()+'.tmp');
 const mode=exists?fs.statSync(file).mode:0o600;fs.writeFileSync(temp,text,{mode});
 try{fs.renameSync(temp,file);}catch(error){try{fs.unlinkSync(temp);}catch{}throw error;}
 return readText(root,relative);
}
function listFiles(root,relative=''){
 const full=resolveFile(root,relative);return fs.readdirSync(full,{withFileTypes:true})
 .filter(e=>e.name!=='.git'&&e.name!=='node_modules'&&!e.isSymbolicLink())
 .sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name))
 .slice(0,500).map(e=>({name:e.name,path:path.join(relative,e.name),directory:e.isDirectory()}));
}
async function searchFiles(root,query){
 if(typeof query!=='string'||!query.trim()||query.length>300)throw Error('יש להזין טקסט לחיפוש (עד 300 תווים).');
 const fg=require('./vendor/workbench-deps.cjs').glob;
 const names=await fg('**/*',{cwd:root,onlyFiles:true,dot:true,followSymbolicLinks:false,ignore:IGNORED,deep:15});
 const results=[];let searched=0;
 for(const name of names.slice(0,3000)){
  let file;try{file=readText(root,name);}catch{continue;}searched++;
  const lines=file.text.split(/\r?\n/);for(let i=0;i<lines.length;i++){
   if(lines[i].toLocaleLowerCase().includes(query.toLocaleLowerCase())){results.push({path:name,line:i+1,text:lines[i].slice(0,350)});if(results.length>=200)return {results,searched,truncated:true};}
  }
 }
 return {results,searched,truncated:names.length>3000};
}
function previewChanges(relative,before,after){return require('./vendor/workbench-deps.cjs').createPatch(relative,before,after);}
async function git(root,args){return (await exec(tool('git'),['-c','core.pager=cat','-c','core.fsmonitor=false',...args],{cwd:root,windowsHide:true,encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_PAGER:'cat'}})).stdout;}
async function gitOverview(root){
 const values=await Promise.allSettled([git(root,['branch','--show-current']),git(root,['status','--short']),git(root,['log','-12','--format=%h%x09%s']),git(root,['branch','--format=%(refname:short)']),git(root,['worktree','list','--porcelain'])]);
 if(values[0].status==='rejected')throw Error('Git אינו זמין או שהתיקייה אינה מאגר Git.');
 const result={};['branch','status','log','branches','worktrees'].forEach((key,i)=>{result[key]=values[i].status==='fulfilled'?values[i].value.trim():'';});return result;
}
class ProjectConfig{
 constructor(directory){this.directory=directory;fs.mkdirSync(directory,{recursive:true});}
 file(id){if(typeof id!=='string'||!/^[\w-]{1,100}$/.test(id))throw Error('פרויקט לא תקין.');return path.join(this.directory,id+'.json');}
 get(id){try{return JSON.parse(fs.readFileSync(this.file(id),'utf8'));}catch{return {instructions:'',mcpServers:[]};}}
 save(id,value){
  if(!value||typeof value.instructions!=='string'||value.instructions.length>16000||!Array.isArray(value.mcpServers)||value.mcpServers.length>30)throw Error('הגדרות הפרויקט אינן תקינות.');
  const servers=value.mcpServers.map(s=>{
   if(!s||typeof s.name!=='string'||!/^[\w-]{1,80}$/.test(s.name))throw Error('שם שרת MCP אינו תקין.');
   if(s.type==='http'){let url;try{url=new URL(s.url);}catch{throw Error('כתובת MCP אינה תקינה.');}if(url.username||url.password||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('יש להשתמש ב־HTTPS או בשרת מקומי.');if(url.search)throw Error('אין לשמור מפתחות או פרמטרי גישה בכתובת MCP.');return {name:s.name,type:'http',url:url.href};}
   if(s.type!=='stdio'||typeof s.command!=='string'||!s.command.trim()||/[\r\n\0]/.test(s.command)||!Array.isArray(s.args)||s.args.length>40||s.args.some(a=>typeof a!=='string'||a.length>2048||/[\r\n\0]/.test(a)))throw Error('הגדרת פקודת MCP אינה תקינה.');
   return {name:s.name,type:'stdio',command:s.command,args:s.args};
  });
  if(new Set(servers.map(s=>s.name)).size!==servers.length)throw Error('יש שמות שרת כפולים.');
  const models=value.models||{};if(!models||typeof models!=='object'||Array.isArray(models)||Object.entries(models).some(([id,model])=>!/^[\w-]+$/.test(id)||typeof model!=='string'||model.length>200))throw Error('מפת מודלים אינה תקינה.');
  const file=this.file(id),data={instructions:value.instructions,mcpServers:servers,models};fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);return data;
 }
}
class CommandRunner{
 constructor(send){this.send=send;this.running=new Map();this.history=new Map();}
 start(project,command){
  if(typeof command!=='string'||!command.trim()||command.length>16000||command.includes('\0'))throw Error('פקודה לא תקינה.');
  if(this.running.size>=3)throw Error('כבר פועלות שלוש פקודות.');
  const id=crypto.randomUUID();
  const script="[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $OutputEncoding=[Console]::OutputEncoding; "+command;
  const encoded=Buffer.from(script,'utf16le').toString('base64');
  const child=spawn(tool('powershell'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded],{cwd:project.path,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  const record={id,projectId:project.id,command,output:'',status:'running',startedAt:new Date().toISOString()};this.running.set(id,{child,record});this.history.set(id,record);
  const output=new StringDecoder('utf8'),errors=new StringDecoder('utf8');
  const data=text=>{record.output=(record.output+text).slice(-200000);this.send({type:'commandOutput',id,projectId:project.id,text});};child.stdout.on('data',chunk=>data(output.write(chunk)));child.stderr.on('data',chunk=>data(errors.write(chunk)));
  child.on('error',error=>{record.error=error.message;});
  child.on('close',code=>{record.status=record.stopping?'interrupted':code===0?'completed':'failed';record.exitCode=code;this.running.delete(id);this.send({type:'commandComplete',...record,output:undefined});});
  while(this.history.size>50){const oldest=[...this.history.values()].find(r=>!this.running.has(r.id));if(!oldest)break;this.history.delete(oldest.id);}return {id};
 }
 list(projectId){return [...this.history.values()].filter(r=>r.projectId===projectId).map(r=>({...r}));}
 async stop(id){const active=this.running.get(id);if(!active)return;active.record.stopping=true;await exec(tool('taskkill'),['/PID',String(active.child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});}
 async close(){await Promise.all([...this.running.keys()].map(id=>this.stop(id)));}
}
module.exports={resolveFile,readText,saveText,listFiles,searchFiles,previewChanges,git,gitOverview,ProjectConfig,CommandRunner};
