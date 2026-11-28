import { randomBytes } from 'node:crypto';
import { roundDateValue } from '../src/availability-workflow.ts';
import { recordedMatchResult, scoreInVenueOrder } from '../src/coach-state.ts';
import { isProcessed, processedMatchIds } from '../src/result-only.ts';
import { fingerprint, HttpError } from './sheets.mjs';

const categories = new Set(['available', 'unavailable', 'pending']);
const dates = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export const parentEmail = value => typeof value === 'string' && value.length <= 254 &&
  /^[^\s@,;<>\\:]+@[^\s@,;<>\\:]+\.[^\s@,;<>\\:]+$/.test(value) ? value.toLowerCase() : '';
const hide = () => new HttpError(404, 'Deze koppeling of wedstrijd is niet beschikbaar.');
const matchTime = match => {
  const date = roundDateValue(match.date);
  const time = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(match.time);
  return date && time ? date + ' ' + time[1].padStart(2, '0') + ':' + time[2] : '';
};
function futureMatch(state, match, now = Date.now()) {
  const kickoff = matchTime(match);
  const parts=Object.fromEntries(dates.formatToParts(now).map(({type,value})=>[type,value]));
  const local=parts.year+'-'+parts.month+'-'+parts.day+' '+parts.hour+':'+parts.minute;
  return !state.catalog.archived && kickoff && kickoff > local &&
    !(state.catalog.liveMatchId === match.id &&
      (state.live.elapsedMs > 0 || state.live.runningSince !== null || state.live.breakSince != null || state.live.phase === 'Einde' ||
      (state.live.goals.length || state.live.awayGoals.length || state.live.swaps.length))) && !isProcessed(state, match.id);
}
const change = (collection, doc, data) => ({collection, id: doc.id, version: doc.version, data});
const rowKey = (team, match, player) => fingerprint([team, match, player]);
const active = doc => doc.data.revokedAt === 0;

export class ParentPortal {
  constructor(store, loadTeam, enabledTeams, origin, clock = Date.now) {
    this.store = store; this.loadTeam = loadTeam; this.teams = enabledTeams; this.origin = origin; this.clock = clock;
  }
  enabled(team) { return this.teams.has(team); }
  async list(teamSeasonId) {
    if (!this.enabled(teamSeasonId)) throw hide();
    const links = await this.store.find('Links', 'teamSeasonId', teamSeasonId);
    return {links: links.filter(active).map(({id,data})=>({id, playerId:data.playerId, email:data.email}))};
  }
  async invite(state, input) {
    const {teamSeasonId, archived, players} = state.catalog;
    const email = parentEmail(input.email);
    if (!this.enabled(teamSeasonId) || archived || !players.some(p=>p.id===input.playerId) || !email) {
      throw new HttpError(422, 'Kies een speler in dit actieve team en geef het juiste e-mailadres op.');
    }
    const code = randomBytes(32).toString('base64url');
    const createdAt = this.clock();
    const expiresAt = createdAt+7*24*60*60*1000;
    await this.store.commit([{collection:'Invites', id:fingerprint(code), data:{teamSeasonId, playerId:input.playerId, email, createdAt, expiresAt, claimedBy:''}}]);
    return {url:this.origin+'/?parent=1#uitnodiging='+code, expiresAt};
  }
  async revoke(teamSeasonId, id) {
    if (!this.enabled(teamSeasonId) || typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw hide();
    const link = await this.store.get('Links', id);
    if (!link || link.data.teamSeasonId !== teamSeasonId) throw hide();
    if (active(link)) await this.store.commit([change('Links',link,{...link.data, revokedAt:this.clock()})]);
    return this.list(teamSeasonId);
  }
  async claim(identity, code) {
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) throw hide();
    const invitation = await this.store.get('Invites',fingerprint(code));
    if (!invitation || invitation.data.expiresAt <= this.clock() ||
        invitation.data.email !== parentEmail(identity.email) || !this.enabled(invitation.data.teamSeasonId)) throw hide();
    const {teamSeasonId, playerId, claimedBy, email} = invitation.data;
    if (claimedBy && claimedBy !== identity.uid) throw hide();
    const state = await this.loadTeam(teamSeasonId);
    if (!state || state.catalog.archived || !state.catalog.players.some(p=>p.id===playerId)) throw hide();
    const id = fingerprint([identity.uid, teamSeasonId, playerId]);
    const old = await this.store.get('Links',id);
    if (old && !active(old) && old.data.revokedAt >= invitation.data.createdAt) throw hide();
    if (claimedBy) {
      if (!old || !active(old)) throw hide();
      return {ok:true};
    }
    await this.store.commit([
      change('Invites',invitation,{...invitation.data,claimedBy:identity.uid}),
      change('Links',old??{id},{uid:identity.uid,email,teamSeasonId,playerId,revokedAt:0}),
    ]);
    return {ok:true};
  }
  async allowedLinks(uid) {
    return (await this.store.find('Links','uid',uid)).filter(row=>active(row)&&this.enabled(row.data.teamSeasonId));
  }
  async dashboard(identity) {
    const groups = new Map();
    for (const link of await this.allowedLinks(identity.uid)) {
      const team = link.data.teamSeasonId;
      if (!groups.has(team)) groups.set(team, []);
      groups.get(team).push(link);
    }
    const children = [];
    for (const [team, links] of groups) {
      const state = await this.loadTeam(team);
      if (!state) continue;
      const recorded = processedMatchIds(state);
      for (const link of links) {
        const player = state.catalog.players.find(p=>p.id===link.data.playerId);
        if (!player) continue;
        const answers = await this.store.find('Answers','child',fingerprint([team,player.id]));
        const byMatch = new Map(answers.map(a=>[a.data.matchId,a]));
        const matches = state.catalog.matches.filter(m=>matchTime(m)||recorded.has(m.id))
          .sort((a,b)=>matchTime(a).localeCompare(matchTime(b))).map(m=>{
            const answer = byMatch.get(m.id);
            const effective = state.availability[m.id]?.[player.id] ?? 'pending';
            const result = recordedMatchResult(state,m.id);
            return {id:m.id, date:roundDateValue(m.date)||m.date, time:m.time, opponent:m.opponent, venue:m.venue,
              editable: Boolean(futureMatch(state,m,this.clock())), processed:recorded.has(m.id),
              answer:answer?.data.status??effective, version:answer?.version??null,
              updatedAt:answer?.data.updatedAt??null, actor:answer?(answer.data.uid===identity.uid?'self':'other'):null,
              coachOverride:Boolean(state.formUpdates?.[m.id+'/'+player.id]?.manual),
              score:result?scoreInVenueOrder(m,result.goalsFor,result.goalsAgainst):null};
          });
        children.push({linkId:link.id,name:player.name,number:player.number,
          teamName:state.catalog.teamName,clubName:state.catalog.clubName,season:state.catalog.seasonName,matches});
      }
    }
    return {children};
  }
  async answer(identity, input) {
    if (!input || typeof input.linkId !== 'string' || !/^[a-f0-9]{64}$/.test(input.linkId) ||
        !categories.has(input.status) || !(input.version === null || typeof input.version === 'string')) throw hide();
    const link = await this.store.get('Links',input.linkId);
    if (!link || link.data.uid !== identity.uid || !active(link) || !this.enabled(link.data.teamSeasonId)) throw hide();
    const {teamSeasonId,playerId} = link.data;
    const state = await this.loadTeam(teamSeasonId);
    const match = state?.catalog.matches.find(m=>m.id===input.matchId);
    if (!match || !state.catalog.players.some(p=>p.id===playerId)) throw hide();
    if (!futureMatch(state,match,this.clock())) throw new HttpError(409, 'Deze wedstrijd is gestart of afgelopen. Neem voor een correctie contact op met je coach.');
    const id = rowKey(teamSeasonId,match.id,playerId);
    const previous = await this.store.get('Answers',id);
    if (!futureMatch(state,match,this.clock())) throw new HttpError(409, 'Deze wedstrijd is gestart. Neem contact op met je coach.');
    if ((previous?.version??null) !== input.version) throw new HttpError(409, 'Het antwoord is intussen gewijzigd. Vernieuw en controleer de huidige keuze.');
    const row = {teamSeasonId, matchId:match.id, playerId, child:fingerprint([teamSeasonId,playerId]),
      status:input.status, uid:identity.uid, updatedAt:this.clock()};
    // Both preconditions must hold; revoking a link during a save makes the save fail.
    await this.store.commit([change('Links',link,link.data),change('Answers',previous??{id},row)]);
    return this.dashboard(identity);
  }
  async coachResponses(team) {
    return this.enabled(team)?this.store.find('Answers','teamSeasonId',team):[];
  }
}

