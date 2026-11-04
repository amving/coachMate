import {scoreInVenueOrder,type Match,type LiveGoal} from './coach-state.ts';

/** Share recorded events in home/away order, without inventing missing legacy chronology. */
export function matchShareText(match:Match,team:string,ours:LiveGoal[],theirs:LiveGoal[],name:(id:string)=>string):string {
  const teams=match.venue==='Thuis'?[team,match.opponent]:[match.opponent,team];
  const score=scoreInVenueOrder(match,ours.length,theirs.length).join('–');
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(match.date);
  const date=iso?new Date(Date.UTC(+iso[1],+iso[2]-1,+iso[3])).toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):match.date||match.shortDate;
  const events=[...ours.map(goal=>({goal,ours:true})),...theirs.map(goal=>({goal,ours:false}))];
  const unique=(values:number[])=>values.every(n=>Number.isFinite(n))&&new Set(values).size===values.length;
  const sequences=events.map(e=>e.goal.sequence??NaN);
  const snapshots=events.map(e=>e.goal.scoreFor!==undefined&&e.goal.scoreAgainst!==undefined?e.goal.scoreFor+e.goal.scoreAgainst:NaN);
  const minutes=events.map(e=>e.goal.minute??NaN);
  const order=unique(sequences)?sequences:unique(snapshots)?snapshots:unique(minutes)?minutes:null;
  const ordered=events.map((e,i)=>({...e,order:order?.[i]??i})).sort((a,b)=>a.order-b.order);
  const scorer=(event:typeof events[number])=>event.goal.ownGoal
    ? event.ours?'Eigen doelpunt tegenstander':(event.goal.playerId?name(event.goal.playerId):'Eigen team')+' (e.d.)'
    : event.ours?event.goal.playerId?name(event.goal.playerId):'Doelpuntenmaker onbekend':'-';
  let goalsFor=0,goalsAgainst=0;
  const timeline=ordered.map(event=>{if(event.ours)goalsFor++;else goalsAgainst++;return (order?scoreInVenueOrder(match,goalsFor,goalsAgainst).join('-'):'?–?')+' '+scorer(event)+" '"+(event.goal.minute??'?');});
  return [teams[0]+' – '+teams[1],date,'','Eindstand',score,'',events.length?'Scoreverloop':'Geen doelpunten.',...(events.length&&!order?['Volgorde niet volledig vastgelegd; tussenstanden onbekend.']:[]),...timeline].join('\n');
}
