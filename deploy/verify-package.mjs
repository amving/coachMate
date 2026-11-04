// Local smoke test of the actual files delivered to Cloud Build; no Google calls.
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';
import http from 'node:http';

const root=resolve(process.argv[2] || '.');
const sum=data=>createHash('sha256').update(data).digest('hex');
const manifest=readFileSync(resolve(root,'SHA256SUMS'),'utf8').trim().split('\n');
for(const row of manifest){
  const [,hash,file]=/^([a-f0-9]{64})  (.+)$/.exec(row)||[];
  assert.ok(file && !file.includes('..') && !file.startsWith('/'),'valid manifest path');
  assert.equal(sum(readFileSync(resolve(root,file))),hash,file);
  assert.ok(!/(^|\/)(?:\.env(?:\.|$)|Oauth|ClientSec|node_modules|debug\.log|client_secret)|\.(?:pem|key)$/i.test(file),file);
}
const visited=new Set();
function checkImports(file){
  if(visited.has(file))return;
  visited.add(file);
  const code=readFileSync(file,'utf8');
  for(const match of code.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+\.(?:ts|mjs))['"]/g)){
    const target=resolve(dirname(file),match[1]);
    assert.ok(existsSync(target),`runtime import missing: ${target}`);
    checkImports(target);
  }
}
checkImports(resolve(root,'server/index.mjs'));
assert.match(readFileSync(resolve(root,'Dockerfile'),'utf8'),/COPY --from=build --chown=node:node \/app\/src \.\/src/);

const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
const port=listener.address().port;await new Promise(r=>listener.close(r));
const origin=`https://127.0.0.1:${port}`;
const proc=spawn(process.execPath,['--experimental-strip-types','server/index.mjs'],{
  cwd:root,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_ENV:'production',PORT:String(port),
    APP_ORIGIN:origin,API_ORIGIN:origin,GOOGLE_CLIENT_ID:'smoke-client',GOOGLE_CLIENT_SECRET:'smoke-only-not-real',
    GOOGLE_SPREADSHEET_ID:'smoke-sheet',COACH_EMAILS:'coach@example.invalid'},stdio:['ignore','pipe','pipe']
});
let output='';proc.stdout.on('data',d=>output+=d);proc.stderr.on('data',d=>output+=d);
try{
  let ready=false;
  for(let i=0;i<80;i++){
    if(proc.exitCode!==null)throw new Error(`Backend stopped: ${output}`);
    try{const r=await fetch(`http://127.0.0.1:${port}/api/session`);if(r.ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready,`Backend did not start: ${output}`);
  const url=`http://127.0.0.1:${port}`;
  const session=await (await fetch(`${url}/api/session`)).json();
  assert.equal(session.configured,true);assert.equal(session.authenticated,false);
  const html=await (await fetch(url)).text();assert.match(html,/id="root"/);
  const asset=html.match(/src="([^" ]+\.js)"/)?.[1];assert.ok(asset);
  assert.equal((await fetch(url+asset)).status,200);
  assert.equal((await fetch(url+'/manifest.webmanifest')).status,200);
  assert.equal((await fetch(url+'/api/teams')).status,401);
  assert.equal((await fetch(url+'/src/coach-state.ts')).status,404);
  assert.equal((await fetch(url+'/.env')).status,404);
  const wrongHost=await new Promise((resolve,reject)=>{
    const request=http.get(url,{headers:{Host:'wrong.example'}},response=>{response.resume();resolve(response.statusCode);});
    request.on('error',reject);
  });
  assert.equal(wrongHost,403);
  console.log(JSON.stringify({manifestFiles:manifest.length,runtimeModules:visited.size,productionSmoke:'passed',node:process.version,googleCalls:0}));
}finally{
  proc.kill();if(proc.exitCode===null)await once(proc,'exit');
}
