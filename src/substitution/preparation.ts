import {isProcessed} from '../result-only.ts';
import {validatePreparedFormation} from '../formations.ts';
import { createTeamState, demoCatalog, goalsOnlyMatch, type CoachState, type Availability } from '../coach-state.ts';
import { adaptMatchState, dateKey } from './adapter.ts';
import { optimizeSubstitutions } from './optimizer.ts';
import { defaultPolicy } from './policy.ts';
import { sameLineup } from './rules.ts';
import type { Scenario, FieldPosition } from './types.ts';

export type Cadence = 'period'|'5-min'|'10-min'|'auto';
export type SquadSelection = {formation?:number[];matchId:string; statuses:Record<string,Availability>; keeperIds:string[]; startingKeeperId:string; keeperSchedule?:string[]; cadence?:Cadence; startingField?:string[]; startingPositions?:Record<string,FieldPosition>};

// Select a practical grid before recording the command. Persisting the explicit
// choice keeps old journal commands reproducible and all subsequent replans on
// that grid. Never round a free plan: that would change its projected minutes.
export function recommendCadence(state:CoachState,selection:SquadSelection,now:number):Exclude<Cadence,'auto'> {
  const policy=state.team.substitutionPolicy??defaultPolicy();
  const candidates=(['period','10-min','5-min'] as const).flatMap(cadence=>{
    const prepared=prepareSquad(state,{...selection,cadence},now);
    const plan=optimizeSubstitutions(adaptMatchState(prepared,{now}),policy).scenarios[0];
    return plan?[{cadence,plan}]:[];
  });
  if(!candidates.length)throw new Error('Geen geldig plan met praktische wisselintervallen. Controleer de spelersgroep en persoonlijke minutenlimieten.');
  const bestError=Math.min(...candidates.map(c=>c.plan.fairnessErrorMs));
  return candidates.filter(c=>c.plan.fairnessErrorMs<=bestError+policy.fairnessToleranceMs).sort((a,b)=>
    Math.floor(b.plan.scores.total*100)-Math.floor(a.plan.scores.total*100)
    ||b.plan.scores.calm-a.plan.scores.calm||b.plan.scores.total-a.plan.scores.total
    ||a.plan.fairnessErrorMs-b.plan.fairnessErrorMs)[0].cadence;
}

// Prefer familiar keepers for the suggestion; the coach confirms suitability for this match.
export function suggestMatchKeepers(state:CoachState,matchId:string,presentIds:string[]) {
  const c=state.catalog??demoCatalog(),match=c.matches.find(m=>m.id===matchId);
  const before=match&&dateKey(match);
  const history=c.matches.filter(m=>m.id!==matchId&&!goalsOnlyMatch(state,m.id)&&before&&dateKey(m)&&dateKey(m)!<before&&state.stats.some(r=>r.matchId===m.id))
    .sort((a,b)=>dateKey(b)!.localeCompare(dateKey(a)!)).slice(0,state.team.substitutionPolicy?.historyMatches??5);
  return c.players.filter(p=>presentIds.includes(p.id)).map(p=>{
    const rows=history.flatMap(m=>state.stats.filter(r=>r.matchId===m.id&&r.playerId===p.id&&r.present&&r.keeperMinutesKnown!==false&&r.keeperMinutes>0));
    return {p,turns:rows.length,minutes:rows.reduce((n,r)=>n+r.keeperMinutes,0)};
  }).filter(({p})=>p.substitutionProfile?.goalkeeperEligible!==false)
    .sort((a,b)=>b.turns-a.turns||b.minutes-a.minutes||Number(Boolean(b.p.substitutionProfile?.goalkeeperEligible||b.p.position==='K'||matchId===c.liveMatchId&&b.p.id===state.live.keeperId))-Number(Boolean(a.p.substitutionProfile?.goalkeeperEligible||a.p.position==='K'||matchId===c.liveMatchId&&a.p.id===state.live.keeperId))||(b.p.substitutionProfile?.goalkeeperPreference??0)-(a.p.substitutionProfile?.goalkeeperPreference??0)||a.p.id.localeCompare(b.p.id))
    .slice(0,2).map(({p})=>p.id);
}

