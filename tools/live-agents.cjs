if(!process.argv.includes('--live-inference'))throw Error('Pass --live-inference explicitly; this opt-in test uses provider model quota.');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {runClaude,runAntigravity}=require('../desktop/agent-providers.cjs');
(async()=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'boau-live-'));
 for(const [name,runner] of [['claude',runClaude],['antigravity',runAntigravity]]){
  const token='BOAU_'+name.toUpperCase()+'_OK';const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),150000);
  let output='';
  try{await runner({thread:{cwd,permissions:'read-only',turns:[]},text:'This is an application integration test. Reply with exactly '+token+'. Do not use any tools or access any files.',signal:controller,permission:async()=>false,emit:e=>{if(e.type==='text'||e.type==='delta')output+=e.text;},onSession:()=>{}});
   if(!output.includes(token))throw Error('Expected response marker missing');console.log('PASS live '+name+' response');
  }catch(error){console.log('FAIL live '+name+': '+error.message);process.exitCode=1;}finally{clearTimeout(timer);}
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
