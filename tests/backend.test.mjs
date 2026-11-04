import {personalFormUrl,codeEntryFromTemplate,availabilityDefaultsFromTemplate} from '../src/form-links.ts';
import { importHistory } from '../server/history-import.mjs';
import { sourceProblem } from '../server/source-validation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { clubMigration } from '../server/clubs.mjs';
import { schema } from '../server/schema.mjs';
import { SheetsStore, loadTeam, stateTables, fingerprint } from '../server/sheets.mjs';
import { createAvailabilityForm, checkAvailabilityForm, readFormResponses, importResponses, formInvitations, connectPersonalLinks } from '../server/forms.mjs';
import { coachReducer, parseState, createTeamState, demoCatalog } from '../src/coach-state.ts';

function source() {
  const tables = Object.fromEntries(Object.keys(schema).map(k => [k, []]));
  tables.Seasons = [{ seasonId: '2026', name: '2026/27', archived: false }, { seasonId: '2027', name: '2027/28', archived: false }];
  tables.TeamSeasons = [{ teamSeasonId: 'a', seasonId: '2026', teamName: 'Team A', periods: 2, liveMatchId: 'match' }, { teamSeasonId: 'b', seasonId: '2027', teamName: 'Team B', periods: 4, liveMatchId: 'match' }];
  tables.Players = ['a', 'b'].flatMap(teamSeasonId => Array.from({length: 6}, (_, i) => ({teamSeasonId, playerId: `p${i}`, number: i + 1, name: `Speler ${i}`, shortName: `S${i}`, parent: '', position: '' })));
  tables.Matches = ['a','b'].map(teamSeasonId => ({ teamSeasonId, matchId: 'match', pool: 'P1', date: '21 september', shortDate: '21 sep', time: '10:00', opponent: 'Andere club', venue: 'Thuis' }));
  return { tables, token: fingerprint(tables) };
}
test('identical player and match IDs remain isolated across team seasons', () => {
  const snapshot = source(); const a = loadTeam(snapshot, 'a'); const b = loadTeam(snapshot, 'b');
  const scored = coachReducer(a.state, { type: 'goal', playerId: 'p0', now: 1000 });
  assert.equal(scored.live.goals.length, 1); assert.equal(b.state.live.goals.length, 0); assert.equal(b.state.team.periods, 4);
  const replacements = stateTables(snapshot, 'b', b.state, 1); Object.assign(snapshot.tables, replacements);
  Object.assign(snapshot.tables, stateTables(snapshot, 'a', scored, 1));
  assert.equal(loadTeam(snapshot, 'a').state.live.goals.length, 1); assert.equal(loadTeam(snapshot, 'b').state.live.goals.length, 0);
});
test('archived seasons cannot be modified by reducer', () => {
  const snapshot = source(); snapshot.tables.Seasons[0].archived = true;
  const { state } = loadTeam(snapshot, 'a');
  assert.deepEqual(coachReducer(state, { type: 'goal', playerId: 'p0', now: 1 }), state);
});
test('new roster and match rows are incorporated without changing existing statistics', () => {
  const snapshot = source(); const finished = coachReducer(loadTeam(snapshot,'a').state, { type:'finish', now:1 });
  Object.assign(snapshot.tables, stateTables(snapshot,'a',finished,1));
  snapshot.tables.Players.push({...snapshot.tables.Players[0],playerId:'new'});
  snapshot.tables.Matches.push({...snapshot.tables.Matches[0],matchId:'next'});
  snapshot.tables.TeamSeasons[0].liveMatchId='next';
  const state=loadTeam(snapshot,'a').state;
  assert.equal(state.live.goals.length,0); assert.equal(state.live.phase,'Spelen');
  assert.equal(state.stats.find(r=>r.playerId==='new').present,false);
  assert.equal(state.liveArchive.match.phase,'Einde');
  assert.doesNotThrow(()=>parseState(JSON.stringify(state)));
});
test('removing used IDs or switching an open match is rejected', () => {
  const snapshot=source(); Object.assign(snapshot.tables,stateTables(snapshot,'a',loadTeam(snapshot,'a').state,1));
  snapshot.tables.Matches.push({...snapshot.tables.Matches[0],matchId:'next'}); snapshot.tables.TeamSeasons[0].liveMatchId='next';
  assert.throws(()=>loadTeam(snapshot,'a'),/vorige wedstrijd/);
  snapshot.tables.Players=snapshot.tables.Players.filter(p=>!(p.teamSeasonId==='a'&&p.playerId==='p0'));
  assert.throws(()=>loadTeam(snapshot,'a'),/Verwijder geen/);
});
const form={teamSeasonId:'a',matchId:'match',round:1,formId:'f',codeQuestion:'code',statusQuestion:'status'};
const invites=[{formId:'f',playerId:'p0',code:'unpredictable-secret'}];
const response=(id,time='2026-09-20T12:00:00Z',code='unpredictable-secret')=>({responseId:id,lastSubmittedTime:time,answers:{code:{textAnswers:{answers:[{value:code}]}},status:{textAnswers:{answers:[{value:'Ja'}]}}}});
test('Forms import is idempotent and validates personal codes',()=>{
  const state=loadTeam(source(),'a').state;
  const first=importResponses(state,form,invites,[],[response('1'),response('2',undefined,'wrong')]);
  assert.equal(first.imported,1); assert.equal(first.state.availability.match.p0,'available');
  assert.equal(importResponses(first.state,form,invites,first.log,[response('1')]).imported,0);
});

