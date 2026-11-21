import {sameRoundRows} from '../src/availability-workflow.ts';
import {isProcessed} from '../src/result-only.ts';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { coachReducer, parseState } from '../src/coach-state.ts';
import { SheetsStore, HttpError, loadTeam, stateTables } from './sheets.mjs';
import { createAvailabilityForm, checkAvailabilityForm, readFormResponses, importResponses, formInvitations, connectPersonalLinks, completePreparedForm } from './forms.mjs';
import { importHistory } from './history-import.mjs';
import { clubMigration } from './clubs.mjs';
import { applyActionBatch } from '../src/action-batch.ts';
import { serveStatic } from './static.mjs';
import {sealSession,openSession} from './session.mjs';
import { ParentStore } from './parent-store.mjs';
import { ParentPortal, parentEmail, projectParentAnswers, withoutParentProjection } from './parents.mjs';
import {prepareRoundJob,queueInvitationBatch,workerReady,serviceDataToken} from './invitations.mjs';

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || process.env.API_PORT || 4175);
const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:4173';
const apiOrigin = process.env.API_ORIGIN || `http://127.0.0.1:${port}`;
if (production && (!origin.startsWith('https://') || apiOrigin !== origin)) throw new Error('Production requires one HTTPS APP_ORIGIN and matching API_ORIGIN.');
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const allowed = (process.env.COACH_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && spreadsheetId && allowed.length);
const sessionSecret = process.env.GOOGLE_SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const parentTeams = new Set((process.env.COACHMATE_PARENT_TEAMS || '').split(',').map(s=>s.trim()).filter(Boolean));
const parentProject = process.env.COACHMATE_PARENT_PROJECT;
const parentEnabled = Boolean(parentProject && parentTeams.size && configured);
const parentPortal = parentEnabled ? new ParentPortal(
  new ParentStore(new GoogleAuth({scopes:['https://www.googleapis.com/auth/datastore']}), parentProject, process.env.COACHMATE_PARENT_DATABASE),
  async team => {
    const auth = new GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
    try { return loadTeam(await new SheetsStore(auth, spreadsheetId).read(), team).state; }
    catch (error) { if (error instanceof HttpError && error.status===404) return null; throw error; }
  }, parentTeams, origin,
) : null;
async function loadCoachTeam(snapshot, team) {
  const loaded = loadTeam(snapshot, team);
  if (!parentPortal?.enabled(team)) return loaded;
  const answers = await parentPortal.coachResponses(team);
  return {...projectParentAnswers(loaded,answers), parentPortalEnabled:true};
}
const sessions = new Map();
const attempts = new Map();
const random = () => randomBytes(32).toString('base64url');
const client = () => new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${apiOrigin}/auth/callback`);
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=')));
const cookie = (key, value, age) => `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${apiOrigin.startsWith('https:') ? '; Secure' : ''}`;
let queue = Promise.resolve();
const serial = operation => { const next = queue.then(operation); queue = next.catch(() => {}); return next; };
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
async function body(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 100000) throw new HttpError(413, 'Verzoek te groot.'); }
  try { return JSON.parse(data); } catch { throw new HttpError(400, 'Ongeldige JSON.'); }
}
function publicState(result) {
  const state = structuredClone(result.state);
  delete state.formUpdates;
  return { ...result, state };
}
function distributionData(snapshot, team) {
  const {tables}=snapshot, forms=tables.Forms.filter(row=>row.teamSeasonId===team);
  return {forms,invites:formInvitations(forms,tables.FormInvites),jobs:tables.FormJobs.filter(row=>row.teamSeasonId===team),deliveries:tables.FormDeliveries.filter(row=>row.teamSeasonId===team),mailReady:workerReady(tables)&&tables.FormJobs.some(row=>row.jobId==='worker'&&row.type==='worker-invitations-v3'),serviceDataToken:serviceDataToken(tables)};
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  if (req.headers.host !== new URL(apiOrigin).host) return send(res, 403, { error: 'Onbekende host.' });
  if (req.headers.origin === origin) {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, apiOrigin);
  try {
    if (production && await serveStatic(req, res, fileURLToPath(new URL('../dist/client/', import.meta.url)))) return;
    const sid = cookies(req).coach_session;
    const session = sessions.get(sid);
    if (session && session.expires < Date.now()) sessions.delete(sid);
    let active = session && session.expires >= Date.now() ? session : null;
    if (!active) {
      const saved=openSession(sid,sessionSecret);
      if(saved?.kind==='coach' && typeof saved.email==='string' && allowed.includes(saved.email.toLowerCase()) && saved.tokens && typeof saved.csrf==='string') {
        const auth=client();auth.setCredentials(saved.tokens);active={...saved,auth};if(sessions.size>=200)sessions.delete(sessions.keys().next().value);sessions.set(sid,active);
      } else if (saved?.kind==='parent' && parentPortal && typeof saved.uid==='string' && parentEmail(saved.email) && typeof saved.csrf==='string') {
        active=saved;
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/session') return send(res, 200, { configured, parentEnabled, authenticated: Boolean(active), role:active?.kind, email: active?.email, csrf: active?.csrf });
    if (req.method === 'GET' && url.pathname === '/auth/login') {
      const parent = url.searchParams.get('role') === 'parent';
      if (parent ? !parentPortal : !configured) throw new HttpError(503, 'Google-aanmelding is hier nog niet ingesteld.');
      if (attempts.size > 100) throw new HttpError(429, 'Probeer later opnieuw.');
      const oauth = client(); const state = random();
      const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();
      const nonce = random(); attempts.set(state, { codeVerifier, nonce, expires: Date.now() + 600000 });
      res.setHeader('Set-Cookie', cookie('coach_oauth', sealSession({kind:'oauth',role:parent?'parent':'coach',state,codeVerifier,nonce,expires:Date.now()+600000},sessionSecret), 600));
      res.writeHead(302, { Location: oauth.generateAuthUrl({ access_type: parent?'online':'offline', prompt:parent?'select_account':active?.auth?.credentials.refresh_token?undefined:'consent', scope: parent?['openid','email']:['openid','email','https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/forms.body','https://www.googleapis.com/auth/forms.responses.readonly'], state, nonce, code_challenge: codeChallenge, code_challenge_method: 'S256' }) }); return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/auth/callback') {
      const state = url.searchParams.get('state'); const sealed=openSession(cookies(req).coach_oauth,sessionSecret); const attempt=sealed?.kind==='oauth'&&sealed.state===state?sealed:null;
      if (!attempt || attempt.expires < Date.now()) throw new HttpError(403, 'Inloggen verlopen. Probeer opnieuw.');
      attempts.delete(state);
      const oauth = client();
      const { tokens } = await oauth.getToken({ code: url.searchParams.get('code'), codeVerifier: attempt.codeVerifier });
      oauth.setCredentials(tokens);
      const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
      const profile = ticket.getPayload();
      if (!profile?.email_verified || profile.nonce !== attempt.nonce || !parentEmail(profile.email) || !profile.sub) throw new HttpError(403, 'Google kon dit account niet verifiëren.');
      if (attempt.role==='parent') {
        if (!parentPortal) throw new HttpError(503, 'Het ouderportaal is niet actief.');
        const age=8*3600;
        const saved={kind:'parent',uid:profile.sub,email:parentEmail(profile.email),csrf:random(),expires:Date.now()+age*1000};
        if (sid) sessions.delete(sid);
        res.setHeader('Set-Cookie',[cookie('coach_session',sealSession(saved,sessionSecret),age),cookie('coach_oauth','',0)]);
        res.writeHead(302,{Location:origin+'/?parent=1'}); return res.end();
      }
      if (!allowed.includes(profile.email.toLowerCase())) throw new HttpError(403, 'Dit Google-account heeft geen coachtoegang.');
      if (sid) sessions.delete(sid);
      const refresh_token=tokens.refresh_token || (active?.email===profile.email?active?.auth?.credentials.refresh_token:undefined);
      const age=refresh_token?30*24*3600:8*3600;
      const credentials=refresh_token?{refresh_token}:{access_token:tokens.access_token,expiry_date:tokens.expiry_date,token_type:tokens.token_type};
      const saved={kind:'coach',email:profile.email,csrf:random(),tokens:credentials,expires:Date.now()+age*1000};
      res.setHeader('Set-Cookie', [cookie('coach_session', sealSession(saved,sessionSecret), age), cookie('coach_oauth', '', 0)]);
      res.writeHead(302, { Location: `${origin}/?google=connected` }); return res.end();
    }
    if (!active) throw new HttpError(401, 'Log eerst in met Google.');
    if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['x-csrf-token'] !== active.csrf)) throw new HttpError(403, 'Ongeldig verzoek. Herlaad de pagina.');
    if (req.method === 'POST' && url.pathname === '/api/logout') { sessions.delete(sid); res.setHeader('Set-Cookie', cookie('coach_session', '', 0)); return send(res, 200, { ok: true }); }
    if (active.kind==='parent') {
      if (!parentPortal) throw new HttpError(503, 'Het ouderportaal is niet actief.');
      if (req.method==='GET' && url.pathname==='/api/parent') return send(res,200,await parentPortal.dashboard(active));
      if (req.method==='POST' && url.pathname==='/api/parent/claim') {
        const input=await body(req);
        return send(res,200,await parentPortal.claim(active,input?.code));
      }
      if (req.method==='POST' && url.pathname==='/api/parent/answer') return send(res,200,await parentPortal.answer(active,await body(req)));
      throw new HttpError(403, 'Deze functie is voor coaches.');
    }
    const store = new SheetsStore(active.auth, spreadsheetId);
    if (url.pathname==='/api/parent-access' || url.pathname.startsWith('/api/parent-access/')) {
      if (!parentPortal) throw new HttpError(404, 'Het ouderportaal is niet actief.');
      if (req.method==='GET' && url.pathname==='/api/parent-access') {
        const team=url.searchParams.get('team');
        loadTeam(await store.read(),team);
        return send(res,200,await parentPortal.list(team));
      }
      if (req.method==='POST') {
        const input=await body(req);
        const snapshot=await store.read();
        const loaded=loadTeam(snapshot,input.teamSeasonId);
        if (url.pathname==='/api/parent-access/invite') return send(res,200,await parentPortal.invite(loaded.state,input));
        if (url.pathname==='/api/parent-access/revoke') return send(res,200,await parentPortal.revoke(input.teamSeasonId,input.linkId));
        if (url.pathname==='/api/parent-access/release') {
          const output=await serial(async()=>{
            const fresh=await store.read(),team=input.teamSeasonId;
            const raw=loadTeam(fresh,team);
            const current=projectParentAnswers(raw,await parentPortal.coachResponses(team));
            const m=raw.state.catalog.matches.find(m=>m.id===input.matchId);
            const key=input.matchId+'/'+input.playerId;
            if (raw.state.catalog.archived || !m || isProcessed(raw.state,m.id) || !current.parentAnswers?.[key]?.coachOverride ||
                raw.revision!==input.revision || current.sourceToken!==input.sourceToken) throw new HttpError(409,'Vernieuw de wedstrijd. De coachcorrectie is gewijzigd of de wedstrijd is afgesloten.');
            const next={...raw.state,formUpdates:{...raw.state.formUpdates}};
            delete next.formUpdates[key];
            await store.write(fresh,stateTables(fresh,team,next,raw.revision+1));
            const saved=await store.read();
            return {...publicState(await loadCoachTeam(saved,team)),distribution:distributionData(saved,team)};
          });
          return send(res,200,output);
        }
      }
      throw new HttpError(404, 'Niet gevonden.');
    }
    if (req.method === 'GET' && url.pathname === '/api/teams') {
      const snapshot=await store.read(),{tables}=snapshot;
      const preferred=url.searchParams.get('team'), chosen=tables.TeamSeasons.find(team=>team.teamSeasonId===preferred)??(tables.TeamSeasons.length===1?tables.TeamSeasons[0]:null);
      return send(res, 200, {seasons:tables.Seasons,teams:tables.TeamSeasons,...(chosen?{...publicState(await loadCoachTeam(snapshot,chosen.teamSeasonId)),distribution:distributionData(snapshot,chosen.teamSeasonId)}:{})});
    }
    if (req.method === 'GET' && url.pathname === '/api/state') { const snapshot=await store.read(),team=url.searchParams.get('team');return send(res,200,{...publicState(await loadCoachTeam(snapshot,team)),distribution:distributionData(snapshot,team)}); }
    if (req.method === 'GET' && url.pathname === '/api/forms') {
      const snapshot = await store.read(); const {tables}=snapshot; const team = url.searchParams.get('team');
      const forms = tables.Forms.filter(f => f.teamSeasonId === team);
      const loaded=await loadCoachTeam(snapshot,team);
      return send(res, 200, { forms, invites: formInvitations(forms,tables.FormInvites),jobs:tables.FormJobs.filter(row=>row.teamSeasonId===team),deliveries:tables.FormDeliveries.filter(row=>row.teamSeasonId===team),mailReady:workerReady(tables)&&tables.FormJobs.some(row=>row.jobId==='worker'&&row.type==='worker-invitations-v3'),revision:loaded.revision,sourceToken:loaded.sourceToken,serviceDataToken:serviceDataToken(tables) });
    }
    if (req.method === 'GET' && url.pathname === '/api/forms/status') {
      const snapshot = await store.read();
      const loaded = loadTeam(snapshot, url.searchParams.get('team'));
      const form = snapshot.tables.Forms.find(form => form.teamSeasonId === loaded.state.catalog.teamSeasonId && form.formId === url.searchParams.get('form'));
      if (!form) throw new HttpError(404, 'Formulier niet gevonden voor dit teamseizoen.');
      return send(res, 200, await checkAvailabilityForm(active.auth, loaded.state, form));
    }
    if (req.method !== 'POST' || !['/api/action', '/api/action-batch', '/api/forms/create', '/api/forms/prepare', '/api/forms/finalize', '/api/forms/invite', '/api/forms/link', '/api/forms/import', '/api/club', '/api/history/import'].includes(url.pathname)) throw new HttpError(404, 'Niet gevonden.');
    const input = await body(req);
    const output = await serial(async () => {
      const snapshot = await store.read();
      const raw = loadTeam(snapshot,input.teamSeasonId);
      const loaded = await loadCoachTeam(snapshot,input.teamSeasonId);
      if (loaded.state.catalog.archived) throw new HttpError(403, 'Dit seizoen is gearchiveerd en alleen leesbaar.');
      if(url.pathname==='/api/forms/invite' && snapshot.tables.FormDeliveries.some(row=>row.batchId===input.batchId)) {
        const repeated=queueInvitationBatch(snapshot,loaded.state,input);
        return {...publicState(loaded),deliveries:repeated.deliveries};
      }
      if (url.pathname === '/api/action-batch' && loaded.state.committedBatches?.includes(input.batchId)) return publicState(loaded);
      if (loaded.revision !== input.revision || loaded.sourceToken !== input.sourceToken) throw new HttpError(409, 'Een andere coach of de bron heeft gegevens gewijzigd. Vernieuw de gegevens.');
      if (url.pathname === '/api/club') {
        const migration = clubMigration(snapshot, input.teamSeasonId, input);
        await store.write(snapshot, migration.replacements);
        const saved = await store.read();
        return { ...publicState(await loadCoachTeam(saved, migration.teamSeasonId)), teams: saved.tables.TeamSeasons };
      }
      let state = loaded.state; let extra = {}; let detail = {};
      if (url.pathname === '/api/action-batch') {
        if (typeof input.batchId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(input.batchId)) throw new HttpError(400, 'Ongeldig conceptnummer.');
        try { state = applyActionBatch(state, input.actions); } catch (error) { throw new HttpError(422, error.message); }
        state.committedBatches = [...(state.committedBatches ?? []), input.batchId].slice(-100);
      } else if (url.pathname === '/api/action') {
        const action = input.action;
        const types = ['set-formations','set-substitution-profiles','set-substitution-policy','prepare-match','toggle-clock','phase','finish','set-periods','set-field-size','set-period','goal','away-goal','edit-goal','undo-goal','keeper','swap','availability','availability-batch','new-round','add-matches','save-round-matches','save-stats'];
        if (!action || !types.includes(action.type)) throw new HttpError(400, 'Onbekende actie.');
        if(action.type==='save-round-matches'&&snapshot.tables.Forms.some(f=>f.teamSeasonId===input.teamSeasonId&&Number(f.round)===action.round)&&!sameRoundRows(state.catalog.matches.filter(m=>m.availabilityRound===action.round),action.matches??[]))throw new HttpError(422,'Deze ronde heeft al een formulier. Bestaande vragen en antwoorden blijven behouden; controleer wijzigingen eerst bij het formulierbeheer.');
        const previous = state;
        state = coachReducer(state, { ...action, now: Date.now() });
        if(action.type==='save-stats'&&previous.resultOnly?.[action.matchId])throw new HttpError(422,'Deze wedstrijd bevat alleen uitslag en scoreverloop. Corrigeer die registratie zonder aanwezigheid of minuten in te vullen.');
        if (['set-formations','set-substitution-policy','set-substitution-profiles'].includes(action.type) && state === previous) throw new HttpError(422, 'Ongeldig of verouderd wisselbeleid of spelersprofiel.');
        if(action.type==='save-round-matches'&&state===previous)throw new HttpError(422,'Controleer de wedstrijden. Verwerkte of lopende wedstrijden mogen niet worden gewijzigd en bestaande wedstrijden moeten behouden blijven.');
        if (action.type === 'prepare-match' && state === previous) throw new HttpError(422, 'Sluit de actieve wedstrijd eerst af en kies een nog niet geregistreerde wedstrijd.');
        if (action.type === 'availability-batch') {
          if(state===previous) throw new HttpError(422,'Controleer de beschikbaarheidswijzigingen; afgesloten wedstrijden zijn alleen-lezen.');
          const time=new Date().toISOString();
          state.formUpdates={...state.formUpdates,...Object.fromEntries(Object.keys(action.changes).map(id=>[`${action.matchId}/${id}`,{time,manual:true}]))};
        }
        if (action.type === 'availability') state.formUpdates = { ...state.formUpdates, [`${action.matchId}/${action.playerId}`]: { time: new Date().toISOString(), manual: true } };
        if (['new-round','add-matches'].includes(action.type)) {
          if (state === previous) throw new HttpError(422, 'Voer minstens één geldige nieuwe wedstrijd in.');
          if (action.type === 'add-matches' && snapshot.tables.Forms.some(f => f.teamSeasonId === input.teamSeasonId && !f.matchId && Number(f.round) === state.currentRound)) throw new HttpError(422, 'Het rondeformulier is al gemaakt. Start een nieuwe ronde voor extra wedstrijden.');
        }
        try { parseState(JSON.stringify(state)); } catch { throw new HttpError(422, 'Ongeldige wedstrijdgegevens.'); }
      } else if (url.pathname === '/api/history/import') {
        const imported = importHistory(state, snapshot.tables.Matches, { singleKeeperQuarter: true });
        state = imported.state; detail = { imported: imported.imported, report: imported.report };
      } else if (url.pathname === '/api/forms/link') {
        const form=snapshot.tables.Forms.find(form=>form.teamSeasonId===input.teamSeasonId&&form.formId===input.formId);
        if(!form)throw new HttpError(404,'Formulier niet gevonden voor dit teamseizoen.');
        const linked=connectPersonalLinks(form,await checkAvailabilityForm(active.auth,state,form),input.template);
        extra={Forms:snapshot.tables.Forms.map(row=>row===form?linked:row),FormInvites:snapshot.tables.FormInvites.map(invite=>invite.formId===linked.formId?formInvitations([linked],[invite])[0]:invite)};
        detail={form:linked};
      } else if(url.pathname === '/api/forms/prepare') {
        const prepared=prepareRoundJob(snapshot,state,Number(input.round));
        if(prepared.form)return {...publicState(loaded),form:prepared.form};
        if(snapshot.tables.FormJobs.some(job=>job.jobId===prepared.job.jobId&&job.status===prepared.job.status))return {...publicState(loaded),job:prepared.job};
        extra={FormJobs:[...snapshot.tables.FormJobs.filter(job=>job.jobId!==prepared.job.jobId),prepared.job]};detail={job:prepared.job};
      } else if(url.pathname === '/api/forms/finalize') {
        const job=snapshot.tables.FormJobs.find(job=>job.teamSeasonId===input.teamSeasonId&&job.formId===input.formId&&job.status==='awaiting-mapping');
        const form=job&&snapshot.tables.Forms.find(form=>form.formId===job.formId&&form.teamSeasonId===input.teamSeasonId);
        if(!form)throw new HttpError(404,'De formulieropdracht is niet gevonden.');
        const linked=await completePreparedForm(active.auth,state,form);
        extra={Forms:snapshot.tables.Forms.map(row=>row===form?linked:row),FormJobs:snapshot.tables.FormJobs.map(row=>row===job?{...row,status:'ready',completedAt:new Date().toISOString()}:row)};
      } else if(url.pathname === '/api/forms/invite') {
        const queued=queueInvitationBatch(snapshot,state,input);
        const form=snapshot.tables.Forms.find(form=>form.formId===input.formId&&form.teamSeasonId===input.teamSeasonId);
        const checked=await checkAvailabilityForm(active.auth,state,form);
        if(checked.issues.length||checked.published!==true||checked.accepting!==true)throw new HttpError(422,'Het formulier is nog niet klaar voor ouders. Er is niets verstuurd.');
        extra={FormDeliveries:[...snapshot.tables.FormDeliveries,...queued.deliveries]};detail={deliveries:queued.deliveries};
      } else if (url.pathname === '/api/forms/create') {
        const existing = snapshot.tables.Forms.find(f => f.teamSeasonId === input.teamSeasonId && !f.matchId && Number(f.round) === Number(input.round));
        if (existing) return { ...publicState(loaded), form: existing };
        const created = await createAvailabilityForm(active.auth, state, Number(input.round));
        extra = { Forms: [...snapshot.tables.Forms, created.form], FormInvites: [...snapshot.tables.FormInvites, ...created.invites] }; detail = { form: created.form };
      } else {
        const round = input.round === undefined ? null : Number(input.round);
        if (round !== null && (!Number.isInteger(round) || round < 1)) throw new HttpError(422, 'Kies een geldige speelronde.');
        const forms = snapshot.tables.Forms.filter(f => f.teamSeasonId === input.teamSeasonId && (round === null || Number(f.round) === round));
        if (!forms.length) throw new HttpError(422, 'Bereid eerst een beschikbaarheidsformulier voor deze speelronde voor.');
        let log = snapshot.tables.FormResponses; let imported = 0, invalidCodes = 0;
        for (const form of forms) {
          const checked = await checkAvailabilityForm(active.auth, state, form);
          if (checked.issues.length) throw new HttpError(422, checked.issues.join(' '));
          const result = importResponses(state, form, snapshot.tables.FormInvites, log, await readFormResponses(active.auth, form.formId));
          state = result.state; log = result.log; imported += result.imported; invalidCodes += result.invalidCodes;
        }
        extra = { FormResponses: log }; detail = { imported, invalidCodes };
      }
      const serviceOnly=['/api/forms/create','/api/forms/prepare','/api/forms/finalize','/api/forms/invite','/api/forms/link'].includes(url.pathname) || (url.pathname==='/api/forms/import' && detail.imported===0);
      const replacements=serviceOnly?{}:stateTables(snapshot,input.teamSeasonId,withoutParentProjection(state,raw.state,loaded.state),loaded.revision+1);
      const resultOnlyWrite=url.pathname==='/api/action-batch'&&input.actions.every(action=>action.type==='save-result');
      await store.write(snapshot, { ...(resultOnlyWrite?{State:replacements.State}:replacements), ...extra });
      const saved=await store.read();return { ...publicState(await loadCoachTeam(saved, input.teamSeasonId)), distribution:distributionData(saved,input.teamSeasonId), ...detail };
    });
    send(res, 200, output);
  } catch (error) {
    // Never return OAuth tokens, request headers, or Google's raw error payload.
    const status = error instanceof HttpError ? error.status : 502;
    send(res, status, { error: error instanceof HttpError ? error.message : 'Google-verzoek mislukt. Controleer API-toegang en vernieuw de gegevens voordat je opnieuw probeert.' });
  }
});
setInterval(() => { for (const map of [sessions, attempts]) for (const [key, value] of map) if (value.expires < Date.now()) map.delete(key); }, 60000).unref();
server.listen(port, production ? '0.0.0.0' : '127.0.0.1', () => console.log(`CoachMate backend: ${apiOrigin} (${configured ? 'Google ingesteld' : 'Google-configuratie ontbreekt'})`));


