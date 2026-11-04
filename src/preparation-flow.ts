import {coachReducer,demoCatalog,type CoachState,type Availability} from './coach-state.ts';
import {formationFitsTeam,formationRoles,formationsForTeam,positionsForFormation} from './formations.ts';
import {adviceContext,type AdviceAction} from './substitution/recommendations.ts';
import {recommendCadence,type Cadence,type SquadSelection} from './substitution/preparation.ts';
import type {FieldPosition,Scenario} from './substitution/types.ts';

export type PreparationDraft={version:3;teamSeasonId:string;matchId:string;planId:string;slots:string[];cadence:Cadence;field:string[];positions:Record<string,FieldPosition>;statuses:Record<string,Availability>;formation?:number[];manualLineup:boolean;dirty:boolean;keepersConfirmed:boolean;plan?:Scenario;sourceContext?:string;calculatedKey?:string;legacy?:unknown};
function storedPlanValid(plan:Scenario|undefined,state:CoachState,matchId:string):boolean {
 const c=state.catalog??demoCatalog();
 return Boolean(plan&&plan.matchId===matchId&&plan.teamSeasonId===c.teamSeasonId&&typeof plan.id==='string'&&Number.isFinite(plan.fairnessErrorMs)&&plan.fairnessErrorMs>=0&&Array.isArray(plan.reasonCodes)&&plan.reasonCodes.every(code=>typeof code==='string')&&plan.expectedEndMs&&Array.isArray(plan.intervals)&&plan.intervals.length>0&&plan.intervals.every((s,i,a)=>Number.isSafeInteger(s.startMs)&&Number.isSafeInteger(s.endMs)&&s.endMs>s.startMs&&s.startMs===(i?a[i-1].endMs:0)&&Array.isArray(s.field)&&s.field.length===(state.team.fieldSize??6)&&new Set(s.field).size===s.field.length&&s.field.every(id=>c.players.some(p=>p.id===id))&&s.field.includes(s.keeperId))&&plan.intervals.at(-1)!.endMs===50*60000);
}
export function newPreparationDraft(state:CoachState,matchId:string):PreparationDraft {
 const c=state.catalog??demoCatalog(),prep=c.liveMatchId===matchId?state.live.preparation:undefined;
 const fixed=prep?.keeperSchedule?.length===state.team.periods?prep:undefined;
 const lineup=fixed?.startingField?.length===(state.team.fieldSize??6)&&formationFitsTeam(fixed.formation,state.team)?fixed:undefined;
 const draft:PreparationDraft={version:3,teamSeasonId:c.teamSeasonId,matchId,planId:'',slots:fixed?[...fixed.keeperSchedule!]:Array(state.team.periods).fill(''),cadence:'auto',field:lineup?.startingField?[...lineup.startingField]:Array(state.team.fieldSize??6).fill(''),positions:{...lineup?.startingPositions},statuses:{...state.availability[matchId]},formation:lineup?.formation?[...lineup.formation]:formationsForTeam(state.team)[0]?.lines,manualLineup:Boolean(lineup?.startingField),dirty:true,keepersConfirmed:false};
 const session=state.assistant?.[matchId];
 if(lineup&&session?.status==='accepted'&&session.context===adviceContext(state)&&state.live.elapsedMs===0&&state.live.runningSince===null)return {...draft,plan:session.plan,planId:session.plan.id,cadence:lineup.cadence??'auto',dirty:false,keepersConfirmed:true,sourceContext:adviceContext(state),calculatedKey:preparationKey(draft)};
 return draft;
}
export function readPreparationDraft(raw:string|null,state:CoachState,matchId:string):PreparationDraft|null {
 if(!raw)return null;
 try {
  const old=JSON.parse(raw),initial=newPreparationDraft(state,matchId),c=state.catalog??demoCatalog();
  if(!old||![2,3].includes(old.version)||!Array.isArray(old.slots)||!old.slots.every((id:unknown)=>typeof id==='string')||!Array.isArray(old.field)||!old.field.every((id:unknown)=>typeof id==='string')||!old.statuses||!c.players.every(p=>['available','unavailable','pending'].includes(old.statuses[p.id]))||!old.positions||typeof old.positions!=='object'||Array.isArray(old.positions)||typeof old.manualLineup!=='boolean')return null;
  if(old.version===3&&(old.teamSeasonId!==c.teamSeasonId||old.matchId!==matchId))return null;
  const compatible=old.field.length===(state.team.fieldSize??6)&&(!old.formation||formationFitsTeam(old.formation,state.team));
  if(old.version===3&&old.slots.length===state.team.periods&&compatible){const valid=storedPlanValid(old.plan,state,matchId);return {...old,plan:valid?old.plan:undefined,dirty:old.dirty!==false||!valid};}
  // Old slots were whole-match candidates, never quarter assignments. Retain the
  // entire old draft and its manual lineup without silently assigning quarters.
  return {...initial,statuses:{...old.statuses},...(compatible&&old.manualLineup?{field:[...old.field],positions:{...old.positions},formation:old.formation,manualLineup:true}:{}),legacy:old};
 }catch{return null;}
}
export function keeperScheduleValid(state:CoachState,draft:PreparationDraft):boolean {
 return draft.slots.length===state.team.periods&&draft.slots.every(id=>Boolean(id)&&draft.statuses[id]==='available')&&(state.catalog??demoCatalog()).players.filter(p=>draft.statuses[p.id]==='available').length>=(state.team.fieldSize??6);
}
export function startingLineupValid(state:CoachState,draft:PreparationDraft):boolean {
 return startingLineupIssue(state,draft)===null;
}
export function startingLineupIssue(state:CoachState,draft:PreparationDraft):string|null {
 if(!keeperScheduleValid(state,draft))return 'Controleer de spelersgroep en de keeper per periode.';
 if(!formationFitsTeam(draft.formation,state.team))return 'Kies een formatie voor dit spelersaantal.';
 if(!draft.manualLineup)return 'Vul de veldplekken in of neem het voorstel over.';
 if(draft.field.length!==(state.team.fieldSize??6))return 'Vul alle plekken van deze formatie in.';
 if(draft.field[0]!==draft.slots[0])return 'Zet de gekozen startkeeper op doel.';
 const empty=draft.field.flatMap((id,i)=>id?[]:[i]);
 if(empty.length===1){const roles=formationRoles(draft.formation),index=empty[0]-1,role=roles[index],labels={V:'Verdediging',M:'Middenveld',A:'Spits'};return `Kies een speler voor ${labels[role]} ${roles.slice(0,index+1).filter(value=>value===role).length}.`;}
 if(empty.length)return `Kies nog ${empty.length} spelers voor de lege veldplekken.`;
 if(new Set(draft.field).size!==draft.field.length)return 'Een speler staat op meer dan één plek.';
 if(!draft.field.every(id=>draft.statuses[id]==='available'))return 'Vervang de spelers die niet aanwezig zijn.';
 return null;
}
export function preparationSelection(draft:PreparationDraft):SquadSelection {
 return {matchId:draft.matchId,statuses:{...draft.statuses},keeperSchedule:[...draft.slots],keeperIds:[...new Set(draft.slots)],startingKeeperId:draft.slots[0],...(draft.manualLineup?{startingField:[...draft.field],startingPositions:draft.formation?positionsForFormation(draft.formation,draft.field):{...draft.positions},...(draft.formation?{formation:[...draft.formation]}:{})}:{})};
}
export const preparationKey=(draft:PreparationDraft)=>JSON.stringify(preparationSelection(draft));
export function preparationPlanCurrent(state:CoachState,draft:PreparationDraft):boolean {
 return Boolean(draft.plan&&!draft.dirty&&draft.sourceContext===adviceContext(state)&&draft.calculatedKey===preparationKey(draft));
}
export function calculatePreparation(state:CoachState,draft:PreparationDraft,ids:{id:string;eventId:string;now:number},confirmed=false) {
 if(!keeperScheduleValid(state,draft)||confirmed&&!startingLineupValid(state,draft))throw new Error('Controleer de spelersgroep, alle keeperkeuzes en de startopstelling.');
 const effective=!confirmed&&draft.manualLineup&&!startingLineupValid(state,draft)?{...draft,manualLineup:false}:draft;
 const selection=preparationSelection(effective),cadence=recommendCadence(state,selection,ids.now);
 const action:Extract<AdviceAction,{type:'assistant-prepare'}>={type:'assistant-prepare',...ids,...selection,cadence,expectedEpoch:state.live.adviceEpoch??0,...(confirmed?{confirmed:true}:{})};
 const computed=coachReducer(state,action),plan=computed.assistant?.[draft.matchId]?.plan;
 if(computed===state||!plan)throw new Error('Geen geldig wisselplan. Controleer de keeperkeuzes, opstelling en persoonlijke minutenlimieten.');
 return {action,state:computed,draft:{...draft,plan,planId:plan.id,cadence,dirty:false,keepersConfirmed:true,sourceContext:adviceContext(confirmed?computed:state),calculatedKey:preparationKey(draft)} as PreparationDraft};
}
