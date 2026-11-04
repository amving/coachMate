import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export function validateReleaseInput({release,confirmation,branch,ref,event}) {
  if(event!=='workflow_dispatch'||confirmation!=='DEPLOY')throw new Error('Production requires an explicit manual DEPLOY confirmation.');
  if(!/^v[1-9][0-9]*$/.test(release??''))throw new Error('Use an existing release tag such as v42.');
  if(!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch??'')||branch.includes('..')||ref!==`refs/heads/${branch}`)throw new Error('Start deployment from the default branch.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const {RELEASE_TAG:release,DEPLOY_CONFIRMATION:confirmation,DEFAULT_BRANCH:branch,GITHUB_REF:ref,GITHUB_EVENT_NAME:event}=process.env;
  validateReleaseInput({release,confirmation,branch,ref,event});
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
  const sha=git('rev-parse','--verify',`refs/tags/${release}^{commit}`);
  git('merge-base','--is-ancestor',sha,`refs/remotes/origin/${branch}`);
  git('checkout','--detach',sha);
  if(!process.env.GITHUB_OUTPUT)throw new Error('GitHub output file missing.');
  appendFileSync(process.env.GITHUB_OUTPUT,`sha=${sha}\n`);
  console.log(`Reviewed release: ${release} (${sha})`);
}
