import {coachReducer, liveMatchRows, scoreInVenueOrder} from '../src/coach-state.ts';
import {isProcessed} from '../src/result-only.ts';
import {fingerprint, HttpError} from './sheets.mjs';

const missing = () => new HttpError(404, 'Deze Live-registratie is niet beschikbaar.');
const conflict = message => new HttpError(409, message);
const eventId = /^[a-f0-9-]{36}$/;
const types = new Set(['goal','away-goal','swap','keeper','set-period','toggle-clock','phase']);
const clockTypes = new Set(['set-period','toggle-clock','phase']);
const key = (team, match) => fingerprint([team, match]);
const content = row => JSON.parse(row.data.json);
const source = state => fingerprint([state.live,state.catalog.players,state.catalog.matches.find(m=>m.id===state.catalog.liveMatchId),state.availability[state.catalog.liveMatchId],state.team]);
const duplicateKey = event => event.type==='swap'?JSON.stringify([event.type,event.out,event.in]):
  ['goal','away-goal','keeper'].includes(event.type)?event.type:'';
function duplicates(events) {
  const ids=new Set();
  events.forEach((event,index)=>{
    const key=duplicateKey(event);
    for(let i=index-1;key&&i>=0&&event.now-events[i].now<=8000;i--){
      if(duplicateKey(events[i])===key&&event.actor!==events[i].actor){ids.add(event.id);ids.add(events[i].id);}
    }
  });
  return [...ids];
}

function normalized(input, from, until, clock) {
  if (!input || !eventId.test(input.id??'') || !types.has(input.type) ||
    !Number.isSafeInteger(input.now) || input.now < from || input.now > until ||
    (clockTypes.has(input.type) && !clock)) throw new HttpError(422,'Ongeldige Live-actie of geen toegang tot de klok.');
  const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
  const event = {id:input.id,type:input.type,now:input.now};
  switch (input.type) {
    case 'goal':
      if (input.playerId !== null && !id(input.playerId)) throw new HttpError(422,'Ongeldige doelpuntenmaker.');
      if (input.ownGoal === true && input.playerId !== null) throw new HttpError(422,'Ongeldig eigen doelpunt.');
      return {...event,playerId:input.playerId,ownGoal:input.ownGoal===true,unknownScorer:input.playerId===null};
    case 'away-goal':
      if (input.ownGoalPlayerId !== undefined && !id(input.ownGoalPlayerId)) throw new HttpError(422,'Ongeldige doelpuntenmaker.');
      return {...event,delta:1,...(input.ownGoalPlayerId===undefined?{}:{ownGoalPlayerId:input.ownGoalPlayerId})};
    case 'swap':
      if (!id(input.out) || !id(input.in) || input.out===input.in) throw new HttpError(422,'Ongeldige wissel.');
      return {...event,out:input.out,in:input.in};
    case 'keeper':
      if (!id(input.playerId)) throw new HttpError(422,'Ongeldige keeper.');
      return {...event,playerId:input.playerId};
    case 'set-period':
      if (![1,2,3,4].includes(input.period)) throw new HttpError(422,'Ongeldige periode.');
      return {...event,period:input.period};
    default: return event;
  }
}

export function replaySharedLive(base, events) {
  let state = base;
  const errors = [];
  for (const event of events) {
    // The final period is closed only by approved processing.
    const next = event.type==='phase' && state.live.period===state.live.periods ? state : coachReducer(state,event);
    if (next===state) errors.push(event.id);
    else state=next;
  }
  return {state,errors};
}