// Parent answers are projected for the coach. A manual coach decision takes priority
// and the Firestore answer stays available for review and release of that decision.
export function projectParentAnswers(loaded, answers) {
  const state = loaded.state;
  if (!answers.length || state.catalog.archived) return loaded;
  const changes = [];
  const processed = processedMatchIds(state);
  const matchIds = new Set(state.catalog.matches.map(m=>m.id));
  const playerIds = new Set(state.catalog.players.map(p=>p.id));
  const availability = {...state.availability};
  const parentAnswers = {};
  for(const {data:r} of [...answers].sort((a,b)=>a.id.localeCompare(b.id))) {
    if(r.teamSeasonId!==state.catalog.teamSeasonId || !matchIds.has(r.matchId) ||
       !playerIds.has(r.playerId) || !categories.has(r.status)) continue;
    const key=r.matchId+'/'+r.playerId;
    const manual=Boolean(state.formUpdates?.[key]?.manual);
    parentAnswers[key]={status:r.status,coachOverride:manual};
    if (processed.has(r.matchId) || manual || availability[r.matchId]?.[r.playerId]===r.status) continue;
    availability[r.matchId]={...availability[r.matchId],[r.playerId]:r.status};
    changes.push([r.matchId,r.playerId,r.status]);
  }
  return {...loaded, parentAnswers, state:{...state,availability},
    sourceToken:changes.length?loaded.sourceToken+':parent:'+fingerprint(changes):loaded.sourceToken};
}

export function withoutParentProjection(next, base, projected) {
  if (base.availability === projected.availability) return next;
  let availability=next.availability;
  for(const [matchId, answers] of Object.entries(projected.availability)){
    for(const [playerId,status] of Object.entries(answers)){
      const before=base.availability[matchId]?.[playerId];
      if(before!==status && next.availability[matchId]?.[playerId]===status &&
          !next.formUpdates?.[matchId+'/'+playerId]?.manual &&
          next.formUpdates?.[matchId+'/'+playerId]?.time === base.formUpdates?.[matchId+'/'+playerId]?.time) {
        if(availability===next.availability)availability={...availability};
        availability[matchId]={...availability[matchId],[playerId]:before??'pending'};
      }
    }
  }
  return availability===next.availability?next:{...next,availability};
}
