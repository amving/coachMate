import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createTeamState, demoCatalog, coachReducer, parseState, settleLive } from '../src/coach-state.ts';
import { adaptMatchState } from '../src/substitution/adapter.ts';
import { planCoachMatch } from '../src/substitution/index.ts';
import { defaultPolicy, normalizePolicy } from '../src/substitution/policy.ts';
import { calculateTargets } from '../src/substitution/targets.ts';
import { chooseKeeper } from '../src/substitution/goalkeepers.ts';
import { rotationPriority } from '../src/substitution/rotation.ts';
import { optimizeSubstitutions, SEARCH_LIMITS } from '../src/substitution/optimizer.ts';
import { projectMinutes, validateExecution, validateMatchState, validatePlan } from '../src/substitution/rules.ts';
import { schema } from '../server/schema.mjs';
import { loadTeam, stateTables, fingerprint } from '../server/sheets.mjs';

const MIN=60000;
function fixture(count=11,fieldSize=8,periods=4) {
  const catalog={...demoCatalog(),teamSeasonId:'test-season-2026',players:Array.from({length:count},(_,i)=>({id:`p${String(i).padStart(2,'0')}`,number:i+1,name:`Test ${i}`,shortName:`T${i}`,parent:'',position:''})),liveMatchId:'current',matches:[{id:'current',pool:'',date:'2026-10-17',shortDate:'17 okt',time:'10:00',opponent:'Test',venue:'Thuis',availabilityRound:1}]};
  const state=createTeamState(catalog,periods,fieldSize);
  state.availability.current=Object.fromEntries(catalog.players.map(p=>[p.id,'available']));
  const profiles=Object.fromEntries(catalog.players.map((p,i)=>[p.id,{goalkeeperEligible:i<3}]));
  return {state,profiles};
}
function normalized(count=11,size=8,periods=4){const {state,profiles}=fixture(count,size,periods);return adaptMatchState(state,{now:0,profiles});}
function best(state,policy=defaultPolicy()) {
  const result=optimizeSubstitutions(state,policy);
  assert.ok(result.scenarios.length,JSON.stringify(result.issues));
  return result.scenarios[0];
}
// Independent interval sweep, including a separately accumulated keeper budget.
function assertOccupancy(state,scenario) {
  let cursor=state.clock.matchMs,total=0,keeper=0;
  const sums=Object.fromEntries(state.players.map(p=>[p.id,p.playedMs]));
  for(const s of scenario.intervals) {
    assert.equal(s.startMs,cursor);assert.ok(s.endMs>s.startMs);
    assert.equal(s.field.length,state.rules.fieldSize);assert.equal(new Set(s.field).size,s.field.length);
    assert.ok(s.field.includes(s.keeperId));assert.ok(state.players.find(p=>p.id===s.keeperId)?.goalkeeperEligible);
    const bench=state.players.filter(p=>p.available&&!s.field.includes(p.id)).map(p=>p.id);
    assert.equal(bench.filter(id=>s.field.includes(id)).length,0);
    for(const id of s.field){const p=state.players.find(p=>p.id===id);assert.ok(p?.available);assert.ok(p.availableFromMs<=s.startMs&&p.availableUntilMs>=s.endMs);sums[id]+=s.endMs-s.startMs;}
    total+=(s.endMs-s.startMs)*s.field.length;keeper+=s.endMs-s.startMs;cursor=s.endMs;
  }
  assert.equal(cursor,state.rules.durationMs);assert.equal(total,(state.rules.durationMs-state.clock.matchMs)*state.rules.fieldSize);
  assert.equal(keeper,state.rules.durationMs-state.clock.matchMs);
  for(const p of state.players){assert.equal(sums[p.id],scenario.expectedEndMs[p.id].playedMs);assert.ok(sums[p.id]<=p.maxTotalMs);assert.equal(scenario.expectedEndMs[p.id].fieldMs+scenario.expectedEndMs[p.id].keeperMs,sums[p.id]);}
}

