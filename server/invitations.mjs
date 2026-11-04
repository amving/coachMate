import {randomUUID} from 'node:crypto';
import {HttpError,fingerprint} from './sheets.mjs';
import {formInvitations} from './forms.mjs';
import {parentEmailValid,normalizeInvitationMessage,invitationText} from '../src/invitations.ts';

export function workerReady(tables,now=Date.now()) {
  const worker=tables.FormJobs?.find(row=>row.jobId==='worker');
  return worker?.status==='ready' && now-Date.parse(worker.completedAt)<180000 && now>=Date.parse(worker.completedAt);
}
export const serviceDataToken=tables=>fingerprint(Object.fromEntries(Object.entries(tables).filter(([name])=>!['Forms','FormInvites','FormResponses','FormJobs','FormDeliveries'].includes(name))));
export function prepareRoundJob(snapshot,state,round,now=Date.now()) {
  if(state.catalog.archived)throw new HttpError(403,'Dit seizoen is gearchiveerd.');
  if(!Number.isInteger(round)||!state.catalog.matches.some(match=>match.availabilityRound===round)||!state.catalog.players.length)throw new HttpError(422,'Voeg eerst de wedstrijden en spelers toe.');
  const existing=snapshot.tables.Forms.find(form=>form.teamSeasonId===state.catalog.teamSeasonId&&!form.matchId&&Number(form.round)===round);
  if(existing)return {form:existing};
  const jobs=snapshot.tables.FormJobs??[];
  const previous=jobs.find(job=>job.teamSeasonId===state.catalog.teamSeasonId&&Number(job.round)===round&&job.type==='prepare');
  if(previous)return {job:previous.status==='failed'?{...previous,status:'queued',error:''}:previous};
  const template=snapshot.tables.Forms.find(form=>form.teamSeasonId===state.catalog.teamSeasonId&&form.codeEntryId&&form.prefillDefaults);
  if(!template)throw new HttpError(422,'Stel eerst één keer de vaste formulieropmaak voor dit team in.');
  if(!workerReady(snapshot.tables,now))throw new HttpError(503,'De verzendkoppeling is nog niet actief. Activeer deze één keer via Instellingen.');
  return {job:{jobId:randomUUID(),teamSeasonId:state.catalog.teamSeasonId,round,type:'prepare',status:'queued',templateFormId:template.formId,formId:'',createdAt:new Date(now).toISOString(),completedAt:'',error:''}};
}

export function queueInvitationBatch(snapshot,state,input,now=Date.now()) {
  if(state.catalog.archived)throw new HttpError(403,'Dit seizoen is gearchiveerd.');
  if(typeof input.batchId!=='string'||!/^[a-zA-Z0-9-]{10,80}$/.test(input.batchId))throw new HttpError(422,'Ongeldige verzendactie.');
  let message;try{message=normalizeInvitationMessage(input.message);}catch(error){throw new HttpError(422,error.message);}
  const channel=input.channel??'email';if(!['email','whatsapp'].includes(channel))throw new HttpError(422,'Ongeldig kanaal.');
  const log=snapshot.tables.FormDeliveries??[];
  const repeated=log.filter(row=>row.batchId===input.batchId);
  if(repeated.length){
    const actual=repeated.map(row=>row.playerId).sort();
    if(repeated.some(row=>row.channel!==channel||row.teamSeasonId!==state.catalog.teamSeasonId||row.formId!==input.formId)||JSON.stringify(actual)!==JSON.stringify([...(input.playerIds??[])].sort()))throw new HttpError(409,'Deze verzendactie hoort bij een andere selectie.');
    if(repeated.some(row=>(row.message??'')!==message))throw new HttpError(409,'Deze verzendactie bevat een andere uitnodigingstekst. Controleer eerst de bestaande verzending.');
    return {deliveries:repeated,repeated:true};
  }
  const form=snapshot.tables.Forms.find(form=>form.formId===input.formId&&form.teamSeasonId===state.catalog.teamSeasonId);
  if(!form)throw new HttpError(404,'Formulier hoort niet bij dit teamseizoen.');
  if(!Array.isArray(input.playerIds)||!input.playerIds.length||input.playerIds.length>100||new Set(input.playerIds).size!==input.playerIds.length)throw new HttpError(422,'Selecteer één of meer spelers.');
  if(channel==='email'&&!workerReady(snapshot.tables,now))throw new HttpError(503,'De verzendkoppeling is nog niet actief. Er is niets verstuurd.');
  if(channel==='email'&&snapshot.tables.FormJobs.find(row=>row.jobId==='worker')?.type!=='worker-invitations-v3')throw new HttpError(503,'Werk de verzendkoppeling bij om aangepaste uitnodigingsteksten te versturen. Er is niets klaargezet.');
  const invites=formInvitations([form],snapshot.tables.FormInvites);
  const deliveries=input.playerIds.map(playerId=>{
    const player=state.catalog.players.find(player=>player.id===playerId);
    const invite=invites.find(invite=>invite.playerId===playerId);
    // WhatsApp is an explicit coach attestation, never an outgoing message.
    // A response may precede that registration; it still blocks new email starts.
    if((channel==='email'&&(invite?.responseId||invite?.editUrl))||log.some(row=>row.formId===form.formId&&row.playerId===playerId&&['queued','processing','sent','uncertain'].includes(row.status)))throw new HttpError(409,'Deze speler is al uitgenodigd of heeft gereageerd. Gebruik zo nodig de aparte wijzigingslink; er is geen nieuwe invullink klaargezet.');
    if(!player||(channel==='email'&&!parentEmailValid(player.parentEmail))||!invite?.personalUrl||!form.prefillDefaults)throw new HttpError(422,'Een geselecteerde speler mist een geldig e-mailadres of persoonlijke formulierlink. Er is niets klaargezet.');
    return {deliveryId:randomUUID(),batchId:input.batchId,teamSeasonId:state.catalog.teamSeasonId,formId:form.formId,playerId,channel,recipient:channel==='email'?player.parentEmail:player.parentPhone||'Door coach bevestigd',status:channel==='email'?'queued':'sent',createdAt:new Date(now).toISOString(),sentAt:channel==='email'?'':new Date(now).toISOString(),error:'',message,renderedMessage:invitationText({playerName:player.name,shortName:player.shortName,parentName:player.parentName||player.parent,teamName:state.catalog.clubName?state.catalog.clubName+' · '+state.catalog.teamName:state.catalog.teamName||'',seasonName:state.catalog.seasonName||'',round:Number(form.round),count:state.catalog.matches.filter(m=>form.matchId?m.id===form.matchId:m.availabilityRound===Number(form.round)).length,url:invite.shortUrl||invite.personalUrl,message})};
  });
  return {deliveries,repeated:false};
}
