import {createWorkspace} from './workspace-state.js';
import {mountAgentControls} from './agents.js';
import {mountProductivity} from './productivity.js';
import {mountWorkbench} from './workbench-ui.js';
import {mountApprovals} from './approval-ui.js';
import {renderMarkdown} from './markdown.js';
import {el,button,field,copyText} from './dom.js';
import './productivity.css';
import './app.css';

const api=window.boau,root=document.getElementById('root');
if(!api){el('h1','Relay Workbench',root);el('p','פתח את אפליקציית שולחן העבודה כדי לעבוד עם קבצים וסוכנים.',root);}
else start();
function start(){
  let enhancements=[],approvals,lastHistory='',lastMessages='',inspectorTab='activity',settingsOpen=false;
  const drafts=new Map();let draftKey='',settingsFields=null;
  const w=createWorkspace(api,()=>render());
  const run=async action=>{try{return await action();}catch(error){w.error=String(error.message||error);render();return null;}};
  const snapshot=()=>({...w,openThread:t=>run(()=>w.openThread(t)),selectProject:p=>run(()=>w.selectProject(p)),newChat:()=>run(()=>w.newChat())});
  const app=el('div',null,root,'app-shell');
  const sidebar=el('aside',null,app,'sidebar');sidebar.setAttribute('aria-label','פרויקטים ושיחות');
  const brand=el('div',null,sidebar,'sidebar-brand');el('span','↗',brand,'brand-symbol');el('strong','Relay Workbench',brand,'brand');
  const newChat=button('＋ שיחה חדשה',()=>run(()=>w.newChat()),sidebar,'new-chat-button');
  const scroll=el('div',null,sidebar,'sidebar-scroll'),projectsSection=el('section',null,scroll);
  el('h2','פרויקטים',projectsSection,'section-heading');
  const addFolder=button('הוסף תיקייה',()=>run(()=>w.chooseFolder()),projectsSection,'add-folder-button');
  const projects=el('div',null,projectsSection,'project-list');
  const historyHeader=el('div',null,scroll,'history-heading');el('h2','שיחות',historyHeader,'section-heading');
  const archived=button('ארכיון',()=>run(()=>w.showArchived(!w.archived)),historyHeader,'text-button');
  const search=el('input',null,scroll,'field history-search');search.type='search';search.placeholder='חיפוש בשיחות';search.setAttribute('aria-label','חיפוש בשיחות');
  const histories=el('div',null,scroll,'history-list');
  const moreHistory=button('טעינת שיחות נוספות',()=>run(()=>w.loadMoreThreads()),scroll,'secondary-button');
  const sidebarFooter=el('footer',null,sidebar,'sidebar-footer');
  const settingsButton=button('הגדרות',()=>openSettings(),sidebarFooter,'settings-link');
  const version=el('span','',sidebarFooter,'version');
  const workspace=el('main',null,app,'main-workspace');
  const header=el('header',null,workspace,'workspace-header');
  const titleWrap=el('div',null,header),title=el('h1','סביבת העבודה שלי',titleWrap),projectPath=el('p','',titleWrap,'long-path project-path');
  const headerActions=el('div',null,header,'header-actions');
  const connect=button('התחבר לסוכן',()=>run(()=>w.connect()),headerActions,'connect-button');
  const disconnect=button('ניתוק',()=>run(()=>w.disconnect()),headerActions,'secondary-button');
  const inspectorToggle=button('סביבת העבודה',()=>{app.classList.toggle('inspector-hidden');inspectorToggle.setAttribute('aria-expanded',String(!app.classList.contains('inspector-hidden')));},headerActions,'secondary-button');
  inspectorToggle.setAttribute('aria-expanded','true');
  const compact=matchMedia('(max-width:1050px)');
  function compactInspector(){if(compact.matches){app.classList.add('inspector-hidden');inspectorToggle.setAttribute('aria-expanded','false');}}
  compact.addEventListener('change',compactInspector);compactInspector();
  const agentHost=el('div',null,workspace),toolsHost=el('div',null,workspace,'workspace-tools');
  const errorBox=el('div',null,workspace,'error-notice');errorBox.setAttribute('role','alert');
  const errorText=el('span','',errorBox);button('סגירה',()=>w.clearError(),errorBox,'text-button');
  const loginBanner=el('section',null,workspace,'login-banner');
  const loginText=el('p','',loginBanner),loginReopen=button('פתיחת ההתחברות בדפדפן',()=>run(()=>w.reopenLogin()),loginBanner);
  const loginCancel=button('ביטול התחברות',()=>run(()=>w.cancelLogin()),loginBanner);
  const timeline=el('section',null,workspace,'timeline');timeline.setAttribute('aria-label','תוכן השיחה');timeline.setAttribute('aria-busy','false');
  const welcome=el('section',null,timeline,'welcome');
  const welcomeIcon=el('img',null,welcome,'welcome-mark');welcomeIcon.src='./relay.png';welcomeIcon.alt='';welcomeIcon.width=56;welcomeIcon.height=56;el('p','RELAY WORKBENCH',welcome,'welcome-eyebrow');el('h2','מה בונים היום?',welcome);
  el('p','בחר תיקייה, כתוב מה צריך, ונתחיל לעבוד.',welcome,'welcome-description');
  const suggestions=el('div',null,welcome,'suggestions');
  for(const text of ['תכנן אתר','שפר עיצוב','בדוק קוד'])button(text,()=>{setDraft(text);input.focus();},suggestions);
  const older=button('טעינת הודעות קודמות',()=>run(()=>w.loadOlderTurns()),timeline);
  const messages=el('div',null,timeline,'messages');
  const sessionStatus=el('p','',workspace,'session-status');sessionStatus.setAttribute('role','status');
  const composerArea=el('section',null,workspace,'composer-area'),composer=el('form',null,composerArea,'composer');
  const input=el('textarea',null,composer);input.rows=3;input.maxLength=120000;input.placeholder='מה תרצה לבנות או לשנות?';input.setAttribute('aria-label','הודעה לסוכן');
  const composerBottom=el('div',null,composer,'composer-bottom');
  const folderLabel=el('span','בחר תיקייה',composerBottom,'composer-folder');
  const model=el('select',null,composerBottom,'model-select');model.setAttribute('aria-label','מודל לשיחה');
  const effort=el('select',null,composerBottom,'effort-select');effort.setAttribute('aria-label','רמת חשיבה');
  for(const [value,label] of [['','ברירת מחדל'],['none','ללא'],['minimal','מזערית'],['low','נמוכה'],['medium','בינונית'],['high','גבוהה'],['xhigh','גבוהה מאוד'],['max','מרבית'],['ultra','אולטרה']])el('option',label,effort).value=value;
  const send=el('button','שלח הודעה',composerBottom,'primary-button');send.type='submit';send.setAttribute('aria-label','שלח הודעה');
  const stop=button('עצור משימה',()=>run(()=>w.interrupt()),composerBottom,'danger-button');
  el('p','Enter לשליחה · Shift+Enter לשורה חדשה · השינויים נשמרים בתיקיית הפרויקט שלך',composerArea,'composer-footnote');
  const inspector=el('aside',null,app,'inspector');inspector.setAttribute('aria-label','פעולות ושינויים');
  el('h2','סביבת העבודה',inspector,'inspector-heading');
  const inspectorNav=el('nav',null,inspector,'inspector-tabs');
  for(const [id,label] of [['activity','פעולות'],['plan','תוכנית'],['diff','שינויים']])button(label,()=>{inspectorTab=id;renderInspector();},inspectorNav,'text-button').dataset.tab=id;
  const inspection=el('div',null,inspector,'inspector-body'),connectionStatus=el('p','',inspector,'connection-status');
  const settingsDialog=el('dialog',null,document.body,'settings-dialog');settingsDialog.dir='rtl';settingsDialog.setAttribute('aria-label','הגדרות');
  settingsDialog.addEventListener('close',()=>{settingsOpen=false;});
  const report=e=>{w.error=String(e.message||e);render();};
  function setDraft(value){input.value=value;drafts.set(draftKey,value);updateComposer();}
  input.oninput=()=>{drafts.set(draftKey,input.value);updateComposer();};
  async function submit(event){event?.preventDefault();if(!input.value.trim()||w.session.busy)return;const text=input.value,key=draftKey;const accepted=await run(()=>w.send(text));if(accepted){drafts.delete(key);drafts.delete(draftKey);input.value='';updateComposer();}}
  composer.addEventListener('submit',submit);
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();void submit();}});
  model.onchange=()=>run(()=>w.saveSettings({model:model.value}));
  effort.onchange=()=>run(()=>w.saveSettings({reasoningEffort:effort.value}));
  search.oninput=()=>renderHistory(true);
  function updateComposer(){
    send.disabled=!input.value.trim()||w.session.busy||w.connecting||w.loadingHistory||!w.project;
    send.hidden=w.session.busy;stop.hidden=!w.session.busy;stop.disabled=!w.session.turnId;
    input.disabled=w.loadingHistory;model.disabled=w.session.busy||w.status.provider!=='codex';effort.disabled=w.session.busy||w.status.provider!=='codex';
  }
  function renderHistory(force=false){
    const key=JSON.stringify([w.projects,w.project?.id,w.threads,w.session.threadId,w.session.busy,w.archived,search.value,w.loadingHistory]);
    if(!force&&lastHistory===key)return;lastHistory=key;projects.replaceChildren();histories.replaceChildren();
    if(!w.projects.length)el('p','הפרויקטים שלך יופיעו כאן. בחר תיקייה כדי להתחיל.',projects,'muted');
    for(const project of w.projects){
      const row=el('div',null,projects,'project-row');row.classList.toggle('selected',w.project?.id===project.id);
      const b=button(project.name,()=>run(()=>w.selectProject(project)),row,'project-button');b.disabled=w.session.busy;b.title=project.path;
      const remove=button('×',()=>{if(confirm('להסיר את הפרויקט מהרשימה? הקבצים יישארו במקומם.'))void run(()=>w.removeProject(project.id));},row,'text-button');remove.setAttribute('aria-label','הסרת הפרויקט '+project.name);remove.disabled=w.session.busy;
    }
    const visible=w.threads.filter(t=>((t.name||'')+' '+(t.preview||'')).toLowerCase().includes(search.value.toLowerCase()));
    if(!visible.length)el('p',w.loadingHistory?'טוען שיחות…':'אין שיחות להצגה.',histories,'muted');
    for(const thread of visible){const row=button(thread.name||thread.preview||'שיחה חדשה',()=>run(()=>w.openThread(thread)),histories,'history-row');row.classList.toggle('selected',thread.id===w.session.threadId);row.disabled=w.session.busy;row.title=thread.preview||thread.name||'';}
    moreHistory.hidden=!w.threadCursor;moreHistory.disabled=w.loadingHistory||w.session.busy;archived.textContent=w.archived?'חזרה לשיחות':'ארכיון';archived.disabled=w.session.busy;
  }
  function renderMessages(){
    const key=JSON.stringify(w.session.messages);if(lastMessages===key)return;lastMessages=key;
    const stick=timeline.scrollHeight-timeline.scrollTop-timeline.clientHeight<120;
    messages.replaceChildren();
    for(const message of w.session.messages){
      const article=el('article',null,messages,'message '+message.role);
      const heading=el('header',null,article,'message-heading');el('strong',message.role==='user'?'אתה':w.status.providerName||'סוכן',heading);
      button('העתקה',()=>copyText(message.text).catch(report),heading,'text-button');
      const body=el('div',null,article,'message-body');
      if(message.role==='assistant'){
        body.innerHTML=renderMarkdown(message.text);
        for(const pre of body.querySelectorAll('pre')){const code=pre.querySelector('code');if(code)button('העתקת קוד',()=>copyText(code.textContent).catch(report),pre,'copy-code');}
        for(const link of body.querySelectorAll('a'))link.addEventListener('click',event=>{event.preventDefault();void copyText(link.getAttribute('href')).then(()=>{sessionStatus.textContent='הקישור הועתק.';}).catch(report);});
      }else body.textContent=message.text;
    }
    if(!w.session.messages.length)timeline.scrollTop=0;else if(stick)timeline.scrollTop=timeline.scrollHeight;
  }
  function renderInspector(){
    for(const tab of inspectorNav.querySelectorAll('button'))tab.setAttribute('aria-selected',String(tab.dataset.tab===inspectorTab));
    inspection.replaceChildren();
    if(inspectorTab==='diff'){
      const diff=w.session.diff||w.gitInfo?.diff;
      button('רענון שינויים',()=>run(()=>w.refreshDiff()),inspection);
      if(diff){const pre=el('pre',null,inspection,'diff-view');pre.dir='ltr';for(const line of diff.split('\n'))el('div',line||' ',pre,line.startsWith('+')?'diff-add':line.startsWith('-')?'diff-remove':'');}
      else el('p','שינויים בקבצים יופיעו כאן.',inspection,'muted');
    }else if(inspectorTab==='plan'){
      if(!w.session.plan.length)el('p','כשהסוכן יפרסם תוכנית היא תופיע כאן.',inspection,'muted');
      const list=el('ol',null,inspection);for(const step of w.session.plan)el('li',(step.status==='completed'?'✓ ':step.status==='inProgress'?'◉ ':'○ ')+step.step,list,'plan-step');
    }else{
      if(!w.session.activities.length)el('p','פעולות, קבצים ושלבי עבודה יופיעו כאן בזמן אמת.',inspection,'muted');
      for(const item of w.session.activities){
        const details=el('details',null,inspection,'activity-row');el('summary',(item.status==='completed'?'✓ ':item.status==='failed'?'! ':'◉ ')+(item.tool||item.command||item.type),details);
        const data={...item};delete data.id;el('pre',JSON.stringify(data,null,2),details,'activity-details').dir='ltr';
      }
    }
  }
  function openSettings(){
    if(settingsDialog.open)return;settingsOpen=true;settingsDialog.replaceChildren();
    const head=el('header',null,settingsDialog,'modal-header');el('h2','הגדרות',head);
    const body=el('div',null,settingsDialog,'modal-body');
    const account=el('section',null,body,'settings-section');el('h3','חשבון וחיבור',account);
    el('p','',account,'account-details');
    button('התחברות לחשבון',()=>run(async()=>{if(!w.status.connected)await w.connect();else await w.loginAccount();}),account);
    button('התחברות באמצעות קוד מכשיר',()=>run(()=>w.loginAccount('chatgptDeviceCode')),account);
    button('רענון מצב החשבון',()=>run(()=>w.refreshAccount()),account);
    button('התנתקות מהחשבון',()=>run(()=>w.logout()),account,'danger-button');
    button('מכסות שימוש',()=>run(async()=>{await w.refreshUsage();usage.textContent=JSON.stringify(w.usage,null,2);}),account);
    const usage=el('pre','',account);usage.dir='ltr';
    button('תצורת הסוכן',()=>run(async()=>{const result=await api.request('config/read',w.project?{cwd:w.project.path}:{});usage.textContent=JSON.stringify(result,null,2);}),account);
    const appearance=el('section',null,body,'settings-section');el('h3','מראה',appearance);
    button('בהיר',()=>run(()=>w.saveSettings({theme:'light'})),appearance);button('כהה',()=>run(()=>w.saveSettings({theme:'dark'})),appearance);
    const behavior=el('section',null,body,'settings-section');el('h3','הרשאות ומודל',behavior);
    const permissionsLabel=el('label','הרשאות הפרויקט',behavior,'form-field'),permissions=el('select',null,permissionsLabel,'field');permissions.setAttribute('aria-label','הרשאות הפרויקט');
    el('option','עריכת קבצים בפרויקט באישור',permissions).value='workspace-write';el('option','קריאה בלבד',permissions).value='read-only';permissions.value=w.settings.permissions;permissions.disabled=w.session.busy;
    const customModel=field('מזהה מודל',w.settings.model,behavior,{dir:'ltr'});el('p','מודל ברירת המחדל של Codex. מודלים לשאר הסוכנים מוגדרים בכלי הפרויקט.',behavior,'muted');
    const runtime=el('section',null,body,'settings-section');el('h3','כלי Codex',runtime);
    const executable=field('נתיב לקובץ ההפעלה של Codex',w.settings.codexPath,runtime,{dir:'ltr'});executable.disabled=w.session.busy;
    button('בחירת קובץ הפעלה',()=>run(async()=>{const chosen=await api.workbench.chooseAgentExecutable();if(chosen)executable.value=chosen;}),runtime).disabled=w.session.busy;
    el('p','אם השדה ריק, ייבדק כלי רשמי שהותקן בנפרד. סוכנים ומנויים אינם מצורפים לאפליקציה.',runtime,'muted');
    const sandbox=el('section',null,body,'settings-section');el('h3','סביבת Windows',sandbox);el('p','',sandbox,'sandbox-state');
    for(const [mode,label] of [['unelevated','הכנת סביבה רגילה'],['elevated','הכנת סביבה עם הרשאות מערכת']])button(label,()=>run(()=>w.setupSandbox(mode)),sandbox).disabled=w.session.busy||w.status.provider!=='codex'||!w.project;
    button('בדיקת מוכנות',()=>run(()=>w.refreshSandbox()),sandbox);
    el('p','Relay Workbench · '+w.info.version+' · '+w.info.platform,body,'settings-about');
    settingsFields={account,sandbox};
    const footer=el('footer',null,settingsDialog,'modal-footer');
    button('סיום',()=>run(async()=>{await w.saveSettings({theme:w.settings.theme,model:customModel.value.trim(),permissions:permissions.value,codexPath:executable.value.trim()});settingsDialog.close();}),footer,'primary-button');
    button('ביטול',()=>settingsDialog.close(),footer);
    settingsDialog.showModal();updateSettings();
  }
  function updateSettings(){
    if(!settingsOpen||!settingsFields)return;
    settingsFields.account.querySelector('.account-details').textContent=w.account?(w.account.email||w.account.planType||'חשבון חיצוני'):'לא מחובר';
    const external=w.status.provider&&w.status.provider!=='codex';
    for(const b of settingsFields.account.querySelectorAll('button'))b.disabled=external||w.session.busy;
    if(external)settingsFields.account.querySelector('.account-details').textContent='ההתחברות מנוהלת בכלי הרשמי של '+w.status.providerName+'. ניתן לפתוח אותו בחיבורי הסוכנים.';
    settingsFields.sandbox.querySelector('.sandbox-state').textContent=w.sandbox.status||'unknown';
  }
  function render(){
    document.documentElement.dataset.theme=w.settings.theme;
    const nextKey=(w.project?.id||'')+':'+(w.session.threadId||'new')+':'+(w.status.provider||'codex');
    if(nextKey!==draftKey){
      const previous=draftKey;drafts.set(previous,input.value);
      // Preserve the submitted/new-chat draft while a server allocates the thread ID.
      const enteringThread=!previous.includes(':new:')&&nextKey.includes(':new:')?false:previous.split(':')[0]===nextKey.split(':')[0]&&w.session.busy;
      draftKey=nextKey;input.value=drafts.get(nextKey)||(enteringThread?input.value:'');
    }
    title.textContent=w.project?.name||'סביבת העבודה שלי';projectPath.textContent=w.project?.path||'';folderLabel.textContent=w.project?.name||'בחר תיקייה';version.textContent='v'+(w.info.version||'');
    connect.textContent=w.connecting?'מתחבר…':w.status.connected?'חיבור מחדש':'התחבר לסוכן';connect.disabled=w.connecting||w.session.busy;disconnect.hidden=!w.status.connected;disconnect.disabled=w.session.busy;
    newChat.disabled=w.session.busy;addFolder.disabled=w.session.busy;
    errorBox.hidden=!w.error;errorText.textContent=w.error||'';
    loginBanner.hidden=!w.login;loginText.textContent=w.login?.userCode?'קוד מכשיר: '+w.login.userCode:'השלם את ההתחברות בחלון הרשמי וחזור לכאן.';
    loginReopen.hidden=!w.login;loginCancel.hidden=!w.login;
    welcome.hidden=!!w.session.messages.length;older.hidden=!w.session.turnCursor;older.disabled=w.loadingHistory;
    timeline.setAttribute('aria-busy',String(w.session.busy));
    const labels={completed:'המשימה הושלמה',failed:'המשימה נכשלה',interrupted:'המשימה נעצרה'};
    sessionStatus.textContent=w.session.error||((w.session.approvals.length?'ממתין לתשובה שלך':w.session.busy?'הסוכן עובד…':w.loadingHistory?'טוען שיחה…':labels[w.session.lastStatus])||'מוכן להתחיל');
    connectionStatus.textContent=(w.status.providerName||'Codex')+' · '+(w.status.connected?'מחובר':'לא מחובר');
    const modelKey=JSON.stringify([w.models,w.settings.model]);
    if(model.dataset.key!==modelKey){model.dataset.key=modelKey;model.replaceChildren();el('option','מודל אוטומטי',model).value='';for(const m of w.models)el('option',m.displayName||m.model||m.id,model).value=m.model||m.id;if(w.settings.model&&!Array.from(model.options).some(o=>o.value===w.settings.model))el('option',w.settings.model,model).value=w.settings.model;model.value=w.settings.model||'';}
    effort.value=w.settings.reasoningEffort||'';
    updateComposer();renderHistory();renderMessages();renderInspector();updateSettings();
    const view=snapshot();for(const enhancement of enhancements)enhancement.update(view,input.value);approvals?.update();
  }
  enhancements=[mountAgentControls(agentHost,snapshot(),setDraft),mountProductivity(headerActions,snapshot(),openSettings),mountWorkbench(toolsHost,snapshot(),setDraft)];
  approvals=mountApprovals(()=>w,api,report);
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key===','){event.preventDefault();openSettings();}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='n'&&!document.querySelector('dialog[open]')){event.preventDefault();void run(()=>w.newChat());}
  });
  window.addEventListener('unload',()=>{w.dispose();for(const enhancement of enhancements)enhancement.destroy();approvals.destroy();},{once:true});
  render();void run(()=>w.initialize());
}
