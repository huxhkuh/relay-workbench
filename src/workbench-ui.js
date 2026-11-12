import {EditorView,basicSetup} from 'codemirror';
import {EditorState,Compartment} from '@codemirror/state';
import {javascript} from '@codemirror/lang-javascript';
import {python} from '@codemirror/lang-python';
import {json} from '@codemirror/lang-json';
import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {markdown} from '@codemirror/lang-markdown';
import {HighlightStyle,syntaxHighlighting} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './workbench.css';

export function mountWorkbench(host,initial,setDraft){
 const api=window.boau.workbench;let w=initial,currentDraft='',tab='files',editor=null,editorFile=null,editorDocument=null,terminal=null,fit=null,observer=null,commandId=null,currentDir='',generation=0,fileRequest=0;
 const documents=new Map(),themeSlot=new Compartment();let consoleLog='',taskListRevision=0;
 const syntaxSlot=new Compartment();
 const darkSyntax=syntaxHighlighting(HighlightStyle.define([{tag:tags.keyword,color:'#c7b1e8'},{tag:tags.variableName,color:'#d8dfd1'},{tag:tags.definition(tags.variableName),color:'#9bc5ef'},{tag:tags.string,color:'#b8ca8d'},{tag:tags.number,color:'#e6b987'},{tag:tags.comment,color:'#939b8d'},{tag:tags.propertyName,color:'#b4d0cb'},{tag:tags.typeName,color:'#e9c58c'},{tag:[tags.operator,tags.punctuation],color:'#cfd6c6'}]));
 const launch=el('button','סביבת פיתוח',host,'secondary-button');launch.title='קבצים, חיפוש, מסוף, Git והרחבות · Ctrl+Shift+P';
 const dialog=el('dialog',null,document.body,'studio-dialog');dialog.dir='rtl';dialog.setAttribute('aria-label','סביבת הפיתוח');
 const header=el('header',null,dialog,'studio-header');const heading=el('div',null,header);el('span','Relay Workbench · סביבת עבודה',heading,'studio-eyebrow');const title=el('h2','סביבת הפיתוח',heading);
 const close=button('סגירה',()=>closeSafe(),header);
 const nav=el('nav',null,dialog,'studio-nav');nav.setAttribute('aria-label','כלי פיתוח');
 const notice=el('p','',dialog,'studio-notice');notice.setAttribute('role','status');
 const body=el('div',null,dialog,'studio-body');
 function el(tag,text,parent,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;parent.append(n);return n;}
 function button(label,action,parent=body){const b=el('button',label,parent,'secondary-button');b.type='button';b.onclick=async()=>{b.disabled=true;try{await action();}catch(error){notice.textContent=clean(error);}finally{b.disabled=false;}};return b;}
 function clean(error){return String(error.message||error).replace(/^Error invoking remote method '[^']+': Error: /,'');}
 function field(label,value='',multiline=false,parent=body){const wrap=el('label',label,parent,'studio-field');const input=el(multiline?'textarea':'input',null,wrap,'field');input.value=value;if(multiline)input.rows=5;return input;}
 function section(title,text,parent=body){const c=el('section',null,parent,'studio-card');el('h3',title,c);if(text)el('p',text,c);return c;}
 function project(){if(!w.project)throw Error('יש לבחור תיקיית פרויקט במסך הראשי.');return w.project.id;}
 function dirty(){return [...documents.values()].some(d=>d.dirty);}
 function rememberEditor(){if(editor&&editorDocument)editorDocument.state=editor.state;}
 function destroyViews(){rememberEditor();editor?.destroy();editor=null;editorDocument=null;terminal?.dispose();terminal=null;observer?.disconnect();observer=null;}
 function closeSafe(){if(dirty()&&!confirm('יש קבצים עם שינויים שטרם נשמרו. לסגור את חלון העבודה? הטיוטות יישארו עד סגירת האפליקציה.'))return;dialog.close();}
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeSafe();});
 const beforeUnload=event=>{if(dirty()){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
 function theme(){return EditorView.theme({ '&':{backgroundColor:w.settings.theme==='dark'?'#20221f':'#fff',color:w.settings.theme==='dark'?'#eee':'#222',height:'100%'},'.cm-content':{fontFamily:'Consolas, monospace',fontSize:'13px',direction:'ltr'},'.cm-scroller':{overflow:'auto'},'.cm-gutters':{backgroundColor:w.settings.theme==='dark'?'#272a26':'#f6f6f2',color:'#888',border:'none'}},{dark:w.settings.theme==='dark'});}
 function language(name){if(/\.[cm]?[jt]sx?$/.test(name))return javascript({typescript:/\.tsx?$/.test(name),jsx:/x$/.test(name)});if(/\.py$/.test(name))return python();if(/\.json[c]?$/.test(name))return json();if(/\.html?$/.test(name))return html();if(/\.css$/.test(name))return css();if(/\.md$/.test(name))return markdown();return [];}
 async function openFile(relative,line){
  const request=++fileRequest,id=project(),key=id+':'+relative;rememberEditor();let doc=documents.get(key);
  if(!doc){const file=await api.readFile(id,relative);if(request!==fileRequest)return;doc={...file,projectId:id,dirty:false};documents.set(key,doc);}
  editorFile=doc;tab='files';await render();if(line&&editor){const target=editor.state.doc.line(Math.min(line,editor.state.doc.lines));editor.dispatch({selection:{anchor:target.from},effects:EditorView.scrollIntoView(target.from,{y:'center'})});editor.focus();}
 }
 async function save(){
  if(!editorFile||!editor)return;const doc=editorFile;const result=await api.saveFile(doc.projectId,{relative:doc.path,text:editor.state.doc.toString(),expectedHash:doc.hash});
  doc.text=result.text;doc.hash=result.hash;doc.dirty=(doc===editorDocument&&editor?editor.state.doc.toString():doc.state?.doc.toString()||result.text)!==result.text;notice.textContent=doc.dirty?'הגרסה שנשלחה נשמרה. יש עריכות נוספות שטרם נשמרו.':'הקובץ נשמר.';renderTabs();
 }
 function renderTabs(){const bar=body.querySelector('.studio-tabs');if(!bar)return;bar.replaceChildren();
  for(const doc of documents.values()){if(doc.projectId!==w.project?.id)continue;const b=button((doc.dirty?'● ':'')+doc.path,()=>{rememberEditor();editorFile=doc;tab='files';return render();},bar);b.setAttribute('aria-pressed',String(doc===editorFile));if(doc===editorFile)b.classList.add('selected');}
 }
 async function filesView(){ const token=generation;
  const layout=el('div',null,body,'studio-files');const tree=el('aside',null,layout,'studio-tree');tree.setAttribute('aria-label','קבצי הפרויקט');const main=el('div',null,layout,'studio-editor-pane');
  const tools=el('div',null,tree,'studio-actions');button('תיקיית שורש',async()=>{currentDir='';await render();},tools);button('קובץ חדש',async()=>{
   const relative=prompt('נתיב הקובץ החדש בתוך הפרויקט');if(!relative)return;
   const file=await api.saveFile(project(),{relative,text:'',expectedHash:null});documents.set(project()+':'+relative,{...file,projectId:project(),dirty:false});await openFile(relative);
  },tools);
  el('p',currentDir||'קבצי הפרויקט',tree,'studio-path');
  if(currentDir)button('↑ תיקיית אב',async()=>{currentDir=currentDir.split(/[\\/]/).filter(Boolean).slice(0,-1).join('/');await render();},tree);
  const entries=await api.listFiles(project(),currentDir);if(token!==generation)return;
  for(const entry of entries){const b=button((entry.directory?'▸ ':'')+entry.name,()=>entry.directory?(currentDir=entry.path,render()):openFile(entry.path),tree);b.classList.add('studio-file');b.title=entry.path;}
  el('div',null,main,'studio-tabs');renderTabs();
  if(!editorFile||editorFile.projectId!==w.project?.id){el('p','בחר קובץ כדי לפתוח אותו בעורך.',main,'studio-empty');return;}
  const actions=el('div',null,main,'studio-actions');button('שמירה · Ctrl+S',save,actions);
  button('טעינה מחדש',async()=>{if(editorFile.dirty&&!confirm('לטעון מחדש ולוותר על השינויים שלא נשמרו?'))return;const relative=editorFile.path;documents.delete(project()+':'+relative);editorFile=null;await openFile(relative);},actions);
  button('השוואת העריכה',async()=>{const diff=await api.previewFile(editorFile.projectId,{relative:editorFile.path,text:editor.state.doc.toString(),expectedHash:editorFile.hash});showText('השוואה לקובץ השמור',diff);},actions);
  button('צירוף לשיחה',async()=>{if(editorFile.projectId!==project())throw Error('יש לבחור בשיחה את הפרויקט של הקובץ.');if(editorFile.dirty)throw Error('שמור את הקובץ לפני צירוף לשיחה.');const result=await api.fileContext(project(),editorFile.path);if(result.canceled)return;if(currentDraft.length+result.text.length>120000)throw Error('הטיוטה ארוכה מדי לצירוף הקובץ.');setDraft(currentDraft+result.text);notice.textContent='הקובץ צורף לטיוטה. הוא יישלח רק בלחיצה על שליחה.';},actions);
  button('סגירת לשונית',async()=>{if(editorFile.dirty&&!confirm('לוותר על העריכה שלא נשמרה?'))return;documents.delete(project()+':'+editorFile.path);editorFile=null;await render();},actions);
  const mount=el('div',null,main,'studio-editor');mount.dir='ltr';
  const doc=editorFile;
  const state=doc.state||EditorState.create({doc:doc.text,extensions:[basicSetup,language(doc.path),themeSlot.of(theme()),syntaxSlot.of(w.settings.theme==='dark'?darkSyntax:[]),EditorView.lineWrapping,EditorView.updateListener.of(update=>{if(update.docChanged){doc.dirty=update.state.doc.toString()!==doc.text;doc.state=update.state;renderTabs();}})]});
  editor=new EditorView({state,parent:mount});editorDocument=doc;editor.contentDOM.setAttribute('aria-label','עורך: '+doc.path);editor.dispatch({effects:[themeSlot.reconfigure(theme()),syntaxSlot.reconfigure(w.settings.theme==='dark'?darkSyntax:[])]});
 }
 function showText(title,text){const modal=el('dialog',null,dialog,'studio-text-dialog');modal.setAttribute('aria-label',title);el('h3',title,modal);const pre=el('pre',text||'אין שינויים להצגה.',modal);pre.dir='ltr';button('סגירה',()=>modal.close(),modal);modal.addEventListener('close',()=>modal.remove());modal.showModal();}
 async function searchView(){const c=section('חיפוש בפרויקט','חיפוש בטקסט בקובצי הפרויקט. תיקיות תלויות, קובצי סודות וקבצים בינאריים מוחרגים. עד 200 תוצאות.');const query=field('טקסט לחיפוש','',false,c);const results=el('div',null,c,'studio-results');
  const search=async()=>{results.replaceChildren();const data=await api.searchFiles(project(),query.value);el('p',`${data.results.length} תוצאות · ${data.searched} קבצים נבדקו${data.truncated?' · התוצאה קוצרה':''}`,results);for(const r of data.results){const b=button(r.path+':'+r.line+' — '+r.text,()=>openFile(r.path,r.line),results);b.dir='auto';}};
  button('חיפוש',search,c);query.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();search().catch(error=>notice.textContent=clean(error));}};query.focus();}
 async function consoleView(){const token=generation;const c=section('מסוף פקודות','הפקודות רצות בהרשאות המשתמש, מתיקיית הפרויקט. התצוגה אינה PTY ואינה תומכת בתוכניות אינטראקטיביות.');const command=field('פקודה להרצה','',true,c);command.rows=2;command.dir='ltr';const actions=el('div',null,c,'studio-actions');
  button('הרצת פקודה',async()=>{const result=await api.commandStart(project(),command.value);commandId=result.id;await render();},actions);
  button('עצירת פקודה',async()=>{if(commandId)await api.commandStop(project(),commandId);},actions);
  button('פתיחת PowerShell אינטראקטיבי',()=>api.openProjectTerminal(project()),actions);
  const records=await api.commandList(project());if(token!==generation)return;const list=el('div',null,c,'studio-command-list');for(const record of records)button(record.command.slice(0,80)+' · '+record.status,async()=>{commandId=record.id;await render();},list);
  if(!commandId)commandId=records.at(-1)?.id;
  const selected=records.find(r=>r.id===commandId);consoleLog=selected?.output||'';
  const screen=el('div',null,c,'studio-terminal');screen.dir='ltr';terminal=new Terminal({disableStdin:true,convertEol:true,fontSize:13,fontFamily:'Consolas, monospace',scrollback:3000,theme:{background:'#1d201d',foreground:'#efefea'}});fit=new FitAddon();terminal.loadAddon(fit);terminal.open(screen);fit.fit();terminal.write(consoleLog);observer=new ResizeObserver(()=>{try{fit.fit();}catch{}});observer.observe(screen);
 }
 async function gitView(){const token=generation;const state=await api.gitOverview(project());if(token!==generation)return;const c=section('Git · '+(state.branch||'ללא ענף'),'פעולות Git מקומיות. יצירת commit מפעילה גם את ה־hooks של המאגר.');el('pre',state.status||'תיקיית העבודה נקייה.',c).dir='ltr';
  const actions=el('div',null,c,'studio-actions');button('רענון',render,actions);button('השוואת שינויים',async()=>{const result=await window.boau.getGitDiff(project());showText('שינויים מול HEAD',result.diff||result.message);},actions);
  button('הוספת הכול ל־stage',async()=>{await api.gitStage(project(),'.',true);await render();},actions);button('הוצאת הכול מ־stage',async()=>{await api.gitStage(project(),'.',false);await render();},actions);
  const message=field('הודעת commit','',false,c);button('יצירת commit מקומי',async()=>{const result=await api.gitCommit(project(),message.value);if(!result.canceled){notice.textContent=result.output;await render();}},c);
  const work=section('סביבת עבודה מבודדת','יצירת worktree בענף חדש מאפשרת לעבוד על משימה בלי לערבב את קבציה עם תיקיית העבודה הזאת.');const branch=field('שם הענף החדש','codex/task-'+Date.now(),false,work);branch.dir='ltr';button('יצירת worktree ופתיחתו',async()=>{const p=await api.createWorktree(project(),branch.value);await w.refreshProjects();await w.selectProject(p);editorFile=null;currentDir='';notice.textContent='סביבת העבודה המבודדת נוצרה.';await render();},work);
  el('pre',state.worktrees,work).dir='ltr';el('pre',state.log,section('commits אחרונים')).dir='ltr';
 }
 async function toolsView(){const token=generation;const id=project(),config=await api.getProjectTools(id);if(token!==generation)return;const c=section('הוראות לפרויקט','ההוראות מצורפות לסוכן דרך החיבור שלו. אין לשמור כאן סיסמאות או מפתחות.');const instructions=field('הוראות קבועות',config.instructions||'',true,c);instructions.rows=7;
  const mc=section('שרתי MCP','השמות והפקודות נשמרים בנתוני האפליקציה לפרויקט הזה. תהליכים וחיבורי HTTP מופעלים רק כאשר הסוכן טוען אותם. הזדהות נפרדת ותמיכה תלויות בסוכן.');const servers=field('הגדרות MCP כ־JSON',JSON.stringify(config.mcpServers||[],null,2),true,mc);servers.dir='ltr';servers.rows=8;el('pre','[{"name":"docs","type":"http","url":"https://example.com/mcp"}]',mc).dir='ltr';
  const modelCard=section('מודל לפי סוכן','השאר ריק כדי להשתמש בברירת המחדל של הסוכן. שינוי כאן אינו רוכש גישה למודל. Codex ממשיך להשתמש בבחירת המודל במסך השיחה.');const models=field('מפת מזהי מודלים כ־JSON',JSON.stringify(config.models||{},null,2),true,modelCard);models.dir='ltr';models.rows=3;
  button('שמירת הגדרות הפרויקט',async()=>{const result=await api.saveProjectTools(id,{instructions:instructions.value,mcpServers:JSON.parse(servers.value),models:JSON.parse(models.value)});if(!result.canceled)notice.textContent='ההגדרות נשמרו. יש להתחיל שיחה חדשה כדי להחיל חיבורי MCP.';});
  const skills=await api.listSkills(id);if(token!==generation)return;const skillSection=section('סקילים בפרויקט','קובצי SKILL.md תחת ‎.claude/skills, ‎.agents/skills ו־‎.codex/skills. כל סוכן טוען את התיקיות שבהן הוא תומך.');
  if(!skills.length)el('p','לא נמצאו סקילים בפרויקט.',skillSection);for(const s of skills)button(s.path,()=>openFile(s.path),skillSection);
  button('יצירת סקיל לפרויקט',async()=>{const name=prompt('שם תיקיית הסקיל באותיות באנגלית, מספרים ומקפים');if(!name)return;if(!/^[a-z0-9-]{1,70}$/.test(name))throw Error('שם סקיל אינו תקין.');const target=confirm('ליצור עבור Claude? ביטול ייצור בתיקיית ‎.agents/skills.')?'.claude':'.agents';const relative=`${target}/skills/${name}/SKILL.md`;await api.saveFile(id,{relative,text:`---\nname: ${name}\ndescription: תיאור מתי להשתמש בסקיל\n---\n\n# הוראות\n\nכתוב כאן את ההנחיות.\n`,expectedHash:null});await openFile(relative);},skillSection);
 }
 async function agentsView(){const token=generation;const data=await window.boau.getAgents(w.session.threadId);if(token!==generation)return;const c=section('חיבורי סוכנים','סוכני ACP משתלבים באותו ממשק. התקנה והשלמת handshake אינן מבטיחות חשבון פעיל, מכסה או גישה לרשת.');
  for(const p of data.providers){const row=section(p.name,p.installed?'מותקן במחשב':'לא מותקן',c);if(p.kind==='acp'&&p.installed)button('בדיקת פרוטוקול '+p.name,async()=>{const result=await api.probeAgent(p.id,project());showText('יכולות '+p.name,JSON.stringify(result,null,2));},row);if(p.custom)button('הסרת החיבור',async()=>{await api.removeAgent(p.id);document.dispatchEvent(new Event('boau-connections-changed'));await render();},row);}
  const custom=section('חיבור ACP מקומי נוסף','בחר קובץ הפעלה של סוכן שאתה סומך עליו. האפליקציה מפעילה אותו כמשתמש הנוכחי ללא shell וללא דילוג על אישורים.');const name=field('שם החיבור','',false,custom),binary=field('קובץ ההפעלה','',false,custom);binary.readOnly=true;binary.dir='ltr';button('בחירת קובץ הפעלה',async()=>{const file=await api.chooseAgentExecutable();if(file)binary.value=file;},custom);const args=field('ארגומנטים כמערך JSON','["--acp"]',false,custom);args.dir='ltr';button('הוספת החיבור',async()=>{await api.addAgent({name:name.value,executable:binary.value,args:JSON.parse(args.value)});document.dispatchEvent(new Event('boau-connections-changed'));notice.textContent='החיבור נוסף. הוא זמין בבחירת הסוכן בשיחה חדשה.';await render();},custom);
  const local=await api.listLocalModels();if(token!==generation)return;const localCard=section('מודלים מקומיים דרך Ollama',local.available?'Ollama זמין במחשב.':local.message);for(const m of local.models)el('p',m.name+' · '+(m.size/1e9).toFixed(1)+' GB',localCard);el('p','השתמש ב־OpenCode המחובר ל־Ollama כדי להריץ סוכן עם מודל מקומי. האפליקציה אינה מורידה מודלים ללא פעולה שלך.',localCard);
  const registry=await api.getAgentCatalog();if(token!==generation)return;const cat=section('קטלוג ACP · '+registry.agents.length+' סוכנים','רשימת גילוי מהקטלוג הרשמי. הופעה כאן אינה התקנה או אישור לאמינות הסוכן. חיבור נעשה באמצעות קובץ מקומי לאחר התקנה מתאימה.');const filter=field('חיפוש בקטלוג','',false,cat),list=el('div',null,cat,'studio-catalog');const show=()=>{list.replaceChildren();for(const a of registry.agents.filter(a=>(a.name+' '+a.description).toLowerCase().includes(filter.value.toLowerCase()))){const item=section(a.name,a.description,list);el('small',a.license||'רישיון לא צוין',item);}};filter.oninput=show;show();
 }
 async function tasksView(){
  const token=generation,c=section('משימות רקע מבודדות','עד שתי משימות במקביל. כל משימה מקבלת worktree בענף חדש מתוך ה־commit הנוכחי. עריכות שטרם נכנסו ל־commit אינן מועתקות. הסוכן עשוי לצרוך ממכסת החשבון שלך.');
  const info=await window.boau.getAgents();if(token!==generation)return;
  const selector=el('label','סוכן למשימת הרקע',c,'studio-field'),provider=el('select',null,selector,'field');
  for(const p of info.providers){const option=el('option',p.name,provider);option.value=p.id;option.disabled=!p.installed;}
  provider.setAttribute('aria-label','סוכן למשימת הרקע');provider.value=info.selected;const prompt=field('המשימה לביצוע','',true,c);prompt.rows=4;
  button('הפעלת משימה מבודדת',async()=>{await window.boau.taskStart({projectId:project(),provider:provider.value,prompt:prompt.value});prompt.value='';await renderTaskList();},c);
  el('div',null,body,'studio-tasks');await renderTaskList();
 }
 async function renderTaskList(){
  const container=body.querySelector('.studio-tasks');if(!container)return;
  const token=generation,revision=++taskListRevision;const records=await window.boau.taskList();if(token!==generation||revision!==taskListRevision||!container.isConnected)return;container.replaceChildren();
  const labels={preparing:'מכין סביבת עבודה',running:'פועלת',waiting:'ממתינה לאישור',completed:'הושלמה',failed:'נכשלה',interrupted:'נעצרה'};
  if(!records.length)el('p','עדיין אין משימות רקע.',container);
  for(const task of records){const card=section(task.sourceName+' · '+task.provider+' · '+(labels[task.status]||task.status),task.prompt.slice(0,300),container);
   if(task.cwd)el('p',task.cwd,card,'studio-path');if(task.error)el('p',task.error,card);
   for(const request of task.approvals||[]){const approval=section('בקשת אישור',request.params?.reason||'',card);el('pre',request.params?.command||JSON.stringify(request.params,null,2).slice(0,12000),approval).dir='ltr';
    if(['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(request.method))button('אישור פעולה למשימת הרקע',async()=>{await window.boau.taskRespond(task.id,request.id,true);await renderTaskList();},approval);
    button('דחייה',async()=>{await window.boau.taskRespond(task.id,request.id,false);await renderTaskList();},approval);
   }
   if(['preparing','running','waiting'].includes(task.status))button('עצירת משימת הרקע',async()=>{await window.boau.taskStop(task.id);await renderTaskList();},card);
   else if(task.threadId)button('פתיחת השיחה בפרויקט המבודד',async()=>{const result=await window.boau.taskOpen(task.id);await w.refreshProjects();await w.selectProject(result.project);await w.openThread(result.thread);dialog.close();},card);
   if(task.answer){const details=el('details',null,card);el('summary','תשובת הסוכן',details);el('pre',task.answer,details).dir='auto';}
  }
 }
 async function capabilitiesView(){const token=generation;const result=await api.getRuntimeInfo(w.session.threadId);if(token!==generation)return;const c=section('יכולות השיחה הנוכחית','מידע שהסוכן פרסם בפועל בפרוטוקול. יכולות שלא דווחו אינן מוצגות כמובטחות.');el('pre',JSON.stringify(result,null,2),c).dir='ltr';
  const runtime=result.runtime||{};if(runtime.commands?.length){const commands=section('פקודות שהסוכן פרסם');for(const command of runtime.commands)button('/'+command.name+' — '+(command.description||''),()=>{setDraft('/'+command.name+' ');dialog.close();},commands);}
 }
 async function render(){
  if(!dialog.open)return;const token=++generation;destroyViews();body.replaceChildren();body.scrollTop=0;nav.replaceChildren();title.textContent=w.project?.name||'סביבת הפיתוח';
  for(const [id,label] of [['files','קבצים ועורך'],['search','חיפוש'],['console','מסוף'],['git','Git'],['tasks','משימות רקע'],['tools','הוראות ו־MCP'],['agents','סוכנים וקטלוג'],['capabilities','יכולות השיחה']]){const b=button(label,async()=>{tab=id;notice.textContent='';await render();},nav);b.classList.toggle('selected',id===tab);}
  if(!w.project){el('p','בחר תיקיית פרויקט במסך הראשי כדי לפתוח את כלי העבודה.',body,'studio-empty');return;}
  try{await ({files:filesView,search:searchView,console:consoleView,git:gitView,tasks:tasksView,tools:toolsView,agents:agentsView,capabilities:capabilitiesView}[tab])();}catch(error){if(token===generation)notice.textContent=clean(error);}
 }
 const unsubscribe=window.boau.onEvent(event=>{if(event.type==='taskUpdate'&&tab==='tasks'&&dialog.open)renderTaskList().catch(error=>notice.textContent=clean(error));if(event.type==='commandOutput'&&event.id===commandId&&terminal)terminal.write(event.text);if(event.type==='commandComplete'&&event.id===commandId)notice.textContent='הפקודה '+({completed:'הושלמה',failed:'נכשלה',interrupted:'נעצרה'}[event.status]||event.status);});
 launch.onclick=()=>{if(!dialog.open)dialog.showModal();render();};
 const key=event=>{if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='p'){event.preventDefault();launch.click();}if(dialog.open&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();save().catch(error=>notice.textContent=clean(error));}};document.addEventListener('keydown',key);
 return {update(next,draft){const changed=next.project?.id!==w.project?.id;w=next;currentDraft=draft||'';if(changed){fileRequest++;currentDir='';editorFile=null;if(dialog.open)render();}if(editor)editor.dispatch({effects:[themeSlot.reconfigure(theme()),syntaxSlot.reconfigure(w.settings.theme==='dark'?darkSyntax:[])]});},destroy(){generation++;fileRequest++;destroyViews();unsubscribe();dialog.remove();launch.remove();document.removeEventListener('keydown',key);window.removeEventListener('beforeunload',beforeUnload);}};
}
