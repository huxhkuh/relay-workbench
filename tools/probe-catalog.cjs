const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {AgentCatalog}=require('../desktop/agent-catalog.cjs'),{AcpClient}=require('../desktop/agent-providers.cjs');
(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'boau-probes-'));const catalog=new AgentCatalog(path.join(root,'settings'));
 for(const id of ['opencode','cline','copilot','gemini']){
  try{const result=await catalog.probe(id,root,AcpClient);console.log(JSON.stringify({id,protocol:result.protocolVersion,handshake:true,authMethods:result.authMethods.map(m=>m.name)}));}
  catch(error){console.log(JSON.stringify({id,handshake:false,error:error.message}));}
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
