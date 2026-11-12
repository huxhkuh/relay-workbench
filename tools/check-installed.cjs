// Tests an already-installed NSIS build in an isolated profile; no inference requests.
const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),directory=process.argv[2]||path.join(process.env.LOCALAPPDATA,'Programs','Relay Workbench');
(async()=>{
 const exe=path.join(directory,'Relay-Workbench.exe');assert.ok(fs.existsSync(exe),'Installed executable missing');
 const asar=require('@electron/asar'),archive=path.join(directory,'resources/app.asar'),entries=asar.listPackage(archive);
 assert.ok(entries.some(name=>name.endsWith('/src/app.js'))===false,'Source layout unexpected in runtime');
 assert.equal(entries.some(name=>/claude-sdk\.mjs|index-Q9adHlnJ|\.woff2?$/.test(name)),false);
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'relay-nsis-qa-')),project=path.join(profile,'project');fs.mkdirSync(project);fs.writeFileSync(path.join(project,'hello.js'),'const before = 1;\n');
 const app=await _electron.launch({executablePath:exe,args:['--user-data-dir='+profile]});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>document.title==='Relay Workbench');
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
  const info=await page.evaluate(()=>window.boau.getAppInfo());assert.equal(info.version,require('../package.json').version);assert.equal(info.packaged,true);
  await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);
  await page.getByRole('button',{name:'הוסף תיקייה',exact:true}).click();await page.getByRole('button',{name:'סביבת פיתוח',exact:true}).click();
  const studio=page.getByRole('dialog',{name:'סביבת הפיתוח',exact:true});await studio.getByRole('button',{name:'hello.js',exact:true}).click();
  await studio.locator('.cm-content').fill('const installed = "verified";\n');await studio.getByRole('button',{name:'שמירה · Ctrl+S',exact:true}).click();
  assert.equal(fs.readFileSync(path.join(project,'hello.js'),'utf8'),'const installed = "verified";\n');
  await studio.getByRole('button',{name:'סגירה',exact:true}).click();await page.keyboard.press('Control+,');await page.getByRole('dialog',{name:'הגדרות',exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS installed NSIS app: branded launcher, ASAR, isolated profile, version, real editor save, settings and no renderer errors.');
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