test('response audit links distinct API and script IDs through verified player, form and millisecond timestamp',()=>{
 const state=loadTeam(source(),'a').state,res=response('api-id','2026-09-20T12:00:00.158995Z');
 const linked=[{...invites[0],responseId:'script-id',submittedAt:'2026-09-20T12:00:00.158Z'}];
 const before=structuredClone(linked),result=importResponses(state,form,linked,[],[res]);
 assert.deepEqual(result.log[0],{formId:'f',responseId:'api-id',updatedAt:res.lastSubmittedTime,result:'Verwerkt (1 wedstrijden)',teamSeasonId:'a',playerId:'p0',playerName:'Speler 0',round:1,appsScriptResponseId:'script-id'});
 assert.deepEqual(linked,before);assert.equal(result.imported,1);
 assert.equal(importResponses(result.state,form,linked,result.log,[res]).imported,0);
});

test('legacy response audit is enriched without replaying answers, changing manual precedence or replacing its original result',()=>{
 const state=loadTeam(source(),'a').state,res=response('api-id');
 state.availability.match.p0='unavailable';state.formUpdates={'match/p0':{manual:true,time:'2026-09-21T12:00:00Z'}};
 const old=[{formId:'other',responseId:'api-id',updatedAt:res.lastSubmittedTime,result:'Other team'}, {formId:'f',responseId:'api-id',updatedAt:res.lastSubmittedTime,result:'Verwerkt (6 wedstrijden)'}];
 const before=structuredClone(old),result=importResponses(state,form,[{...invites[0],responseId:'script-id',submittedAt:res.lastSubmittedTime}],old,[res]);
 assert.equal(result.imported,0);assert.deepEqual(result.state,state);assert.deepEqual(old,before);assert.deepEqual(result.log[0],old[0]);
 assert.equal(result.log[1].result,'Verwerkt (6 wedstrijden)');assert.equal(result.log[1].playerId,'p0');assert.equal(result.log[1].appsScriptResponseId,'script-id');
 assert.deepEqual(importResponses(state,form,invites,result.log,[res]).log,result.log);
});

test('response audit never joins by timestamp alone, stale timestamps, ambiguous codes or a foreign roster',()=>{
 const state=loadTeam(source(),'a').state,res=response('api-id');
 for(const linked of [
  [{...invites[0],responseId:'wrong-time',submittedAt:'2026-09-21T12:00:00Z'}],
  [{...invites[0],formId:'other',responseId:'wrong-form',submittedAt:res.lastSubmittedTime}],
  [{...invites[0],playerId:'foreign',responseId:'wrong-player',submittedAt:res.lastSubmittedTime}],
  [invites[0],{...invites[0],playerId:'p1'}]
 ]){const result=importResponses(state,form,linked,[],[res]);assert.equal(result.log[0].appsScriptResponseId,'');if(linked[0].responseId!=='wrong-time')assert.equal(result.log[0].playerId,'');}
 const unknown=importResponses(state,form,invites,[],[response('bad',undefined,'wrong')]);assert.equal(unknown.log[0].playerName,'');
 const pair=importResponses(state,form,[{...invites[0],responseId:'ambiguous-script',submittedAt:res.lastSubmittedTime}],[],[res,response('api-other')]);assert.ok(pair.log.every(r=>r.appsScriptResponseId===''));
});

test('edited responses keep the API deduplication key and cannot be relabeled by an older submission',()=>{
 const state=loadTeam(source(),'a').state,newer=response('api-id','2026-09-22T12:00:00Z');
 const linked=[{...invites[0],responseId:'script-id',submittedAt:newer.lastSubmittedTime}];
 const first=importResponses(state,form,linked,[],[newer]);
 assert.deepEqual(importResponses(first.state,form,linked,first.log,[response('api-id')]).log,first.log);
 const edited={...response('api-id','2026-09-23T12:00:00Z'),answers:{...newer.answers,status:{textAnswers:{answers:[{value:'Nee'}]}}}};
 const changed=importResponses(first.state,form,linked,first.log,[edited]);assert.equal(changed.log.length,1);assert.equal(changed.log[0].appsScriptResponseId,'');assert.equal(changed.state.availability.match.p0,'unavailable');
});
test('wrong match rounds and manual corrections cannot be overwritten by Forms',()=>{
  const state=loadTeam(source(),'a').state;
  const next=structuredClone(state); next.catalog.matches[0].availabilityRound=2;
  assert.equal(importResponses(next,form,invites,[],[response('1')]).imported,0);
  state.formUpdates={'match/p0':{manual:true,time:'2026-09-20T10:00:00Z'}};
  assert.equal(importResponses(state,form,invites,[],[response('1')]).imported,0);
});
test('out-of-order responses retain the newest answer',()=>{
  const state=loadTeam(source(),'a').state;
  const first=importResponses(state,form,invites,[],[response('1')]);
  assert.equal(importResponses(first.state,form,invites,first.log,[response('2','2026-09-19T12:00:00Z')]).imported,0);
});
test('empty team seasons parse without demo data',()=>{
  const state=createTeamState({...demoCatalog(),players:[],matches:[],liveMatchId:''});
  assert.doesNotThrow(()=>parseState(JSON.stringify(state))); assert.equal(state.stats.length,0);
});
test('Sheets detects changes before writing and writes literal values atomically',async()=>{
  const snapshot=source();
  snapshot.sheets=Object.fromEntries(Object.keys(schema).map((k,i)=>[k,{sheetId:i,gridProperties:{rowCount:1000}}]));
  snapshot.rowCounts={Seasons:5};
  const calls=[]; const store=new SheetsStore({request:async args=>{calls.push(args);return {data:{}};}},'test');
  store.read=async()=>snapshot;
  await assert.rejects(()=>store.write({...snapshot,token:'old',tables:{...snapshot.tables,Seasons:[]}},{Seasons:[]}),/bron is gewijzigd/);
  assert.equal(calls.length,0);
  await store.write(snapshot,{Seasons:[{seasonId:'x',name:'=IMPORTXML("bad")',archived:false}]});
  assert.equal(calls.length,1); assert.equal(calls[0].retry,false);
  assert.equal(calls[0].data.requests[0].updateCells.range.endRowIndex,5);
  assert.equal(calls[0].data.requests[0].updateCells.rows[1].values[1].userEnteredValue.stringValue,'=IMPORTXML("bad")');
});

