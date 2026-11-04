import { syncLiveSquad } from '../src/coach-state.ts';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './sheets.mjs';
import { personalFormUrl, availabilityDefaultsFromTemplate, safeEditResponseUrl, safeShortFormUrl } from '../src/form-links.ts';

export function formInvitations(forms,invites){
  return invites.filter(invite=>forms.some(form=>form.formId===invite.formId)).map(invite=>{
    const form=forms.find(form=>form.formId===invite.formId);
    const personalUrl=personalFormUrl(form.url,form.codeEntryId,invite.code,form.prefillDefaults),editUrl=safeEditResponseUrl(form.url,invite.editUrl,form.formId);
    return {...invite,editUrl,personalUrl,shortUrl:safeShortFormUrl(invite.shortUrl,invite.shortUrlSource,personalUrl),shortEditUrl:safeShortFormUrl(invite.shortEditUrl,invite.shortEditUrlSource,editUrl)};
  });
}
export function connectPersonalLinks(form,status,template){
  if(status.issues.length)throw new HttpError(422,status.issues.join(' '));
  try{const input=String(template??''); const prefillDefaults=availabilityDefaultsFromTemplate(input,status.url,status.matchCount); const url=new URL(input);const codeEntryId=[...url.searchParams].find(([,value])=>value==='COACHMATE_CODE')[0].slice(6);return {...form,url:status.url,codeEntryId,prefillDefaults};}
  catch(error){throw new HttpError(422,error.message);}
}

const availabilityChoices = new Map([['Ja','available'],['Nee','unavailable'],['Aanwezig','available'],['Afwezig','unavailable']]);
const availabilityChoice = value => availabilityChoices.get(value) ?? null;
const formQuestions = form => {
  try { return form.matchId ? { [form.matchId]: form.statusQuestion } : JSON.parse(form.statusQuestion); }
  catch { return null; }
};

// Read Google's current settings rather than assuming an editor link is ready for parents.
export async function checkAvailabilityForm(auth, state, form) {
  if (form.teamSeasonId !== state.catalog.teamSeasonId) throw new HttpError(404, 'Formulier hoort niet bij dit teamseizoen.');
  const document = (await auth.request({ url: `https://forms.googleapis.com/v1/forms/${encodeURIComponent(form.formId)}` })).data;
  const questions = new Map((document.items ?? []).flatMap(item => item.questionItem?.question ? [[item.questionItem.question.questionId, item.questionItem.question]] : []));
  const mapping = formQuestions(form);
  const matches = state.catalog.matches.filter(match => form.matchId ? match.id === form.matchId : match.availabilityRound === Number(form.round));
  const issues = [];
  if (!questions.get(form.codeQuestion)?.required || !questions.get(form.codeQuestion)?.textQuestion) issues.push('De verplichte vraag voor de persoonlijke code ontbreekt of is gewijzigd.');
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || new Set(Object.values(mapping)).size !== Object.keys(mapping).length || Object.values(mapping).includes(form.codeQuestion) || !matches.length || Object.keys(mapping).length !== matches.length || matches.some(match => match.availabilityRound !== Number(form.round) || !Object.hasOwn(mapping, match.id))) {
    issues.push('De wedstrijden in de Sheet komen niet meer overeen met dit formulier. Herstel de oorspronkelijke speelronde en wedstrijden voordat je reacties ophaalt.');
  } else {
    for (const questionId of Object.values(mapping)) {
      const question = questions.get(questionId);
      const choices = question?.choiceQuestion;
      if (!question?.required || choices?.type !== 'RADIO' || choices.options?.length !== 2 || !([['Aanwezig','Afwezig'],['Ja','Nee']].some(pair=>pair.every(value=>choices.options.some(option=>option.value===value&&!option.isOther))))) {
        issues.push('Een beschikbaarheidsvraag is verwijderd of gewijzigd. Gebruik de verplichte keuzes Aanwezig en Afwezig (oude formulieren mogen Ja en Nee behouden).'); break;
      }
    }
  }
  let url = '';
  try { const target = new URL(document.responderUri); if (target.protocol === 'https:' && target.hostname === 'docs.google.com' && target.pathname.startsWith('/forms/')) url = target.href; } catch {}
  const publish = document.publishSettings?.publishState;
  return { formId: form.formId, url, codeEntryId:String(form.codeEntryId??''), prefillDefaults:String(form.prefillDefaults??''), published: publish ? publish.isPublished === true : null, accepting: publish ? publish.isAcceptingResponses === true : null, issues, matchCount: matches.length };
}

