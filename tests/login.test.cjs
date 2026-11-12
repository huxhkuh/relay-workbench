const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {LoginManager,trustedLoginURL}=require('../desktop/login-manager.cjs');
function fixture(openExternal=async()=>{}){
 const children=[];const manager=new LoginManager({openExternal,spawnImpl:(command,args,options)=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();children.push({child,command,args,options});return child;}});
 return {manager,children};
}
test('only exact official HTTPS login hosts are accepted',()=>{
 assert.equal(trustedLoginURL('claude','https://claude.ai/oauth/authorize?state=private'),true);
 for(const url of ['http://claude.ai','https://claude.ai.evil.test','https://user@claude.ai','https://claude.ai:444/','file:///etc/passwd'])assert.equal(trustedLoginURL('claude',url),false);
 assert.equal(trustedLoginURL('claude','https://claude.com/oauth/authorize?state=fixture'),true);
 assert.equal(trustedLoginURL('copilot','https://github.com/login/device'),true);
});
test('launch waits for complete URLs, opens browser, supports retry without leaking tokens',async()=>{
 const opened=[];const {manager,children}=fixture(async url=>opened.push(url));
 assert.equal(manager.start('claude',{command:'official.exe'},['auth','login']).state,'starting');
 const child=children[0].child;child.stdout.emit('data',Buffer.from('https://claude.ai/oauth?sta'));
 await new Promise(r=>setTimeout(r,550));assert.equal(opened.length,0);
 child.stdout.emit('data',Buffer.from('te=secret\n'));await new Promise(setImmediate);
 assert.deepEqual(opened,['https://claude.ai/oauth?state=secret']);
 assert.equal(manager.status('claude').state,'browser-open');
 assert.equal(JSON.stringify(manager.status('claude')).includes('secret'),false);
 await manager.reopen('claude');assert.equal(opened.length,2);
 manager.start('claude',{command:'official.exe'},[]);assert.equal(children.length,1);
 child.emit('close',0);assert.equal(manager.status('claude').state,'completed');
});
test('browser failure is visible and arbitrary output links never open',async()=>{
 const {manager,children}=fixture(async()=>{throw Error('browser unavailable');});
 manager.start('claude',{command:'official.exe'},[]);
 children[0].child.stderr.emit('data',Buffer.from('https://evil.test/login\n'));
 await new Promise(setImmediate);assert.equal(manager.status('claude').canReopen,false);
 children[0].child.stdout.emit('data',Buffer.from('https://claude.ai/oauth\n'));
 await new Promise(setImmediate);assert.equal(manager.status('claude').state,'failed');
 children[0].child.emit('close',1);
});
test('interactive login creates a real console and reports launch failure',()=>{
 const {manager,children}=fixture();manager.start('gemini',{command:'node.exe'},['gemini.js']);
 const launcher=Buffer.from(children[0].args.at(-1),'base64').toString('utf16le');
 assert.match(launcher,/Start-Process/);assert.match(launcher,/-NoExit/);
 children[0].child.emit('close',1);assert.equal(manager.status('gemini').state,'failed');
});
test('manual authentication code is passed only to an active official process and never returned',()=>{
 const {manager,children}=fixture();manager.start('claude',{command:'official.exe'},[]);
 let written='';const stream=new EventEmitter();stream.writable=true;stream.write=value=>{written=value;};children[0].child.stdin=stream;
 assert.throws(()=>manager.submitCode('claude','bad\ncommand'));
 manager.submitCode('claude','test-code#state');
 assert.equal(written,'test-code#state\n');assert.equal(JSON.stringify(manager.status('claude')).includes('test-code'),false);
 children[0].child.emit('close',0);assert.throws(()=>manager.submitCode('claude','test-code#state'));
});