test('Google Sheets batch reads use separate range parameters within grid bounds', async () => {
  const calls = [];
  const auth = { request: async options => {
    calls.push(options);
    if (calls.length === 1) return { data: { sheets: Object.keys(schema).map((title, sheetId) => ({ properties: { title, sheetId, gridProperties: { rowCount: 1000 } } })) } };
    return { data: { valueRanges: Object.values(schema).map(headers => ({ values: [headers] })) } };
  } };
  await new SheetsStore(auth, 'test').read();
  assert.equal(calls[1].params.getAll('ranges').length, Object.keys(schema).length);
  assert.equal(calls[1].params.getAll('ranges')[0], "'Seasons'!A1:C1000");
});


test('club migration preserves all team links, statistics, live history and other clubs', () => {
  const snapshot = source();
  let state = loadTeam(snapshot, 'a').state;
  state = coachReducer(state, {type:'toggle-clock',now:1000});
  state = coachReducer(state, {type:'finish',now:301000});
  state.formUpdates = {'match/p0':{manual:true,time:'2026-09-27T10:00:00Z'}};
  Object.assign(snapshot.tables, stateTables(snapshot, 'a', state, 3));
  snapshot.tables.Forms = [{...form}];
  snapshot.tables.FormInvites = [...invites];
  const before = structuredClone(snapshot.tables);
  const result = clubMigration(snapshot, 'a', {clubName:'HFC Edo',teamName:'JO10-2'});
  assert.equal(result.teamSeasonId, 'hfc-edo-jo10-2-2026');
  assert.deepEqual(snapshot.tables, before);
  Object.assign(snapshot.tables, result.replacements);
  const loaded = loadTeam(snapshot, result.teamSeasonId);
  assert.equal(loaded.state.catalog.clubName, 'HFC Edo');
  assert.equal(loaded.state.catalog.teamName, 'JO10-2');
  assert.deepEqual(loaded.state.stats, state.stats);
  assert.deepEqual(loaded.state.liveArchive, state.liveArchive);
  assert.deepEqual(loaded.state.formUpdates, state.formUpdates);
  assert.equal(loaded.revision, 4);
  for (const [name, headers] of Object.entries(schema)) {
    if (headers.includes('teamSeasonId')) {
      assert.equal(snapshot.tables[name].some(r=>r.teamSeasonId==='a'),false);
      assert.deepEqual(snapshot.tables[name].filter(r=>r.teamSeasonId==='b'),before[name].filter(r=>r.teamSeasonId==='b'));
    }
  }
  assert.deepEqual(snapshot.tables.FormInvites, before.FormInvites);
  const rename = clubMigration(snapshot,result.teamSeasonId,{clubName:'HFC EDO',teamName:'JO10-2'});
  assert.equal(rename.teamSeasonId,result.teamSeasonId);
});

test('club migration rejects collisions and archived seasons', () => {
  const snapshot=source();
  snapshot.tables.TeamSeasons.push({...snapshot.tables.TeamSeasons[1],teamSeasonId:'hfc-edo-jo10-2-2026'});
  assert.throws(()=>clubMigration(snapshot,'a',{clubName:'HFC Edo',teamName:'JO10-2'}),/bestaat al/);
  snapshot.tables.Seasons[0].archived=true;
  assert.throws(()=>clubMigration(snapshot,'a',{clubName:'HFC Edo',teamName:'JO10-2'}),/gearchiveerd/);
});


test('source validation rejects orphan rows, duplicate scoped IDs and wrong live match', () => {
  const snapshot = source();
  assert.equal(sourceProblem(snapshot.tables), null);
  snapshot.tables.Players.push({...snapshot.tables.Players[0]});
  assert.match(sourceProblem(snapshot.tables), /dubbele playerId/);
  snapshot.tables.Players.pop();
  snapshot.tables.Players[0].teamSeasonId = 'unknown';
  assert.match(sourceProblem(snapshot.tables), /bestaat niet/);
  snapshot.tables.Players[0].teamSeasonId = 'a';
  snapshot.tables.TeamSeasons[0].liveMatchId = 'wrong';
  assert.match(sourceProblem(snapshot.tables), /hoort niet bij dit team/);
});


test('historical import reverses away score, converts quarters, preserves unknown minutes and is idempotent', () => {
  const snapshot=source();
  snapshot.tables.TeamSeasons[0].liveMatchId='';
  const state=loadTeam(snapshot,'a').state;
  const row={...snapshot.tables.Matches[0],venue:'Uit',Stand:'3-7',Doelpuntenmakers:'S0 3x, S1 *4',Keepers:'S0 3x, S1',afwezig:'S2'};
  const result=importHistory(state,[row],{singleKeeperQuarter:true});
  assert.equal(result.imported,1);
  assert.equal(result.state.matchResults.match.goalsFor,7);
  assert.equal(result.state.matchResults.match.goalsAgainst,3);
  const keeper=result.state.stats.find(r=>r.playerId==='p0');
  assert.equal(keeper.keeperMinutes,37.5);
  assert.equal(keeper.minutesKnown,false);
  assert.equal(result.state.stats.find(r=>r.playerId==='p2').present,false);
  assert.equal(importHistory(result.state,[row],{singleKeeperQuarter:true}).imported,0);
  assert.throws(()=>importHistory(result.state,[{...row,Stand:'3-8'}],{singleKeeperQuarter:true}),/niet overschreven/);
  assert.equal(state.stats.length,0);
  const stored=stateTables(snapshot,'a',result.state,1).MatchStats.find(r=>r.playerId==='p0');
  assert.equal(stored.minutes,''); assert.equal(stored.minutesKnown,false); assert.equal(stored.keeperMinutes,37.5);
  assert.doesNotThrow(()=>parseState(JSON.stringify(result.state)));
});

