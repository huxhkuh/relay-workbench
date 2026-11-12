// Actual Electron / preload / UI; official-process output and browser dispatch are doubled.
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'relay-login-test-'));
 const appRoot=path.join(root,'release','Boau-Code-'+version+'-Windows-x64/resources/app'),pkgFile=path.join(appRoot,'package.json'),original=fs.readFileSync(pkgFile),pkg=JSON.parse(original),bootstrap=path.join(appRoot,'desktop/test-login.cjs');
 fs.writeFileSync(bootstrap,"const p=require('./agent-providers.cjs');p.executable=()=>process.execPath;p.providerInfo=async id=>({id,name:id==='claude'?'Claude':'Codex',installed:true,authenticated:false});require('./main.cjs');");pkg.main='desktop/test-login.cjs';fs.writeFileSync(pkgFile,JSON.stringify(pkg));let app;
 try{
  app=await _electron.launch({executablePath:path.join(root,'release','Boau-Code-'+version+'-Windows-x64/Boau-Code.exe'),args:['--user-data-dir='+profile]});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);
  await page.waitForFunction(()=>document.title==='Relay Workbench');
  assert.equal(await page.title(),'Relay Workbench');
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
  await app.evaluate(async({app})=>{
   const req=process.mainModule.require.bind(process.mainModule);
   const {LoginManager}=req('./login-manager.cjs'),{EventEmitter}=req('node:events');
   const original=LoginManager.prototype.start;globalThis.loginOpened=[];globalThis.submittedCodes=[];
   LoginManager.prototype.start=function(provider,spec,args){
    this.openExternal=async url=>{globalThis.loginOpened.push(url);};
    this.spawn=()=>{const child=new EventEmitter();child.stdin=new EventEmitter();child.stdin.writable=true;child.stdin.write=value=>globalThis.submittedCodes.push(value);child.stdout=new EventEmitter();child.stderr=new EventEmitter();setTimeout(()=>child.stdout.emit('data',Buffer.from('https://claude.ai/oauth?state=fixture\n')),40);setTimeout(()=>child.emit('close',0),10000);return child;};
    return original.call(this,provider,spec,args);
   };
  });
  await page.getByRole('button',{name:'חיבורי סוכנים',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'חיבור והעברת משימות',exact:true});
  await dialog.getByRole('button',{name:'התחברות ל־Claude',exact:true}).click();
  await dialog.getByText('הדפדפן נפתח. השלם את ההתחברות וחזור לאפליקציה.',{exact:true}).waitFor();
  assert.equal(await app.evaluate(()=>globalThis.loginOpened.length),1);
  await dialog.getByRole('button',{name:'פתיחה חוזרת בדפדפן',exact:true}).click();
  assert.equal(await app.evaluate(()=>globalThis.loginOpened.length),2);
  const card=dialog.locator('.productivity-card').filter({hasText:'Claude Code'});
  await card.getByText('הדפדפן הציג קוד אימות?',{exact:true}).click();
  await card.getByLabel('קוד אימות זמני',{exact:true}).fill('fixture-code#state');
  await card.getByRole('button',{name:'העברת הקוד לכלי הרשמי',exact:true}).click();
  assert.equal(await app.evaluate(()=>globalThis.submittedCodes.length),1);
  assert.equal(await card.getByLabel('קוד אימות זמני',{exact:true}).inputValue(),'');
  const status=await page.evaluate(()=>window.boau.agentLoginStatus('claude'));assert.equal(JSON.stringify(status).includes('fixture'),false);
  await page.screenshot({path:path.join(root,'qa-relay-connections.png')});
  await dialog.getByRole('button',{name:'סגירה',exact:true}).click();
  await page.screenshot({path:path.join(root,'qa-relay-home.png')});
  await page.keyboard.press('Control+,');await page.getByRole('button',{name:'כהה',exact:true}).click();await page.getByRole('button',{name:'סיום',exact:true}).click();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(960,700));
  await page.screenshot({path:path.join(root,'qa-relay-home-dark.png')});
  console.log('PASS brand, isolated profile, login button → process → official URL → browser dispatch, reopen, private status and light/dark UI (provider/browser doubles)');
 }finally{
  fs.writeFileSync(pkgFile,original);if(fs.existsSync(bootstrap))fs.unlinkSync(bootstrap);
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
  await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);}
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
