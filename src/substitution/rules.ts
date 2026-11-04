import type { MatchState, Occupancy, Validation, Issue } from './types.ts';
export const RULES_VERSION = 'deterministic-c/3';
export const sameLineup = (a: Pick<Occupancy,'field'|'keeperId'>, b: Pick<Occupancy,'field'|'keeperId'>) => a.keeperId === b.keeperId && a.field.length === b.field.length && a.field.every(id => b.field.includes(id));

export function rotationPoints(state:MatchState):number[] {
  const step=state.rules.rotationIntervalMs;
  const points=[...state.rules.periodBoundariesMs];
  if(step&&Number.isSafeInteger(step)&&step>0){let previous=0;for(const end of state.rules.periodBoundariesMs){for(let t=previous+step;t<end;t+=step)points.push(t);previous=end;}}
  return [...new Set(points)].sort((a,b)=>a-b);
}

export function validateLineup(state: MatchState, field: string[], keeperId: string, start: number, end: number): Issue[] {
  const issues: Issue[] = [];
  if (field.length !== state.rules.fieldSize || new Set(field).size !== field.length) issues.push({code:'FIELD_SIZE',detail:'Het veld moet precies het ingestelde aantal unieke spelers bevatten.'});
  for (const id of field) {
    const p = state.players.find(p => p.id === id);
    if (!p || !p.available || p.availableFromMs > start || p.availableUntilMs < end) issues.push({code:'UNAVAILABLE_PLAYER',detail:id});
  }
  if (!field.includes(keeperId) || !state.players.find(p => p.id === keeperId)?.goalkeeperEligible) issues.push({code:'GOALKEEPER',detail:'Precies één geschikte keeper moet deel uitmaken van het veld.'});
  if(end>start&&state.rules.keeperSchedule?.some((id,i)=>Math.max(start,state.rules.periodBoundariesMs[i-1]??0)<Math.min(end,state.rules.periodBoundariesMs[i])&&id!==keeperId))issues.push({code:'KEEPER_SCHEDULE',detail:'De keeper moet overeenkomen met de bevestigde keuze voor dit kwart of deze helft.'});
  return issues;
}
export function validateMatchState(state: MatchState): Validation {
  const issues: Issue[] = [];
  const time = (v: number) => Number.isSafeInteger(v) && v >= 0;
  const {durationMs,periodBoundariesMs,fieldSize} = state.rules;
  if(state.rules.keeperSchedule!==undefined&&(!Array.isArray(state.rules.keeperSchedule)||state.rules.keeperSchedule.length!==periodBoundariesMs.length||!state.rules.keeperSchedule.every(id=>state.players.some(p=>p.id===id&&p.goalkeeperEligible))))issues.push({code:'KEEPER_SCHEDULE',detail:'Ongeldige keeperkeuze per periode.'});
  if(state.rules.startingField!==undefined&&(!Array.isArray(state.rules.startingField)||state.rules.startingField.length!==fieldSize||new Set(state.rules.startingField).size!==fieldSize||!state.rules.startingField.every(id=>state.players.some(p=>p.id===id))))issues.push({code:'START_LINEUP',detail:'Ongeldige bevestigde startopstelling.'});
  if(state.rules.rotationIntervalMs!==undefined&&(!time(state.rules.rotationIntervalMs)||state.rules.rotationIntervalMs<30000||state.rules.rotationIntervalMs>durationMs))issues.push({code:'ROTATION_INTERVAL',detail:'Ongeldig wisselritme.'});
  if (!time(durationMs) || durationMs <= 0 || durationMs > 7200000 || !Number.isInteger(fieldSize) || fieldSize < 2 || fieldSize > 11
    || ![2,4].includes(periodBoundariesMs.length) || periodBoundariesMs.some((v,i) => !time(v) || v <= (periodBoundariesMs[i-1] ?? 0) || v !== durationMs*(i+1)/periodBoundariesMs.length) || periodBoundariesMs.at(-1) !== durationMs) issues.push({code:'MATCH_RULES',detail:'Ongeldige duur, bezetting of periodegrenzen.'});
  if (!Number.isInteger(state.currentPeriod)||state.currentPeriod<1||state.currentPeriod>periodBoundariesMs.length||!Object.values(state.actualPeriodTimesMs).every(time)) issues.push({code:'PERIOD',detail:'Ongeldige actuele periode of geregistreerde periodetijd.'});
  if (!time(state.clock.matchMs) || state.clock.breakMs !== null && !time(state.clock.breakMs) || state.clock.elapsedRealMs !== null && (!time(state.clock.elapsedRealMs) || state.clock.elapsedRealMs < state.clock.matchMs)) issues.push({code:'CLOCK',detail:'Ongeldige actieve of werkelijke tijd.'});
  if (!state.matchId || !state.teamSeasonId || !state.stateVersion || state.players.length > 50 || new Set(state.players.map(p => p.id)).size !== state.players.length) issues.push({code:'IDENTITY',detail:'Dubbele of ontbrekende identiteit.'});
  for (const p of state.players) {
    if (![p.playedMs,p.keeperMs,p.availableFromMs,p.availableUntilMs,p.maxTotalMs,p.substitutionCount].every(time) || p.keeperMs > p.playedMs || p.playedMs > state.clock.matchMs
      || p.availableFromMs > p.availableUntilMs || p.playedMs > p.maxTotalMs
      || ![p.consecutivePlayMs,p.consecutiveBenchMs,p.lastEntryMs,p.lastExitMs].every(v => v === null || time(v)&&v<=state.clock.matchMs)
      || ![p.goalkeeperQuality,p.goalkeeperPreference,...Object.values(p.positionQualities)].every(v => v === null || Number.isFinite(v) && v >= 0 && v <= 1)
      || !p.history.every(h => [h.playedMs,h.targetMs,h.keeperMs].every(v => v === null || time(v)))) issues.push({code:'PLAYER_DATA',detail:p.id});
  }
  if (state.players.reduce((sum,p)=>sum+p.keeperMs,0) !== state.clock.matchMs) issues.push({code:'CLOCK_LEDGER',detail:'De geregistreerde keeperminuten moeten samen exact de actieve wedstrijdtijd vormen.'});
  let observedEnd:number|null=null;
  for (const s of state.observedIntervals) {
    if (!time(s.startMs)||!time(s.endMs)||s.endMs<=s.startMs||s.endMs>state.clock.matchMs||observedEnd!==null&&s.startMs!==observedEnd
      || !s.field.length||s.field.length>11||new Set(s.field).size!==s.field.length||!s.field.every(id=>state.players.some(p=>p.id===id))||!s.field.includes(s.keeperId)) issues.push({code:'OBSERVED_INTERVAL',detail:'Ongeldige geregistreerde bezetting.'});
    observedEnd=s.endMs;
  }
  if (observedEnd!==null&&observedEnd!==state.clock.matchMs) issues.push({code:'OBSERVED_INTERVAL',detail:'De geregistreerde intervallen missen recente speeltijd.'});
  for (const p of state.players) {
    const played=state.observedIntervals.reduce((sum,s)=>sum+(s.field.includes(p.id)?s.endMs-s.startMs:0),0);
    const kept=state.observedIntervals.reduce((sum,s)=>sum+(s.keeperId===p.id?s.endMs-s.startMs:0),0);
    const complete=state.observedIntervals[0]?.startMs===0&&observedEnd===state.clock.matchMs;
    if (played>p.playedMs||kept>p.keeperMs||complete&&(played!==p.playedMs||kept!==p.keeperMs)) issues.push({code:'OCCUPANCY_LEDGER',detail:p.id});
  }
  if (new Set(state.bench).size !== state.bench.length || state.bench.some(id => state.field.includes(id) || !state.players.some(p => p.id === id && p.available))
    || state.players.some(p => p.available && !state.field.includes(p.id) && !state.bench.includes(p.id))) issues.push({code:'BENCH_OVERLAP',detail:'Veld en bank moeten beschikbare spelers zonder overlap verdelen.'});
  if (state.phase !== 'Einde') issues.push(...validateLineup(state,state.field,state.keeperId,state.clock.matchMs,state.clock.matchMs));
  return {valid:issues.length === 0,issues};
}
// Recompute from occupancy, never trust a supplied expected-minutes table.
export function projectMinutes(state: MatchState, intervals: Occupancy[]) {
  const totals = Object.fromEntries(state.players.map(p => [p.id,{playedMs:p.playedMs,keeperMs:p.keeperMs,fieldMs:p.playedMs-p.keeperMs}]));
  for (const s of intervals) for (const id of s.field) {
    if (!totals[id]) continue;
    const d = s.endMs-s.startMs;
    totals[id].playedMs += d;
    if (id === s.keeperId) totals[id].keeperMs += d; else totals[id].fieldMs += d;
  }
  return totals;
}
export function validatePlan(state: MatchState, intervals: Occupancy[]): Validation {
  const issues = [...validateMatchState(state).issues];
  if(state.clock.matchMs===0&&state.rules.startingKeeperId&&intervals[0]?.keeperId!==state.rules.startingKeeperId)issues.push({code:'START_KEEPER',detail:'De bevestigde startkeeper moet op doel beginnen.'});
  if(state.clock.matchMs===0&&state.rules.startingField!==undefined&&(!Array.isArray(state.rules.startingField)||!intervals[0]||state.rules.startingField.length!==intervals[0].field.length||!state.rules.startingField.every(id=>intervals[0].field.includes(id))))issues.push({code:'START_LINEUP',detail:'De bevestigde starters moeten op het veld beginnen.'});
  let cursor = state.clock.matchMs;
  for (const s of intervals) {
    if(state.rules.rotationIntervalMs!==undefined&&s.startMs!==state.clock.matchMs&&!rotationPoints(state).includes(s.startMs))issues.push({code:'ROTATION_INTERVAL',detail:'Het plan wijkt af van het gekozen wisselritme.'});
    if (!Number.isSafeInteger(s.startMs) || !Number.isSafeInteger(s.endMs) || s.startMs !== cursor || s.endMs <= s.startMs || s.endMs > state.rules.durationMs) issues.push({code:'INTERVAL',detail:'Bezettingsintervallen moeten aaneengesloten zijn en precies de resterende wedstrijd beslaan.'});
    issues.push(...validateLineup(state,s.field,s.keeperId,s.startMs,s.endMs)); cursor = s.endMs;
  }
  if (cursor !== Math.max(state.clock.matchMs,state.rules.durationMs)) issues.push({code:'HORIZON',detail:'De volledige resterende wedstrijd moet gepland zijn.'});
  const totals = projectMinutes(state,intervals);
  for (const p of state.players) if (totals[p.id].playedMs > p.maxTotalMs) issues.push({code:'MINUTE_LIMIT',detail:p.id});
  return {valid:issues.length === 0,issues};
}
// Pure phase-3 execution gate. Acceptance alone never changes the reducer.
export function validateExecution(state: MatchState, proposal: {stateVersion:string; policyVersion:number; atMs:number; field:string[]; keeperId:string}, policyVersion: number, confirmation: {accepted:boolean; executed:boolean}): Validation {
  const issues = [...validateMatchState(state).issues];
  if (state.archived || state.phase === 'Einde') issues.push({code:'READ_ONLY',detail:'Deze wedstrijd kan niet worden gewijzigd.'});
  if (proposal.stateVersion !== state.stateVersion || proposal.policyVersion !== policyVersion) issues.push({code:'STALE_PROPOSAL',detail:'Herbereken met de actuele wedstrijdstatus en beleidsversie.'});
  if (!confirmation.accepted || !confirmation.executed) issues.push({code:'NOT_EXECUTED',detail:'Acceptatie én bevestiging van werkelijke uitvoering zijn vereist.'});
  if (proposal.atMs !== state.clock.matchMs) issues.push({code:'EXECUTION_TIME',detail:'Registreer de werkelijke uitvoeringstijd.'});
  const scheduled=state.rules.keeperSchedule?.[Math.min(state.rules.periodBoundariesMs.length-1,state.rules.periodBoundariesMs.filter(t=>t<=state.clock.matchMs).length)];
  if(scheduled&&proposal.keeperId!==scheduled)issues.push({code:'KEEPER_SCHEDULE',detail:'De keeperwissel hoort bij een ander kwart of een andere helft.'});
  issues.push(...validateLineup(state,proposal.field,proposal.keeperId,state.clock.matchMs,state.clock.matchMs));
  for (const id of proposal.field) if ((state.players.find(p=>p.id===id)?.maxTotalMs ?? 0) <= (state.players.find(p=>p.id===id)?.playedMs ?? 0)) issues.push({code:'MINUTE_LIMIT',detail:id});
  return {valid:issues.length===0,issues};
}