test('historical import rejects unresolved names, inconsistent scores and keeper quarters atomically', () => {
  const snapshot=source(); snapshot.tables.TeamSeasons[0].liveMatchId='';
  const state=loadTeam(snapshot,'a').state;
  const row={...snapshot.tables.Matches[0],Stand:'1-0',Doelpuntenmakers:'S0 1x',Keepers:'',afwezig:'-'};
  const result=importHistory(state,[row]);
  assert.equal(result.state.stats[0].keeperMinutesKnown,false);
  assert.throws(()=>importHistory(state,[{...row,afwezig:'unknown'}]),/onbekend/);
  assert.throws(()=>importHistory(state,[{...row,Stand:'2-0'}]),/niet op/);
  assert.throws(()=>importHistory(state,[{...row,Keepers:'S0 3x'}]),/niet op tot 4/);
  assert.throws(()=>importHistory(state,[{...row,afwezig:'S0'}]),/Afwezige/);
  assert.equal(state.stats.length,0);
});

test('legacy Forms metadata upgrades without changing invitation identities', async () => {
  const tables=source().tables;
  tables.Forms=[{...form},{...form,teamSeasonId:'b',formId:'other'}];
  tables.FormInvites=[...invites];
  const calls=[];
  const auth={request:async request=>{
    calls.push(request);
    if(request.url.endsWith(':batchUpdate'))return {data:{}};
    if(request.url.endsWith('/values:batchGet'))return {data:{valueRanges:Object.entries(schema).map(([name,columns])=>{const headers=name==='Forms'?columns.slice(0,7):name==='FormInvites'?columns.slice(0,3):columns;return {values:[headers,...tables[name].map(row=>headers.map(key=>row[key]??''))]};})}};
    return {data:{sheets:Object.keys(schema).map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:100,columnCount:26}}}))}};
  }};
  const store=new SheetsStore(auth,'test'),snapshot=await store.read();
  assert.equal(snapshot.tables.Forms[0].codeEntryId,'');
  await store.write(snapshot,{Forms:snapshot.tables.Forms.map(row=>row.formId===form.formId?{...row,codeEntryId:'295629329'}:row)});
  const update=calls.at(-1).data.requests.find(r=>r.updateCells).updateCells;
  const values=update.rows.map(row=>row.values.map(cell=>cell.userEnteredValue.stringValue));
  assert.deepEqual(values[0],schema.Forms);
  assert.equal(values[1][7],'295629329');
  assert.equal(values[2][3],'other');
  assert.deepEqual(snapshot.tables.FormInvites,tables.FormInvites.map(row=>({...row,personalUrl:'',editUrl:'',responseId:'',submittedAt:'',mailSentAt:'',shortUrl:'',shortUrlSource:'',shortEditUrl:'',shortEditUrlSource:''})));
  assert.equal(calls.at(-1).data.requests.length,1);
});

test('legacy four-column response logs gain audit columns without changing original rows or other tables',async()=>{
 const tables=source().tables;tables.FormResponses=[{formId:'f',responseId:'api-id',updatedAt:'2026-09-20T12:00:00Z',result:'Verwerkt (6 wedstrijden)'},{formId:'foreign',responseId:'other-id',updatedAt:'2026-09-19T12:00:00Z',result:'Other team'}];
 const calls=[],auth={request:async request=>{calls.push(request);if(request.url.endsWith(':batchUpdate'))return {data:{}};if(request.url.endsWith('/values:batchGet'))return {data:{valueRanges:Object.entries(schema).map(([name,columns])=>{const headers=name==='FormResponses'?columns.slice(0,4):columns;return {values:[headers,...tables[name].map(row=>headers.map(key=>row[key]??''))]};})}};return {data:{sheets:Object.keys(schema).map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:100,columnCount:26}}}))}};}};
 const store=new SheetsStore(auth,'test'),snapshot=await store.read();assert.equal(snapshot.tables.FormResponses[0].playerId,'');
 const rows=snapshot.tables.FormResponses.map((row,i)=>i?row:{...row,teamSeasonId:'a',playerId:'p0',playerName:'Speler 0',round:1,appsScriptResponseId:'script-id'});
 await store.write(snapshot,{FormResponses:rows});const requests=calls.at(-1).data.requests;assert.equal(requests.length,1);
 const values=requests[0].updateCells.rows.map(r=>r.values.map(c=>c.userEnteredValue.stringValue??c.userEnteredValue.numberValue));
 assert.deepEqual(values[0],schema.FormResponses);assert.deepEqual(values[1].slice(0,4),Object.values(tables.FormResponses[0]));assert.equal(values[1][5],'p0');assert.deepEqual(values[2].slice(0,4),Object.values(tables.FormResponses[1]));
});

test('legacy MatchStats and empty unchecked season rows remain readable', async () => {
  const auth={request:async options => options.url.endsWith('/values:batchGet')
    ? {data:{valueRanges:Object.entries(schema).map(([name,headers])=>({values:name==='Seasons'?[headers,['2026','2026',false],['','',false]]:name==='MatchStats'?[headers.slice(0,8)]:[headers]}))}}
    : {data:{sheets:Object.keys(schema).map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:1000}}}))}}};
  const snapshot=await new SheetsStore(auth,'test').read();
  assert.equal(snapshot.tables.Seasons.length,1);
  assert.equal(snapshot.tables.MatchStats.length,0);
});


