import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,demoCatalog,parseState} from '../src/coach-state.ts';
import {applyActionBatch} from '../src/action-batch.ts';
import {readJournal,journalKey} from '../src/local-cache.ts';

function seed(){const s=createInitialState();s.catalog=demoCatalog();s.live={...s.live,elapsedMs:0,periodTimes:{},runningSince:null,breakSince:null,breakMs:0,goals:[],awayGoals:[],swaps:[],played:Object.fromEntries(s.catalog.players.map(p=>[p.id,{milliseconds:0,keeperMilliseconds:0}]))};return s;}
test('delayed upload replays original playing/rest times and scorer without counting upload delay',()=>{
 const s=seed();const a=[{type:'toggle-clock',now:1000},{type:'goal',playerId:'p01',now:61000},{type:'phase',now:121000},{type:'phase',now:181000},{type:'toggle-clock',now:241000}];
 const next=applyActionBatch(s,a,999000);
 assert.equal(next.live.elapsedMs,180000);assert.equal(next.live.breakMs,60000);assert.equal(next.live.runningSince,null);assert.equal(next.live.goals.length,1);assert.equal(next.live.played.p01.milliseconds,180000);assert.equal(s.live.goals.length,0);
});
test('invalid batch is rejected without changing its base, and arbitrary state replacement is excluded',()=>{
 const s=seed(), before=JSON.stringify(s);assert.throws(()=>applyActionBatch(s,[{type:'goal',playerId:'p01',now:1000},{type:'replace',state:{}}],5000));assert.equal(JSON.stringify(s),before);
 assert.throws(()=>applyActionBatch(s,[{type:'toggle-clock',now:3000},{type:'phase',now:2000}],5000));assert.throws(()=>applyActionBatch(s,[{type:'toggle-clock',now:1000000}],5000));
});
test('journal and upload receipts are isolated by account and stable team-season',()=>{
 const state=seed();state.committedBatches=['saved-id'];assert.deepEqual(parseState(JSON.stringify(state)).committedBatches,['saved-id']);
 const data={version:1,id:'draft-id',account:'a@example',teamSeasonId:state.catalog.teamSeasonId,revision:3,sourceToken:'token',state,actions:[{type:'goal',playerId:'p01',now:1000}]};
 const values=new Map([[journalKey(data.account,data.teamSeasonId),JSON.stringify(data)]]);const storage={getItem:key=>values.get(key)??null};
 assert.equal(readJournal(storage,data.account,data.teamSeasonId).id,'draft-id');assert.equal(readJournal(storage,'other@example',data.teamSeasonId),null);assert.equal(readJournal(storage,data.account,'other-season'),null);
 values.set(journalKey(data.account,'other-season'),JSON.stringify(data));assert.throws(()=>readJournal(storage,data.account,'other-season'));
});
