const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
 const profile=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'boau-profile-')));
 const app=await _electron.launch({executablePath:path.resolve(__dirname,'../release/Boau-Code-'+require('../package.json').version+'-Windows-x64/Boau-Code.exe'),args:['--user-data-dir='+profile],timeout:30000});
 try {
 const actual=await app.evaluate(({app})=>app.getPath('userData'));console.log('PROFILE',actual);
 if(path.resolve(actual)!==path.resolve(profile))throw Error('Test profile was not isolated');
 const page=await app.firstWindow();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const project=path.join(profile,'fixture');fs.mkdirSync(project);require('node:child_process').execFileSync('git',['init',project],{windowsHide:true});fs.writeFileSync(path.join(project,'hello.txt'),'before');
 await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});dialog.showMessageBox=async()=>({response:1});},project);
 await page.getByRole('button',{name:'מרכז העבודה',exact:true}).click();
 await page.getByRole('heading',{name:'מרכז העבודה',exact:true}).waitFor();
 await page.getByRole('heading',{name:'1. תיקיית פרויקט'}).waitFor();
 await page.getByRole('status').filter({hasText:'הפעולה הושלמה.'}).waitFor();
 await page.getByRole('button',{name:'בחירת תיקייה',exact:true}).click();
 await page.getByRole('button',{name:'בחירת תיקייה',exact:true}).waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('.productivity-card p')?.textContent?.includes('fixture'));
 await page.waitForFunction(()=>!document.querySelector('.productivity-body button')?.disabled);
 console.log('PASS readiness dialog');
 for(const tab of ['שיחות ופרויקטים','קבצים ושינויים','נקודות שחזור','תחזוקה']){
  await page.getByRole('button',{name:tab,exact:true}).click();console.log('PASS tab',tab);
 }
 await page.waitForFunction(()=>!document.querySelector('.productivity-body button')?.disabled);
 await page.getByRole('button',{name:'נקודות שחזור',exact:true}).click();
 await page.getByRole('button',{name:'יצירת נקודת שחזור',exact:true}).click();
 await page.getByRole('button',{name:'שחזור עם גיבוי המצב הנוכחי',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('.productivity-body button')?.disabled);
 fs.writeFileSync(path.join(project,'hello.txt'),'after');fs.writeFileSync(path.join(project,'new.txt'),'new');
 await page.getByRole('button',{name:'שחזור עם גיבוי המצב הנוכחי',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.productivity-card').length>=4);
 if(fs.readFileSync(path.join(project,'hello.txt'),'utf8')!=='before'||fs.existsSync(path.join(project,'new.txt')))throw Error('UI restore did not restore fixture');
 console.log('PASS snapshot creation and restore through real IPC');
 await page.waitForFunction(()=>!document.querySelector('.productivity-body button')?.disabled);
 await page.getByRole('button',{name:'תחזוקה',exact:true}).click();
 const report=path.join(profile,'diagnostic.json');
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},report);
 await page.getByRole('button',{name:'שמירת דוח אבחון',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.productivity-body button')?.disabled);
 const diagnostic=JSON.parse(fs.readFileSync(report,'utf8'));if(diagnostic.appVersion!==require('../package.json').version||JSON.stringify(diagnostic).includes(project))throw Error('Invalid diagnostics');
 console.log('PASS diagnostic export through IPC');
 await page.getByRole('button',{name:'שיחות ופרויקטים',exact:true}).click();
 await page.getByRole('button',{name:'הצמדה',exact:true}).click();
 await page.getByRole('button',{name:'ביטול הצמדה',exact:true}).waitFor();
 const pins=await page.evaluate(()=>window.boau.getProductivity());if(pins.projectPins.length!==1)throw Error('Pin did not persist');
 await page.waitForFunction(()=>!document.querySelector('.productivity-body button')?.disabled);
 await page.getByRole('dialog',{name:'מרכז העבודה',exact:true}).getByRole('searchbox').fill('אין-תוצאה');
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('.productivity-body button')).some(b=>b.textContent==='fixture'));
 if(await page.locator('.productivity-dialog').getByRole('button',{name:'fixture',exact:true}).count())throw Error('Search failed');
 console.log('PASS project pin and search');
 await page.screenshot({path:path.resolve(__dirname,'../qa-maintenance.png')});
 await page.getByRole('dialog',{name:'מרכז העבודה',exact:true}).getByRole('button',{name:'סגירה',exact:true}).click();
 await page.keyboard.press('Control+k');await page.getByRole('heading',{name:'מרכז העבודה',exact:true}).waitFor();
 await page.keyboard.press('Escape');
 console.log('PASS keyboard modal');
 await page.keyboard.press('Control+,');await page.getByRole('button',{name:'כהה',exact:true}).click();
 await page.getByRole('button',{name:'סיום',exact:true}).click();await page.keyboard.press('Control+k');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(960,700));
 await page.screenshot({path:path.resolve(__dirname,'../qa-dark-compact.png')});
 const overflow=await page.getByRole('dialog',{name:'מרכז העבודה',exact:true}).evaluate(el=>el.scrollWidth>el.clientWidth+2);if(overflow)throw Error('Dialog overflow at compact size');
 console.log('PASS dark compact layout');
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS no renderer errors');const alert=page.getByRole('alert');if(await alert.isVisible())throw Error('Unexpected workspace error: '+await alert.innerText());
 } finally {await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});