test('app match preparation updates TeamSeasons and State together without losing archived statistics',()=>{
 const snapshot=source();
 snapshot.tables.Matches.push({...snapshot.tables.Matches[0],matchId:'next'});
 const initial=loadTeam(snapshot,'a').state;
 const finished=coachReducer(initial,{type:'finish',now:1000});
 const next=coachReducer(finished,{type:'prepare-match',matchId:'next'});
 Object.assign(snapshot.tables,stateTables(snapshot,'a',next,2));
 assert.equal(snapshot.tables.TeamSeasons.find(t=>t.teamSeasonId==='a').liveMatchId,'next');
 assert.equal(snapshot.tables.TeamSeasons.find(t=>t.teamSeasonId==='b').liveMatchId,'match');
 const saved=loadTeam(snapshot,'a').state;
 assert.equal(saved.catalog.liveMatchId,'next');
 assert.equal(saved.live.elapsedMs,0);
 assert.equal(saved.stats.length,6);
 assert.ok(saved.liveArchive.match);
});

test('field size is stored per team season and survives shared Sheets reload',()=>{
 const snapshot=source();let a=loadTeam(snapshot,'a').state;const b=loadTeam(snapshot,'b').state;
 a=coachReducer(a,{type:'set-field-size',fieldSize:11,now:1000});Object.assign(snapshot.tables,stateTables(snapshot,'a',a,1));
 assert.equal(loadTeam(snapshot,'a').state.team.fieldSize,11);assert.equal(loadTeam(snapshot,'b').state.team.fieldSize,6);
 assert.equal(b.live.field.length,6);
});


test('new rounds persist matches and leave previous match answers and source data intact',()=>{
 const snapshot=source(); const original=loadTeam(snapshot,'a').state; original.availability.match.p0='available';
 const next=coachReducer(original,{type:'new-round',matches:[{...original.catalog.matches[0],id:'round2',date:'2026-10-10',availabilityRound:2}]});
 Object.assign(snapshot.tables,stateTables(snapshot,'a',next,1));
 const loaded=loadTeam(snapshot,'a').state;
 assert.equal(loaded.availability.match.p0,'available');assert.equal(loaded.availability.round2.p0,'pending');assert.equal(loaded.catalog.matches.find(m=>m.id==='round2').availabilityRound,2);
 assert.equal(snapshot.tables.Matches.filter(m=>m.teamSeasonId==='b').length,1);
 assert.equal(snapshot.tables.Availability.find(r=>r.matchId==='round2').round,2);
 assert.equal(importResponses(loaded,form,invites,[],[response('prior-round')]).imported,1);
});

test('one round Form asks every match and imports separately with manual and completed match protection',async()=>{
 let state=loadTeam(source(),'a').state;
 state=coachReducer(state,{type:'new-round',matches:['new1','new2','new3'].map(id=>({...state.catalog.matches[0],id,date:'2026-10-10',availabilityRound:2}))});
 const requests=[];const auth={request:async request=>{requests.push(request);return{data:requests.length===1?{formId:'round-form',responderUri:'https://forms.example'}:{replies:[{},...Array.from({length:4},(_,i)=>({createItem:{questionId:[`q${i}`]}}))]}};}};
 const created=await createAvailabilityForm(auth,state,2);
 assert.equal(requests.length,2);assert.equal(requests[1].data.requests.length,5);assert.equal(created.form.matchId,'');
 const questions=JSON.parse(created.form.statusQuestion);assert.deepEqual(Object.keys(questions),['new1','new2','new3']);
 state.formUpdates={'new2/p0':{manual:true,time:'2026-01-01T00:00:00Z'}};
 const answers={q0:{textAnswers:{answers:[{value:created.invites[0].code}]}},...Object.fromEntries(Object.values(questions).map((q,i)=>[q,{textAnswers:{answers:[{value:i===0?'Ja':'Nee'}]}}]))};
 const result=importResponses(state,created.form,created.invites,[],[{responseId:'round-response',lastSubmittedTime:'2026-10-01T12:00:00Z',answers}]);
 assert.equal(result.imported,2);assert.equal(result.state.availability.new1.p0,'available');assert.equal(result.state.availability.new2.p0,'pending');assert.equal(result.state.availability.new3.p0,'unavailable');assert.equal(result.state.availability.match.p0,'pending');
 const finished=coachReducer(result.state,{type:'save-stats',matchId:'new1',rows:result.state.catalog.players.map(p=>({matchId:'new1',playerId:p.id,present:false,minutes:0,keeperMinutes:0,goals:0}))});
 const newer=importResponses(finished,created.form,created.invites,[],[{responseId:'later',lastSubmittedTime:'2026-10-02T12:00:00Z',answers:{...answers,[questions.new1]:{textAnswers:{answers:[{value:'Nee'}]}}}}]);
 assert.equal(newer.state.availability.new1.p0,'available');
});


test('round numbers repeat safely across seasons, including identical player and match IDs',()=>{
 const snapshot=source();const a=loadTeam(snapshot,'a').state,b=loadTeam(snapshot,'b').state;
 const first=importResponses(a,form,invites,[],[response('season-a')]);assert.equal(first.imported,1);
 const wrong=importResponses(b,form,invites,[],[response('season-a')]);assert.equal(wrong.imported,0);assert.equal(wrong.state.availability.match.p0,'pending');
 const own=importResponses(b,{...form,teamSeasonId:'b'},invites,[],[response('season-b')]);assert.equal(own.imported,1);
 Object.assign(snapshot.tables,stateTables(snapshot,'a',first.state,1));Object.assign(snapshot.tables,stateTables(snapshot,'b',own.state,1));
 assert.equal(snapshot.tables.Availability.filter(row=>row.round===1&&row.playerId==='p0').length,2);
 assert.notEqual(snapshot.tables.Availability.find(row=>row.teamSeasonId==='a').seasonId,snapshot.tables.Availability.find(row=>row.teamSeasonId==='b').seasonId);
});


