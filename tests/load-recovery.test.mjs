import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamState,demoCatalog,coachReducer,parseState,validateRows,STORAGE_KEY} from '../src/coach-state.ts';
import {journalKey,readJournal,archiveConfirmedJournal,rebuildJournal,storeRebuiltJournal,recoveryStorage} from '../src/local-cache.ts';

function memory(entries=[]){const map=new Map(entries);return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size;}};}
function fixture(){
 const base=createTeamState(demoCatalog(),4,6),account='coach@example.test',team=base.catalog.teamSeasonId;
 const actions=[{type:'toggle-clock',now:1000},{type:'goal',playerId:base.live.field[1],now:61000},{type:'finish',now:121000}];
 const draft={version:1,id:'original-batch',account,teamSeasonId:team,revision:7,sourceToken:'exact-original-source',actions,attempted:true,state:{...base,version:999}};
 const raw=JSON.stringify(draft),storage=memory([[journalKey(account,team),raw]]);
 return {base,account,team,draft,raw,storage};
}
test('a valid integer-millisecond target remains readable after minute conversion and JSON serialization',()=>{
 let s=coachReducer(createTeamState(demoCatalog(),4,6),{type:'finish',now:0});
 for(const ms of [59,61,63,118,119,1666669,2999999]){
  s.stats[0].targetMinutes=ms/60000;
  assert.doesNotThrow(()=>parseState(JSON.stringify(s)));
  assert.equal(parseState(JSON.stringify(s)).stats[0].targetMinutes,ms/60000);
 }
 for(const invalid of [59.5/60000,-1,121,Infinity,NaN]){s.stats[0].targetMinutes=invalid;assert.equal(validateRows(s.stats,s.catalog.liveMatchId,s.catalog),false);}
});
test('invalid statistics identify the match while preserving malformed input verbatim',()=>{
 const s=coachReducer(createTeamState(demoCatalog(),4,6),{type:'finish',now:0});s.stats[0].minutes=-1;
 const raw=JSON.stringify(s);assert.throws(()=>parseState(raw),new RegExp(s.catalog.matches.find(m=>m.id===s.catalog.liveMatchId).opponent));assert.equal(JSON.stringify(s),raw);
 assert.throws(()=>parseState('null'),/wedstrijdgegevens ontbreken/);
});
test('an unreadable local snapshot is reconstructed as a preview from exact source and original events',()=>{
 const f=fixture(),before=JSON.stringify(f.base);assert.throws(()=>readJournal(f.storage,f.account,f.team));
 const restored=rebuildJournal(f.storage,f.account,f.team,f.base,7,'exact-original-source');
 assert.equal(restored.id,f.draft.id);assert.equal(restored.attempted,true);assert.deepEqual(restored.actions,f.draft.actions);
 assert.equal(restored.state.live.phase,'Einde');assert.equal(restored.state.live.elapsedMs,120000);assert.equal(restored.state.live.goals[0].minute,1);
 assert.equal(JSON.stringify(f.base),before);assert.equal(f.storage.getItem(journalKey(f.account,f.team)),f.raw);assert.equal(f.storage.length,1);
 assert.doesNotThrow(()=>parseState(JSON.stringify(restored.state)));
});
test('reconstruction rejects changed source, other account/team, archived season and invalid actions',()=>{
 const f=fixture();
 for(const [rev,token] of [[8,'exact-original-source'],[7,'different']])assert.throws(()=>rebuildJournal(f.storage,f.account,f.team,f.base,rev,token),/bron is gewijzigd/);
 assert.throws(()=>rebuildJournal(f.storage,'other',f.team,f.base,7,'exact-original-source'),/Geen lokaal/);
 const archived=structuredClone(f.base);archived.catalog.archived=true;assert.throws(()=>rebuildJournal(f.storage,f.account,f.team,archived,7,'exact-original-source'),/actief teamseizoen/);
 const other=structuredClone(f.base);other.catalog.teamSeasonId='other';assert.throws(()=>rebuildJournal(f.storage,f.account,f.team,other,7,'exact-original-source'),/actief teamseizoen/);
 const confirmed={...f.base,committedBatches:[f.draft.id]};assert.throws(()=>rebuildJournal(f.storage,f.account,f.team,confirmed,7,'exact-original-source'),/al bevestigd/);
 f.storage.setItem(journalKey(f.account,f.team),JSON.stringify({...f.draft,actions:[{type:'replace',state:f.base}]}));
 assert.throws(()=>rebuildJournal(f.storage,f.account,f.team,f.base,7,'exact-original-source'),/Onbekende conceptactie/);
});
test('explicit restoration backs up original raw bytes before replacing the snapshot, retaining batch identity',()=>{
 const f=fixture(),restored=rebuildJournal(f.storage,f.account,f.team,f.base,7,'exact-original-source');
 storeRebuiltJournal(f.storage,restored,f.raw);
 assert.equal(f.storage.getItem(journalKey(f.account,f.team)+':backup:original-batch:before-rebuild'),f.raw);
 assert.equal(readJournal(f.storage,f.account,f.team).id,f.draft.id);
 assert.deepEqual(readJournal(f.storage,f.account,f.team).actions,f.draft.actions);
 const changed=JSON.stringify({...restored,id:'newer'});f.storage.setItem(journalKey(f.account,f.team),changed);
 assert.throws(()=>storeRebuiltJournal(f.storage,restored,f.raw),/intussen gewijzigd/);assert.equal(f.storage.getItem(journalKey(f.account,f.team)),changed);
});
test('a backup write failure never replaces or deletes the unreadable original',()=>{
 const f=fixture(),restored=rebuildJournal(f.storage,f.account,f.team,f.base,7,'exact-original-source');
 const locked={getItem:f.storage.getItem,setItem:()=>{throw new Error('quota');}};
 assert.throws(()=>storeRebuiltJournal(locked,restored,f.raw),/quota/);assert.equal(f.storage.getItem(journalKey(f.account,f.team)),f.raw);
});
test('recovery export includes raw scoped journal and backups, never another account or unrelated storage',()=>{
 const f=fixture(),key=journalKey(f.account,f.team);
 f.storage.setItem(key,'not JSON');f.storage.setItem(key+':backup:old','original bytes');f.storage.setItem(STORAGE_KEY,'legacy bytes');
 f.storage.setItem(journalKey('other@example.test',f.team),'other person');f.storage.setItem('unrelated-private-key','secret');
 assert.deepEqual(recoveryStorage(f.storage,f.account,f.team),{[key]:'not JSON',[key+':backup:old']:'original bytes',[STORAGE_KEY]:'legacy bytes'});
 assert.equal(f.storage.getItem(key),'not JSON');
});
test('a confirmed batch with an unreadable snapshot is backed up before retiring it without replay',()=>{
 const f=fixture(),key=journalKey(f.account,f.team),latest={...f.base,committedBatches:[f.draft.id]};
 assert.equal(archiveConfirmedJournal(f.storage,f.account,f.team,f.base),false);assert.equal(f.storage.length,1);
 assert.equal(archiveConfirmedJournal(f.storage,f.account,f.team,latest),true);
 assert.equal(f.storage.getItem(key),null);assert.equal(f.storage.getItem(key+':backup:original-batch:confirmed'),f.raw);
 assert.equal(archiveConfirmedJournal(f.storage,f.account,f.team,latest),false);
});
test('a confirmed batch is retained when its backup fails or its team does not match',()=>{
 const f=fixture(),latest={...f.base,committedBatches:[f.draft.id]};
 const locked={...f.storage,setItem:()=>{throw new Error('quota');}};
 assert.throws(()=>archiveConfirmedJournal(locked,f.account,f.team,latest),/quota/);
 const other=structuredClone(latest);other.catalog.teamSeasonId='other';
 assert.throws(()=>archiveConfirmedJournal(f.storage,f.account,f.team,other),/ander team/);
 assert.equal(f.storage.getItem(journalKey(f.account,f.team)),f.raw);
});
