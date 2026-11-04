import {validatePreparedFormation} from '../formations.ts';
import { demoCatalog, settleLive, fullStatsFromRound, type CoachState } from '../coach-state.ts';
import { adaptMatchState } from './adapter.ts';
import { optimizeSubstitutions, scorePlan } from './optimizer.ts';
import { defaultPolicy } from './policy.ts';
import { projectMinutes, RULES_VERSION, sameLineup, validateExecution, validatePlan } from './rules.ts';
import type { Occupancy, Scenario } from './types.ts';
import { prepareSquad, startingPositions, type SquadSelection } from './preparation.ts';

export type AdviceEvent = {id:string; adviceId:string; kind:'generated'|'accepted'|'deferred'|'skipped'|'adjusted'|'executed'; at:number; matchMs:number; epoch:number; policyVersion:number; rulesVersion:string;
  squad?:NonNullable<CoachState['live']['preparation']>;
  proposal?:{atMs:number;out:string[];in:string[];fromKeeper:string;toKeeper:string;expectedEndMs:Scenario['expectedEndMs'];scores:Scenario['scores'];reasonCodes:string[]}};
export type AdviceSession = {
  plan:Scenario; epoch:number; context:string; createdAt:number; status:'proposed'|'accepted'|'deferred'|'skipped'|'executed';
  deferUntilMs?:number; targetsMs?:Record<string,number>; events:AdviceEvent[];
};
export type AdviceAction =
  | ({type:'assistant-prepare';confirmed?:true;id:string;eventId:string;expectedEpoch:number;now:number}&SquadSelection)
  | {type:'assistant-plan';id:string;eventId:string;expectedEpoch:number;alternative?:number;now:number}
  | {type:'assistant-decision';id:string;eventId:string;expectedEpoch:number;decision:'accept'|'skip'|'defer';now:number}
  | {type:'assistant-adjust';id:string;eventId:string;expectedEpoch:number;field:string[];keeperId:string;now:number}
  | {type:'assistant-execute';id:string;eventId:string;expectedEpoch:number;now:number};
const identity=(id:string)=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(id);
export const adviceEpoch=(state:CoachState)=>state.live.adviceEpoch??0;
export const adviceFor=(state:CoachState)=>state.assistant?.[(state.catalog??demoCatalog()).liveMatchId];
export function adviceContext(state:CoachState) {
  const c=state.catalog??demoCatalog();
  return JSON.stringify([RULES_VERSION,c.teamSeasonId,c.liveMatchId,c.archived,adviceEpoch(state),state.live.preparation,state.live.field,state.live.keeperId,state.live.periods,state.live.period,state.team,c.players.map(p=>[p.id,p.position,p.substitutionProfile??null]),state.availability[c.liveMatchId],state.stats,...(fullStatsFromRound(state)>1?[{fullStatsFromRound:fullStatsFromRound(state)}]:[])]);
}

export function nextAdvice(state:CoachState,session=adviceFor(state)):Occupancy|null {
  if(!session||session.context!==adviceContext(state)||session.epoch!==adviceEpoch(state)||session.status==='skipped')return null;
  return session.plan.intervals.find(s=>!sameLineup(s,state.live))??null;
}
export function explainAdvice(codes:string[]):string[] {
  const text:Record<string,string>={HYBRID_C:'Speeltijd, rotatie en bekende positiekwaliteit zijn samen afgewogen.',KEEPER_COUNTS_AS_PLAY:'Keeperminuten tellen volledig mee als speeltijd.',SINGLE_ELIGIBLE_KEEPER:'Er is maar één bevestigde geschikte keeper; die moet blijven keepen.',NO_TACTICAL_QUALITY_DATA:'Er zijn geen kwaliteitsscores ingevuld; er is geen tactische kwaliteit verzonnen.',BOUNDED_HISTORICAL_COMPENSATION:'Bekende historische achterstanden zijn binnen de ingestelde grenzen gecompenseerd.',UNKNOWN_HISTORICAL_TARGETS:'Oude persoonlijke streeftijden ontbreken. Voor die wedstrijden is geen achterstand verzonnen.',MID_PERIOD_FAIRNESS_REPAIR:'Een wissel tussen periodeovergangen verbetert de minutenverdeling.',MANUAL_ADJUSTMENT:'De coach heeft dit voorstel aangepast. Bekijk de nieuwe eindminuten.'};
  return codes.flatMap(c=>text[c]?[text[c]]:[]);
}
export function generateAdvice(state:CoachState,now:number,alternative=0) {
  const snapshot=adaptMatchState(state,{now});
  const policy=state.team.substitutionPolicy??defaultPolicy();
  const result=optimizeSubstitutions(snapshot,policy);
  if(!result.scenarios.length)throw new Error(result.issues[0]?.detail??'Geen geldig plan beschikbaar.');
  if(!Number.isInteger(alternative)||alternative<0||alternative>=result.scenarios.length)throw new Error('Dit alternatief is niet meer beschikbaar. Bereken opnieuw.');
  return {snapshot,result,plan:result.scenarios[alternative]};
}

