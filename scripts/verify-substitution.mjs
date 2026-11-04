import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createTeamState, demoCatalog, coachReducer } from '../src/coach-state.ts';
import { planCoachMatch, validatePlan, adaptMatchState } from '../src/substitution/index.ts';
const minute=60000;
const catalog={...demoCatalog(),teamSeasonId:'synthetic-reference-2026',liveMatchId:'reference',
  players:Array.from({length:11},(_,i)=>({id:`p${String(i+1).padStart(2,'0')}`,number:i+1,name:`Synthetic ${i+1}`,shortName:`S${i+1}`,parent:'',position:'',substitutionProfile:{goalkeeperEligible:i<3}})),
  matches:[{id:'reference',pool:'',date:'2026-10-17',shortDate:'17 okt',time:'10:00',opponent:'Synthetic reference',venue:'Thuis',availabilityRound:1}]};
const original=createTeamState(catalog,4,8);
original.availability.reference=Object.fromEntries(catalog.players.map(p=>[p.id,'available']));
const start=performance.now();const result=planCoachMatch(original,{now:0});const durationMs=performance.now()-start;
assert.ok(result.scenarios.length);
const chosen=result.scenarios[0];
assert.ok(validatePlan(adaptMatchState(original,{now:0}),chosen.intervals).valid);
let actual=coachReducer(original,{type:'toggle-clock',now:0});
for(const s of chosen.intervals) {
  const out=actual.live.field.filter(id=>!s.field.includes(id)),incoming=s.field.filter(id=>!actual.live.field.includes(id));
  out.forEach((id,i)=>{actual=coachReducer(actual,{type:'swap',out:id,in:incoming[i],now:s.startMs});});
  if(actual.live.keeperId!==s.keeperId)actual=coachReducer(actual,{type:'keeper',playerId:s.keeperId,now:s.startMs});
}
actual=coachReducer(actual,{type:'clock',now:50*minute});
const rows=Object.entries(chosen.expectedEndMs).map(([id,value])=>{
  assert.equal(value.playedMs,actual.live.played[id].milliseconds);
  assert.equal(value.keeperMs,actual.live.played[id].keeperMilliseconds);
  return {playerId:id,targetMs:chosen.targetsMs[id],...value,actualPlayedMs:actual.live.played[id].milliseconds,actualKeeperMs:actual.live.played[id].keeperMilliseconds};
});
const totalPlayedMs=rows.reduce((sum,p)=>sum+p.actualPlayedMs,0),totalKeeperMs=rows.reduce((sum,p)=>sum+p.actualKeeperMs,0);
assert.equal(totalPlayedMs,400*minute);assert.equal(totalKeeperMs,50*minute);
const evidence={reference:{periods:4,periodMinutes:12.5,fieldSize:8,available:11,eligibleKeepers:3},
  validation:'passed',deterministic:true,totalPlayedMs,totalPlayerMinutes:totalPlayedMs/minute,totalKeeperMinutes:totalKeeperMs/minute,
  maximumTargetDeviationMs:chosen.fairnessErrorMs,optimizerDurationMs:Math.round(durationMs*100)/100,search:result.search,
  chosenScenarioId:chosen.id,policyVersion:chosen.policyVersion,rulesVersion:chosen.rulesVersion,scores:chosen.scores,
  keeperIdsUsed:[...new Set(chosen.intervals.map(s=>s.keeperId))],intervals:chosen.intervals,players:rows};
assert.deepEqual(planCoachMatch(original,{now:0}),result);
writeFileSync(new URL('../outputs/substitution-reference.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({validation:evidence.validation,playerMinutes:evidence.totalPlayerMinutes,keeperMinutes:evidence.totalKeeperMinutes,maximumTargetDeviationMs:evidence.maximumTargetDeviationMs,keeperIdsUsed:evidence.keeperIdsUsed,intervals:evidence.intervals.length,durationMs:evidence.optimizerDurationMs}));
