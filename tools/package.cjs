// Windows package built from official pinned Electron and maintained application source.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
require('./build.cjs');
const electron=require('electron');
if(!fs.existsSync(electron))throw Error('Official Electron runtime is missing. Run node node_modules/electron/install.js.');
const source=path.dirname(electron),dest=path.join(root,'release','Boau-Code-'+version+'-Windows-x64');
fs.mkdirSync(dest,{recursive:true});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const copyOptions={recursive:true,filter:(from,to)=>{
 if(path.basename(from)==='default_app.asar')return false;
 return fs.statSync(from).isDirectory()||!fs.existsSync(to)||fs.statSync(from).size!==fs.statSync(to).size||hash(from)!==hash(to);
}};
for(const name of fs.readdirSync(source)){
 const target=name==='electron.exe'?'Boau-Code.exe':name;
 fs.cpSync(path.join(source,name),path.join(dest,target),copyOptions);
}
for(const name of ['desktop','dist','package.json'])fs.cpSync(path.join(root,name),path.join(dest,'resources/app',name),{recursive:true,filter:from=>!/^test-.*\.cjs$/.test(path.basename(from))});
const desktopOut=path.join(dest,'resources/app/desktop');for(const name of fs.readdirSync(desktopOut))if(/^test-.*\.cjs$/.test(name))fs.unlinkSync(path.join(desktopOut,name));
fs.cpSync(path.join(root,'licenses'),path.join(dest,'licenses'),{recursive:true});
for(const name of ['README.md','README.he.md','CAPABILITIES.md','OPEN-SOURCE.md','SOURCE-PROVENANCE.md','PUBLIC-RELEASE.md','SECURITY.md','PRIVACY.md','FEATURE-PARITY.md','VALIDATION.md','CONTRIBUTING.md'])fs.copyFileSync(path.join(root,name),path.join(dest,name));
fs.copyFileSync(path.join(root,'LICENSE'),path.join(dest,'APP-LICENSE.txt'));
fs.copyFileSync(path.join(root,'LICENSE'),path.join(dest,'resources/app/LICENSE'));
fs.cpSync(path.join(root,'.github/assets'),path.join(dest,'.github/assets'),{recursive:true});
const readme=path.join(dest,'README.md');fs.writeFileSync(readme,fs.readFileSync(readme,'utf8').replace('](LICENSE)','](APP-LICENSE.txt)'));

fs.copyFileSync(path.join(root,'dist/relay.ico'),path.join(dest,'Relay-Workbench.ico'));
const installer=path.join(root,'desktop/install.ps1');fs.writeFileSync(installer,'\ufeff'+fs.readFileSync(installer,'utf8').replace(/^\ufeff/,''));
fs.copyFileSync(installer,path.join(dest,'resources/app/desktop/install.ps1'));
fs.copyFileSync(installer,path.join(dest,'Install-Boau-Code.ps1'));
fs.writeFileSync(path.join(dest,'Install.cmd'),'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Boau-Code.ps1" -Source "%~dp0."\r\n');
const files=[];function walk(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,item.name);if(item.isDirectory())walk(full);else if(item.name!=='release-manifest.json')files.push({path:path.relative(dest,full),sha256:hash(full)});}}
walk(dest);fs.writeFileSync(path.join(dest,'release-manifest.json'),JSON.stringify({product:'boau-code',version,files},null,2));console.log(dest);console.log(files.length+' files hashed; no bundled provider CLI or SDK.');