test('reference: 4 x 12.5 minutes, 11 available, 8 on field, exactly 400 player-minutes',()=>{
  const state=normalized();const snapshot=JSON.stringify(state);const result=optimizeSubstitutions(state);
  assert.ok(result.scenarios.length>=2);
  for(const s of result.scenarios){assertOccupancy(state,s);assert.equal(Object.values(s.expectedEndMs).reduce((a,p)=>a+p.playedMs,0),400*MIN);assert.ok(s.fairnessErrorMs<=30000);assert.equal(s.policyVersion,1);assert.ok(validatePlan(state,s.intervals).valid);}
  assert.deepEqual(state.rules.periodBoundariesMs,[12.5,25,37.5,50].map(x=>x*MIN));
  assert.equal(JSON.stringify(state),snapshot);assert.deepEqual(optimizeSubstitutions(state),result);
});
test('planned occupancy replays through the existing reducer to exactly the projected real minutes',()=>{
  const {state:original,profiles}=fixture();const plan=best(adaptMatchState(original,{now:0,profiles}));
  let state=coachReducer(original,{type:'toggle-clock',now:0});
  for(const s of plan.intervals){
    const out=state.live.field.filter(id=>!s.field.includes(id)),incoming=s.field.filter(id=>!state.live.field.includes(id));
    out.forEach((id,i)=>{state=coachReducer(state,{type:'swap',out:id,in:incoming[i],now:s.startMs});});
    if(state.live.keeperId!==s.keeperId)state=coachReducer(state,{type:'keeper',playerId:s.keeperId,now:s.startMs});
  }
  state=coachReducer(state,{type:'clock',now:50*MIN});
  assert.equal(Object.values(state.live.played).reduce((a,p)=>a+p.milliseconds,0),400*MIN);
  assert.equal(Object.values(state.live.played).reduce((a,p)=>a+p.keeperMilliseconds,0),50*MIN);
  for(const [id,p] of Object.entries(state.live.played)){assert.equal(p.milliseconds,plan.expectedEndMs[id].playedMs);assert.equal(p.keeperMilliseconds,plan.expectedEndMs[id].keeperMs);}
  assert.deepEqual(parseState(JSON.stringify(state)).live.played,state.live.played);
});
test('adapter settles the existing clock, preserves breaks, records occupancy and does not mutate',()=>{
  const {state:base,profiles}=fixture();let state=coachReducer(base,{type:'toggle-clock',now:1000});
  state=coachReducer(state,{type:'phase',now:12.5*MIN+1000});
  const snapshot=JSON.stringify(state);const adapted=adaptMatchState(state,{now:15*MIN+1000,profiles,revision:7});
  assert.equal(adapted.clock.matchMs,12.5*MIN);assert.equal(adapted.clock.breakMs,2.5*MIN);assert.equal(adapted.clock.elapsedRealMs,15*MIN);
  assert.equal(adapted.observedIntervals.length,1);assert.equal(JSON.stringify(state),snapshot);
  state=coachReducer(state,{type:'phase',now:15*MIN+1000});state=coachReducer(state,{type:'clock',now:20*MIN+1000});
  assert.equal(state.live.elapsedMs,17.5*MIN);assert.equal(state.live.occupancy.length,1);
  assertOccupancy(adaptMatchState(state,{now:20*MIN+1000,profiles}),best(adaptMatchState(state,{now:20*MIN+1000,profiles})));
});
test('legacy missing rest, streaks, historical targets and qualities remain unknown',()=>{
  const {state,profiles}=fixture();delete state.live.occupancy;delete state.live.breakMs;
  state.live.elapsedMs=MIN;for(const id of state.live.field)state.live.played[id].milliseconds=MIN;state.live.played[state.live.keeperId].keeperMilliseconds=MIN;
  const n=adaptMatchState(state,{now:0,profiles});assert.equal(n.clock.breakMs,null);assert.equal(n.clock.elapsedRealMs,null);assert.equal(n.players[0].consecutivePlayMs,null);
  assert.ok(n.warnings.includes('UNKNOWN_LEGACY_ROTATION'));assert.ok(best(n).reasonCodes.includes('NO_TACTICAL_QUALITY_DATA'));assert.equal(best(n).scores.tactical,null);
});
test('historical compensation uses last five known personal targets, bounds and exact joint budget',()=>{
  const state=normalized();
  state.players.forEach((p,i)=>{p.history=Array.from({length:7},(_,j)=>({matchId:`h${j}`,playedMs:(i===0?5:45)*MIN,targetMs:36*MIN,keeperMs:null}));});
  const p=defaultPolicy();const result=calculateTargets(state,p);
  assert.equal(Object.values(result.targetsMs).reduce((a,b)=>a+b,0),400*MIN);
  for(const id of Object.keys(result.baseMs))assert.ok(Math.abs(result.targetsMs[id]-result.baseMs[id])<=Math.floor(result.baseMs[id]*.15));
  assert.ok(result.targetsMs.p00>result.baseMs.p00);
  const first=structuredClone(result);state.players.forEach(player=>{player.history=player.history.slice(0,5);});assert.deepEqual(calculateTargets(state,p),first);
});
test('unknown historical targets/minutes and unavailable appearances contribute no debt',()=>{
  const state=normalized();const original=calculateTargets(state,defaultPolicy());
  state.players[0].history=[{matchId:'h',playedMs:null,targetMs:40*MIN,keeperMs:MIN},{matchId:'h2',playedMs:0,targetMs:null,keeperMs:null}];
  assert.deepEqual(calculateTargets(state,defaultPolicy()),original);
});
test('adapter scopes history to processed, preceding matches and known attendance, across supported date formats',()=>{
  const {state,profiles}=fixture();
  for(const [id,date] of [['h1','16 oktober 2026'],['h2','15-10-2026'],['future','2026-11-01']]){
    state.catalog.matches.push({...state.catalog.matches[0],id,date});
    state.stats.push(...state.catalog.players.map((p,i)=>({matchId:id,playerId:p.id,present:i!==1,minutes:i===1?0:30,keeperMinutes:0,goals:0,targetMinutes:35})));
  }
  const n=adaptMatchState(state,{now:0,profiles});assert.deepEqual(n.players[0].history.map(h=>h.matchId),['h1','h2']);assert.equal(n.players[1].history.length,0);
});
test('rotation priority distinguishes equal minutes using bench duration, continuous load and previous turns',()=>{
  const history=order=>{
    const {state:base,profiles}=fixture(10,8);let state=coachReducer(base,{type:'toggle-clock',now:0});
    for(const [out,incoming,t] of [['p07',order[0],10],[order[0],order[1],15],[order[1],'p07',20]])state=coachReducer(state,{type:'swap',out,in:incoming,now:t*MIN});
    return adaptMatchState(state,{now:25*MIN,profiles});
  };
  const a=history(['p08','p09']),b=history(['p09','p08']);
  assert.equal(a.players.find(p=>p.id==='p08').playedMs,a.players.find(p=>p.id==='p09').playedMs);
  const result=optimizeSubstitutions(a);
  const priority=(state,id)=>{const p=state.players.find(p=>p.id===id);return rotationPriority(p.consecutiveBenchMs,p.consecutivePlayMs,p.substitutionCount,state.rules.durationMs);};
  assert.ok(priority(a,'p08')>priority(a,'p09'));assert.ok(priority(b,'p09')>priority(b,'p08'));
  assert.ok(rotationPriority(5*MIN,0,0,50*MIN)>rotationPriority(5*MIN,0,8,50*MIN));
  assert.ok(rotationPriority(0,MIN,0,50*MIN)>rotationPriority(0,10*MIN,0,50*MIN));
  assert.ok(result.scenarios.length);assertOccupancy(a,result.scenarios[0]);
  assert.ok(result.scenarios.every(s=>s.reasonCodes.includes('FULL_REMAINING_HORIZON')));
});
test('quality cannot buy structural unfairness, even with 100% tactical weight',()=>{
  const state=normalized();state.players.forEach((p,i)=>{p.position='A';p.positionQualities={A:i===0?1:0};});
  const policy={...defaultPolicy(),weights:{fairness:0,rotation:0,tactical:1}};
  const result=optimizeSubstitutions(state,policy);assert.ok(result.scenarios.length);
  for(const s of result.scenarios){assertOccupancy(state,s);assert.ok(s.fairnessErrorMs<=policy.fairnessToleranceMs);}
});
test('single suitable keeper is a forced constraint, with no extra field compensation',()=>{
  const state=normalized();state.players.forEach(p=>{p.goalkeeperEligible=p.id==='p00';});
  const scenario=best(state);assert.ok(scenario.reasonCodes.includes('SINGLE_ELIGIBLE_KEEPER'));assert.equal(scenario.expectedEndMs.p00.playedMs,50*MIN);assert.equal(scenario.expectedEndMs.p00.keeperMs,50*MIN);assert.equal(scenario.expectedEndMs.p00.fieldMs,0);assertOccupancy(state,scenario);
});
test('keeper rotation uses known history and preferences, never inventing candidates',()=>{
  const state=normalized();const keepers=state.players.slice(0,3);
  keepers[0].history=[{matchId:'h',playedMs:50*MIN,targetMs:null,keeperMs:50*MIN}];keepers[1].goalkeeperPreference=1;
  assert.equal(chooseKeeper(state,keepers,'p00',{p00:0,p01:0,p02:0},defaultPolicy(),true),'p01');
  const scenario=best(state);assert.ok(new Set(scenario.intervals.map(s=>s.keeperId)).size>=2);
  const fixed=best(state,{...defaultPolicy(),goalkeeperMode:'FIXED'});assertOccupancy(state,fixed);
});
test('keeper/field position changes preserve total playing time and composite transitions are atomic snapshots',()=>{
  const state=normalized();const plan=[{startMs:0,endMs:25*MIN,field:state.field,keeperId:'p00'},{startMs:25*MIN,endMs:50*MIN,field:state.field,keeperId:'p01'}];
  const total=projectMinutes(state,plan);assert.equal(total.p00.playedMs,50*MIN);assert.equal(total.p00.keeperMs,25*MIN);assert.equal(total.p00.fieldMs,25*MIN);assert.ok(validatePlan(state,plan).valid);
  const composite=[plan[0],{...plan[1],field:state.field.map(id=>id==='p00'?'p08':id),keeperId:'p01'}];assert.ok(validatePlan(state,composite).valid);
});
test('bundles and period edges win when fairness and other scores are comparable',()=>{
  const state=normalized(12,8);const plan=best(state);assertOccupancy(state,plan);
  const transitions=plan.intervals.filter((s,i)=>i>0&&s.field.some(id=>!plan.intervals[i-1].field.includes(id)));
  assert.ok(transitions.length<=8,`unnecessarily many moments: ${transitions.length}`);
  assert.ok(transitions.some(s=>state.rules.periodBoundariesMs.includes(s.startMs)));
});
test('personal caps and partial availability remain hard constraints throughout the horizon',()=>{
  const state=normalized();state.players.find(p=>p.id==='p08').maxTotalMs=20*MIN;state.players.find(p=>p.id==='p09').availableFromMs=10*MIN;state.players.find(p=>p.id==='p10').availableUntilMs=40*MIN;
  const s=best(state);assertOccupancy(state,s);assert.ok(s.expectedEndMs.p08.playedMs<=20*MIN);
});
test('delayed and manually changed swaps replan all remaining play, preserving actual minutes',()=>{
  const {state:base,profiles}=fixture();let state=coachReducer(base,{type:'toggle-clock',now:0});
  state=coachReducer(state,{type:'swap',out:'p07',in:'p10',now:17*MIN});
  const n=adaptMatchState(state,{now:19*MIN,profiles});const before=JSON.stringify(state);
  const scenario=best(n);assert.equal(scenario.intervals[0].startMs,19*MIN);assertOccupancy(n,scenario);assert.equal(JSON.stringify(state),before);
  const changed=structuredClone(n);changed.players.find(p=>p.id==='p09').available=false;changed.bench=changed.bench.filter(id=>id!=='p09');assertOccupancy(changed,best(changed));
});
test('execution requires acceptance, actual confirmation, current time and state/policy versions',()=>{
  const state=normalized();const proposal={stateVersion:state.stateVersion,policyVersion:1,atMs:0,field:state.field,keeperId:state.keeperId};
  assert.ok(validateExecution(state,proposal,1,{accepted:true,executed:true}).valid);
  for(const confirmation of [{accepted:false,executed:false},{accepted:true,executed:false},{accepted:false,executed:true}])assert.equal(validateExecution(state,proposal,1,confirmation).valid,false);
  for(const patch of [{stateVersion:'old'},{policyVersion:2},{atMs:MIN}])assert.equal(validateExecution(state,{...proposal,...patch},1,{accepted:true,executed:true}).valid,false);
  assert.equal(state.clock.matchMs,0);assert.equal(state.players[0].playedMs,0);
});
test('clock/goal/policy changes invalidate a token even without a persisted revision change',()=>{
  const {state,profiles}=fixture();const n=adaptMatchState(state,{now:0,profiles,revision:2});
  const goal=coachReducer(state,{type:'goal',playerId:'p01',now:0});assert.notEqual(adaptMatchState(goal,{now:0,profiles,revision:2}).stateVersion,n.stateVersion);
  const policy=coachReducer(state,{type:'set-substitution-policy',expectedVersion:0,policy:defaultPolicy()});assert.notEqual(adaptMatchState(policy,{now:0,profiles,revision:2}).stateVersion,n.stateVersion);
});
test('policy weights normalize; unknown hard-rule switches and malformed values are rejected',()=>{
  const p=normalizePolicy({...defaultPolicy(),weights:{fairness:50,rotation:30,tactical:20}});assert.deepEqual(p.weights,{fairness:.5,rotation:.3,tactical:.2});
  for(const patch of [{allowNoKeeper:true},{historyMatches:0},{compensationFactor:NaN},{maxHistoricalCorrection:-1},{weights:{fairness:0,rotation:0,tactical:0}},{preferBundled:'yes'},{schemaVersion:2},{fairnessToleranceMs:Infinity}])assert.throws(()=>normalizePolicy({...defaultPolicy(),...patch}));
});
test('versioned policy persists in the existing State table, isolates teams and supports reset',()=>{
  const {state:base}=fixture();let state=coachReducer(base,{type:'set-substitution-policy',expectedVersion:0,policy:{...defaultPolicy(),compensationFactor:.6}});
  assert.equal(state.team.substitutionPolicy.version,1);assert.equal(coachReducer(state,{type:'set-substitution-policy',expectedVersion:0}),state);
  state=coachReducer(state,{type:'set-substitution-policy',expectedVersion:1});assert.equal(state.team.substitutionPolicy.version,2);assert.equal(state.team.substitutionPolicy.compensationFactor,.3);assert.equal(state.team.substitutionPolicyHistory[0].compensationFactor,.6);
  const tables=Object.fromEntries(Object.keys(schema).map(k=>[k,[]]));tables.Seasons=[{seasonId:state.catalog.seasonId,name:state.catalog.seasonName,archived:false}];tables.TeamSeasons=[{teamSeasonId:state.catalog.teamSeasonId,seasonId:state.catalog.seasonId,teamName:'Test',periods:4,liveMatchId:'current'}];tables.Players=state.catalog.players.map(({id,...p})=>({...p,playerId:id,teamSeasonId:state.catalog.teamSeasonId}));tables.Matches=state.catalog.matches.map(({id,...m})=>({...m,matchId:id,teamSeasonId:state.catalog.teamSeasonId}));
  const snapshot={tables,token:fingerprint(tables)};Object.assign(tables,stateTables(snapshot,state.catalog.teamSeasonId,state,4));
  const loaded=loadTeam(snapshot,state.catalog.teamSeasonId);assert.equal(loaded.revision,4);assert.deepEqual(loaded.state.team.substitutionPolicyHistory,state.team.substitutionPolicyHistory);
  const applied=planCoachMatch(loaded.state,{now:0,profiles:fixture().profiles});assert.ok(applied.scenarios.length);assert.ok(applied.scenarios.every(s=>s.policyVersion===2));
  const archived=structuredClone(state);archived.catalog.archived=true;assert.equal(coachReducer(archived,{type:'set-substitution-policy',expectedVersion:2}),archived);
  assert.equal(base.team.substitutionPolicy,undefined);assert.deepEqual(parseState(JSON.stringify(state)).team,state.team);
});
test('corrupt occupancy totals and malformed policy histories are rejected on reload',()=>{
  const {state:base}=fixture();const state=coachReducer(coachReducer(base,{type:'toggle-clock',now:0}),{type:'clock',now:MIN});
  state.live.occupancy[0].endMs=MIN-1;assert.throws(()=>parseState(JSON.stringify(state)));
  const policy=coachReducer(base,{type:'set-substitution-policy',expectedVersion:0});policy.team.substitutionPolicyHistory=[];assert.throws(()=>parseState(JSON.stringify(policy)));
});
test('optional player profiles load from the existing Players source and survive local snapshots',()=>{
  const {state}=fixture();state.catalog.players[1].substitutionProfile={goalkeeperEligible:true,goalkeeperQuality:.7,goalkeeperPreference:.8,positionQualities:{V:.6},maxMinutes:40};
  assert.deepEqual(parseState(JSON.stringify(state)).catalog.players[1].substitutionProfile,state.catalog.players[1].substitutionProfile);
  const tables=Object.fromEntries(Object.keys(schema).map(k=>[k,[]]));tables.Seasons=[{seasonId:state.catalog.seasonId,name:'Test',archived:false}];tables.TeamSeasons=[{teamSeasonId:state.catalog.teamSeasonId,seasonId:state.catalog.seasonId,teamName:'Test',periods:4,liveMatchId:'current'}];tables.Players=state.catalog.players.map(({id,substitutionProfile,...p})=>({...p,playerId:id,teamSeasonId:state.catalog.teamSeasonId,...(substitutionProfile?{substitutionProfile:JSON.stringify(substitutionProfile)}:{})}));tables.Matches=state.catalog.matches.map(({id,...m})=>({...m,matchId:id,teamSeasonId:state.catalog.teamSeasonId}));
  const loaded=loadTeam({tables,token:'test'},state.catalog.teamSeasonId).state;
  assert.deepEqual(loaded.catalog.players[1].substitutionProfile,state.catalog.players[1].substitutionProfile);
  loaded.availability.current=state.availability.current;
  const n=adaptMatchState(loaded,{now:0});assert.equal(n.players[1].goalkeeperEligible,true);assert.equal(n.players[1].goalkeeperQuality,.7);assert.equal(n.players[1].maxTotalMs,40*MIN);
  tables.Players[1].substitutionProfile='{"goalkeeperEligible":"yes"}';assert.throws(()=>loadTeam({tables,token:'test'},state.catalog.teamSeasonId),/substitutionProfile/);
});
test('seeded rolling-horizon scenarios preserve exact occupancy across pauses and irregular execution times',()=>{
  let seed=20261017;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let sample=0;sample<32;sample++) {
    const size=[6,8,11][sample%3],count=size+1+Math.floor(rand()*8);
    const {state:base,profiles}=fixture(count,size,sample%2?2:4);let state=coachReducer(base,{type:'toggle-clock',now:1000});
    const t=Math.floor((3+rand()*15)*MIN);
    state=coachReducer(state,{type:'swap',out:`p${String(size-1).padStart(2,'0')}`,in:`p${String(count-1).padStart(2,'0')}`,now:1000+t});
    assert.equal(state.live.swaps.at(-1).atMs,t);
    const immediate=adaptMatchState(state,{now:1000+t,profiles});assert.equal(immediate.executedSubstitutions.at(-1).atMs,t);assert.equal(immediate.executedSubstitutions.at(-1).precision,'millisecond');
    state=coachReducer(state,{type:'toggle-clock',now:1000+t+17321});
    state=coachReducer(state,{type:'toggle-clock',now:1000+t+17321+50000});
    const n=adaptMatchState(state,{now:1000+t+17321+50000+12345,profiles});
    const result=optimizeSubstitutions(n);assert.ok(result.scenarios.length,`seeded sample ${sample}: ${JSON.stringify(result.issues)}`);
    for(const s of result.scenarios)assertOccupancy(n,s);
  }
});
test('invalid scenarios explain wrong counts, keepers, quarters, totals and double occupancy',()=>{
  const state=normalized();const plan=best(state).intervals;
  for(const change of [s=>s.field.pop(),s=>{s.keeperId='unknown';},s=>{s.field[0]=s.field[1];},s=>{s.endMs++;},s=>{s.field[0]='invented';}]){const copy=structuredClone(plan);change(copy[0]);assert.equal(validatePlan(state,copy).valid,false);}
  const noKeeper=structuredClone(state);noKeeper.players.forEach(p=>{p.goalkeeperEligible=false;});assert.ok(optimizeSubstitutions(noKeeper).issues.some(i=>i.code==='GOALKEEPER'));
  const overlap=structuredClone(state);overlap.bench.push(overlap.field[0]);assert.ok(validateMatchState(overlap).issues.some(i=>i.code==='BENCH_OVERLAP'));
  const wrongQuarter=structuredClone(state);wrongQuarter.rules.periodBoundariesMs=[12*MIN,24*MIN,36*MIN,48*MIN];assert.equal(validateMatchState(wrongQuarter).valid,false);
});
test('unconfirmed availability, unsuitable keeper, invalid profiles and too-small squads fail closed',()=>{
  const {state,profiles}=fixture();state.availability.current.p07='pending';assert.throws(()=>adaptMatchState(state,{now:0,profiles}),/UNAVAILABLE_PLAYER/);
  state.availability.current.p07='available';assert.throws(()=>adaptMatchState(state,{now:0,profiles:{...profiles,p00:{goalkeeperEligible:false}}}),/GOALKEEPER/);
  assert.throws(()=>adaptMatchState(state,{now:0,profiles:{...profiles,p01:{positionQualities:{A:2}}}}));
  const n=normalized();n.players.forEach(p=>{p.maxTotalMs=MIN;});assert.equal(optimizeSubstitutions(n).scenarios.length,0);
});
test('archived, finished and overtime matches retain actual time without invented future minutes',()=>{
  for(const patch of [{archived:true},{phase:'Einde'},{clock:{matchMs:51*MIN,breakMs:0,elapsedRealMs:51*MIN}}]){const n={...normalized(),...patch};assert.equal(optimizeSubstitutions(n).scenarios.length,0);}
});
for(const [count,size,minutes,periods] of [[6,6,40,2],[9,6,60,2],[14,11,70,2],[16,8,50,4],[22,11,90,2],[50,11,120,4]])test(`scenario ${count} players / ${size} field / ${minutes} minutes / ${periods} periods`,()=>{
  const state=normalized(count,size,periods);state.rules.durationMs=minutes*MIN;state.rules.periodBoundariesMs=Array.from({length:periods},(_,i)=>(i+1)*minutes*MIN/periods);state.players.forEach(p=>{p.availableUntilMs=minutes*MIN;p.maxTotalMs=minutes*MIN;});
  const start=performance.now();const result=optimizeSubstitutions(state);assert.ok(result.scenarios.length,JSON.stringify(result.issues));assert.ok(result.search.generated<=SEARCH_LIMITS.candidates);assertOccupancy(state,result.scenarios[0]);assert.ok(performance.now()-start<10000,'bounded search exceeded 10 seconds');
});
