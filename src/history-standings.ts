import {recordedMatchResult, type CoachState, type Match} from './coach-state.ts';
import {processedMatchIds} from './result-only.ts';

export type MatchOutcome = 'win' | 'draw' | 'loss';

export const outcomeLabels: Record<MatchOutcome,string> = {win:'Winst',draw:'Gelijk',loss:'Verlies'};

export function registeredMatchResults(state:CoachState,matches:Match[]) {
  const processed=processedMatchIds(state);
  return matches.filter(match=>processed.has(match.id)).map(match=>{
    const score=recordedMatchResult(state,match.id);
    if(!score)return {match,result:null};
    const goalDifference=score.goalsFor-score.goalsAgainst;
    const outcome:MatchOutcome=goalDifference>0?'win':goalDifference<0?'loss':'draw';
    return {match,result:{...score,outcome,points:outcome==='win'?3:outcome==='draw'?1:0}};
  });
}

export function matchStanding(rows:ReturnType<typeof registeredMatchResults>) {
  const standing={played:rows.length,unknown:0,win:0,draw:0,loss:0,points:0,goalDifference:0};
  for(const {result} of rows){
    if(!result){standing.unknown++;continue;}
    standing[result.outcome]++;
    standing.points+=result.points;
    standing.goalDifference+=result.goalsFor-result.goalsAgainst;
  }
  return standing;
}
