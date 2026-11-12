const {chromium}=require('playwright'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),url=process.env.RELAY_WEBSITE_URL||'http://127.0.0.1:4177/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'networkidle'});await page.evaluate(()=>localStorage.clear());await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  for(const href of ['#features','#workflow','#download'])assert.ok(await page.locator('a[href="'+href+'"]').count());
  await page.getByRole('tab',{name:/03.*העברה/}).click();await page.getByText('סקירה מזווית נוספת',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Switch to English',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('dir'),'ltr');await page.getByRole('heading',{name:'Your code. Your agents. One workspace.'}).waitFor();
  assert.equal(await page.locator('[data-i18n]').evaluateAll(nodes=>nodes.filter(n=>/[\u0590-\u05ff]/.test(n.textContent)).map(n=>n.dataset.i18n).join(',')),'');
  const selected=page.getByRole('tab',{name:/03.*Hand off/});await selected.focus();await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:/01.*Choose/}).getAttribute('aria-selected'),'true');
  await page.locator('.questions summary').first().click();assert.equal(await page.locator('.questions details').first().getAttribute('open'),'');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const metadata=fs.existsSync(path.join(root,'website/public/release.json'))?JSON.parse(fs.readFileSync(path.join(root,'website/public/release.json'),'utf8')):null;
  if(metadata){await page.waitForFunction(()=>/^[a-f0-9]{64}$/.test(document.getElementById('checksum').textContent));assert.equal(await page.locator('#checksum').innerText(),metadata.installer.sha256);for(const href of await page.locator('[data-download]').evaluateAll(nodes=>nodes.map(n=>n.href)))assert.equal(href,metadata.installer.url);}
  await page.getByRole('button',{name:'מעבר לעברית',exact:true}).click();await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(root,'qa-website-hero.png')});await page.locator('.download-section').screenshot({path:path.join(root,'qa-website-download.png')});await page.screenshot({path:path.join(root,'qa-website-desktop.png'),fullPage:true});
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,hasTouch:true});
  const m=await mobile.newPage();m.on('pageerror',error=>errors.push(error.message));await m.goto(url,{waitUntil:'networkidle'});
  await m.getByRole('button',{name:'תפריט',exact:true}).click();await m.getByRole('button',{name:'Switch to English',exact:true}).click();
  await m.getByRole('link',{name:'Features',exact:true}).click();assert.equal(await m.locator('#menu').getAttribute('aria-expanded'),'false');
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await m.evaluate(()=>scrollTo(0,0));await m.screenshot({path:path.join(root,'qa-website-mobile.png'),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS website: Hebrew/English, RTL/LTR, keyboard demo tabs, FAQ, mobile navigation, no overflow or JS errors'+(metadata?', real installer URL and SHA-256 metadata':' (release metadata not built yet)'));
  await context.close();await mobile.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
