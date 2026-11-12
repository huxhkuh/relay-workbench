'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const wb=require('./workbench.cjs');
const {tool}=require('./local-tools.cjs');
function registerWorkbench({handle,store,bridge,configs,commands,dialog,getWindow,active,recoveryBusy,userData}){
 const project=id=>store.requireProject(id);
 const idle=()=>{if(active()||recoveryBusy())throw Error('יש להמתין לסיום המשימה לפני שינוי קבצים או הגדרות.');};
 handle('listFiles',(id,relative)=>wb.listFiles(project(id).path,relative));
 handle('readFile',(id,relative)=>wb.readText(project(id).path,relative));
 handle('saveFile',(id,value)=>{idle();return wb.saveText(project(id).path,value);});
 handle('searchFiles',(id,query)=>wb.searchFiles(project(id).path,query));
 handle('previewFile',(id,value)=>{const p=project(id),before=value.expectedHash?wb.readText(p.path,value.relative).text:'';return wb.previewChanges(value.relative,before,value.text);});
 handle('fileContext',async(id,relative)=>{
  const file=wb.readText(project(id).path,relative);
  if(/(^|[\\/])(\.env[^\\/]*|credentials[^\\/]*|.*\.(pem|key|p12))$/i.test(relative)){
   const result=await dialog.showMessageBox(getWindow(),{type:'warning',message:'הקובץ עשוי להכיל פרטי גישה. לצרף לטיוטת השיחה?',detail:'התוכן יוצג בטיוטה. אם תשלח אותה, התוכן יועבר לספק הסוכן.',buttons:['ביטול','צירוף לטיוטה'],defaultId:0,cancelId:0});
   if(result.response!==1)return {canceled:true};
  }
  if(file.text.length>80000)throw Error('לצירוף לשיחה יש לבחור קובץ עד 80,000 תווים.');
  return {text:`\n\nקובץ מצורף: ${relative}\n\`\`\`\n${file.text}\n\`\`\`\n`};
 });
 handle('gitOverview',id=>wb.gitOverview(project(id).path));
 handle('gitStage',async(id,relative,stage)=>{idle();const p=project(id);wb.resolveFile(p.path,relative,true);await wb.git(p.path,stage?['add','--',relative]:['restore','--staged','--',relative]);return wb.gitOverview(p.path);});
 handle('gitCommit',async(id,message)=>{
  idle();const p=project(id);if(typeof message!=='string'||!message.trim()||message.length>2000)throw Error('יש להזין הודעת commit עד 2,000 תווים.');
  const result=await dialog.showMessageBox(getWindow(),{type:'question',message:'ליצור commit מקומי מהקבצים שב־stage?',detail:message,buttons:['ביטול','יצירת commit'],defaultId:0,cancelId:0});
  if(result.response!==1)return {canceled:true};return {output:await wb.git(p.path,['commit','-m',message])};
 });
 handle('createWorktree',async(id,branch)=>{
  idle();const p=project(id);if(typeof branch!=='string'||branch.length>100)throw Error('שם ענף לא תקין.');await wb.git(p.path,['check-ref-format','--branch',branch]);
  const folder=path.join(userData,'worktrees',crypto.randomUUID());fs.mkdirSync(path.dirname(folder),{recursive:true});
  await wb.git(p.path,['worktree','add','-b',branch,folder]);return store.addProject(folder);
 });
 handle('getProjectTools',id=>configs.get(project(id).id));
 handle('saveProjectTools',async(id,value)=>{
  idle();const p=project(id);
  if(value?.mcpServers?.length){const answer=await dialog.showMessageBox(getWindow(),{type:'warning',message:'לשמור חיבורי MCP לפרויקט?',detail:'שרתי MCP עשויים להריץ פקודות מקומיות או לקבל מידע מסוכן הקוד. יש להוסיף רק שרתים שאתה סומך עליהם. ההגדרות יחולו על השיחה הבאה.',buttons:['ביטול','שמירה'],defaultId:0,cancelId:0});if(answer.response!==1)return {canceled:true};}
  return configs.save(p.id,value);
 });
 handle('listSkills',async id=>{
  const p=project(id),items=[];
  for(const base of ['.agents/skills','.claude/skills','.codex/skills']){
   let folders;try{folders=wb.listFiles(p.path,base);}catch{continue;}
   for(const folder of folders.filter(e=>e.directory)){
    const relative=path.join(folder.path,'SKILL.md');try{const file=wb.readText(p.path,relative);items.push({path:relative,name:folder.name,preview:file.text.slice(0,600)});}catch{}
   }
  }return items;
 });
 handle('commandStart',(id,command)=>commands.start(project(id),command));
 handle('openProjectTerminal',id=>{const p=project(id);require('node:child_process').spawn(tool('powershell'),['-NoLogo','-NoProfile','-NoExit'],{cwd:p.path,detached:true,stdio:'ignore',windowsHide:false}).unref();return {started:true};});
 handle('commandList',id=>commands.list(project(id).id));
 handle('commandStop',async(id,commandId)=>{const p=project(id);if(!commands.list(p.id).some(c=>c.id===commandId))throw Error('הפקודה אינה שייכת לפרויקט.');await commands.stop(commandId);return {ok:true};});
 handle('getAgentCatalog',()=>bridge.catalog.registry());
 handle('probeAgent',async(id,projectId)=>{idle();return bridge.catalog.probe(id,project(projectId).path,require('./agent-providers.cjs').AcpClient);});
 handle('addAgent',async value=>{
  idle();const item=bridge.catalog.add(value);return item;
 });
 handle('chooseAgentExecutable',async()=>{const chosen=await dialog.showOpenDialog(getWindow(),{title:'בחירת קובץ סוכן ACP מקומי',properties:['openFile'],filters:[{name:'Executable / JavaScript',extensions:['exe','js','mjs','cjs']}]});return chosen.canceled?null:chosen.filePaths[0];});
 handle('removeAgent',id=>{idle();if(bridge.selected===id)throw Error('בחר סוכן אחר לפני הסרת החיבור.');bridge.catalog.remove(id);return {ok:true};});
 handle('getRuntimeInfo',threadId=>{const t=bridge.threads.get(threadId);if(!t)return {provider:'codex',runtime:{},note:'יכולות Codex מנוהלות ב־App Server.'};project(t.cwd);return {provider:t.provider,runtime:t.runtime||{}};});
 handle('listLocalModels',async()=>{
  try{const response=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2000)});if(!response.ok)throw Error();const data=await response.json();return {available:true,models:(data.models||[]).map(m=>({name:m.name,size:m.size}))};}
  catch{return {available:false,models:[],message:'Ollama אינו פועל במחשב. ניתן לחבר אותו דרך OpenCode לאחר התקנה והורדת מודל מתאים.'};}
 });
}
module.exports={registerWorkbench};
