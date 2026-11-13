import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamState,demoCatalog,coachReducer,parseState,totalGoals,teamMatchMinutes,unknownMatchDurationCount,recordedMatchResult,individualStatsRows} from '../src/coach-state.ts';
import {parseScoreEvents,validateResultOnly,processedMatchIds,seasonGoalRows,scoreEventsText} from '../src/result-only.ts';
import {applyActionBatch} from '../src/action-batch.ts';
import {loadTeam,stateTables} from '../server/sheets.mjs';
import {schema} from '../server/schema.mjs';
import {importHistory} from '../server/history-import.mjs';
import {importResponses} from '../server/forms.mjs';
function fixture(){const c=demoCatalog();c.matches=c.matches.map(m=>({...m,availabilityRound:2}));const s=createTeamState(c,4,6);s.stats=[];return s;}
const result=(s,text='0-3\n1-3 Mats\n2-3 Mats\n3-3 Siem\n3-4\n4-4 Jayden')=>({goalsFor:4,goalsAgainst:4,events:parseScoreEvents(text,s.catalog)});
const action=(s,r=result(s))=>({type:'save-result',matchId:s.catalog.matches[0].id,result:r,expected:null});
test('result-only records contain only supplied scores/events and survive Sheets state round trips',()=>{
 const s=fixture(),before=structuredClone(s),a=action(s),next=applyActionBatch(s,[a]);
 assert.deepEqual(next.resultOnly[a.matchId],a.result);assert.equal(a.result.events.length,6);assert.deepEqual(a.result.events[0],{scoreFor:0,scoreAgainst:3,playerId:null,minute:null,ownGoal:false});
 for(const key of Object.keys(before))assert.deepEqual(next[key],before[key],key);
 assert.equal(next.stats.length,0);assert.equal(totalGoals(next),4);assert.equal(processedMatchIds(next).size,1);assert.equal(teamMatchMinutes(next),0);assert.equal(unknownMatchDurationCount(next),1);assert.deepEqual(individualStatsRows(next),[]);
 assert.equal(seasonGoalRows(next).find(r=>r.playerId==='p02').goals,2);assert.deepEqual(recordedMatchResult(next,a.matchId),{goalsFor:4,goalsAgainst:4});
 const tables=Object.fromEntries(Object.keys(schema).map(k=>[k,[]]));tables.Seasons=[{seasonId:s.catalog.seasonId,name:s.catalog.seasonName,archived:false}];tables.TeamSeasons=[{teamSeasonId:s.catalog.teamSeasonId,seasonId:s.catalog.seasonId,teamName:s.catalog.teamName,periods:4,liveMatchId:s.catalog.liveMatchId}];tables.Players=s.catalog.players.map(p=>({...p,playerId:p.id,teamSeasonId:s.catalog.teamSeasonId}));tables.Matches=s.catalog.matches.map(m=>({...m,matchId:m.id,teamSeasonId:s.catalog.teamSeasonId}));const snapshot={tables};
 const replacements=stateTables(snapshot,s.catalog.teamSeasonId,next,3);assert.equal(replacements.MatchStats.length,0);Object.assign(tables,replacements);const loaded=loadTeam(snapshot,s.catalog.teamSeasonId);assert.deepEqual(loaded.state.resultOnly,next.resultOnly);assert.equal(loaded.revision,3);assert.equal(loaded.state.stats.length,0);
});
test('duplicate registration is idempotent; correction requires the reviewed prior result',()=>{
 const s=fixture(),a=action(s),next=coachReducer(s,a);assert.equal(coachReducer(next,a),next);
 const correction={...a,result:{goalsFor:0,goalsAgainst:0,events:[]}};assert.equal(coachReducer(next,correction),next);assert.throws(()=>applyActionBatch(next,[correction]),/gewijzigd/);
 const corrected=coachReducer(next,{...correction,expected:JSON.stringify(a.result)});assert.equal(corrected.resultOnly[a.matchId].goalsFor,0);assert.equal(processedMatchIds(corrected).size,1);
 for(const type of ['availability','availability-batch'])assert.equal(coachReducer(next,{type,matchId:a.matchId,playerId:'p01',value:'available',changes:{p01:'available'}}),next);
 assert.equal(coachReducer(next,{type:'prepare-match',matchId:a.matchId}),next);
 const archived=structuredClone(next);archived.catalog.archived=true;assert.equal(coachReducer(archived,{...correction,expected:JSON.stringify(a.result)}),archived);
});
test('reject conflicting, foreign or malformed registrations without overwriting existing data',()=>{
 const s=fixture(),a=action(s);
 for(const mutate of [r=>{r.goalsFor=5},r=>{r.events[2].scoreFor=0},r=>{r.events[1].playerId='foreign'},r=>{r.events[0].minute=-1},r=>{r.events[0].playerId='p01'},r=>{r.events[1].scoreFor=2},r=>{r.events[1].minute=5;r.events[2].minute=4}]){const r=structuredClone(a.result);mutate(r);assert.equal(validateResultOnly(r,s.catalog),false);assert.equal(coachReducer(s,{...a,result:r}),s);}
 for(const field of ['stats','matchResults','liveArchive']){const existing=structuredClone(s);if(field==='stats')existing.stats=[{matchId:a.matchId}];else existing[field]={[a.matchId]:{}};assert.equal(coachReducer(existing,a),existing);}
 assert.equal(coachReducer(s,{...a,matchId:s.catalog.liveMatchId}),s);assert.equal(coachReducer(s,{...a,matchId:'foreign'}),s);
 const overlapping=coachReducer(s,a);overlapping.stats=[{matchId:a.matchId}];assert.throws(()=>parseState(JSON.stringify(overlapping)),/dubbele verwerking/);
 assert.throws(()=>importHistory(coachReducer(s,a),[{teamSeasonId:s.catalog.teamSeasonId,matchId:a.matchId,Stand:'4-4',venue:'Thuis'}]),/niet overschreven/);
});
test('score-only, optional minutes and own goals preserve unknowns and player totals',()=>{
 const s=fixture(),r={goalsFor:2,goalsAgainst:1,events:parseScoreEvents("1-0 Mats '5\n1-1 Siem (e.d.)\n2-1 (e.d.)",s.catalog)};
 assert.ok(validateResultOnly(r,s.catalog));assert.equal(r.events[0].minute,5);assert.equal(r.events[1].minute,null);assert.equal(scoreEventsText(r,s.catalog),"1-0 Mats '5\n1-1 Siem (e.d.)\n2-1 (e.d.)");
 const next=coachReducer(s,action(s,r));assert.equal(totalGoals(next),2);assert.equal(seasonGoalRows(next).find(r=>r.playerId==='p04').goals,0);assert.equal(seasonGoalRows(next).find(r=>r.playerId==='p02').goals,1);
 const onlyScore=coachReducer(s,action(s,{goalsFor:2,goalsAgainst:1,events:[]}));assert.equal(totalGoals(onlyScore),2);assert.deepEqual(seasonGoalRows(onlyScore),[]);assert.equal(unknownMatchDurationCount(onlyScore),1);
 assert.throws(()=>parseScoreEvents('1-0 Not in roster',s.catalog),/onbekend/);
});
test('adding a result retains known season figures and never adds inferred appearances or duration',()=>{
 const s=fixture(),oldId=s.catalog.matches[2].id;s.stats=s.catalog.players.map(p=>({matchId:oldId,playerId:p.id,present:true,minutes:25,keeperMinutes:p.id==='p01'?25:0,goals:p.id==='p02'?1:0}));
 const next=coachReducer(s,action(s));assert.deepEqual(next.stats,s.stats);assert.equal(totalGoals(next),5);assert.equal(processedMatchIds(next).size,2);assert.equal(teamMatchMinutes(next),50);assert.equal(unknownMatchDurationCount(next),1);assert.deepEqual(individualStatsRows(next),s.stats);assert.equal(seasonGoalRows(next).filter(r=>r.playerId==='p02').reduce((n,r)=>n+r.goals,0),3);
});
test('away input and display put the home team first while stored scores remain team relative',()=>{
 const s=fixture(),text='3-0\n3-1 Mats\n3-2 Mats\n3-3 Siem\n4-3\n4-4 Jayden';const r={goalsFor:4,goalsAgainst:4,events:parseScoreEvents(text,s.catalog,'Uit')};assert.ok(validateResultOnly(r,s.catalog));assert.equal(r.events[0].scoreAgainst,3);assert.equal(r.events[1].scoreFor,1);assert.equal(scoreEventsText(r,s.catalog,'Uit'),text);
});
test('Forms cannot replace the saved match availability after result-only processing',()=>{
 const s=fixture(),a=action(s),next=coachReducer(s,a),form={teamSeasonId:s.catalog.teamSeasonId,matchId:a.matchId,round:2,formId:'form',codeQuestion:'code',statusQuestion:'status'};
 const response={responseId:'response',lastSubmittedTime:'2026-10-20T12:00:00Z',answers:{code:{textAnswers:{answers:[{value:'personal-code'}]}},status:{textAnswers:{answers:[{value:'Ja'}]}}}};
 const imported=importResponses(next,form,[{formId:'form',playerId:'p01',code:'personal-code'}],[],[response]);assert.deepEqual(imported.state.availability,next.availability);assert.deepEqual(imported.state.resultOnly,next.resultOnly);
});
