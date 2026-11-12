// Local review export only. No GitHub API calls or git push.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const destination=path.join(root,'release','Relay-Workbench-'+pkg.version+'-source-'+Date.now());
const allowed=['desktop','src','tests','tools','.github','.gitignore','package.json','package-lock.json','README.md','README.he.md','LICENSE','CAPABILITIES.md','OPEN-SOURCE.md','CONTRIBUTING.md','SECURITY.md','SOURCE-PROVENANCE.md','PUBLIC-RELEASE.md','VALIDATION.md','FEATURE-PARITY.md','PRIVACY.md','licenses','.gitattributes','electron-builder.config.cjs','website/public','RELEASE-NOTES.md'];
const files=[];fs.mkdirSync(destination,{recursive:true});
function copy(relative){
 const from=path.join(root,relative),stat=fs.lstatSync(from);
 if(stat.isSymbolicLink())throw Error('Source export rejects symlinks: '+relative);
 if(relative.split(path.sep).includes('vendor'))return;
 if(stat.isDirectory()){for(const name of fs.readdirSync(from))copy(path.join(relative,name));return;}
 if(/(?:^|[\\/])(?:\.env(?:\..*)?|.*\.(?:pem|key|log))$/i.test(relative))throw Error('Sensitive file name in export: '+relative);
 let data=fs.readFileSync(from);
 const isText=/\.(?:cjs|mjs|js|json|md|html|css|ya?ml|ps1|txt)$/.test(relative)||['LICENSE','.gitignore','.gitattributes'].includes(path.basename(relative));
 if(isText){
  // Match .gitattributes so the ZIP and Git index have identical source hashes.
  const text=data.toString('utf8').replace(/\r\n/g,'\n');data=Buffer.from(text,'utf8');
  if(text.includes(require('node:os').homedir())||/(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:proj-|ant-)[A-Za-z0-9_-]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text))throw Error('Potential private content: '+relative);
 }
 const to=path.join(destination,relative);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,data);
 files.push({path:relative.split(path.sep).join('/'),sha256:crypto.createHash('sha256').update(data).digest('hex')});
}
try{for(const entry of allowed)copy(entry);fs.writeFileSync(path.join(destination,'SOURCE-MANIFEST.json'),JSON.stringify({product:'Relay Workbench',version:pkg.version,status:'open-source developer preview; public release v'+pkg.version,files},null,2));console.log(destination);console.log(files.length+' source files exported; private-content pattern scan passed (not a comprehensive secret audit).');}catch(error){console.error(error.message);process.exitCode=1;}
