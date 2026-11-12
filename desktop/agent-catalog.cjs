'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');const exec=promisify(execFile);
const BUILTINS={
 codex:{name:'Codex',kind:'native'},claude:{name:'Claude',kind:'native'},antigravity:{name:'Antigravity',kind:'acp',binary:'agy',args:['acp','--stdio']},
 opencode:{name:'OpenCode',kind:'acp',binary:'opencode',npm:'opencode-ai',args:['acp']},
 cline:{name:'Cline',kind:'acp',binary:'cline',npm:'cline',args:['--acp']},
 copilot:{name:'GitHub Copilot',kind:'acp',binary:'copilot',npm:'@github/copilot',args:['--acp','--stdio']},
 gemini:{name:'Gemini CLI',kind:'acp',binary:'gemini',npm:'@google/gemini-cli',args:['--acp']},
};
function nodeSpec(file,args){
 const known=[path.join(process.env.ProgramFiles||'C:/Program Files','nodejs/node.exe')];
 const node=known.find(p=>fs.existsSync(p))||process.execPath;
 return {command:node,args:[file,...args],env:node===process.execPath?{ELECTRON_RUN_AS_NODE:'1'}:{}};
}
class AgentCatalog{
 constructor(directory){this.directory=directory;fs.mkdirSync(directory,{recursive:true});this.custom=[];try{this.custom=JSON.parse(fs.readFileSync(path.join(directory,'connections.json'),'utf8'));}catch{}if(!Array.isArray(this.custom))this.custom=[];}
 definitions(){return {...BUILTINS,...Object.fromEntries(this.custom.map(a=>[a.id,a]))};}
 names(){return Object.fromEntries(Object.entries(this.definitions()).map(([id,a])=>[id,a.name]));}
 spec(id){
  const definition=this.definitions()[id];if(!definition)throw Error('סוכן לא מוכר.');
  if(definition.executable){if(!fs.existsSync(definition.executable))throw Error('קובץ הסוכן אינו קיים.');return /\.[cm]?js$/i.test(definition.executable)?nodeSpec(definition.executable,definition.args):{command:definition.executable,args:definition.args};}
  const dirs=[path.join(process.env.LOCALAPPDATA||os.homedir(),'agy/bin'),path.join(os.homedir(),'.local/bin'),...(process.env.PATH||'').split(path.delimiter).filter(Boolean).map(p=>p.replace(/^"|"$/g,'')).filter(p=>path.isAbsolute(p))];
  for(const dir of dirs){const exe=path.join(dir,definition.binary+'.exe');if(fs.existsSync(exe))return {command:exe,args:definition.args};}
  if(definition.npm){
   const locations=[path.join(process.env.LOCALAPPDATA||os.homedir(),'BoauCode/agents/node_modules'),path.join(process.env.APPDATA||os.homedir(),'npm/node_modules')];
   for(const root of locations){
    const folder=path.join(root,definition.npm),pkgFile=path.join(folder,'package.json');if(!fs.existsSync(pkgFile))continue;
    const pkg=JSON.parse(fs.readFileSync(pkgFile,'utf8'));const entry=typeof pkg.bin==='string'?pkg.bin:pkg.bin?.[definition.binary]||Object.values(pkg.bin||{})[0];
    if(entry){const file=path.resolve(folder,entry);if(!fs.existsSync(file))continue;return /\.exe$/i.test(file)?{command:file,args:definition.args}:nodeSpec(file,definition.args);}
   }
  }
  throw Error(definition.name+' אינו מותקן במחשב.');
 }
 async info(id){
  const d=this.definitions()[id];if(!d)throw Error('סוכן לא מוכר.');
  if(d.kind==='native')return {id,name:d.name,kind:d.kind,installed:true};
  try{const spec=this.spec(id);return {id,name:d.name,kind:'acp',installed:true,custom:!BUILTINS[id],transport:'ACP',command:path.basename(spec.command)};}
  catch(error){return {id,name:d.name,kind:'acp',installed:false,message:error.message};}
 }
 add(value){
  if(!value||typeof value.name!=='string'||!value.name.trim()||value.name.length>80||typeof value.executable!=='string'||!path.isAbsolute(value.executable)||!fs.existsSync(value.executable)||!fs.statSync(value.executable).isFile()||!(/\.(exe|[cm]?js)$/i.test(value.executable)))throw Error('יש לבחור קובץ הפעלה מקומי או קובץ JavaScript ולתת שם לחיבור.');
  if(!Array.isArray(value.args)||value.args.length>30||value.args.some(a=>typeof a!=='string'||a.length>2048||/[\0\r\n]/.test(a)||/skip-permission|bypasspermission|--yolo|--auto-approve|--allow-all/i.test(a)))throw Error('ארגומנטים לא תקינים או כאלה שמדלגים על אישורי פעולות.');
  if(this.custom.length>=50)throw Error('אפשר לשמור עד 50 חיבורים מותאמים.');
  const item={id:'custom-'+crypto.randomUUID(),name:value.name.trim(),kind:'acp',executable:fs.realpathSync(value.executable),args:value.args};this.custom.push(item);this.save();return item;
 }
 remove(id){if(!this.custom.some(a=>a.id===id))throw Error('אפשר להסיר רק חיבור מותאם.');this.custom=this.custom.filter(a=>a.id!==id);this.save();}
 save(){const f=path.join(this.directory,'connections.json');fs.writeFileSync(f+'.tmp',JSON.stringify(this.custom,null,2));fs.renameSync(f+'.tmp',f);}
 registry(){try{return JSON.parse(fs.readFileSync(path.join(__dirname,'registry-snapshot.json'),'utf8'));}catch{return {agents:[]};}}
 async probe(id,cwd,Client){
  const client=new Client(this.spec(id),cwd);try{const init=await client.request('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'boau-code',version:'0.4.0'}});return {protocolVersion:init.protocolVersion,capabilities:init.agentCapabilities||{},authMethods:(init.authMethods||[]).map(m=>({id:m.id,name:m.name})),agentInfo:init.agentInfo||{}};}finally{await client.close();}
 }
}
module.exports={AgentCatalog,BUILTINS,nodeSpec};