test('Matches accepts partial legacy columns, reordered headers and extra columns; saves preserve their cells',async()=>{
 for(const extra of [[],['','Stand'],['Stand'],['Stand','Keepers'],['Stand','Doelpuntenmakers','Keepers','Afwezig','Notitie']]) {
  const snapshot=source();const headers=[...schema.Matches.slice(0,8)].reverse().concat(extra);
  let calls=[];
  const auth={request:async request=>{calls.push(request);
   if(request.url.endsWith(':batchUpdate'))return{data:{}};
   if(!request.url.endsWith('/values:batchGet'))return{data:{sheets:Object.keys(schema).map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:100,columnCount:26}}}))}};
   return{data:{valueRanges:Object.entries(schema).map(([name,columns])=>({values:name==='Matches'?[headers,...snapshot.tables.Matches.map(row=>headers.map(key=>key==='Notitie'?'Formule blijft staan':row[key]??''))]:[columns,...snapshot.tables[name].map(row=>columns.map(key=>row[key]??''))]}))}};
  }};
  const store=new SheetsStore(auth,'test');const read=await store.read();assert.equal(read.tables.Matches[0].matchId,'match');assert.equal(read.tables.Matches[0].opponent,'Andere club');
  const next=coachReducer(loadTeam(read,'a').state,{type:'new-round',matches:[{...loadTeam(read,'a').state.catalog.matches[0],id:'new',date:'2026-10-10',availabilityRound:2}]});
  await store.write(read,stateTables(read,'a',next,1));
  const update=calls.at(-1).data.requests.filter(request=>request.updateCells?.range.sheetId===Object.keys(schema).indexOf('Matches')).map(request=>request.updateCells);
  assert.deepEqual(update[0].rows[0].values.slice(0,headers.length).map(cell=>cell.userEnteredValue.stringValue),headers);
  // Existing result/note/formula columns are never rewritten; additions go below existing rows.
  for(const cells of update.filter(cells=>cells.range.startRowIndex>0&&cells.range.startRowIndex<3)) {
   const column=cells.range.startColumnIndex;assert.ok(column>=headers.length || schema.Matches.slice(0,8).includes(headers[column]));
  }
  assert.ok(update.some(cells=>cells.range.startRowIndex===3));
 }
});


test('Form readiness reads publishing, validates every question and never writes', async()=>{
 const state=loadTeam(source(),'a').state;
 const document={responderUri:'https://docs.google.com/forms/d/e/parent/viewform',publishSettings:{publishState:{isPublished:true,isAcceptingResponses:true}},items:[{questionItem:{question:{questionId:'code',required:true,textQuestion:{}}}},{questionItem:{question:{questionId:'status',required:true,choiceQuestion:{type:'RADIO',options:[{value:'Ja'},{value:'Nee'}]}}}}]};
 const calls=[];const auth={request:async request=>{calls.push(request);return{data:document};}};
 const checked=await checkAvailabilityForm(auth,state,form);assert.equal(checked.published,true);assert.equal(checked.accepting,true);assert.deepEqual(checked.issues,[]);assert.equal(checked.url,document.responderUri);assert.ok(calls.every(call=>!call.method));
 document.publishSettings.publishState.isAcceptingResponses=false;assert.equal((await checkAvailabilityForm(auth,state,form)).accepting,false);
 delete document.publishSettings;assert.equal((await checkAvailabilityForm(auth,state,form)).published,null);
 document.items[1].questionItem.question.required=false;assert.match((await checkAvailabilityForm(auth,state,form)).issues.join(' '),/beschikbaarheidsvraag/);
 document.responderUri='https://untrusted.example/';assert.equal((await checkAvailabilityForm(auth,state,form)).url,'');
 await assert.rejects(()=>checkAvailabilityForm(auth,state,{...form,teamSeasonId:'b'}),/teamseizoen/);
 const roundForm={...form,matchId:'',statusQuestion:JSON.stringify({match:'status'})};
 state.catalog.matches.push({...state.catalog.matches[0],id:'late-added'});assert.match((await checkAvailabilityForm(auth,state,roundForm)).issues.join(' '),/Sheet/);
});

test('responses paginate, apply newest edits, report wrong codes and survive storage reload',async()=>{
 const pages=[{responses:[response('old')],nextPageToken:'next'},{responses:[{...response('new','2026-09-21T12:00:00Z'),answers:{...response('new').answers,status:{textAnswers:{answers:[{value:'Nee'}]}}}},response('bad',undefined,'wrong')]}];
 const calls=[];const responses=await readFormResponses({request:async request=>{calls.push(request);return{data:pages.shift()};}},'f');
 assert.equal(calls[1].params.pageToken,'next');assert.equal(responses.length,3);
 const snapshot=source();const imported=importResponses(loadTeam(snapshot,'a').state,form,invites,[],responses);
 assert.equal(imported.state.availability.match.p0,'unavailable');assert.equal(imported.invalidCodes,1);
 Object.assign(snapshot.tables,stateTables(snapshot,'a',imported.state,1));const reloaded=loadTeam(snapshot,'a').state;
 const repeat=importResponses(reloaded,form,invites,imported.log,responses);assert.equal(repeat.imported,0);assert.equal(repeat.invalidCodes,0);assert.deepEqual(repeat.log,imported.log);
 const manual=coachReducer(reloaded,{type:'availability-batch',matchId:'match',changes:{p0:'available'},now:1});manual.formUpdates['match/p0']={manual:true,time:'2026-09-22T00:00:00Z'};
 assert.equal(importResponses(manual,form,invites,imported.log,[response('newest','2026-09-23T00:00:00Z')]).imported,0);
});


