import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReleaseInput} from '../scripts/verify-github-release.mjs';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const valid={release:'v42',confirmation:'DEPLOY',branch:'main',ref:'refs/heads/main',event:'workflow_dispatch'};
test('production requires deliberate manual approval on the default branch',()=>{
 assert.doesNotThrow(()=>validateReleaseInput(valid));
 assert.doesNotThrow(()=>validateReleaseInput({...valid,branch:'master',ref:'refs/heads/master'}));
 for(const patch of [{confirmation:''},{confirmation:'deploy'},{event:'push'},{event:'pull_request'},{ref:'refs/heads/feature'},{ref:'refs/tags/v42'},{branch:'../main'},{release:'main'},{release:'v42;echo secret'},{release:'v0'},{release:'--help'}])assert.throws(()=>validateReleaseInput({...valid,...patch}));
});
test('release selection checks out the tagged commit only when it is part of the default branch',()=>{
 const root=mkdtempSync(join(tmpdir(),'coachmate-release-'));
 try{
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','--initial-branch=main');git('config','user.name','Release Test');git('config','user.email','test@example.invalid');
  writeFileSync(join(root,'source.txt'),'reviewed');git('add','source.txt');git('commit','-m','Reviewed');git('tag','v42');
  const reviewed=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',reviewed);
  git('checkout','-b','unreviewed');writeFileSync(join(root,'source.txt'),'unreviewed');git('commit','-am','Unreviewed');git('tag','v43');
  const run=release=>spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/verify-github-release.mjs',import.meta.url))],{cwd:root,encoding:'utf8',env:{...process.env,RELEASE_TAG:release,DEPLOY_CONFIRMATION:'DEPLOY',DEFAULT_BRANCH:'main',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_OUTPUT:join(root,'output')}});
  assert.notEqual(run('v43').status,0);assert.equal(readFileSync(join(root,'source.txt'),'utf8'),'unreviewed');
  const selected=run('v42');assert.equal(selected.status,0,selected.stderr);assert.equal(git('rev-parse','HEAD'),reviewed);
  assert.equal(readFileSync(join(root,'output'),'utf8'),`sha=${reviewed}\n`);
 }finally{rmSync(root,{recursive:true,force:true});}
});
