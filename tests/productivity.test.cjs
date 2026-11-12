const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {Recovery,inside,sanitizeDiagnostic,inspectProject}=require('../desktop/productivity.cjs');
function fixture(t){const base=fs.mkdtempSync(path.join(os.tmpdir(),'boau-test-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));const root=path.join(base,'project');fs.mkdirSync(root);const canonicalRoot=fs.realpathSync.native(root);execFileSync('git',['init',canonicalRoot],{windowsHide:true});const top=execFileSync(require('../desktop/local-tools.cjs').tool('git'),['rev-parse','--show-toplevel'],{cwd:canonicalRoot,encoding:'utf8',windowsHide:true}).trim();assert.equal(require('../desktop/workspace.cjs').normalizedPath(top),require('../desktop/workspace.cjs').normalizedPath(canonicalRoot),'fixture Git root must match its canonical project path');return {base,root:canonicalRoot,project:{id:'test',path:canonicalRoot}};}
test('restore preserves pre-existing edits, untracked files and ignored content; creates undo point',async t=>{
 const {base,root,project}=fixture(t);const recovery=new Recovery(path.join(base,'recovery'));
 fs.writeFileSync(path.join(root,'.gitignore'),'ignored.txt\n');fs.writeFileSync(path.join(root,'file.txt'),'before');fs.writeFileSync(path.join(root,'ignored.txt'),'private');
 const point=await recovery.create(project);
 fs.writeFileSync(path.join(root,'file.txt'),'after');fs.writeFileSync(path.join(root,'new.txt'),'new');fs.writeFileSync(path.join(root,'ignored.txt'),'private-new');
 const result=await recovery.restore(project,point.id);
 assert.equal(fs.readFileSync(path.join(root,'file.txt'),'utf8'),'before');assert.equal(fs.existsSync(path.join(root,'new.txt')),false);assert.equal(fs.readFileSync(path.join(root,'ignored.txt'),'utf8'),'private-new');
 await recovery.restore(project,result.backupId);assert.equal(fs.readFileSync(path.join(root,'new.txt'),'utf8'),'new');assert.equal(fs.readFileSync(path.join(root,'file.txt'),'utf8'),'after');
});
test('corrupt backup is rejected before writing project files',async t=>{const {base,root,project}=fixture(t);const r=new Recovery(path.join(base,'recovery'));fs.writeFileSync(path.join(root,'a'),'one');const p=await r.create(project);fs.writeFileSync(path.join(root,'a'),'two');fs.writeFileSync(path.join(base,'recovery','test',p.id,'files','a'),'broken');await assert.rejects(r.restore(project,p.id));assert.equal(fs.readFileSync(path.join(root,'a'),'utf8'),'two');});
test('path traversal and git internals are rejected',()=>{for(const p of ['../outside','.git/config','a/../../outside'])assert.throws(()=>inside('C:\\project',p));});
test('diagnostics redact credentials, user folder and email',()=>{const text=sanitizeDiagnostic('Bearer abcdefgh sk-abcdefghijklmnop password=hunter2 token=abcdef user@example.com C:\\Users\\private','C:\\Users\\private');for(const secret of ['abcdefghijklmnop','hunter2','abcdef','user@example.com','C:\\Users\\private'])assert.ok(!text.includes(secret));});
test('inspection includes untracked files and reports tools',async t=>{const {root,project}=fixture(t);fs.writeFileSync(path.join(root,'new.txt'),'new');const result=await inspectProject(project);assert.ok(result.changes.some(x=>x.name==='new.txt'&&x.status==='??'));assert.ok(result.checks.some(x=>x.name==='git'&&x.available));});
test('snapshot deletion stays inside backup root',async t=>{const {base,root,project}=fixture(t);fs.writeFileSync(path.join(root,'a'),'content');const r=new Recovery(path.join(base,'recovery'));const p=await r.create(project);assert.throws(()=>r.remove(project,'../outside'));r.remove(project,p.id);assert.equal(r.list(project).length,0);assert.equal(fs.readFileSync(path.join(root,'a'),'utf8'),'content');});
test('subdirectory projects are rejected instead of backing up another root',async t=>{const {base,root,project}=fixture(t);const nested=path.join(root,'nested');fs.mkdirSync(nested);const r=new Recovery(path.join(base,'recovery'));await assert.rejects(r.create({...project,path:nested}),/שורש/);});
