import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamState,demoCatalog,coachReducer,parseState,matchRows,fullStatsFromRound,goalsOnlyMatch,individualStatsRows,teamMatchMinutes,totalGoals} from '../src/coach-state.ts';
import {importHistory} from '../server/history-import.mjs';
import {adaptMatchState} from '../src/substitution/adapter.ts';
import {adviceContext} from '../src/substitution/recommendations.ts';
function fixture(){
 const c=demoCatalog();c.teamSeasonId='hfc-edo-jo10-2-2026-2027';c.matches=[1,2,3].map((n,i)=>({...c.matches[0],id:`m${n}`,date:`2026-10-${10+i}`,availabilityRound:i===0?1:2}));c.liveMatchId='m3';
 const s=createTeamState(c,4,6);s.availability=Object.fromEntries(c.matches.map(m=>[m.id,Object.fromEntries(c.players.map(p=>[p.id,'available']))]));
 s.stats=['m1','m2'].flatMap(id=>c.players.map((p,i)=>({matchId:id,playerId:p.id,present:true,minutes:id==='m1'?50:30,keeperMinutes:i===0?25:0,goals:i===1?2:0})));return s;
}
test('round-one coverage belongs only to this team season and retains original data',()=>{
 const s=fixture(),raw=JSON.stringify(s);assert.equal(fullStatsFromRound(s),2);assert.ok(goalsOnlyMatch(s,'m1'));assert.ok(!goalsOnlyMatch(s,'m2'));assert.ok(!goalsOnlyMatch(s,'foreign'));assert.deepEqual([...new Set(individualStatsRows(s).map(r=>r.matchId))],['m2']);assert.equal(totalGoals(s),4);assert.equal(JSON.stringify(s),raw);
 for(const id of ['another-team-2026-2027','hfc-edo-jo10-2-2027-2028']){const other=structuredClone(s);other.catalog.teamSeasonId=id;assert.equal(fullStatsFromRound(other),1);assert.equal(individualStatsRows(other).length,s.stats.length);}
 s.catalog.archived=true;assert.equal(individualStatsRows(s).length,10);assert.equal(coachReducer(s,{type:'save-stats',matchId:'m1',rows:matchRows(s,'m1')}),s);
});
test('match duration counts each processed match once and preserves later overtime without rest',()=>{
 const s=fixture();s.liveArchive={m1:{...s.live,phase:'Einde',elapsedMs:123000},m2:{...s.live,phase:'Einde',elapsedMs:3210000,breakMs:900000}};assert.equal(teamMatchMinutes(s),103.5);assert.notEqual(teamMatchMinutes(s),s.stats.reduce((n,r)=>n+r.minutes,0));
 s.stats.push(...matchRows(s,'m3'));s.live={...s.live,phase:'Einde',elapsedMs:3510000,breakMs:300000};assert.equal(teamMatchMinutes(s),162);
 delete s.liveArchive;s.stats=s.stats.filter(r=>r.matchId!=='m3');assert.equal(teamMatchMinutes(s),100);s.stats=[];assert.equal(teamMatchMinutes(s),0);
});
test('goal corrections preserve hidden figures and new goal-only rows leave minutes unknown',()=>{
 const s=fixture(),rows=matchRows(s,'m1');rows[0]={...rows[0],minutes:0,keeperMinutes:0,minutesKnown:false,keeperMinutesKnown:false,goals:3};const next=coachReducer(s,{type:'save-stats',matchId:'m1',rows});const saved=next.stats.find(r=>r.matchId==='m1'&&r.playerId===rows[0].playerId);assert.equal(saved.minutes,50);assert.equal(saved.keeperMinutes,25);assert.equal(saved.goals,3);assert.equal(teamMatchMinutes(next),100);assert.doesNotThrow(()=>parseState(JSON.stringify(next)));
 s.stats=s.stats.filter(r=>r.matchId!=='m1');const fresh=matchRows(s,'m1');assert.ok(fresh.every(r=>r.minutesKnown===false&&r.keeperMinutesKnown===false));const created=coachReducer(s,{type:'save-stats',matchId:'m1',rows:fresh});assert.ok(created.stats.filter(r=>r.matchId==='m1').every(r=>r.minutesKnown===false&&r.keeperMinutesKnown===false));
});
test('round-one imports require only goals and score; later imports still validate attendance',()=>{
 const s=fixture();s.stats=[];const source={teamSeasonId:s.catalog.teamSeasonId,matchId:'m1',venue:'Thuis',Stand:'2-0',Doelpuntenmakers:'Mats 2x',Keepers:'old incomplete keeper text',afwezig:''};const imported=importHistory(s,[source]);assert.equal(imported.imported,1);assert.equal(totalGoals(imported.state),2);assert.equal(teamMatchMinutes(imported.state),50);assert.equal(individualStatsRows(imported.state).length,0);assert.ok(imported.state.stats.every(r=>r.minutesKnown===false&&r.keeperMinutesKnown===false));assert.equal(importHistory(imported.state,[source]).imported,0);assert.throws(()=>importHistory(s,[{...source,matchId:'m2',Keepers:''}]),/afwezig/);assert.throws(()=>importHistory(s,[{...source,Stand:'3-0'}]),/niet op/);
});
test('assistant history excludes uncollected round-one statistics and preserves later unknowns',()=>{
 const s=fixture(),r=s.stats.find(r=>r.matchId==='m2'&&r.playerId==='p01');r.minutes=0;r.minutesKnown=false;const snapshot=adaptMatchState(s,{now:1000});assert.ok(snapshot.players.every(p=>p.history.every(h=>h.matchId==='m2')));assert.equal(snapshot.players.find(p=>p.id==='p01').history[0].playedMs,null);const invalid=structuredClone(s);invalid.team.fullStatsFromRound=0;assert.throws(()=>parseState(JSON.stringify(invalid)),/statistiekenperiode/);
});

test('a historical coverage change invalidates an old advice context without rewriting its stored plan',()=>{
 const s=fixture(),context=adviceContext(s),old=JSON.parse(context);assert.deepEqual(old.at(-1),{fullStatsFromRound:2});old.pop();assert.notEqual(context,JSON.stringify(old));
 s.team.fullStatsFromRound=1;assert.notEqual(adviceContext(s),context);
});
