// Full source-renderer protocol test in real Electron. No live services or paid calls.
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),release=path.join(root,'release/Boau-Code-'+require('../package.json').version+'-Windows-x64');
const appRoot=path.join(release,'resources/app'),pkgFile=path.join(appRoot,'package.json'),bootstrap=path.join(appRoot,'desktop/test-core.cjs');
(async()=>{
 const original=fs.readFileSync(pkgFile),pkg=JSON.parse(original),profile=fs.mkdtempSync(path.join(os.tmpdir(),'relay-core-')),fixture=path.join(profile,'project');fs.mkdirSync(fixture);
 fs.writeFileSync(bootstrap,"require('./codex-bridge.cjs').CodexBridge=require("+JSON.stringify(path.join(root,'tests/fixtures/codex-protocol.cjs'))+");const e=require('electron');globalThis.openedFixtureURLs=[];e.shell.openExternal=async url=>globalThis.openedFixtureURLs.push(url);require('./main.cjs');");
 pkg.main='desktop/test-core.cjs';fs.writeFileSync(pkgFile,JSON.stringify(pkg));let app;
 try{
  app=await _electron.launch({executablePath:path.join(release,'Boau-Code.exe'),args:['--user-data-dir='+profile]});
  const page=await app.firstWindow();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({dialog},fixture)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});},fixture);
  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.getByRole('button',{name:'הוסף תיקייה',exact:true}).click();
  await page.getByRole('button',{name:'התחבר לסוכן',exact:true}).click();
  await page.getByRole('combobox',{name:'מודל לשיחה'}).selectOption('fixture-model');
  const input=page.getByRole('textbox',{name:'הודעה לסוכן',exact:true});
  async function send(text){await input.fill(text);await page.getByRole('button',{name:'שלח הודעה',exact:true}).click();}
  async function complete(text){await page.getByText(text,{exact:true}).waitFor();await page.getByRole('button',{name:'העבר משימה',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.agent-label select').disabled);}
  await send('MARKDOWN');await page.getByText('FIXTURE_MARKDOWN_OK',{exact:true}).waitFor();
  assert.equal(await page.locator('.messages script,.messages img').count(),0);assert.equal(await page.locator('.messages code').count(),1);
  assert.equal(await page.locator('.message.assistant').count(),1);console.log('PASS source chat, models, streaming/final deduplication, safe Markdown and code rendering');
  const approval=page.getByRole('dialog',{name:'אישור פעולה',exact:true});
  for(const command of ['COMMAND','FILE']){
   await complete(command==='COMMAND'?'FIXTURE_MARKDOWN_OK':'FIXTURE_DONE_COMMAND');await send(command);
   await approval.getByRole('button',{name:'לאשר את הפעולה',exact:true}).click();await complete('FIXTURE_DONE_'+command);
  }
  await send('PERMISSIONS');await approval.locator('.permission-choice input').first().check();
  await approval.getByRole('button',{name:'אישור ההרשאות שנבחרו',exact:true}).click();await complete('FIXTURE_DONE_PERMISSIONS');
  const granted=await app.evaluate(()=>globalThis.protocolFixture.responses.at(-1).result.permissions);assert.deepEqual(granted,{network:{enabled:true}});
  for(const command of ['QUESTION','LEGACY_QUESTION']){await send(command);await approval.getByLabel('תשובה חופשית',{exact:true}).fill('תשובת בדיקה');await approval.getByRole('button',{name:'שליחת תשובות',exact:true}).click();await complete('FIXTURE_DONE_'+command);}
  await send('MCP_FORM');await approval.getByLabel('כינוי',{exact:true}).fill('fixture');await approval.getByLabel('כמות',{exact:true}).fill('3');await approval.getByLabel('פעיל',{exact:true}).check();await approval.getByRole('button',{name:'שליחת פרטים',exact:true}).click();await complete('FIXTURE_DONE_MCP_FORM');
  assert.deepEqual(await app.evaluate(()=>globalThis.protocolFixture.responses.at(-1).result.content),{nickname:'fixture',count:3,enabled:true,plan:'small'});
  await send('MCP_URL');await approval.getByRole('button',{name:'פתיחת הקישור המבוקש',exact:true}).click();assert.deepEqual(await app.evaluate(()=>globalThis.openedFixtureURLs),['https://example.test/verify']);
  await approval.getByRole('button',{name:'שליחת פרטים',exact:true}).click();await complete('FIXTURE_DONE_MCP_URL');
  assert.equal(await page.evaluate(async()=>{try{await window.boau.openElicitationURL('not-active');return false;}catch{return true;}}),true);
  console.log('PASS all six supported approval/input methods, typed MCP form, selective permissions and pending-request URL validation');
  await send('WAIT');await page.getByRole('button',{name:'עצור משימה',exact:true}).click();await page.getByRole('status').filter({hasText:'המשימה נעצרה'}).waitFor();
  await send('FAIL');await page.getByRole('status').filter({hasText:'fixture model failure'}).waitFor();
  await send('REJECT_START');await page.getByRole('alert').filter({hasText:'fixture rejected before start'}).waitFor();assert.equal(await input.inputValue(),'REJECT_START');
  console.log('PASS interruption, model failure and failed-submit draft preservation without automatic replay');
  await page.getByRole('button',{name:'שיחה חדשה',exact:false}).first().click();await page.locator('.history-row').first().click();
  while(await page.getByRole('button',{name:'טעינת הודעות קודמות',exact:true}).isVisible())await page.getByRole('button',{name:'טעינת הודעות קודמות',exact:true}).click();
  await page.getByText('FIXTURE_MARKDOWN_OK',{exact:true}).waitFor();console.log('PASS paginated historical conversation and canonical messages');
  await page.keyboard.press('Control+,');const settings=page.getByRole('dialog',{name:'הגדרות',exact:true});
  await settings.getByRole('button',{name:'מכסות שימוש',exact:true}).click();await settings.getByText(/usedPercent/).waitFor();
  await settings.getByRole('button',{name:'הכנת סביבה רגילה',exact:true}).click();await settings.locator('.sandbox-state').filter({hasText:'ready'}).waitFor();
  await settings.getByRole('button',{name:'כהה',exact:true}).click();await settings.getByRole('button',{name:'סיום',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
  await page.screenshot({path:path.join(root,'qa-source-chat-dark.png')});
  await page.keyboard.press('Control+k');const center=page.getByRole('dialog',{name:'מרכז העבודה',exact:true});await center.getByRole('button',{name:'שיחות ופרויקטים',exact:true}).click();
  await center.locator('.productivity-thread summary').first().click();await center.getByLabel('שם השיחה',{exact:true}).fill('Renamed fixture');await center.getByRole('button',{name:'שמירה',exact:true}).click();await center.getByText('Renamed fixture',{exact:true}).waitFor();
  await center.getByRole('button',{name:'העברה לארכיון',exact:true}).click();await center.getByRole('button',{name:'סגירה',exact:true}).click();
  await page.getByRole('button',{name:'ארכיון',exact:true}).click();await page.locator('.history-row').filter({hasText:'Renamed fixture'}).waitFor();
  console.log('PASS account usage, Windows sandbox setup, saved dark theme, conversation rename and archive discovery');
  if(errors.length)throw Error(errors.join('\n'));
 }finally{
  fs.writeFileSync(pkgFile,original);if(fs.existsSync(bootstrap))fs.unlinkSync(bootstrap);
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);}
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