// Shared by browser and backend replay. Only this action changes the entire lineup atomically.
export function reduceAdvice(state:CoachState,action:AdviceAction):CoachState {
  if(action.type==='assistant-prepare'){
    if(Object.values(state.assistant??{}).some(s=>s.events.some(e=>e.id===action.eventId)))return state;
    if(action.expectedEpoch!==adviceEpoch(state)||!identity(action.id)||!identity(action.eventId)||action.confirmed!==undefined&&action.confirmed!==true)return state;
    if((state.assistant?.[action.matchId]?.events.length??0)>=2000)return state;
    let prepared=prepareSquad(state,action,action.now);
    const generated=generateAdvice(prepared,action.now),start=generated.plan.intervals[0];
    prepared={...prepared,live:{...prepared.live,field:[...start.field],keeperId:start.keeperId,preparation:{...prepared.live.preparation!,startingPositions:startingPositions(prepared,start.field,start.keeperId)}}};
    const snapshot=adaptMatchState(prepared,{now:action.now}),policy=prepared.team.substitutionPolicy??defaultPolicy();
    if(!validatePlan(snapshot,generated.plan.intervals).valid)return state;
    const scored=scorePlan(snapshot,generated.plan.intervals,generated.plan.targetsMs,policy);
    const plan={...generated.plan,id:action.id,stateVersion:snapshot.stateVersion,expectedEndMs:scored.totals,scores:scored.scores,fairnessErrorMs:scored.error};
    const old=prepared.assistant?.[action.matchId];
    const change=plan.intervals.find(s=>!sameLineup(s,prepared.live));
    const proposal={atMs:change?.startMs??0,out:change?prepared.live.field.filter(id=>!change.field.includes(id)):[],in:change?change.field.filter(id=>!prepared.live.field.includes(id)):[],fromKeeper:start.keeperId,toKeeper:change?.keeperId??start.keeperId,expectedEndMs:plan.expectedEndMs,scores:plan.scores,reasonCodes:plan.reasonCodes};
    const session:AdviceSession={plan,epoch:adviceEpoch(prepared),context:adviceContext(prepared),createdAt:action.now,status:action.confirmed?'accepted':'proposed',...(action.confirmed?{targetsMs:{...plan.targetsMs}}:{}),events:[...(old?.events??[]),{id:action.eventId,adviceId:action.id,kind:action.confirmed?'accepted':'generated',at:action.now,matchMs:0,epoch:adviceEpoch(prepared),policyVersion:plan.policyVersion,rulesVersion:plan.rulesVersion,squad:structuredClone(prepared.live.preparation!),proposal:structuredClone(proposal)}]};
    return {...prepared,assistant:{...prepared.assistant,[action.matchId]:session}};
  }
  const catalog=state.catalog??demoCatalog(),matchId=catalog.liveMatchId,old=adviceFor(state);
  if(catalog.archived||state.live.phase==='Einde'||!matchId||!identity(action.eventId)||!identity(action.id)||!Number.isSafeInteger(action.now)||action.now<0)return state;
  if(old?.events.some(e=>e.id===action.eventId))return state;
  if(action.expectedEpoch!==adviceEpoch(state))return state;
  const snapshot=adaptMatchState(state,{now:action.now}),policy=state.team.substitutionPolicy??defaultPolicy();
  let session:AdviceSession;let kind:AdviceEvent['kind'];let next=state;
  if(action.type==='assistant-plan') {
    const generated=generateAdvice(state,action.now,action.alternative??0);
    session={plan:{...generated.plan,id:action.id},epoch:adviceEpoch(state),context:adviceContext(state),createdAt:action.now,status:'proposed',events:old?.events??[],targetsMs:old?.targetsMs};kind='generated';
  }else {
    if(!old||old.context!==adviceContext(state)||old.plan.id!==action.id||old.epoch!==adviceEpoch(state)||old.plan.policyVersion!==policy.version||old.plan.rulesVersion!==RULES_VERSION)return state;
    session={...old};
    if(action.type==='assistant-decision') {
      if(['skipped','executed'].includes(old.status))return state;
      if(action.decision==='accept'){session.status='accepted';session.targetsMs??={...old.plan.targetsMs};kind='accepted';}
      else if(action.decision==='skip'){session.status='skipped';kind='skipped';}
      else if(action.decision==='defer'){session.status='deferred';session.deferUntilMs=snapshot.clock.matchMs+120000;kind='deferred';}
      else return state;
    }else if(action.type==='assistant-adjust') {
      const change=nextAdvice(state,old);if(!change)return state;
      const intervals=old.plan.intervals.filter(s=>s.endMs>snapshot.clock.matchMs).map(s=>({...s,startMs:Math.max(s.startMs,snapshot.clock.matchMs),field:[...s.field]}));
      const index=intervals.findIndex(s=>s.endMs===change.endMs);
      if(index<0)return state;
      intervals[index]={...intervals[index],field:[...action.field],keeperId:action.keeperId};
      if(!validatePlan(snapshot,intervals).valid)return state;
      const scored=scorePlan(snapshot,intervals,old.plan.targetsMs,policy);
      session={...old,status:'proposed',deferUntilMs:undefined,createdAt:action.now,plan:{...old.plan,id:action.eventId,stateVersion:snapshot.stateVersion,intervals,expectedEndMs:scored.totals,scores:scored.scores,fairnessErrorMs:scored.error,reasonCodes:[...new Set([...old.plan.reasonCodes,'MANUAL_ADJUSTMENT'])]}};kind='adjusted';
    }else {
      if(old.status!=='accepted'||old.deferUntilMs!==undefined&&snapshot.clock.matchMs<old.deferUntilMs)return state;
      const change=nextAdvice(state,old);if(!change)return state;
      const check=validateExecution(snapshot,{stateVersion:snapshot.stateVersion,policyVersion:old.plan.policyVersion,atMs:snapshot.clock.matchMs,field:change.field,keeperId:change.keeperId},policy.version,{accepted:true,executed:true});
      if(!check.valid)return state;
      const live=settleLive(state.live,action.now);
      const out=live.field.filter(id=>!change.field.includes(id)),incoming=change.field.filter(id=>!live.field.includes(id));
      next={...state,live:{...live,field:[...change.field],keeperId:change.keeperId,adviceEpoch:adviceEpoch(state)+1,
        swaps:[...live.swaps,...out.map((id,i)=>({out:id,in:incoming[i],minute:Math.floor(live.elapsedMs/60000),atMs:live.elapsedMs}))]}};
      session.status='executed';kind='executed';
    }
  }
  const change=nextAdvice(state,{...session,status:'proposed'});
  const proposal={atMs:change?.startMs??snapshot.clock.matchMs,out:change?state.live.field.filter(id=>!change.field.includes(id)):[],in:change?change.field.filter(id=>!state.live.field.includes(id)):[],fromKeeper:state.live.keeperId,toKeeper:change?.keeperId??state.live.keeperId,expectedEndMs:session.plan.expectedEndMs,scores:session.plan.scores,reasonCodes:session.plan.reasonCodes};
  session.events=[...session.events,{id:action.eventId,adviceId:session.plan.id,kind,at:action.now,matchMs:snapshot.clock.matchMs,epoch:session.epoch,policyVersion:session.plan.policyVersion,rulesVersion:session.plan.rulesVersion,proposal:structuredClone(proposal)}];
  if(session.events.length>2000)return state;
  return {...next,assistant:{...state.assistant,[matchId]:session}};
}

