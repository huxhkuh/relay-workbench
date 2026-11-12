export function el(tag,text,parent,className) {
  const node=document.createElement(tag);
  if(text!=null)node.textContent=text;
  if(className)node.className=className;
  parent?.append(node);return node;
}
export function button(text,action,parent,className='secondary-button') {
  const node=el('button',text,parent,className);node.type='button';node.addEventListener('click',action);return node;
}
export function field(label,value,parent,options={}) {
  const wrap=el('label',label,parent,'form-field'),input=el(options.multiline?'textarea':'input',null,wrap,'field');
  if(!options.multiline)input.type=options.type||'text';
  input.value=value??'';input.setAttribute('aria-label',label);
  if(options.dir)input.dir=options.dir;
  if(options.secret){input.type='password';input.autocomplete='off';}
  return input;
}
export async function copyText(text) {
  try {await navigator.clipboard.writeText(text);}
  catch {const input=el('textarea',null,document.body);input.value=text;input.select();document.execCommand('copy');input.remove();}
}
