import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,coachReducer,parseState,liveMatchRows,totalGoals} from '../src/coach-state.ts';
import {applyActionBatch} from '../src/action-batch.ts';

function fixture(){const s=createInitialState();s.stats=[];s.opponentOwnGoals={};s.live={...s.live,field:s.live.field.slice(0,6),goals:[],awayGoals:[]};return s;}
const id=s=>(s.catalog?.liveMatchId??'m-021');
test('a bench/absent scorer requires an explicit exception and never invents a substitution or minutes',()=>{
 const s=fixture(),player=(s.catalog?.players??[]).find(p=>!s.live.field.includes(p.id))?.id??'p10';
 assert.ok(!s.live.field.includes(player));s.availability[id(s)]={...s.availability[id(s)],[player]:'unavailable'};
 const action={type:'goal',playerId:player,now:1000};assert.equal(coachReducer(s,action),s);
 const next=coachReducer(s,{...action,allowOffField:true});assert.equal(next.live.goals.length,1);assert.equal(next.live.goals[0].playerId,player);
 assert.deepEqual(next.live.field,s.live.field);assert.deepEqual(next.live.swaps,s.live.swaps);assert.deepEqual(next.live.played,s.live.played);assert.deepEqual(next.availability,s.availability);
 assert.equal(coachReducer(s,{...action,playerId:'foreign',allowOffField:true}),s);assert.ok(parseState(JSON.stringify(next)));
});
test('the goal minute is captured at open while registration settles the running clock at submit',()=>{
 let s=fixture();s=coachReducer(s,{type:'toggle-clock',now:1000});
 const action={type:'goal',playerId:s.live.field[0],now:181000,minute:1};
 const next=coachReducer(s,action);assert.equal(next.live.goals[0].minute,1);assert.equal(next.live.elapsedMs,180000);assert.equal(next.live.runningSince,181000);
 for(const minute of [-1,4,1.5,NaN])assert.equal(coachReducer(s,{...action,minute}),s);
 assert.equal(coachReducer(s,{type:'away-goal',delta:1,minute:1,now:181000}).live.awayGoals[0].minute,1);
 const replay=applyActionBatch(fixture(),[{type:'toggle-clock',now:1000},action],200000);assert.equal(replay.live.goals[0].minute,1);assert.equal(replay.live.elapsedMs,180000);
});
test('unknown makers are explicit and count in the team score without attributing player goals',()=>{
 let s=fixture();assert.equal(coachReducer(s,{type:'goal',playerId:null,now:1000}),s);
 s=coachReducer(s,{type:'goal',playerId:null,unknownScorer:true,now:1000});assert.equal(s.live.goals.length,1);assert.equal(s.live.goals[0].ownGoal,false);
 assert.equal(liveMatchRows(s).reduce((sum,r)=>sum+r.goals,0),0);assert.ok(parseState(JSON.stringify(s)));
 s=coachReducer(s,{type:'finish',now:2000});assert.equal(totalGoals(s),1);assert.equal(s.opponentOwnGoals[id(s)],0);
 assert.equal(totalGoals(parseState(JSON.stringify(s))),1);
});
test('goal corrections preserve score, chronology, clock, squad and minutes, rejecting stale edits',()=>{
 let s=fixture();s=coachReducer(s,{type:'goal',playerId:null,unknownScorer:true,now:1000});
 const old=s.live.goals[0],action={type:'edit-goal',side:'ours',index:0,matchId:id(s),expected:JSON.stringify(old),playerId:s.live.field[1],minute:0};
 const next=coachReducer(s,action);assert.equal(next.live.goals.length,1);assert.equal(next.live.goals[0].playerId,action.playerId);assert.equal(next.live.goals[0].sequence,old.sequence);assert.equal(next.live.goals[0].scoreFor,old.scoreFor);
 assert.deepEqual(next.live.field,s.live.field);assert.deepEqual(next.live.played,s.live.played);assert.equal(next.live.elapsedMs,s.live.elapsedMs);assert.ok(parseState(JSON.stringify(next)));
 assert.equal(coachReducer(next,action),next);
 for(const changes of [{matchId:'foreign'},{index:7},{playerId:'foreign'},{minute:1},{minute:-1}])assert.equal(coachReducer(s,{...action,...changes}),s);
 assert.throws(()=>applyActionBatch(next,[action]),/actuele opstelling/);
 const ended=coachReducer(s,{type:'finish',now:2000}),corrected=coachReducer(ended,action);assert.equal(corrected.liveArchive[id(s)].goals[0].playerId,action.playerId);assert.equal(corrected.stats.find(r=>r.matchId===id(s)&&r.playerId===action.playerId).goals,1);assert.equal(totalGoals(corrected),1);assert.ok(parseState(JSON.stringify(corrected)));
 const archived={...ended,catalog:{...(ended.catalog??{}),archived:true}};assert.equal(coachReducer(archived,action),archived);
});
test('opponent goals need no player; explicit own goals remain attributable and undoable',()=>{
 let s=fixture();s=coachReducer(s,{type:'away-goal',delta:1,minute:0,now:1000});assert.equal(s.live.awayGoals[0].playerId,null);assert.equal(s.live.awayGoals[0].ownGoal,false);
 const player=s.live.field[0];s=coachReducer(s,{type:'away-goal',delta:1,ownGoalPlayerId:player,now:2000});assert.equal(s.live.awayGoals[1].ownGoal,true);assert.equal(liveMatchRows(s).find(r=>r.playerId===player).goals,0);
 s=coachReducer(s,{type:'away-goal',delta:-1});assert.equal(s.live.awayGoals.length,1);
 s=coachReducer(s,{type:'goal',playerId:null,ownGoal:true,now:3000});assert.equal(s.live.goals[0].ownGoal,true);assert.equal(liveMatchRows(s).reduce((n,r)=>n+r.goals,0),0);
});