export function validateAdviceStorage(state:CoachState) {
  if(state.assistant===undefined)return;
  const catalog=state.catalog??demoCatalog();
  if(!state.assistant||typeof state.assistant!=='object'||Array.isArray(state.assistant))throw new Error('Ongeldige adviesopslag.');
  for(const [id,s] of Object.entries(state.assistant)) {
    const p=s?.plan;
    if(!catalog.matches.some(m=>m.id===id)||!p||p.matchId!==id||p.teamSeasonId!==catalog.teamSeasonId||!identity(p.id)||!Number.isSafeInteger(s.epoch)||s.epoch<0||!Number.isSafeInteger(s.createdAt)||!['proposed','accepted','deferred','skipped','executed'].includes(s.status)||!Array.isArray(p.intervals)||p.intervals.length>1200||!Array.isArray(s.events)||s.events.length>2000||new Set(s.events.map(e=>e.id)).size!==s.events.length)throw new Error('Ongeldige adviesopslag.');
    if(typeof s.context!=='string'||typeof p.stateVersion!=='string'||typeof p.rulesVersion!=='string'||!Number.isSafeInteger(p.policyVersion)||p.policyVersion<1||!Number.isSafeInteger(p.fairnessErrorMs)||p.fairnessErrorMs<0||s.deferUntilMs!==undefined&&(!Number.isSafeInteger(s.deferUntilMs)||s.deferUntilMs<0)||!p.scores||!Object.entries(p.scores).every(([key,n])=>key==='tactical'&&n===null||typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)||!Array.isArray(p.reasonCodes)||!p.reasonCodes.every(c=>typeof c==='string'))throw new Error('Ongeldige adviesmetadata.');
    if(!p.expectedEndMs||Object.entries(p.expectedEndMs).some(([pid,n])=>!catalog.players.some(player=>player.id===pid)||!n||![n.playedMs,n.keeperMs,n.fieldMs].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=7200000)||n.playedMs!==n.fieldMs+n.keeperMs))throw new Error('Ongeldige verwachte minuten.');
    for(const interval of p.intervals)if(!Number.isSafeInteger(interval.startMs)||!Number.isSafeInteger(interval.endMs)||interval.startMs<0||interval.endMs<=interval.startMs||!Array.isArray(interval.field)||new Set(interval.field).size!==interval.field.length||!interval.field.every(pid=>catalog.players.some(player=>player.id===pid))||!interval.field.includes(interval.keeperId))throw new Error('Ongeldige adviesbezetting.');
    if(![p.targetsMs,s.targetsMs??{}].every(map=>map&&Object.entries(map).every(([pid,n])=>catalog.players.some(player=>player.id===pid)&&Number.isSafeInteger(n)&&n>=0&&n<=7200000)))throw new Error('Ongeldige adviesdoelen.');
    if(!s.events.every(e=>identity(e.id)&&identity(e.adviceId)&&Number.isSafeInteger(e.at)&&e.at>=0&&Number.isSafeInteger(e.matchMs)&&e.matchMs>=0&&Number.isInteger(e.policyVersion)&&e.policyVersion>0&&['generated','accepted','deferred','skipped','adjusted','executed'].includes(e.kind)))throw new Error('Ongeldige adviesregistratie.');
    for(const e of s.events)if(e.squad){const q=e.squad;validatePreparedFormation(q);if(!Number.isSafeInteger(q.confirmedAt)||q.confirmedAt<0||![q.presentIds,q.keeperIds].every(ids=>Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(pid=>catalog.players.some(p=>p.id===pid)))||!q.keeperIds.every(pid=>q.presentIds.includes(pid))||!q.keeperIds.includes(q.startingKeeperId)||q.cadence!==undefined&&!['period','5-min','10-min','auto'].includes(q.cadence))throw new Error('Ongeldige bevestigde spelersgroep in adviesregistratie.');if(q.startingField!==undefined&&(!Array.isArray(q.startingField)||![6,8,11].includes(q.startingField.length)||new Set(q.startingField).size!==q.startingField.length||!q.startingField.every(pid=>q.presentIds.includes(pid))||!q.startingField.includes(q.startingKeeperId)))throw new Error('Ongeldige historische startopstelling.');if(q.startingPositions!==undefined&&(!q.startingPositions||typeof q.startingPositions!=='object'||Array.isArray(q.startingPositions)||Object.entries(q.startingPositions).some(([pid,role])=>!q.presentIds.includes(pid)||q.startingField!==undefined&&!q.startingField.includes(pid)||pid===q.startingKeeperId||!['V','M','A'].includes(role))))throw new Error('Ongeldige historische startposities.');}
    for(const e of s.events)if(e.squad&&e.squad.keeperSchedule!==undefined){const q=e.squad;if(!Array.isArray(q.keeperSchedule)||![2,4].includes(q.keeperSchedule.length)||q.keeperSchedule[0]!==q.startingKeeperId||!q.keeperSchedule.every(pid=>q.keeperIds.includes(pid))||!q.keeperIds.every(pid=>q.keeperSchedule!.includes(pid)))throw new Error('Ongeldig historisch keeperschema.');}
    for(const e of s.events)if(e.proposal&&(!Number.isSafeInteger(e.proposal.atMs)||e.proposal.atMs<0||![e.proposal.out,e.proposal.in].every(ids=>Array.isArray(ids)&&ids.every(pid=>catalog.players.some(p=>p.id===pid)))||![e.proposal.fromKeeper,e.proposal.toKeeper].every(pid=>catalog.players.some(p=>p.id===pid))||!e.proposal.expectedEndMs||Object.values(e.proposal.expectedEndMs).some(m=>!m||![m.playedMs,m.keeperMs,m.fieldMs].every(v=>Number.isSafeInteger(v)&&v>=0)||m.fieldMs+m.keeperMs!==m.playedMs)))throw new Error('Ongeldige advieshistorie.');
  }
}