export async function createAvailabilityForm(auth, state, round) {
  const matches = state.catalog.matches.filter(m => m.availabilityRound === round);
  if (!Number.isInteger(round) || !matches.length || !state.catalog.players.length) throw new HttpError(422, 'Voeg eerst spelers en wedstrijden aan deze ronde toe.');
  if (matches.every(m => state.stats.some(r => r.matchId === m.id))) throw new HttpError(422, 'Deze ronde is al afgesloten.');
  const base = 'https://forms.googleapis.com/v1/forms';
  const title = `${state.catalog.clubName ? state.catalog.clubName + ' · ' : ''}${state.catalog.teamName} · ${state.catalog.seasonName} · speelronde ${round}`;
  const created = (await auth.request({url:base,method:'POST',params:{unpublished:true},retry:false,data:{info:{title,documentTitle:title}}})).data;
  const formId=created.formId;
  const result=(await auth.request({url:`${base}/${formId}:batchUpdate`,method:'POST',retry:false,data:{requests:[
    {updateFormInfo:{info:{description:`Beschikbaarheid voor alle ${matches.length} wedstrijden van ronde ${round}. Alle wedstrijden staan vooraf op Aanwezig. Controleer dit en kies Afwezig waar nodig. De persoonlijke link vult je code al in. Druk na het invullen op Verzenden; pas dan ontvangt de coach je antwoorden. Na verzending staat op het bevestigingsscherm Je antwoord bewerken. Open die link en sla de pagina op als bladwijzer om je ingestuurde antwoorden later te wijzigen. Verzend wijzigingen opnieuw.`},updateMask:'description'}},
    {createItem:{item:{title:'Persoonlijke code',questionItem:{question:{required:true,textQuestion:{}}}},location:{index:0}}},
    ...matches.map((m,i)=>({createItem:{item:{title:`${m.shortDate} · ${m.time} · ${m.opponent} · ${m.venue}`,questionItem:{question:{required:true,choiceQuestion:{type:'RADIO',options:[{value:'Aanwezig'},{value:'Afwezig'}]}}}},location:{index:i+1}}}))
  ]}})).data;
  return {form:{teamSeasonId:state.catalog.teamSeasonId,matchId:'',round,formId,url:created.responderUri??'',codeQuestion:result.replies[1].createItem.questionId[0],statusQuestion:JSON.stringify(Object.fromEntries(matches.map((m,i)=>[m.id,result.replies[i+2].createItem.questionId[0]])))},
    invites:state.catalog.players.map(p=>({formId,playerId:p.id,code:randomBytes(18).toString('base64url')}))};
}

export async function readFormResponses(auth, formId) {
  const responses = [];
  let pageToken;
  do {
    const result = (await auth.request({ url: `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}/responses`, params: { pageSize: 500, ...(pageToken ? { pageToken } : {}) } })).data;
    responses.push(...(result.responses ?? []));
    if (responses.length > 10000) throw new HttpError(422, 'Te veel formulierreacties voor één import.');
    pageToken = result.nextPageToken;
  } while (pageToken);
  return responses.sort((a,b) => Date.parse(a.lastSubmittedTime) - Date.parse(b.lastSubmittedTime));
}

export async function completePreparedForm(auth,state,form) {
  if(form.teamSeasonId!==state.catalog.teamSeasonId)throw new HttpError(404,'Formulier hoort bij een ander teamseizoen.');
  const document=(await auth.request({url:`https://forms.googleapis.com/v1/forms/${encodeURIComponent(form.formId)}`})).data;
  const matches=state.catalog.matches.filter(match=>match.availabilityRound===Number(form.round));
  const code=(document.items??[]).filter(item=>item.title==='Persoonlijke code'&&item.questionItem?.question.textQuestion);
  const choices=(document.items??[]).filter(item=>item.questionItem?.question.choiceQuestion);
  if(code.length!==1||choices.length!==matches.length||!matches.length||choices.some((item,index)=>!item.title?.includes(matches[index].opponent)))throw new HttpError(422,'De voorbereide vragen komen niet overeen met de wedstrijden.');
  const linked={...form,codeQuestion:code[0].questionItem.question.questionId,statusQuestion:JSON.stringify(Object.fromEntries(matches.map((match,index)=>[match.id,choices[index].questionItem.question.questionId])))};
  const checked=await checkAvailabilityForm(auth,state,linked);
  if(checked.issues.length)throw new HttpError(422,checked.issues.join(' '));
  return linked;
}

