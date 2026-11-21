import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamState,demoCatalog,coachReducer,parseState} from '../src/coach-state.ts';
import {adaptMatchState} from '../src/substitution/adapter.ts';
import {newPreparationDraft,calculatePreparation,preparationProblem} from '../src/preparation-flow.ts';

function fixture(){
 const catalog=demoCatalog();catalog.matches=[{...catalog.matches[0],id:'past',date:'2030-11-01',availabilityRound:2},{...catalog.matches[1],id:'next',date:'2030-11-08',availabilityRound:2}];catalog.liveMatchId='next';
 const state=createTeamState(catalog,4,6);state.availability=Object.fromEntries(catalog.matches.map(m=>[m.id,Object.fromEntries(catalog.players.map(p=>[p.id,'available']))]));
 state.stats=catalog.players.map(p=>({matchId:'past',playerId:p.id,present:true,minutes:30,keeperMinutes:p.id==='p01'?25:0,goals:0,...(p.id==='p10'?{targetMinutes:1973750/60000}:{})}));
 return parseState(JSON.stringify(state));
}
test('a historical target with floating point round-trip noise remains usable by the planner',()=>{
 const state=fixture(),before=JSON.stringify(state),snapshot=adaptMatchState(state,{now:1000});
 assert.equal(snapshot.players.find(p=>p.id==='p10').history[0].targetMs,1973750);assert.equal(JSON.stringify(state),before);
});
test('next-match preparation, confirmation and goal registration survive historical fractional minute targets',()=>{
 const state=fixture(),draft={...newPreparationDraft(state,'next'),slots:['p01','p01','p02','p02']};
 const preview=calculatePreparation(state,draft,{id:'preview',eventId:'preview-event',now:1000});
 const ready={...preview.draft,manualLineup:true,field:[...preview.draft.plan.intervals[0].field]};
 const confirmed=calculatePreparation(state,ready,{id:'confirmed',eventId:'confirmed-event',now:2000},true).state;
 assert.equal(confirmed.assistant.next.status,'accepted');assert.equal(confirmed.live.runningSince,null);assert.equal(confirmed.live.elapsedMs,0);
 const scored=coachReducer(confirmed,{type:'goal',playerId:confirmed.live.field[1],now:3000,minute:0});assert.equal(scored.live.goals.length,1);assert.deepEqual(scored.stats,state.stats);assert.doesNotThrow(()=>parseState(JSON.stringify(scored)));
});
test('genuinely fractional historical milliseconds stay invalid rather than being silently rounded',()=>{
 const state=fixture();state.stats.find(p=>p.playerId==='p10').targetMinutes=1973750.5/60000;
 assert.throws(()=>adaptMatchState(state,{now:1000}),/PLAYER_DATA/);
});
test('a real player-data problem names the player and preserves actionable error messages',()=>{
 const state=fixture();assert.match(preparationProblem(new Error('PLAYER_DATA: p10'),state),/Milan/);assert.doesNotMatch(preparationProblem(new Error('PLAYER_DATA: p10'),state),/PLAYER_DATA|p10/);assert.equal(preparationProblem(new Error('Kies een keeper.'),state),'Kies een keeper.');
});
