import type { MatchState, OptimizerPlayer } from './types.ts';
import type { SubstitutionPolicy } from './policy.ts';

export function keeperBurden(player: OptimizerPlayer, keeperMs: number, historyMatches=5) {
  const known=player.history.filter(h=>h.keeperMs!==null).slice(0,historyMatches);
  return keeperMs+(known.length?known.reduce((sum,h)=>sum+h.keeperMs!,0)/known.length:0);
}
export function chooseKeeper(state:MatchState, eligible:OptimizerPlayer[], current:string, keeperMs:Record<string,number>, policy:SubstitutionPolicy, boundary:boolean, atMs=state.clock.matchMs): string | null {
  const keepers=eligible.filter(p=>p.goalkeeperEligible);
  if(state.rules.keeperSchedule){const index=Math.min(state.rules.keeperSchedule.length-1,state.rules.periodBoundariesMs.filter(end=>end<=atMs).length);return keepers.find(p=>p.id===state.rules.keeperSchedule![index])?.id??null;}
  if (!keepers.length) return null;
  if ((!boundary||policy.goalkeeperMode==='FIXED')&&keepers.some(p=>p.id===current))return current;
  return keepers.sort((a,b)=>keeperBurden(a,keeperMs[a.id],policy.historyMatches)-keeperBurden(b,keeperMs[b.id],policy.historyMatches)
    || (b.goalkeeperPreference??0)-(a.goalkeeperPreference??0)
    || (b.goalkeeperQuality??0)-(a.goalkeeperQuality??0) || a.id.localeCompare(b.id))[0].id;
}