// Used for the local preview and replay of the compact confirmation command.
export function prepareSquad(state:CoachState,selection:SquadSelection,now:number):CoachState {
  const c=state.catalog??demoCatalog(),{matchId,statuses,keeperIds,startingKeeperId}=selection;
  if(c.archived||!Number.isSafeInteger(now)||now<0||!c.matches.some(m=>m.id===matchId)||isProcessed(state,matchId))throw new Error('Deze wedstrijd is alleen-lezen.');
  if(c.liveMatchId!==matchId&&state.live.phase!=='Einde')throw new Error('Sluit de actieve wedstrijd eerst af.');
  if(c.liveMatchId===matchId&&(state.live.elapsedMs!==0||state.live.runningSince!==null||state.live.phase!=='Spelen'||state.live.goals.length||state.live.awayGoals.length||state.live.swaps.length))throw new Error('De wedstrijd is al begonnen. Pas de aanwezigheid en keeper aan bij Live.');
  if(!statuses||typeof statuses!=='object'||Array.isArray(statuses)||Object.keys(statuses).length!==c.players.length||!c.players.every(p=>['available','unavailable'].includes(statuses[p.id])))throw new Error('Bevestig voor iedere speler aanwezig of afwezig.');
  const presentIds=c.players.filter(p=>statuses[p.id]==='available').map(p=>p.id),size=state.team.fieldSize??6;
  if(presentIds.length<size)throw new Error(`Bevestig minstens ${size} aanwezige spelers.`);
  if(!Array.isArray(keeperIds)||!keeperIds.length||keeperIds.length>4||new Set(keeperIds).size!==keeperIds.length||!keeperIds.every(id=>presentIds.includes(id))||!keeperIds.includes(startingKeeperId))throw new Error('Kies één tot vier aanwezige keepers en een startkeeper.');
  if(selection.keeperSchedule!==undefined&&(!Array.isArray(selection.keeperSchedule)||selection.keeperSchedule.length!==state.team.periods||selection.keeperSchedule[0]!==startingKeeperId||!selection.keeperSchedule.every(id=>keeperIds.includes(id))||!keeperIds.every(id=>selection.keeperSchedule!.includes(id))))throw new Error('Kies voor ieder kwart of iedere helft één aanwezige keeper.');
  if(selection.cadence!==undefined&&!['period','5-min','10-min','auto'].includes(selection.cadence))throw new Error('Kies een geldig wisselritme.');
  const catalog={...c,liveMatchId:matchId};
  const live=c.liveMatchId===matchId?state.live:createTeamState(catalog,state.team.periods,size).live;
  const field=selection.startingField??[startingKeeperId,...live.field.filter(id=>id!==startingKeeperId&&presentIds.includes(id)),...presentIds.filter(id=>id!==startingKeeperId&&!live.field.includes(id))].slice(0,size);
  if(!Array.isArray(field)||field.length!==size||new Set(field).size!==size||!field.every(id=>presentIds.includes(id))||!field.includes(startingKeeperId))throw new Error(`Kies precies ${size} aanwezige starters, inclusief startkeeper.`);
  if(selection.startingPositions!==undefined&&(!selection.startingPositions||typeof selection.startingPositions!=='object'||Array.isArray(selection.startingPositions)||Object.entries(selection.startingPositions).some(([id,role])=>!field.includes(id)||id===startingKeeperId||!['V','M','A'].includes(role))))throw new Error('Een startpositie hoort bij een veldspeler in deze startopstelling.');
  validatePreparedFormation(selection);
  return {...state,catalog,availability:{...state.availability,[matchId]:{...statuses}},
    formUpdates:{...state.formUpdates,...Object.fromEntries(c.players.map(p=>[`${matchId}/${p.id}`,{time:new Date(now).toISOString(),manual:true}]))},
    live:{...live,field:[...field],keeperId:startingKeeperId,adviceEpoch:(state.live.adviceEpoch??0)+1,preparation:{...(selection.keeperSchedule?{keeperSchedule:[...selection.keeperSchedule]}:{}),...(selection.formation?{formation:[...selection.formation]}:{}),confirmedAt:now,presentIds,keeperIds:[...keeperIds],startingKeeperId,cadence:selection.cadence??'5-min',...(selection.startingField?{startingField:[...field]}:{}),...(selection.startingPositions?{startingPositions:{...selection.startingPositions}}:{})}}};
}