test('Matches keeps empty spacer columns but identifies unnamed data and duplicate headers precisely',async()=>{
 const snapshot=source();let headers=[...schema.Matches.slice(0,8),'','Coachnotitie'];let spacer='';
 const auth={request:async request=>request.url.endsWith('/values:batchGet')?{data:{valueRanges:Object.entries(schema).map(([name,columns])=>({values:name==='Matches'?[headers,...snapshot.tables.Matches.map(row=>[...schema.Matches.slice(0,8).map(key=>row[key]??''),spacer,'Behouden'])]:[columns,...snapshot.tables[name].map(row=>columns.map(key=>row[key]??''))]}))}}:{data:{sheets:Object.keys(schema).map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:100,columnCount:26}}}))}}};
 const store=new SheetsStore(auth,'test');const read=await store.read();assert.equal(read.tableHeaders.Matches[8],'');assert.equal(read.tables.Matches[0].Coachnotitie,'Behouden');
 spacer='zonder kop';await assert.rejects(()=>store.read(),/kolomkoppen I/);spacer='';headers[8]='opponent';await assert.rejects(()=>store.read(),/opponent \(G, I\)/);
});


test('parent email is optional and header mapped; shared addresses never merge player identities',async()=>{
 const snapshot=source();snapshot.tables.Players=snapshot.tables.Players.map(p=>({...p,parentEmail:p.teamSeasonId==='a'?'parent@example.com':''}));
 for(const mode of ['legacy','after-parent','reordered']){
  const headers=mode==='legacy'?schema.Players.filter(k=>k!=='parentEmail'):mode==='after-parent'?['teamSeasonId','playerId','number','name','shortName','parent','parentEmail','position']:['parentEmail',...schema.Players.filter(k=>k!=='parentEmail').reverse(),'Coachnotitie'];
  const calls=[];const auth={request:async request=>{calls.push(request);if(request.url.endsWith(':batchUpdate'))return{data:{}};if(!request.url.endsWith('/values:batchGet'))return{data:{sheets:Object.keys(schema).map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:100,columnCount:26}}}))}};return{data:{valueRanges:Object.entries(schema).map(([name,columns])=>({values:name==='Players'?[headers,...snapshot.tables.Players.map(row=>headers.map(key=>key==='Coachnotitie'?'Formule behouden':row[key]??''))]:[columns,...snapshot.tables[name].map(row=>columns.map(key=>row[key]??''))]}))}};}};
  const store=new SheetsStore(auth,'test');const read=await store.read();const state=loadTeam(read,'a').state;assert.equal(state.catalog.players.length,6);assert.equal(state.catalog.players[0].parentEmail,mode==='legacy'?undefined:'parent@example.com');
  const renamed=read.tables.Players.map(p=>p.teamSeasonId==='a'?{...p,teamSeasonId:'a-renamed'}:p);await store.write(read,{Players:renamed});
  const updates=calls.at(-1).data.requests.filter(r=>r.updateCells?.range.sheetId===Object.keys(schema).indexOf('Players')).map(r=>r.updateCells);
  assert.deepEqual(updates[0].rows[0].values.slice(0,headers.length).map(cell=>cell.userEnteredValue.stringValue),headers);
  assert.ok(updates.slice(1).every(r=>headers[r.range.startColumnIndex]==='teamSeasonId'));assert.equal(updates.length,7);
 }
});


test('Aanwezig and Afwezig work alongside legacy answers without changing player or match identities',async()=>{
 const state=loadTeam(source(),'a').state;
 const replies=[];const auth={request:async request=>{replies.push(request);return{data:replies.length===1?{formId:'labels',responderUri:'https://docs.google.com/forms/d/e/labels/viewform'}:{replies:[{},{createItem:{questionId:['code']}},{createItem:{questionId:['status']}}]}};}};
 const created=await createAvailabilityForm(auth,state,1);const question=replies[1].data.requests[2].createItem.item.questionItem.question;assert.deepEqual(question.choiceQuestion.options,[{value:'Aanwezig'},{value:'Afwezig'}]);assert.equal(question.required,true);
 const doc={responderUri:'https://docs.google.com/forms/d/e/labels/viewform',publishSettings:{publishState:{isPublished:true,isAcceptingResponses:true}},items:[{questionItem:{question:{questionId:'code',required:true,textQuestion:{}}}},{questionItem:{question:{questionId:'status',...question}}}]};
 assert.deepEqual((await checkAvailabilityForm({request:async()=>({data:doc})},state,form)).issues,[]);
 let log=[],current=state;
 for(const [i,label] of ['Aanwezig','Afwezig','Ja','Nee'].entries()){
  const res=response('labels',`2026-10-0${i+1}T12:00:00Z`);res.answers.status.textAnswers.answers[0].value=label;
  const result=importResponses(current,form,invites,log,[res]);assert.equal(result.imported,1);assert.equal(result.state.availability.match.p0,i%2===0?'available':'unavailable');current=result.state;log=result.log;
 }
 const invalid=response('invalid','2026-10-10T12:00:00Z');invalid.answers.status.textAnswers.answers[0].value='toString';assert.equal(importResponses(current,form,invites,log,[invalid]).imported,0);
 assert.equal(importResponses(current,form,invites,log,[response('old','2026-09-01T12:00:00Z')]).imported,0);
 doc.items[1].questionItem.question.choiceQuestion.options=[{value:'Misschien'},{value:'Afwezig'}];assert.ok((await checkAvailabilityForm({request:async()=>({data:doc})},state,form)).issues.length);
});


