const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function hashes(){
 const result={};function walk(relative){for(const item of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const name=path.join(relative,item.name);if(item.isDirectory())walk(name);else result[name.split(path.sep).join('/')]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');}}
 walk('dist');walk('desktop/vendor');return result;
}
execFileSync(process.execPath,[path.join(__dirname,'build.cjs')],{cwd:root,stdio:'pipe'});const before=hashes();
execFileSync(process.execPath,[path.join(__dirname,'build.cjs')],{cwd:root,stdio:'pipe'});const after=hashes();
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Generated assets differ between clean source builds.');
console.log('PASS two clean builds produced identical hashes for '+Object.keys(after).length+' generated files.');
