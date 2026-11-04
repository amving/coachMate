import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveStatic } from '../server/static.mjs';

test('public files are served while auth, dotfiles and traversal remain inaccessible', async () => {
  const root=await mkdtemp(join(tmpdir(),'coachmate-static-'));
  try {
    await writeFile(join(root,'index.html'),'<h1>CoachMate</h1>');
    await writeFile(join(root,'.env'),'secret');
    const request=async url=>{
      const result={status:0,body:''};
      result.handled=await serveStatic({url,method:'GET'},{writeHead(status){result.status=status;},end(body){result.body=body?.toString()??'';}},root);
      return result;
    };
    assert.equal((await request('/')).body,'<h1>CoachMate</h1>');
    for(const path of ['/.env','/%2eenv','/..%2f.env','/..%5c.env','/missing.js']) assert.equal((await request(path)).status,404);
    assert.equal((await request('/api/state')).handled,false);
    assert.equal((await request('/auth/login')).handled,false);
  } finally { await rm(root,{recursive:true,force:true}); }
});