test('personal start links are modelled per form/player, encoded and prefill attendance only after verified setup',()=>{
 const url='https://docs.google.com/forms/d/e/round-parent/viewform';const template=url+'?usp=pp_url&entry.12345=COACHMATE_CODE&entry.99=Aanwezig';
 const linked=connectPersonalLinks(form,{url,issues:[],matchCount:1},template);assert.equal(linked.codeEntryId,'12345');
 const rows=formInvitations([linked],[...invites,{formId:'f',playerId:'p1',code:'other'}, {formId:'other-form',playerId:'p0',code:'foreign'}]);assert.equal(rows.length,2);assert.notEqual(rows[0].personalUrl,rows[1].personalUrl);
 const parsed=new URL(rows[0].personalUrl);assert.equal(parsed.searchParams.get('entry.12345'),invites[0].code);assert.deepEqual([...parsed.searchParams.keys()],['usp','entry.12345','entry.99']);assert.equal(rows[0].code,invites[0].code);
 assert.equal(parsed.searchParams.get('entry.99'),'Aanwezig');assert.equal(codeEntryFromTemplate(template.split('&entry.99')[0],url),'12345');assert.equal(new URL(personalFormUrl(url,'12345','x&entry.9=Ja')).searchParams.get('entry.12345'),'x&entry.9=Ja');
 for(const bad of [template.replace('/round-parent/','/foreign/'),template+'&entry.99=Aanwezig',template.replace('COACHMATE_CODE','secret'),template.replace('https:','http:'),template.replace('docs.google.com','docs.google.com.evil.example')])assert.throws(()=>availabilityDefaultsFromTemplate(bad,url,1));
 assert.equal(personalFormUrl(url,'','x'),'');assert.equal(personalFormUrl('https://evil.example','12345','x'),'');assert.throws(()=>connectPersonalLinks(form,{url,issues:['Formulier gewijzigd']},template),/gewijzigd/);
});

test('only a complete submitted response is applied; saved drafts and incomplete edits do not affect availability',()=>{
 let state=loadTeam(source(),'a').state;state=coachReducer(state,{type:'new-round',matches:['n1','n2'].map(id=>({...state.catalog.matches[0],id,date:'2026-10-10',availabilityRound:2}))});
 const roundForm={...form,matchId:'',round:2,statusQuestion:JSON.stringify({n1:'s1',n2:'s2'})};
 const answers={code:{textAnswers:{answers:[{value:invites[0].code}]}},s1:{textAnswers:{answers:[{value:'Aanwezig'}]}},s2:{textAnswers:{answers:[{value:'Afwezig'}]}}};
 const draft={responseId:'r',answers};assert.equal(importResponses(state,roundForm,invites,[],[draft]).imported,0);
 const incomplete={...draft,lastSubmittedTime:'2026-10-01T12:00:00Z',answers:{code:answers.code,s1:answers.s1}};const rejected=importResponses(state,roundForm,invites,[],[incomplete]);assert.equal(rejected.imported,0);assert.deepEqual(rejected.state.availability,state.availability);assert.match(rejected.log[0].result,/Onvolledig/);
 const first=importResponses(state,roundForm,invites,[],[{...draft,lastSubmittedTime:'2026-10-01T13:00:00Z'}]);assert.equal(first.imported,2);assert.equal(first.state.availability.n1.p0,'available');assert.equal(first.state.availability.n2.p0,'unavailable');
 const nextAnswers=structuredClone(answers);nextAnswers.s1.textAnswers.answers[0].value='Afwezig';
 const noSubmission=importResponses(first.state,roundForm,invites,first.log,[{...draft,answers:nextAnswers}]);assert.deepEqual(noSubmission.state.availability,first.state.availability);
 const submitted={...draft,answers:nextAnswers,lastSubmittedTime:'2026-10-02T12:00:00Z'};const updated=importResponses(first.state,roundForm,invites,first.log,[submitted]);assert.equal(updated.state.availability.n1.p0,'unavailable');assert.equal(updated.log.length,1);assert.equal(importResponses(updated.state,roundForm,invites,updated.log,[submitted]).imported,0);
});


test('round preparation writes existing and added source matches while preserving other team seasons and coach columns',()=>{
 const snapshot=source();snapshot.tables.Matches[0].coachNote='keep this note';
 const loaded=loadTeam(snapshot,'a'),base=loaded.state;const rows=[{id:'round-two',pool:'P2',date:'2030-11-10',shortDate:'10 nov',time:'11:00',opponent:'New club',venue:'Uit',availabilityRound:2}];
 const next=coachReducer(base,{type:'save-round-matches',round:2,matches:rows});assert.notEqual(next,base);
 const other=structuredClone(snapshot.tables.Matches.filter(m=>m.teamSeasonId==='b'));
 const replacements=stateTables(snapshot,'a',next,2);Object.assign(snapshot.tables,replacements);
 assert.deepEqual(snapshot.tables.Matches.filter(m=>m.teamSeasonId==='b'),other);assert.equal(snapshot.tables.Matches.find(m=>m.teamSeasonId==='a'&&m.matchId==='match').coachNote,'keep this note');assert.equal(snapshot.tables.Matches.filter(m=>m.teamSeasonId==='a'&&m.matchId==='round-two').length,1);
 const reloaded=loadTeam(snapshot,'a').state;assert.equal(reloaded.catalog.matches.find(m=>m.id==='round-two').availabilityRound,2);assert.ok(Object.values(reloaded.availability['round-two']).every(s=>s==='pending'));
});
