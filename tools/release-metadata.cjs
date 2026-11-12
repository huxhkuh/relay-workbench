const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,output=path.join(root,'release/publish');
const fileInfo=name=>{const full=path.join(output,name);return {filename:name,bytes:fs.statSync(full).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex'),url:'https://github.com/huxhkuh/relay-workbench/releases/download/v'+version+'/'+name};};
const data={version,channel:'developer-preview',platform:'Windows 10/11 x64',signed:false,
 installer:fileInfo('Relay-Workbench-Setup-'+version+'-x64.exe'),
 portable:fileInfo('Relay-Workbench-'+version+'-x64.zip')};
fs.writeFileSync(path.join(root,'website/public/release.json'),JSON.stringify(data,null,2)+'\n');
fs.writeFileSync(path.join(output,'SHA256SUMS.txt'),[data.installer,data.portable].map(f=>f.sha256+'  '+f.filename).join('\n')+'\n');
console.log(JSON.stringify(data,null,2));
