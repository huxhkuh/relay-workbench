import MarkdownIt from 'markdown-it';
const parser=new MarkdownIt({html:false,linkify:false,breaks:true});
// Never fetch remote images from an agent response.
parser.renderer.rules.image=(tokens,index)=>parser.utils.escapeHtml(tokens[index].content||'תמונה');
export const renderMarkdown=text=>parser.render(String(text||''));
