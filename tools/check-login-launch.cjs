// Opt-in: starts the real official Claude login and opens the default browser.
// Does not submit credentials, purchase a plan or make an inference request.
if(!process.argv.includes('--live-login'))throw Error('Pass --live-login to start official authentication.');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'relay-real-login-'));
 const app=await _electron.launch({executablePath:path.resolve(__dirname,'../release/Boau-Code-'+require('../package.json').version+'-Windows-x64/Boau-Code.exe'),args:['--user-data-dir='+profile]});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.boau);
  await app.evaluate(({shell})=>{
   const {LoginManager}=process.mainModule.require('./login-manager.cjs'),original=LoginManager.prototype.start;
   globalThis.realBrowserDispatches=0;
   LoginManager.prototype.start=function(...args){globalThis.authTestManager=this;this.openExternal=async url=>{await shell.openExternal(url);globalThis.realBrowserDispatches++;};return original.apply(this,args);};
  });
  await page.evaluate(()=>window.boau.loginAgent('claude'));
  for(let i=0;i<25;i++){if(await app.evaluate(()=>globalThis.realBrowserDispatches>0))break;const status=await page.evaluate(()=>window.boau.agentLoginStatus('claude'));if(status.state==='failed'||status.state==='completed')break;await new Promise(r=>setTimeout(r,1000));}
  const status=await page.evaluate(()=>window.boau.agentLoginStatus('claude'));
  const count=await app.evaluate(()=>globalThis.realBrowserDispatches);
  console.log(JSON.stringify({state:status.state,nativeBrowserDispatches:count,accountCompletion:'not tested'}));
  if(!count)throw Error('No confirmed native browser dispatch from official CLI output.');
 }finally{
  await app.evaluate(({app})=>{globalThis.authTestManager?.close();app.exit(0);}).catch(()=>{});
  await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});
