import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
function sourceFiles(){
 const paths=['.gitignore','.gitattributes','.dockerignore','.env.example','.npmrc','AGENTS.md','README.md','design-qa.md','Dockerfile','index.html','mobile-runtime.lock.json','package.json','package-lock.json','playwright.config.ts','playwright.device.config.ts','playwright.preview.config.ts','tsconfig.json','vite.config.ts'].filter(existsSync);
 const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isSymbolicLink())throw new Error(`Unexpected source symlink: ${path}`);if(entry.isDirectory())walk(path);else paths.push(path);}};
 for(const dir of ['.github','.openai','deploy','docs','public','scripts','server','src','tests','worker'])if(existsSync(dir))walk(dir);
 return paths;
}
const local=process.argv.includes('--source-files');
const paths=local?sourceFiles():execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=/(^|\/)(?:node_modules|dist|outputs|ClientSec|Oauth|\.pnpm-store|test-results|playwright-report)(\/|$)|(^|\/)\.env(?:\.|$)|(^|\/)gha-creds-|\.(?:pem|key|p12|pfx|xlsx|csv|log)$|(^|\/)client_secret[^/]*\.json$/i;
const secrets=[/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,/GOCSPX-[A-Za-z0-9_-]{15,}/,/gh[pousr]_[A-Za-z0-9]{25,}/,/github_pat_[A-Za-z0-9_]{30,}/,/"private_key"\s*:\s*"[^"\s]+/];
let failed=false;
for(const path of paths){
 if(path!=='.env.example'&&forbidden.test(path)){console.error(`Excluded local file is tracked: ${path}`);failed=true;continue;}
 if((/\.(?:[cm]?js|tsx?|json|md|ya?ml|sh|html)$/.test(path)||['.env.example','.npmrc'].includes(path))&&secrets.some(pattern=>pattern.test(readFileSync(path,'utf8')))){console.error(`Credential-like content in: ${path}`);failed=true;}
}
if(failed)process.exit(1);
console.log(`Repository content check passed (${paths.length} ${local?'candidate source':'tracked'} files).`);
