// All application assets are rebuilt exclusively from maintained source.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),vendor=path.join(root,'desktop/vendor');
if(path.dirname(dist)!==root||path.basename(dist)!=='dist'||(fs.existsSync(dist)&&fs.lstatSync(dist).isSymbolicLink()))throw Error('Unsafe generated output directory');
if(fs.existsSync(dist))fs.rmSync(dist,{recursive:true});
fs.mkdirSync(path.join(dist,'assets'),{recursive:true});fs.mkdirSync(vendor,{recursive:true});
const stale=path.join(vendor,'claude-sdk.mjs');if(fs.existsSync(stale))fs.unlinkSync(stale);
const staleNotice=path.join(vendor,'THIRD-PARTY-NOTICES.txt');if(fs.existsSync(staleNotice))fs.unlinkSync(staleNotice);
const results=[
 esbuild.buildSync({absWorkingDir:root,entryPoints:[path.join(root,'src/app.js')],outfile:path.join(dist,'assets/app.js'),bundle:true,platform:'browser',format:'esm',target:'chrome140',metafile:true,legalComments:'eof'}),
 esbuild.buildSync({absWorkingDir:root,entryPoints:[path.join(root,'tools/workbench-deps.cjs')],outfile:path.join(vendor,'workbench-deps.cjs'),bundle:true,platform:'node',format:'cjs',target:'node22',metafile:true,legalComments:'eof'})
];
fs.copyFileSync(path.join(root,'src/index.html'),path.join(dist,'index.html'));
require('./generate-icon.cjs')(dist);
const packages=new Set(),inputs=new Set();
for(const name of ['src/index.html','tools/build.cjs','tools/generate-icon.cjs'])inputs.add(name);
for(const result of results)for(const input of Object.keys(result.metafile.inputs)){
 const relative=path.relative(root,path.resolve(root,input)).split(path.sep).join('/');
 const match=relative.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
 if(match)packages.add(match[1]);else inputs.add(relative);
}
let notices='Relay Workbench: bundled open-source dependencies (optional provider SDKs are not bundled).\n';
for(const name of [...packages].sort()){
 const directory=path.join(root,'node_modules',name),meta=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
 notices+='\n=== '+name+' '+meta.version+' ('+meta.license+') ===\n';
 const files=fs.readdirSync(directory).filter(name=>/^(license|copying|notice)/i.test(name)&&fs.statSync(path.join(directory,name)).isFile());
 if(!files.length)throw Error('Missing license text for bundled dependency: '+name);
 for(const name of files)notices+=fs.readFileSync(path.join(directory,name),'utf8')+'\n';
}
fs.writeFileSync(path.join(vendor,'WORKBENCH-LICENSES.txt'),notices);
const sources=[...inputs].sort().map(name=>({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}));
fs.writeFileSync(path.join(dist,'BUILD-SOURCES.json'),JSON.stringify({version:require('../package.json').version,sources},null,2));
console.log('Rebuilt complete renderer and backend helpers from source; collected '+packages.size+' dependency licenses.');
