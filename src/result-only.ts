import type { Catalog, CoachState, Match } from './coach-state.ts';

// Score snapshots also support a known opening score such as 0-3. We do not
// manufacture the missing 0-1/0-2 events, times, lineups or attendance rows.
export type ScoreEvent = { scoreFor:number; scoreAgainst:number; playerId:string|null; minute:number|null; ownGoal:boolean };
export type ResultOnlyMatch = { goalsFor:number; goalsAgainst:number; events:ScoreEvent[] };
const score = (n:unknown):n is number => Number.isInteger(n) && Number(n)>=0 && Number(n)<=99;
export function validateResultOnly(result:ResultOnlyMatch,catalog:Catalog):boolean {
  if(!result||Object.keys(result).some(k=>!['goalsFor','goalsAgainst','events'].includes(k))||!score(result.goalsFor)||!score(result.goalsAgainst)||!Array.isArray(result.events)||result.events.length>198)return false;
  let ours=0,theirs=0,lastMinute=0;
  for(const event of result.events){
    if(!event||Object.keys(event).some(k=>!['scoreFor','scoreAgainst','playerId','minute','ownGoal'].includes(k))||!score(event.scoreFor)||!score(event.scoreAgainst)||typeof event.ownGoal!=='boolean'||!(event.minute===null||typeof event.minute==='number'&&Number.isFinite(event.minute)&&event.minute>=lastMinute&&event.minute<=120))return false;
    const deltaFor=event.scoreFor-ours,deltaAgainst=event.scoreAgainst-theirs;
    if(!((deltaFor>0&&deltaAgainst===0)||(deltaAgainst>0&&deltaFor===0)))return false;
    const knownPlayer=event.playerId!==null&&catalog.players.some(p=>p.id===event.playerId);
    if(event.playerId!==null&&!knownPlayer)return false;
    if(event.ownGoal){
      if(deltaFor>0&&(event.playerId!==null||deltaFor!==1))return false;
      if(deltaAgainst>0&&(!knownPlayer||deltaAgainst!==1))return false;
    }else{
      if(deltaAgainst>0&&event.playerId!==null)return false;
      if(knownPlayer&&deltaFor!==1)return false;
    }
    if(event.minute!==null)lastMinute=event.minute;
    ours=event.scoreFor;theirs=event.scoreAgainst;
  }
  return !result.events.length||ours===result.goalsFor&&theirs===result.goalsAgainst;
}
export function processedMatchIds(state:CoachState):Set<string> {
  return new Set([...state.stats.map(r=>r.matchId),...Object.keys(state.resultOnly??{})]);
}
export function isProcessed(state:CoachState,matchId:string):boolean {return processedMatchIds(state).has(matchId);}
export function resultPlayerGoals(result:ResultOnlyMatch,playerId:string):number {
  return result.events.filter(e=>!e.ownGoal&&e.playerId===playerId).length;
}
export function seasonGoalRows(state:CoachState,players=state.catalog?.players??[]) {
  return [...state.stats.map(({matchId,playerId,goals})=>({matchId,playerId,goals})),
    ...Object.entries(state.resultOnly??{}).flatMap(([matchId,result])=>result.events.length?players.map(p=>({matchId,playerId:p.id,goals:resultPlayerGoals(result,p.id)})):[])];
}
export function parseScoreEvents(text:string,catalog:Catalog,venue:Match['venue']='Thuis'):ScoreEvent[] {
  return text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map((line,index)=>{
    const match=/^(\d{1,2})\s*[-–:]\s*(\d{1,2})(?:\s+(.*?))?(?:\s+'(\d+(?:[.,]\d+)?))?$/.exec(line);
    if(!match)throw new Error(`Regel ${index+1}: gebruik bijvoorbeeld 1-1 ${catalog.players[0]?.shortName??'speler'}.`);
    let label=(match[3]??'').trim();const ownGoal=/\s*\(e\.d\.\)$/i.test(label);label=label.replace(/\s*\(e\.d\.\)$/i,'').trim();
    const matches=catalog.players.filter(p=>[p.name,p.shortName].some(n=>n.toLocaleLowerCase('nl-NL')===label.toLocaleLowerCase('nl-NL')));
    if(label&&label!=='-'&&matches.length!==1)throw new Error(`Regel ${index+1}: speler '${label}' is onbekend of niet uniek.`);
    return {scoreFor:Number(match[venue==='Thuis'?1:2]),scoreAgainst:Number(match[venue==='Thuis'?2:1]),playerId:matches[0]?.id??null,minute:match[4]===undefined?null:Number(match[4].replace(',','.')),ownGoal};
  });
}
export function scoreEventsText(result:ResultOnlyMatch,catalog:Catalog,venue:Match['venue']='Thuis'):string {
  return result.events.map(e=>`${venue==='Thuis'?e.scoreFor:e.scoreAgainst}-${venue==='Thuis'?e.scoreAgainst:e.scoreFor}${e.playerId?' '+catalog.players.find(p=>p.id===e.playerId)?.shortName:''}${e.ownGoal?' (e.d.)':''}${e.minute===null?'':" '"+e.minute}`).join('\n');
}
