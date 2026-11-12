import {el,button,field,copyText} from './dom.js';

// Schema-controlled inputs never evaluate provider HTML, JavaScript or regexes.
function schemaControl(schema,parent,label,required=false) {
  if(schema.type==='object'||schema.properties){
    const group=el('fieldset',null,parent);el('legend',label,group);
    const fields=Object.entries(schema.properties||{}).map(([key,definition])=>[key,schemaControl(definition,group,definition.title||key,(schema.required||[]).includes(key))]);
    return ()=>Object.fromEntries(fields.map(([key,read])=>[key,read()]).filter(([,value])=>value!==undefined));
  }
  const wrap=el('label',label+(required?' *':''),parent,'form-field');
  let input;
  if(schema.enum){input=el('select',null,wrap,'field');for(const value of schema.enum){const option=el('option',String(value),input);option.value=String(value);}}
  else{input=el('input',null,wrap,'field');input.type=schema.type==='boolean'?'checkbox':['number','integer'].includes(schema.type)?'number':'text';if(schema.format==='password')input.type='password';}
  input.setAttribute('aria-label',label);input.autocomplete='off';input.required=required;
  if(schema.default!==undefined){if(input.type==='checkbox')input.checked=!!schema.default;else input.value=String(schema.default);}
  if(schema.minLength!=null)input.minLength=schema.minLength;if(schema.maxLength!=null)input.maxLength=Math.min(schema.maxLength,10000);
  if(schema.minimum!=null)input.min=schema.minimum;if(schema.maximum!=null)input.max=schema.maximum;
  if(schema.type==='integer')input.step='1';
  if(schema.description)el('small',schema.description,wrap);
  return ()=>{
    if(input.type==='checkbox')return input.checked;
    if(!input.value&&!required)return undefined;
    if(!input.checkValidity())throw Error('יש לבדוק את השדה: '+label);
    if(schema.enum)return schema.enum.find(v=>String(v)===input.value);
    if(['integer','number'].includes(schema.type))return Number(input.value);
    if(schema.type==='array'){const parsed=JSON.parse(input.value);if(!Array.isArray(parsed))throw Error('יש להזין מערך JSON: '+label);return parsed;}
    return input.value;
  };
}
export function mountApprovals(getWorkspace,api,report) {
  const dialog=el('dialog',null,document.body,'approval-dialog');dialog.dir='rtl';dialog.setAttribute('aria-label','אישור פעולה');
  let activeKey=null;
  dialog.addEventListener('cancel',event=>{event.preventDefault();});
  function update() {
    const w=getWorkspace(),request=w.session.approvals[0];
    if(!request){activeKey=null;if(dialog.open)dialog.close();return;}
    const key=typeof request.id+':'+request.id;if(key===activeKey)return;activeKey=key;dialog.replaceChildren();
    const params=request.params||{},header=el('header',null,dialog,'modal-header');
    el('h2',request.method.includes('requestUserInput')?'הסוכן מבקש תשובה':'הסוכן מבקש אישור לפעולה',header);
    el('p',params.reason||params.message||'בדוק את הבקשה לפני שתענה.',dialog);
    const body=el('div',null,dialog,'modal-body'),notice=el('p','',dialog,'error-notice');notice.setAttribute('role','status');
    const footer=el('div',null,dialog,'modal-footer');
    const answer=async result=>{
      for(const b of footer.querySelectorAll('button'))b.disabled=true;
      try{await getWorkspace().answer(request.id,result);update();}
      catch(error){notice.textContent=error.message;for(const b of footer.querySelectorAll('button'))b.disabled=false;report(error);}
    };
    if(request.method.includes('requestUserInput')){
      const readers=[];
      for(const q of params.questions||[]){
        const group=el('fieldset',null,body);el('legend',q.header||q.id,group);el('p',q.question,group);
        let select;
        if(q.options?.length){select=el('select',null,group,'field');select.setAttribute('aria-label',q.question+' — בחירה');el('option','בחירת תשובה',select).value='';for(const option of q.options){const value=el('option',option.label+(option.description?' · '+option.description:''),select);value.value=option.label;}}
        const input=field(q.isSecret?'תשובה חסויה':'תשובה חופשית','',group,{multiline:!q.isSecret,secret:q.isSecret});
        readers.push(()=>[q.id,{answers:[input.value.trim()||select?.value||'']}]);
      }
      button('שליחת תשובות',()=>{const values=readers.map(read=>read());if(values.some(([,v])=>!v.answers[0])){notice.textContent='יש להשיב לכל השאלות.';return;}void answer({answers:Object.fromEntries(values)});},footer,'primary-button');
    }else if(request.method==='item/permissions/requestApproval'){
      const choices=[];
      for(const [name,value] of Object.entries(params.permissions||{})){
        const label=el('label',null,body,'permission-choice'),input=el('input',null,label);input.type='checkbox';el('span',name,label);el('pre',JSON.stringify(value,null,2),label).dir='ltr';choices.push([name,value,input]);
      }
      const scope=el('select',null,body,'field');scope.setAttribute('aria-label','טווח האישור');el('option','למשימה הנוכחית',scope).value='turn';el('option','לשיחה הנוכחית',scope).value='session';
      button('אישור ההרשאות שנבחרו',()=>answer({permissions:Object.fromEntries(choices.filter(([, ,input])=>input.checked).map(([name,value])=>[name,value])),scope:scope.value}),footer,'primary-button');
      button('דחייה',()=>answer({permissions:{},scope:'turn'}),footer);
    }else if(request.method==='mcpServer/elicitation/request'){
      let read=()=>({});
      if(params.mode==='url'){
        el('p',params.url||'',body,'long-path').dir='ltr';
        button('פתיחת הקישור המבוקש',()=>api.openElicitationURL(request.id).catch(report),body);
        button('העתקת הקישור',()=>copyText(params.url||''),body);
      }else read=schemaControl(params.requestedSchema||{type:'object'},body,'פרטים שהתבקשו');
      button('שליחת פרטים',()=>{try{void answer({action:'accept',content:params.mode==='url'?null:read()});}catch(e){notice.textContent=e.message;}},footer,'primary-button');
      button('דחייה',()=>answer({action:'decline',content:null}),footer);
      button('ביטול',()=>answer({action:'cancel',content:null}),footer);
    }else{
      if(params.command)el('pre',params.command,body,'approval-command').dir='ltr';
      if(params.cwd)el('p',params.cwd,body,'long-path').dir='ltr';
      for(const change of Array.isArray(params.changes)?params.changes:[]){el('h3',change.path||change.filePath||'שינוי קובץ',body);el('pre',change.diff||JSON.stringify(change,null,2),body).dir='ltr';}
      const detail=el('details',null,body);el('summary','כל פרטי הבקשה',detail);
      const activity=getWorkspace().session.activities.find(item=>item.id===params.itemId);
      el('pre',JSON.stringify({request:params,...(activity?{activity}:{})},null,2),detail).dir='ltr';
      const choices=params.availableDecisions?.length?params.availableDecisions:['accept','decline'];
      for(const choice of choices){const decision=typeof choice==='string'?choice:choice.type;if(!['accept','acceptForSession','decline','cancel'].includes(decision))continue;
        const names={accept:'לאשר את הפעולה',acceptForSession:'לאשר לשיחה',decline:'לדחות את הפעולה',cancel:'ביטול'};
        button(names[decision],()=>answer({decision}),footer,decision==='accept'?'primary-button':'secondary-button');
      }
    }
    if(!dialog.open)dialog.showModal();
  }
  return {update,destroy(){dialog.remove();}};
}
