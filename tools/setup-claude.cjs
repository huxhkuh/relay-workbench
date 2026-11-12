// Explicit, optional user installation. No credentials or inference requests.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {claudeSDKDirectory}=require('../desktop/claude-runtime.cjs'),{tool}=require('../desktop/local-tools.cjs');
const npm=process.env.npm_execpath;if(!npm||!path.isAbsolute(npm)||path.basename(npm)!=='npm-cli.js')throw Error('Run this installer with npm run setup:claude.');
const destination=claudeSDKDirectory();fs.mkdirSync(destination,{recursive:true});
for(const name of ['package.json','package-lock.json'])fs.copyFileSync(path.join(__dirname,'claude-sdk',name),path.join(destination,name));
const result=spawnSync(tool('node'),[npm,'ci','--prefix',destination,'--ignore-scripts','--no-fund'],{stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;if(result.error)throw result.error;
