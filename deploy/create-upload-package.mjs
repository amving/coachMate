import {cpSync,copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const name=process.argv[2];
if(!/^coachmate-v\d+$/.test(name||''))throw new Error('Gebruik: node deploy/create-upload-package.mjs coachmate-v27');
const output=resolve(root,'outputs/deploy');
const target=join(output,name);
if(existsSync(target)||existsSync(`${target}.tar.gz`))throw new Error('Versiepakket bestaat al; kies een nieuwe versie.');
if(!existsSync(join(root,'dist/client/index.html')))throw new Error('Voer eerst npm run build uit.');
mkdirSync(target,{recursive:true});
const files=['Dockerfile','.dockerignore','package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts','mobile-runtime.lock.json'];
for(const file of files)copyFileSync(join(root,file),join(target,file));
for(const folder of ['src','server','public','scripts','worker','.openai'])cpSync(join(root,folder),join(target,folder),{recursive:true});
cpSync(join(root,'dist'),join(target,'dist'),{recursive:true});
mkdirSync(join(target,'tests'));
for(const file of readdirSync(join(root,'tests')).filter(file=>file.endsWith('.test.mjs')))copyFileSync(join(root,'tests',file),join(target,'tests',file));
mkdirSync(join(target,'docs'));
for(const file of ['load-recovery-v41.md','roster-touch-v40.md','goal-registration-v38.md','availability-v37.md','match-report-and-touch.md','response-audit.md','preparation-flow.md','reliability-2026-10-23.md','availability-implementation-tests.md','invitation-refinement.md','substitution-optimizer.md','substitution-phase-3.md'])copyFileSync(join(root,'docs',file),join(target,'docs',file));
for(const [source,destination] of [['deploy-cloud-shell.sh','deploy-cloud-shell.sh'],['test-cloud-shell.sh','test-cloud-shell.sh'],['package.gcloudignore','.gcloudignore'],['UPLOAD-LEESMIJ.md','LEESMIJ.md'],['verify-package.mjs','verify-package.mjs']]){
  writeFileSync(join(target,destination),readFileSync(join(root,'deploy',source),'utf8').replace(/\r\n/g,'\n'));
}
const entries=[];
function walk(folder){for(const entry of readdirSync(folder,{withFileTypes:true})){
  const file=join(folder,entry.name);
  if(entry.isSymbolicLink())throw new Error('Symlinks niet toegestaan');
  if(entry.isDirectory())walk(file);
  else{
    const name=relative(target,file).replaceAll('\\','/');
    if(/(^|\/)(?:\.env(?:\.|$)|Oauth|ClientSec|node_modules|debug\.log|client_secret)|\.(?:pem|key)$/i.test(name))throw new Error(`Verboden pakketbestand: ${name}`);
    if(/\.(?:mjs|ts|tsx|json|html|md|sh|gs)$/.test(name)&&/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(readFileSync(file,'utf8')))throw new Error(`Privesleutel in pakketbestand: ${name}`);
    entries.push(`${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${name}`);
  }
}}
walk(target);
writeFileSync(join(target,'SHA256SUMS'),entries.sort().join('\n')+'\n');
const smoke=spawnSync(process.execPath,['--experimental-strip-types',join(root,'deploy/verify-package.mjs'),target],{encoding:'utf8'});
process.stdout.write(smoke.stdout||'');process.stderr.write(smoke.stderr||'');
if(smoke.status!==0)throw new Error('Pakketcontrole mislukt');
const archive=spawnSync('tar',['-czf',`${target}.tar.gz`,'-C',output,name],{encoding:'utf8'});
if(archive.status!==0)throw new Error(archive.stderr||'Inpakken mislukt');
const hash=createHash('sha256').update(readFileSync(`${target}.tar.gz`)).digest('hex');
writeFileSync(`${target}.tar.gz.sha256`,`${hash}  ${name}.tar.gz\n`);
copyFileSync(join(target,'deploy-cloud-shell.sh'),join(output,`${name}-deploy-cloud-shell.sh`));
console.log(JSON.stringify({archive:`${target}.tar.gz`,sha256:hash,files:entries.length+1}));

