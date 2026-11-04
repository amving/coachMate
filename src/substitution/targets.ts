import type { MatchState } from './types.ts';
import type { SubstitutionPolicy } from './policy.ts';

// Bounded simplex projection in integer milliseconds. Rounding conserves the exact budget.
export function allocate(total:number, desired:number[], lower:number[], upper:number[]): number[] {
  if (lower.reduce((a,b)=>a+b,0)>total || upper.reduce((a,b)=>a+b,0)<total || lower.some((v,i)=>v>upper[i])) throw new Error('INFEASIBLE_MINUTE_BUDGET');
  let lo=-1000000000,hi=1000000000;
  for(let n=0;n<64;n++) {
    const mid=(lo+hi)/2;
    const sum=desired.reduce((s,v,i)=>s+Math.max(lower[i],Math.min(upper[i],v+mid)),0);
    if(sum<total)lo=mid;else hi=mid;
  }
  const values=desired.map((v,i)=>Math.max(lower[i],Math.min(upper[i],v+(lo+hi)/2)));
  const rounded=values.map(Math.floor);
  const order=values.map((v,i)=>({i,fraction:v-rounded[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
  let missing=total-rounded.reduce((a,b)=>a+b,0);
  for(const {i} of order)if(missing>0&&rounded[i]<upper[i]){rounded[i]++;missing--;}
  if(missing!==0)throw new Error('MINUTE_ROUNDING');
  return rounded;
}
export function calculateTargets(state:MatchState,policy:SubstitutionPolicy) {
  const start=state.clock.matchMs,end=Math.max(start,state.rules.durationMs),remaining=end-start;
  const points=[...new Set([start,end,...(state.rules.keeperSchedule?state.rules.periodBoundariesMs:[]),...state.players.flatMap(p=>[p.availableFromMs,p.availableUntilMs])].filter(t=>t>=start&&t<=end))].sort((a,b)=>a-b);
  const forced=Object.fromEntries(state.players.map(p=>[p.id,0]));
  for(let i=0;i<points.length-1;i++) {
    const scheduled=state.rules.keeperSchedule?.[Math.min(state.rules.periodBoundariesMs.length-1,state.rules.periodBoundariesMs.filter(t=>t<=points[i]).length)];
    const candidates=state.players.filter(p=>p.available&&p.goalkeeperEligible&&(!scheduled||p.id===scheduled)&&p.availableFromMs<=points[i]&&p.availableUntilMs>=points[i+1]);
    if(candidates.length===1)forced[candidates[0].id]+=points[i+1]-points[i];
  }
  const lower=state.players.map(p=>p.playedMs+forced[p.id]);
  const upper=state.players.map(p=>p.playedMs+(p.available?Math.min(Math.max(0,Math.min(end,p.availableUntilMs)-Math.max(start,p.availableFromMs)),Math.max(0,p.maxTotalMs-p.playedMs)):0));
  const budget=state.players.reduce((s,p)=>s+p.playedMs,0)+remaining*state.rules.fieldSize;
  const count=state.players.filter(p=>p.available&&p.availableUntilMs>start&&p.availableFromMs<end).length;
  const base=allocate(budget,state.players.map(p=>p.available?budget/Math.max(1,count):p.playedMs),lower,upper);
  const caps=base.map(v=>Math.floor(v*policy.maxHistoricalCorrection));
  const desired=base.map((v,i)=>{
    const h=state.players[i].history.filter(h=>h.playedMs!==null&&h.targetMs!==null).slice(0,policy.historyMatches);
    const debt=h.reduce((s,h)=>s+h.targetMs!-h.playedMs!,0)*policy.compensationFactor;
    return v+Math.max(-caps[i],Math.min(caps[i],debt));
  });
  const targets=allocate(budget,desired,base.map((v,i)=>Math.max(lower[i],v-caps[i])),base.map((v,i)=>Math.min(upper[i],v+caps[i])));
  return {budgetMs:budget,baseMs:Object.fromEntries(state.players.map((p,i)=>[p.id,base[i]])),targetsMs:Object.fromEntries(state.players.map((p,i)=>[p.id,targets[i]]))};
}