export function startingPositions(state:CoachState,field:string[],keeperId:string):Record<string,FieldPosition> {
  const c=state.catalog??demoCatalog(),stored=state.live.preparation?.startingPositions??{};
  return Object.fromEntries(field.filter(id=>id!==keeperId).flatMap(id=>{const role=stored[id]??c.players.find(p=>p.id===id)?.position;return ['V','M','A'].includes(role??'')?[[id,role as FieldPosition]]:[];}));
}

export function planOverview(plan:Scenario) {
  const start=plan.intervals[0];
  const moments=plan.intervals.filter((s,i)=>i>0&&!sameLineup(s,plan.intervals[i-1]));
  const gaps=moments.map((s,i)=>s.startMs-(i?moments[i-1].startMs:start.startMs));
  const regular=gaps.length>0&&gaps.every(d=>d===gaps[0]);
  return {start,moments,intervalMs:regular?gaps[0]:null};
}

// Preserve identities as well as counts: a smaller exchange leaves some of the
// same players on the bench, while the total field/bench occupancy stays fixed.
export function rotationDetails(plan:Scenario,presentIds:string[],periods:number) {
  const length=plan.intervals.at(-1)!.endMs/periods;
  return plan.intervals.slice(1).flatMap((next,i)=>{
    const previous=plan.intervals[i];
    if(sameLineup(previous,next))return [];
    const bench=presentIds.filter(id=>!next.field.includes(id));
    return [{atMs:next.startMs,period:Math.min(periods,Math.floor(next.startMs/length)+1),afterMs:next.startMs%length,
      incoming:next.field.filter(id=>!previous.field.includes(id)),outgoing:previous.field.filter(id=>!next.field.includes(id)),
      staysBench:bench.filter(id=>!previous.field.includes(id)),bench,field:[...next.field],
      keeperChange:next.keeperId!==previous.keeperId,keeperId:next.keeperId}];
  });
}

// A presentation summary of actual transitions, never a nominal cadence claim.
// Equal patterns can share a row; exceptions retain their own period numbers.
export function rotationInstructions(plan:Scenario,periods:number) {
  const length=plan.intervals.at(-1)!.endMs/periods;
  const changes=plan.intervals.slice(1).flatMap((s,i)=>sameLineup(s,plan.intervals[i])?[]:[{
    atMs:s.startMs,count:s.field.filter(id=>!plan.intervals[i].field.includes(id)).length,
    keeperChange:s.keeperId!==plan.intervals[i].keeperId
  }]);
  type Moment={afterMs:number;count:number;keeperChange:boolean};
  const within:{periods:number[];moments:Moment[]}[]=[],between:{periods:number[];count:number;keeperChange:boolean}[]=[];
  for(let p=1;p<=periods;p++){
    const start=(p-1)*length,end=p*length;
    const moments=changes.filter(c=>c.atMs>start&&c.atMs<end).map(c=>({afterMs:c.atMs-start,count:c.count,keeperChange:c.keeperChange}));
    const group=within.find(g=>JSON.stringify(g.moments)===JSON.stringify(moments));
    if(group)group.periods.push(p);else within.push({periods:[p],moments});
    if(p===periods)continue; // Affluiten is not a substitution opportunity.
    const change=changes.find(c=>c.atMs===end),count=change?.count??0,keeperChange=change?.keeperChange??false;
    const pause=between.find(g=>g.count===count&&g.keeperChange===keeperChange);
    if(pause)pause.periods.push(p);else between.push({periods:[p],count,keeperChange});
  }
  return {within,between};
}
