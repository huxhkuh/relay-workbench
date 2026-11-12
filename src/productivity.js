// Source module: enhancement UI integrated with the existing workspace state.
export function mountProductivity(host, initial, openSettings) {
  let w = initial, prefs = { pins: [], projectPins: [] }, tab = 'start', query = '', pending = false;
  let inspection = null, snapshots = [], lastProject = null, revision = 0;
  const editDrafts=new Map();
  const api = window.boau;
  const button = document.createElement('button');
  button.className = 'secondary-button productivity-launch'; button.textContent = 'מרכז העבודה';
  button.title = 'מרכז העבודה · Ctrl+K'; button.type = 'button'; host.append(button);
  const dialog = document.createElement('dialog'); dialog.className = 'productivity-dialog';
  dialog.dir = 'rtl'; dialog.setAttribute('aria-labelledby','productivity-title'); document.body.append(dialog);
  const header = document.createElement('header'); header.className = 'productivity-header';
  const title = document.createElement('h2'); title.id = 'productivity-title'; title.textContent = 'מרכז העבודה'; header.append(title);
  const close = document.createElement('button'); close.textContent = 'סגירה'; close.className = 'secondary-button'; close.onclick = () => dialog.close(); header.append(close);
  const nav = document.createElement('nav'); nav.className = 'productivity-nav'; nav.setAttribute('aria-label','כלי עבודה');
  const body = document.createElement('section'); body.className = 'productivity-body';
  const notice = document.createElement('p'); notice.className = 'productivity-notice'; notice.setAttribute('role','status');
  dialog.append(header, nav, notice, body);
  function el(tag, text, parent = body, cls) { const n = document.createElement(tag); if (text != null) n.textContent = text; if(cls)n.className=cls; parent.append(n); return n; }
  async function run(action) {
    if (pending) return; pending = true; notice.textContent = 'מבצע…'; render();
    try { await action(); notice.textContent = 'הפעולה הושלמה.'; }
    catch(error) { notice.textContent = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /,''); }
    finally { pending = false; render(); }
  }
  function action(label, callback, parent = body, disabled = false) {
    const b=el('button', label, parent,'secondary-button'); b.type='button'; b.disabled=pending||disabled; b.onclick=()=>run(callback); return b;
  }
  function card(title, description) { const c=el('section',null,body,'productivity-card'); el('h3',title,c); if(description)el('p',description,c); return c; }
  function editable(label, value, callback, parent, key=label) {
    const wrap=el('label',label,parent,'productivity-label'), input=el('input',null,wrap,'field'); input.value=editDrafts.get(key)??value; input.maxLength=200;input.setAttribute('aria-label',label);input.dataset.editKey=key;input.disabled=pending;
    input.oninput=()=>editDrafts.set(key,input.value);
    action('שמירה',async()=>{await callback(input.value.trim());editDrafts.delete(key);},wrap); return input;
  }
  async function load() {
    const id = w.project?.id, serial = ++revision;
    const result = await api.inspectProject(id);
    const points = id ? await api.listRecovery(id) : [];
    if (serial !== revision || id !== w.project?.id) return;
    inspection=result; snapshots=points; render();
  }
  async function save(value) { prefs = await api.saveProductivity(value); render(); }
  function checkbox(label, key, description) {
    const c=card(label,description), wrap=el('label',' פעיל',c), input=document.createElement('input'); input.type='checkbox'; input.checked=!!prefs[key];
    input.disabled=pending||w.session.busy; input.onchange=()=>run(()=>save({[key]:input.checked})); wrap.prepend(input);
  }
  function render() {
    if(!dialog.open)return;
    const opened=new Set([...body.querySelectorAll('details[open][data-thread-id]')].map(row=>row.dataset.threadId));
    const focused=document.activeElement?.dataset?.editKey,selection=focused?[document.activeElement.selectionStart,document.activeElement.selectionEnd]:null;
    nav.replaceChildren(); body.replaceChildren();
    for(const [id,label] of [['start','מוכנות'],['chats','שיחות ופרויקטים'],['changes','קבצים ושינויים'],['recovery','נקודות שחזור'],['tools','תחזוקה']]) {
      const b=el('button',label,nav); b.type='button'; b.setAttribute('aria-current',id===tab?'page':'false');
      b.onclick=()=>{ tab=id; query=''; notice.textContent=''; render(); };
    }
    if(tab==='start') {
      const status = w.session.approvals.length ? 'ממתין לתשובה שלך' : w.session.busy ? 'המשימה מתבצעת' : !w.status.connected ? 'הסוכן מנותק' : w.session.lastStatus==='completed' ? 'המשימה הסתיימה' : 'מוכן לעבודה';
      card(status,w.project ? 'פרויקט נוכחי: '+w.project.name : 'בחר תיקיית פרויקט כדי להתחיל.');
      const project=card('1. תיקיית פרויקט',w.project?.path || 'עדיין לא נבחרה תיקייה'); action('בחירת תיקייה',()=>w.chooseFolder(),project,w.session.busy);
      const account=card('2. חשבון וחיבור',w.account&&w.status.connected?'החשבון מחובר.':'התחבר דרך מסך ההתחברות הרשמי.');
      action(w.status.connected?'חיבור מחדש':'התחברות',async()=>{if(w.status.connected)await w.disconnect();await w.connect();},account,w.session.busy||w.connecting);
      const sandbox=card('3. סביבת Windows',w.sandbox.status==='ready'?'הסביבה מוכנה.':'ניתן להכין את סביבת ההרצה מתוך ההגדרות.');
      action('פתיחת הגדרות',()=>{dialog.close();openSettings();},sandbox,w.session.busy);
      const tools=card('כלי הפרויקט','Node.js ו־Python נדרשים רק בפרויקטים שמשתמשים בהם.');
      if(inspection) for(const tool of inspection.checks)el('p',tool.name+': '+(tool.available?tool.version:'לא זמין'),tools);
      action('בדיקה חוזרת',load,tools);
    }
    if(tab==='chats') {
      const label=el('label','חיפוש בשיחות ובפרויקטים',body,'productivity-label');
      const search=el('input',null,label,'field'); search.type='search'; search.value=query; search.placeholder='שם שיחה, תוכן מקדים או פרויקט';
      search.oninput=()=>{const at=search.selectionStart;query=search.value;render();const next=body.querySelector('input[type=search]');next.focus();next.setSelectionRange?.(at,at);};
      const projects=card('פרויקטים');
      for(const p of [...w.projects].sort((a,b)=>(prefs.projectPins.includes(b.id)?1:0)-(prefs.projectPins.includes(a.id)?1:0)).filter(p=>p.name.toLowerCase().includes(query.toLowerCase()))) {
        const row=el('div',null,projects,'productivity-row'); action(p.name,()=>w.selectProject(p),row,w.session.busy);
        action(prefs.projectPins.includes(p.id)?'ביטול הצמדה':'הצמדה',()=>save({projectPins: prefs.projectPins.includes(p.id)?prefs.projectPins.filter(id=>id!==p.id):[...prefs.projectPins,p.id]}),row);
      }
      const chats=card('שיחות בפרויקט','החיפוש חל על השיחות שנטענו. אפשר לטעון שיחות נוספות בהמשך.');
      const matches=[...w.threads].sort((a,b)=>(prefs.pins.includes(b.id)?1:0)-(prefs.pins.includes(a.id)?1:0)).filter(t=>(t.name+' '+t.preview).toLowerCase().includes(query.toLowerCase()));
      if(!matches.length)el('p','לא נמצאו שיחות להצגה.',chats);
      for(const t of matches) {
        const row=el('details',null,chats,'productivity-thread');row.dataset.threadId=t.id;row.open=opened.has(t.id);el('summary',(prefs.pins.includes(t.id)?'★ ':'')+(t.name||t.preview||'שיחה חדשה'),row);
        action('פתיחת שיחה',()=>{w.openThread(t);dialog.close();},row,w.session.busy);
        action(prefs.pins.includes(t.id)?'ביטול הצמדה':'הצמדה',()=>save({pins:prefs.pins.includes(t.id)?prefs.pins.filter(id=>id!==t.id):[...prefs.pins,t.id]}),row);
        editable('שם השיחה',t.name||'',async name=>{if(!name)throw Error('יש להזין שם.');await api.request('thread/name/set',{threadId:t.id,name});await w.refreshThreads();},row,t.id);
        action('העברה לארכיון',async()=>{
          if(!confirm('להעביר את השיחה לארכיון? הקבצים בפרויקט יישארו במקומם.'))return;
          await api.request('thread/archive',{threadId:t.id}); if(w.session.threadId===t.id)w.newChat(); await w.refreshThreads();
        },row,w.session.busy);
      }
      if(w.threadCursor)action('טעינת שיחות נוספות',()=>w.loadMoreThreads(),chats,w.session.busy);
    }
    if(tab==='changes') {
      const c=card('קבצים שהשתנו','כולל קבצים חדשים שעדיין אינם מנוהלים ב־Git. ההשוואה מציגה שינויים בקבצים מנוהלים מול HEAD.');
      action('רענון קבצים והשוואה',async()=>{await load();await w.refreshDiff();},c,!w.project);
      if(inspection?.message)el('p',inspection.message,c);
      for(const file of inspection?.changes||[]) {const row=el('p',file.status+'  '+file.name,c,'productivity-path');row.dir='ltr';}
      if(inspection&&!inspection.changes.length)el('p','אין קבצים שהשתנו להצגה.',c);
      const diff=w.gitInfo?.diff || w.session.diff;
      if(diff) {
        const blocks=diff.split(/(?=^diff --git )/m).filter(Boolean);
        const summary=card('סיכום השינוי');
        el('p',`${blocks.length} מקטעי קבצים · ${diff.split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++')).length} שורות נוספו · ${diff.split('\n').filter(l=>l.startsWith('-')&&!l.startsWith('---')).length} שורות הוסרו`,summary);
        for(const block of blocks) {
          const d=el('details',null,body,'productivity-card');el('summary',block.split('\n')[0],d).dir='ltr';
          const pre=el('pre',null,d,'productivity-diff');pre.dir='ltr';
          for(const line of block.split('\n').slice(0,4000))el('div',line||' ',pre,line.startsWith('+')?'diff-add':line.startsWith('-')?'diff-remove':'');
          if(block.split('\n').length>4000)el('p','ההשוואה קוצרה ל־4,000 שורות.',d);
        }
      }
    }
    if(tab==='recovery') {
      card('חזרה למצב קודם','נשמרים קבצי Git וקבצים חדשים שאינם מוחרגים. קבצים מוחרגים, תיקיית Git וקישורים סמליים אינם נכללים. עד 200MB לכל נקודה. גיבויים נשמרים מקומית ועשויים להכיל מידע פרטי.');
      checkbox('גיבוי לפני כל משימה','autoRecovery','במצב פעיל, משימה תתחיל רק לאחר יצירת נקודת שחזור. נדרש פרויקט שהוא שורש מאגר Git.');
      action('יצירת נקודת שחזור',async()=>{await api.createRecovery(w.project.id);await load();},body,!w.project||w.session.busy);
      action('רענון הרשימה',load,body,!w.project);
      action('פתיחת תיקיית הגיבויים',()=>api.openRecoveryFolder());
      if(!snapshots.length)el('p','עדיין אין נקודות שחזור לפרויקט הזה.');
      for(const point of snapshots) {const c=card(point.label,new Date(point.createdAt).toLocaleString('he-IL')+` · ${point.count} קבצים · ${(point.bytes/1048576).toFixed(1)} MB`);
        action('שחזור עם גיבוי המצב הנוכחי',async()=>{const result=await api.restoreRecovery(w.project.id,point.id);if(!result.canceled){await load();await w.refreshDiff();}},c,w.session.busy);
        action('מחיקת נקודת שחזור',async()=>{await api.deleteRecovery(w.project.id,point.id);await load();},c,w.session.busy);
      }
    }
    if(tab==='tools') {
      checkbox('התראות שולחן עבודה','notifications','התראה בסיום משימה או כשנדרשת תשובה, כאשר האפליקציה אינה בחזית.');
      const errors=card('חיבור ותקלות','חיבור מחדש אינו שולח שוב את ההודעה האחרונה, כדי למנוע ביצוע כפול.');
      action('חיבור מחדש',async()=>{await w.disconnect();await w.connect();},errors,w.session.busy||w.connecting);
      action('שמירת דוח אבחון',()=>api.exportDiagnostic(),errors);
      const update=card('התקנה ועדכון מקומי','בחר חבילת הפצה שחולצה ממקור שאתה סומך עליו. העדכון מאמת את שלמות הקבצים ושומר את נתוני המשתמש. אין כרגע שרת לעדכונים אוטומטיים.');
      action('בחירת חבילת עדכון',()=>api.installLocalUpdate(),update,w.session.busy);
      card('קיצורי מקלדת','Ctrl+K למרכז העבודה · Ctrl+, להגדרות · Escape לסגירה.');
    }
    if(focused&&!pending){const input=[...body.querySelectorAll('input[data-edit-key]')].find(n=>n.dataset.editKey===focused);if(input){input.focus();input.setSelectionRange(...selection);}}
  }
  function open(){if(!dialog.open)dialog.showModal();render();run(load);}
  button.onclick=open;
  function key(event){if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();dialog.open?dialog.close():open();}}
  document.addEventListener('keydown',key);
  api?.getProductivity().then(value=>{prefs={pins:[],projectPins:[],...value};render();}).catch(()=>{});
  return { update(next){w=next;button.disabled=!!w.session.approvals.length;if(w.project?.id!==lastProject){lastProject=w.project?.id;inspection=null;snapshots=[];if(dialog.open)run(load);}render();},
    destroy(){document.removeEventListener('keydown',key);dialog.remove();button.remove();} };
}

