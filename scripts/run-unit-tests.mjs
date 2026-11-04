import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const tests=readdirSync(new URL('../tests/',import.meta.url)).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>`tests/${f}`);
const result=spawnSync(process.execPath,['--experimental-strip-types','--test',...tests],{stdio:'inherit',cwd:new URL('../',import.meta.url)});
if(result.error)throw result.error;
process.exitCode=result.status??1;