export class SharedLive {
  constructor(portal, clock=Date.now) {this.portal=portal;this.store=portal.store;this.clock=clock;}
  async row(team, match) {return this.store.get('Live',key(team,match));}
  change(row, data) {
    return {collection:'Live',id:row.id,version:row.version,data:{
      teamSeasonId:data.team,matchId:data.match,status:data.status,json:JSON.stringify(data),
    }};
  }
  async save(row, data) {
    await this.store.commit([this.change(row,data),
      ...(row.link?[{collection:'Links',id:row.link.id,version:row.link.version,data:row.link.data}]:[])]);
  }
  async open(state, input, coach) {
    const team=state.catalog.teamSeasonId, match=input.matchId;
    if (!this.portal.enabled(team) || state.catalog.archived || state.catalog.liveMatchId!==match ||
      !state.catalog.matches.some(m=>m.id===match) || isProcessed(state,match) || !state.live.field.length) throw missing();
    if (await this.row(team,match)) throw conflict('Er bestaat al een gedeelde registratie voor deze wedstrijd.');
    const available=(await this.store.find('Links','teamSeasonId',team)).filter(({data})=>data.revokedAt===0);
    const assignments=Array.isArray(input.links)?[...new Set(input.links)]:[];
    if (!assignments.length || assignments.length>12 || assignments.some(id=>!available.some(row=>row.id===id))) {
      throw new HttpError(422,'Wijs één of meer actieve ouderaccounts aan.');
    }
    const helpers=available.filter(row=>assignments.includes(row.id)).map(({id,data})=>({id,uid:data.uid,label:data.email}));
    const now=this.clock();
    const matchInfo=state.catalog.matches.find(m=>m.id===match);
    const data={team,match,status:'open',opened:now,openedBy:coach,clock:coach,helpers,events:[],sync:{},baseline:source(state),
      opponent:matchInfo.opponent,base:{
        team:state.team,catalog:{teamSeasonId:team,liveMatchId:match,players:state.catalog.players.map(({id,name,shortName,number})=>({id,name,shortName,number})),matches:[matchInfo]},
        live:state.live,availability:{[match]:state.availability[match]},
      },
    };
    const id=key(team,match);
    await this.save({id},data);
    return this.view(await this.row(team,match),coach,true);
  }
  async parentRows(identity) {
    const links=await this.portal.allowedLinks(identity.uid);
    const teams=[...new Set(links.map(r=>r.data.teamSeasonId))];
    const result=await Promise.all(teams.map(team=>this.store.find('Live','teamSeasonId',team)));
    return result.flat().filter(row=>{
      const data=content(row);
      return (data.status!=='processed'||this.clock()-data.processedAt<7*86400000) &&
        data.helpers.some(helper=>links.some(link=>link.id===helper.id));
    }).map(row=>this.view(row,identity.uid,false));
  }
  async parentRow(identity,input) {
    const row=await this.row(input.teamSeasonId,input.matchId);
    if (!row || !this.portal.enabled(row.data.teamSeasonId)) throw missing();
    const links=await this.portal.allowedLinks(identity.uid);
    const link=links.find(link=>content(row).helpers.some(helper=>link.id===helper.id));
    if(!link)throw missing();
    return {...row,link};
  }
  view(row, actor, coach) {
    const data=content(row);
    const {state,errors}=replaySharedLive(data.base,data.excluded?data.events.filter(event=>!data.excluded.includes(event.id)):data.events);
    return {teamSeasonId:data.team,matchId:data.match,status:data.status,version:row.version,opponent:data.opponent,
      players:data.base.catalog.players,live:state.live,errors,duplicates:duplicates(data.events),submitted:data.submitted??[],actor,
      ...(data.excluded?{excluded:data.excluded}:{}),
      clock:actor===data.clock&&coach,
      events:data.events.map(({actor:owner,...event})=>({...event,by:owner===actor?'Jij':coach?(data.helpers.find(h=>h.uid===owner)?.label??'Coach'):(owner===data.clock?'Coach':'Ouder')})),
      ...(coach?{helpers:data.helpers.map(({id,label,uid})=>({id,label,
        devices:Object.entries(data.sync).filter(([,item])=>item.actor===uid).map(([device,item])=>({device,syncedAt:item.at})),
      }))}:{}),
    };
  }
  async sync(row, actor, input, coach) {
    const data=content(row), now=this.clock();
    if (!Array.isArray(input.events)||input.events.length>100||typeof input.device!=='string'||!eventId.test(input.device)) {
      throw new HttpError(422,'Ongeldige lijst Live-acties of toestel-ID.');
    }
    const labels=new Map(data.events.map(event=>[event.id,event]));
    for (const original of input.events) {
      const existing=labels.get(original?.id);
      const event={...normalized(original,data.opened,Math.max(data.offered??now+60000,existing?.now??0),coach&&actor===data.clock),actor};
      const old=labels.get(event.id);
      if (old&&JSON.stringify(event)!==JSON.stringify(old)) throw conflict('Een bestaand actie-ID heeft andere inhoud.');
      if (!old&& !['open','review'].includes(data.status)) throw conflict('De coach heeft de controle afgesloten. Je lokale invoer blijft bewaard.');
      labels.set(event.id,event);
    }
    if (labels.size>600) throw new HttpError(422,'Deze wedstrijd heeft te veel Live-acties.');
    if (['open','review'].includes(data.status)){
      data.events=[...labels.values()].sort((a,b)=>a.now-b.now||a.id.localeCompare(b.id));
      if(!data.sync[input.device]&&Object.keys(data.sync).length>=40)throw new HttpError(422,'Er zijn te veel toestellen voor deze wedstrijd.');
      if(data.sync[input.device]&&data.sync[input.device].actor!==actor)throw conflict('Dit toestel-ID is al geregistreerd door een ander account.');
      data.sync[input.device]={actor,at:now};
      await this.save(row,data);
    }
    return this.view(await this.row(data.team,data.match),actor,coach);
  }
  async offer(row, actor, coach, version) {
    const data=content(row);
    if (data.status!=='open'||row.version!==version||!data.events.length) throw conflict('Vernieuw het gedeelde concept voordat je het aanbiedt.');
    data.status='review';data.offered=this.clock();data.submitted=data.events.map(e=>e.id);
    await this.save(row,data);
    return this.view(await this.row(data.team,data.match),actor,coach);
  }
  reviewSelection(row,input,current) {
    const data=content(row);
    if (isProcessed(current,data.match)||current.catalog.archived||current.catalog.liveMatchId!==data.match||source(current)!==data.baseline) {
      throw conflict('De officiële wedstrijdgegevens zijn gewijzigd. De gedeelde registratie is bewaard.');
    }
    if (input.version!==row.version || !Array.isArray(input.excluded) || new Set(input.excluded).size!==input.excluded.length ||
      input.excluded.some(id=>!data.events.some(e=>e.id===id))) {
      throw conflict('Het concept of de selectie is gewijzigd. Controleer opnieuw.');
    }
    const selected=data.events.filter(event=>!input.excluded.includes(event.id));
    if (!selected.length) throw new HttpError(422,'Kies minimaal één geldige wedstrijdactie.');
    if (duplicates(selected).length&&input.checkedDuplicates!==true) throw new HttpError(422,'Controleer eerst de mogelijke dubbele acties.');
    const result=replaySharedLive(current,selected);
    if (result.errors.length) throw new HttpError(422,'Verwijder acties die niet bij de opstelling of klok passen.');
    if (result.state.live.runningSince!==null || result.state.live.elapsedMs<=0) {
      throw new HttpError(422,'Registreer de gespeelde tijd en stop de wedstrijdklok voordat je verwerkt.');
    }
    const stoppedAt=Math.max(data.offered,...selected.map(e=>e.now));
    const state=coachReducer(result.state,{type:'finish',now:stoppedAt});
    if (!isProcessed(state,data.match)) throw new HttpError(422,'De wedstrijd kon niet worden afgesloten.');
    return state;
  }
  preview(row,input,current) {
    if(row.data.status!=='review')throw conflict('Bied het concept eerst ter controle aan.');
    const state=this.reviewSelection(row,input,current);
    return {score:scoreInVenueOrder(state.catalog.matches.find(m=>m.id===row.data.matchId),state.live.goals.length,state.live.awayGoals.length),
      milliseconds:state.live.elapsedMs,rows:liveMatchRows(state).filter(r=>r.present).map(({playerId,minutes,keeperMinutes,goals})=>({playerId,minutes,keeperMinutes,goals}))};
  }
  approval(row, input, current) {
    if (row.data.status!=='review') throw conflict('Bied het concept eerst ter controle aan.');
    const state=this.reviewSelection(row,input,current);
    state.committedBatches=[...(state.committedBatches??[]),'shared-live-'+row.id].slice(-100);
    const data={...content(row),status:'processed',processedAt:this.clock(),excluded:input.excluded};
    return {state,change:this.change(row,data)};
  }
}
