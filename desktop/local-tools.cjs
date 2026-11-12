'use strict';
const fs=require('node:fs'),path=require('node:path');
// Resolve an executable before changing cwd; Windows must not pick a repo-local git.exe.
function tool(name){
 if(!/^[a-z0-9-]+$/i.test(name))throw Error('שם כלי לא תקין.');
 const system=process.env.SystemRoot||'C:\\Windows',programs=process.env.ProgramFiles||'C:\\Program Files';
 const known={powershell:[path.join(system,'System32/WindowsPowerShell/v1.0/powershell.exe')],taskkill:[path.join(system,'System32/taskkill.exe')],git:[path.join(programs,'Git/cmd/git.exe')],node:[path.join(programs,'nodejs/node.exe')]};
 const candidates=[...(known[name]||[])];
 for(const dir of (process.env.PATH||'').split(path.delimiter).filter(Boolean)){
  const clean=dir.replace(/^"|"$/g,'');if(!path.isAbsolute(clean))continue;
  for(const suffix of process.platform==='win32'?['.exe','.com']:[''])candidates.push(path.join(clean,name+suffix));
 }
 for(const candidate of candidates)try{if(fs.statSync(candidate).isFile())return candidate;}catch{}
 const error=Error('הכלי '+name+' אינו מותקן או אינו זמין בנתיב מערכת מלא.');error.code='ENOENT';throw error;
}
module.exports={tool};