export function importResponses(state, form, invites, existingLog, responses) {
  if (form.teamSeasonId !== state.catalog.teamSeasonId) return {state,log:[...existingLog],imported:0};
  const next = structuredClone(state);
  const log = [...existingLog];
  const submissionIds = new Map();
  for (const response of responses) {
    if (!response.responseId || !Number.isFinite(Date.parse(response.lastSubmittedTime))) continue;
    const code = String(response.answers?.[form.codeQuestion]?.textAnswers?.answers?.[0]?.value ?? '').trim();
    const key = JSON.stringify([code,Date.parse(response.lastSubmittedTime)]);
    if (!submissionIds.has(key)) submissionIds.set(key,new Set());
    submissionIds.get(key).add(response.responseId);
  }
  let imported = 0, invalidCodes = 0;
  for (const response of responses) {
    const updatedAt = response.lastSubmittedTime;
    if (!response.responseId || !Number.isFinite(Date.parse(updatedAt))) continue;
    const answer = id => response.answers?.[id]?.textAnswers?.answers?.[0]?.value;
    const code = String(answer(form.codeQuestion) ?? '').trim();
    const candidates = invites.filter(i => code && i.formId === form.formId && typeof i.code === 'string' && Buffer.byteLength(code) === Buffer.byteLength(i.code) && timingSafeEqual(Buffer.from(code), Buffer.from(i.code)));
    const invite = candidates.length === 1 && state.catalog.players.some(p=>p.id===candidates[0].playerId) ? candidates[0] : null;
    const player = invite && state.catalog.players.find(p=>p.id===invite.playerId);
    const index = log.findIndex(r => r.formId === form.formId && r.responseId === response.responseId);
    const previous = index >= 0 ? log[index] : null;
    // Apps Script and the Forms REST API can expose different IDs for the same
    // submission. Keep the API ID for replay safety; link the script ID only
    // after verifying this form's personal code, roster and submission time.
    const scriptId = invite?.responseId && Date.parse(invite.submittedAt) === Date.parse(updatedAt) && submissionIds.get(JSON.stringify([code,Date.parse(updatedAt)]))?.size === 1 ? String(invite.responseId) : '';
    const identity = {teamSeasonId:form.teamSeasonId,playerId:player?.id??'',playerName:player?.name??'',round:form.round,appsScriptResponseId:scriptId};
    if (previous && Date.parse(previous.updatedAt) >= Date.parse(updatedAt)) {
      if (Date.parse(previous.updatedAt) === Date.parse(updatedAt) && player) log[index] = {...previous,...identity,appsScriptResponseId:scriptId||previous.appsScriptResponseId||''};
      continue; // Backfill audit metadata without replaying availability or changing its original result.
    }
    let result = 'Ongeldige code of antwoord';
    const questions = formQuestions(form);
    if (!invite) invalidCodes++;
    if (state.catalog.archived) result = 'Afgesloten; niet toegepast';
    else if (invite && questions && typeof questions === 'object' && !Array.isArray(questions) && Object.keys(questions).length && Object.values(questions).every(id=>availabilityChoice(answer(id)))) {
      let applied=0;
      for (const [matchId, questionId] of Object.entries(questions)) {
        const match=state.catalog.matches.find(m=>m.id===matchId);
        if (!match || match.availabilityRound !== Number(form.round) || state.stats.some(s=>s.matchId===matchId) || !availabilityChoice(answer(questionId)) || !Object.hasOwn(next.availability[matchId]??{},invite.playerId)) continue;
        const key=`${matchId}/${invite.playerId}`;
        const marker=next.formUpdates?.[key];
        if (marker?.manual || (marker && Date.parse(marker.time)>=Date.parse(updatedAt))) continue;
        next.availability[matchId][invite.playerId]=availabilityChoice(answer(questionId));
        next.formUpdates={...next.formUpdates,[key]:{time:updatedAt,manual:false}};
        applied++; imported++;
      }
      result=applied ? `Verwerkt (${applied} wedstrijden)` : 'Geen wijzigingen; handmatige, nieuwere of afgesloten reacties behouden';
    }
    if(invite && !state.catalog.archived && questions && !Object.values(questions).every(id=>availabilityChoice(answer(id)))) result='Onvolledig antwoord; niets toegepast';
    const entry = { formId: form.formId, responseId: response.responseId, updatedAt, result, ...identity };
    if (index >= 0) log[index] = entry; else log.push(entry);
  }
  return { state: imported ? syncLiveSquad(next, Date.now()) : next, log, imported, invalidCodes };
}
