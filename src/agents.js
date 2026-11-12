export function mountAgentControls(host, initial, setDraft) {
  const api=window.boau;if(!api?.getAgents)return {update(){},destroy(){}};
  let w=initial,info={selected:'codex',providers:[]},busy=false,lastThread=undefined,serial=0;
  let names={codex:'Codex',claude:'Claude',antigravity:'Antigravity'};
  const wrap=document.createElement('div');wrap.className='agent-controls';host.prepend(wrap);
  const label=document.createElement('label');label.className='agent-label';label.textContent='סוכן לשיחה';
  const select=document.createElement('select');select.setAttribute('aria-label','סוכן לשיחה');label.append(select);
  for(const [id,name] of Object.entries(names)){const o=document.createElement('option');o.value=id;o.textContent=name;select.append(o);}
  const transfer=document.createElement('button');transfer.type='button';transfer.className='secondary-button';transfer.textContent='העבר משימה';
  const connections=document.createElement('button');connections.type='button';connections.className='secondary-button';connections.textContent='חיבורי סוכנים';
  const status=document.createElement('span');status.className='agent-status';status.setAttribute('role','status');
  wrap.append(label,transfer,connections,status);
  const dialog=document.createElement('dialog');dialog.className='productivity-dialog agent-dialog';dialog.dir='rtl';dialog.setAttribute('aria-label','חיבור והעברת משימות');document.body.append(dialog);
  let activeView='';
  function node(tag,text,parent,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;parent.append(e);return e;}
  function notify(message){status.textContent=message;}
  function updateControls(){select.value=info.selected;select.disabled=busy||w.session.busy||w.loadingHistory;transfer.disabled=busy||w.session.busy||!w.session.threadId||!w.session.messages.length;connections.disabled=busy||w.session.busy;}
  async function refresh(){const token=++serial;const result=await api.getAgents(w.session.threadId);if(token!==serial)return;info=result;names=Object.fromEntries(info.providers.map(p=>[p.id,p.name]));select.replaceChildren();for(const [id,name] of Object.entries(names)){const o=document.createElement('option');o.value=id;o.textContent=name;select.append(o);}updateControls();}
  async function choose(provider){
    if(busy||w.session.busy)return;
    ++serial;info.selected=provider;busy=true;updateControls();notify('מכין את '+names[provider]+'…');
    try{await api.selectAgent(provider);w.newChat();await w.connect();info.selected=provider;notify('סוכן: '+names[provider]);}
    catch(error){notify(error.message);await refresh();}
    finally{busy=false;updateControls();}
  }
  select.onchange=()=>choose(select.value);
  function open(title){dialog.replaceChildren();const header=node('header',null,dialog,'productivity-header');node('h2',title,header);const close=node('button','סגירה',header,'secondary-button');close.onclick=()=>dialog.close();dialog.showModal();return node('section',null,dialog,'productivity-body');}
  connections.onclick=async()=>{
    activeView='connections';const body=open('חיבורי סוכנים');node('p','בודק התקנה והתחברות…',body);
    try{
      await refresh();if(!dialog.open||activeView!=='connections')return;body.replaceChildren();
      node('p','כל סוכן משתמש בהתחברות הרשמית שלו. החלפת ספק אינה מעבירה סיסמאות או אסימוני גישה.',body);
      for(const p of info.providers){const c=node('section',null,body,'productivity-card');node('h3',p.name,c);node('p',p.installed?('מותקן'+(p.version?' · '+p.version:'')):'לא מותקן',c);
        node('p',p.id==='codex'?'ההתחברות מנוהלת דרך מסך החשבון הקיים.':p.authenticated===true?'קיימים פרטי התחברות שמורים. תוקפם וזכאות החשבון ייבדקו בהרצת משימה.':p.authenticated===false?'נדרשת התחברות.':'מצב החשבון ייבדק כאשר תתחיל שיחה.',c);
        if(p.id==='claude')node('p','הרצת משימות דורשת גישת Claude Code מתאימה או חשבון API עם יתרה. חשבון צ׳אט חינמי לבדו אינו מספיק. האפליקציה אינה רוכשת מנוי או מוסיפה מכסה.',c);
        if(p.id!=='codex'&&p.installed&&!p.custom){
          const b=node('button','התחברות ל־'+p.name,c,'secondary-button');
          const state=node('p','',c);state.setAttribute('role','status');
          const reopen=node('button','פתיחה חוזרת בדפדפן',c,'secondary-button');reopen.hidden=true;
          reopen.onclick=async()=>{try{await api.reopenAgentLogin(p.id);}catch(e){state.textContent=e.message;}};
          const manual=node('details',null,c);manual.hidden=true;node('summary','הדפדפן הציג קוד אימות?',manual);
          const code=node('input',null,manual,'field');code.type='password';code.maxLength=4096;code.autocomplete='off';code.setAttribute('aria-label','קוד אימות זמני');code.dir='ltr';
          const submit=node('button','העברת הקוד לכלי הרשמי',manual,'secondary-button');
          submit.onclick=async()=>{const value=code.value;code.value='';try{await api.submitAgentLoginCode(p.id,value);state.textContent='הקוד הועבר לכלי הרשמי. ממתין לאישור ההתחברות.';}catch(e){state.textContent=e.message;}};
          let timer;const show=result=>{state.textContent=result.message;reopen.hidden=!result.canReopen;manual.hidden=!result.canAcceptCode;if(manual.hidden)code.value='';b.disabled=['starting','browser-open'].includes(result.state);return result;};
          const poll=async()=>{if(!dialog.open||!state.isConnected)return;try{const result=show(await api.agentLoginStatus(p.id));if(['starting','browser-open'].includes(result.state))timer=setTimeout(poll,1000);}catch(e){state.textContent=e.message;b.disabled=false;}};
          b.onclick=async()=>{clearTimeout(timer);b.disabled=true;try{show(await api.loginAgent(p.id));await poll();}catch(e){state.textContent=e.message;b.disabled=false;}};
          api.agentLoginStatus(p.id).then(show).catch(()=>{});
        }
      }
    }catch(error){body.textContent=error.message;}
  };
  transfer.onclick=async()=>{
    activeView='handoff';const body=open('העברת משימה לסוכן אחר');
    node('p','תיפתח שיחה חדשה באותו פרויקט. טיוטת ההעברה כוללת הודעות אחרונות ושמות קבצים ששונו. בדוק וערוך אותה לפני שליחה לספק אחר.',body);
    const targetLabel=node('label','סוכן מקבל',body,'productivity-label'),target=node('select',null,targetLabel,'field');target.setAttribute('aria-label','סוכן מקבל');
    for(const [id,name] of Object.entries(names))if(id!==info.selected){const o=node('option',name,target);o.value=id;}
    const noteLabel=node('label','מה הסוכן הבא צריך לעשות?',body,'productivity-label'),notes=node('textarea',null,noteLabel,'field');notes.rows=3;notes.maxLength=8000;
    const preview=node('button','הכנת טיוטה לבדיקה',body,'secondary-button');
    const message=node('p','',body);message.setAttribute('role','status');
    preview.onclick=async()=>{
      preview.disabled=true;message.textContent='מכין טיוטה…';
      try{
        const result=await api.prepareHandoff({threadId:w.session.threadId,projectId:w.project.id,messages:w.session.messages.slice(-16).map(m=>({role:m.role,text:m.text||''})),notes:notes.value});
        const draftLabel=node('label','תוכן שיועבר לסוכן הבא',body,'productivity-label'),draft=node('textarea',null,draftLabel,'field');draft.rows=10;draft.maxLength=115000;draft.value=result.text;
        const accept=node('button','פתיחת שיחה עם טיוטת ההעברה',body,'primary-button');
        accept.onclick=async()=>{
          if(!draft.value.trim()){message.textContent='טיוטת ההעברה ריקה.';return;}
          accept.disabled=true;const value=draft.value;
          await choose(target.value);
          if(info.selected===target.value){setDraft(value);dialog.close();notify('הטיוטה מוכנה. לחץ על שליחה כדי להמשיך עם '+names[target.value]+'.');}
          else accept.disabled=false;
        };
        message.textContent='בדוק את הטיוטה. היא עדיין לא נשלחה לספק המקבל.';
      }catch(error){message.textContent=error.message;preview.disabled=false;}
    };
  };
  const onConnectionsChanged=()=>refresh().catch(error=>notify(error.message));document.addEventListener('boau-connections-changed',onConnectionsChanged);
  refresh().catch(error=>notify(error.message));
  return {update(next){w=next;if(w.session.busy&&status.textContent.startsWith('הטיוטה מוכנה'))notify('סוכן: '+names[info.selected]);updateControls();if(lastThread!==w.session.threadId){lastThread=w.session.threadId;refresh().catch(error=>notify(error.message));}},destroy(){serial++;document.removeEventListener('boau-connections-changed',onConnectionsChanged);dialog.remove();wrap.remove();}};
}
