// Branded per-user NSIS installer and portable ZIP; no signing credentials are used.
const fs=require('node:fs'),path=require('node:path'),{build}=require('electron-builder');
const root=path.resolve(__dirname,'..'),staging=path.join(root,'release/installer-app');
require('./build.cjs');
if(path.dirname(staging)!==path.join(root,'release')||path.basename(staging)!=='installer-app'||(fs.existsSync(staging)&&fs.lstatSync(staging).isSymbolicLink()))throw Error('Unsafe installer staging directory');
if(fs.existsSync(staging))fs.rmSync(staging,{recursive:true});
fs.mkdirSync(staging,{recursive:true});
for(const entry of ['desktop','dist','LICENSE','PRIVACY.md'])fs.cpSync(path.join(root,entry),path.join(staging,entry),{recursive:true,filter:file=>!/^test-.*\.cjs$/.test(path.basename(file))});
const pkg={...require('../package.json')};
for(const key of ['dependencies','devDependencies','overrides','scripts'])delete pkg[key];
fs.writeFileSync(path.join(staging,'package.json'),JSON.stringify(pkg,null,2));
build({projectDir:root,config:require('../electron-builder.config.cjs'),publish:'never'})
 .then(files=>{for(const file of files)console.log('ARTIFACT '+path.relative(root,file));})
 .catch(error=>{console.error(error.message);process.exitCode=1;});
