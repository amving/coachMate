import {sameRoundRows} from '../src/availability-workflow.ts';
import {isProcessed,processedMatchIds} from '../src/result-only.ts';
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
import { ParentStore, parentAppTransport } from './parent-store.mjs';
import { parentAuth, authoritativeMailbox } from './parent-auth.mjs';
import { parentEmailLogin } from './parent-email.mjs';
import { SharedLive } from './shared-live.mjs';
import { ParentPortal, parentEmail, projectParentAnswers, withoutParentProjection } from './parents.mjs';
import {prepareRoundJob,queueInvitationBatch,workerReady,serviceDataToken} from './invitations.mjs';
import {appStoreFromEnvironment} from './firestore-app-store.mjs';

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || process.env.API_PORT || 4175);
const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:4173';
const apiOrigin = process.env.API_ORIGIN || `http://127.0.0.1:${port}`;
if (production && (!origin.startsWith('https://') || apiOrigin !== origin)) throw new Error('Production requires one HTTPS APP_ORIGIN and matching API_ORIGIN.');
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const appStore = appStoreFromEnvironment(process.env);
const allowed = (process.env.COACH_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && (appStore || spreadsheetId && allowed.length));
const activeStore = auth => appStore ?? new SheetsStore(auth,spreadsheetId);
const googleAccount = subject => typeof subject==='string'&&subject ? 'google:'+subject : '';
function requireCoachTeam(access, team){
  if(appStore&&(!team||!(access?.admin||access?.teams.includes(team))))throw new HttpError(403,'Dit account heeft geen coachtoegang voor dit team.');
  return team;
}
const hasCoachAccess = access => Boolean(access?.admin||access?.teams.length);
const sessionSecret = process.env.GOOGLE_SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const parentTeams = new Set((process.env.COACHMATE_PARENT_TEAMS || '').split(',').map(s=>s.trim()).filter(Boolean));
const parentProject = appStore ? process.env.COACHMATE_APP_FIRESTORE_PROJECT : process.env.COACHMATE_PARENT_PROJECT;
const parentClientId = process.env.COACHMATE_PARENT_CLIENT_ID;
const parentClientSecret = process.env.COACHMATE_PARENT_CLIENT_SECRET;
const parentSessionSecret = process.env.COACHMATE_PARENT_SESSION_SECRET;
const parentEnabled = process.env.COACHMATE_PARENT_ENABLED==='true' && Boolean(
  (appStore || spreadsheetId) && parentProject && parentTeams.size && parentClientId && parentClientSecret &&
  parentSessionSecret?.length>=32 && parentClientId!==process.env.GOOGLE_CLIENT_ID &&
  parentClientSecret!==process.env.GOOGLE_CLIENT_SECRET && parentClientSecret!==sessionSecret &&
  ![process.env.GOOGLE_CLIENT_SECRET,sessionSecret,parentClientSecret].includes(parentSessionSecret)
);
const parentLogin = parentEnabled ? parentAuth({
  clientId:parentClientId,clientSecret:parentClientSecret,secret:parentSessionSecret,origin,apiOrigin,subjectToUid:appStore?googleAccount:undefined,
}) : null;
const parentPortal = parentEnabled ? new ParentPortal(
  new ParentStore(appStore?parentAppTransport(appStore.connection):new GoogleAuth({scopes:['https://www.googleapis.com/auth/datastore']}),
    parentProject, appStore?undefined:process.env.COACHMATE_PARENT_DATABASE),
  async team => {
    const store=appStore??new SheetsStore(new GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']}),spreadsheetId);
    try { return loadTeam(await store.read(), team).state; }
    catch (error) { if (error instanceof HttpError && error.status===404) return null; throw error; }
  }, parentTeams, origin,
) : null;
const parentEmailKey = process.env.COACHMATE_PARENT_EMAIL_API_KEY;
const authEmulator = !production && process.env.FIREBASE_AUTH_EMULATOR_HOST;
const parentMail = parentPortal && parentEmailKey ? parentEmailLogin({
  apiKey:parentEmailKey, origin, apiOrigin, secret:parentSessionSecret, portal:parentPortal,
  identityBase:authEmulator ? 'http://' + authEmulator + '/identitytoolkit.googleapis.com' : 'https://identitytoolkit.googleapis.com',
}) : null;
const sharedLive=appStore&&parentPortal&&process.env.COACHMATE_SHARED_LIVE_ENABLED==='true'?new SharedLive(parentPortal):null;
async function loadCoachTeam(snapshot, team, loaded = loadTeam(snapshot, team)) {
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
  const availabilitySources = Object.fromEntries(Object.entries(state.formUpdates??{}).map(([key,value])=>
    [key,value.manual?'Coachcorrectie':'Google Forms']));
  const processed=processedMatchIds(state);
  for(const [key,answer] of Object.entries(result.parentAnswers??{})){
    const matchId=key.split('/')[0];
    if(!answer.coachOverride&&!processed.has(matchId))availabilitySources[key]='Ouderportaal';
  }
  delete state.formUpdates;
  return { ...result, state, availabilitySources };
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
    const requestCookies = cookies(req);
    const path=url.pathname;
    if(req.method==='GET'&&path==='/auth/login'&&url.searchParams.get('role')==='parent'){
      if(!parentLogin)throw new HttpError(503,'Het ouderportaal is hier nog niet beschikbaar.');
      return res.writeHead(302,{Location:apiOrigin+'/auth/parent/login'}).end();
    }
    if(req.method==='GET'&&path==='/auth/parent/from-coach'){
      const identity=appStore&&parentLogin?openSession(requestCookies.coach_session,sessionSecret):null;
      if(identity?.kind!=='coach'||!identity.uid?.startsWith('google:')||
        !hasCoachAccess(await appStore.getCoachAccess(identity.uid)))throw new HttpError(403,'Coachsessie niet beschikbaar.');
      parentLogin.createSession(res,identity);
      return res.writeHead(302,{Location:origin+'/?parent=1'}).end();
    }
    if(req.method==='GET'&&path==='/auth/coach/from-parent'){
      const identity=appStore&&parentLogin?parentLogin.session(requestCookies):null;
      if(!identity?.uid.startsWith('google:')||!hasCoachAccess(await appStore.getCoachAccess(identity.uid))){
        throw new HttpError(403,'Dit account heeft geen coachtoegang.');
      }
      const age=Math.max(0,Math.floor((identity.expires-Date.now())/1000));
      const saved={...identity,kind:'coach',csrf:random()};
      res.setHeader('Set-Cookie',cookie('coach_session',sealSession(saved,sessionSecret),age));
      return res.writeHead(302,{Location:origin+'/'}).end();
    }
    if(path.startsWith('/auth/parent/')||path==='/api/parent'||path.startsWith('/api/parent/')){
      const active=parentLogin?.session(requestCookies);
      if(req.method==='GET'&&path==='/api/parent/session'){
        const coachAvailable=Boolean(appStore&&active?.uid.startsWith('google:')&&hasCoachAccess(await appStore.getCoachAccess(active.uid)));
        return send(res,200,{sharedLiveEnabled:Boolean(sharedLive),parentEnabled,parentEmailEnabled:Boolean(parentMail),coachAvailable,authenticated:Boolean(active),role:active?.kind,email:active?.email,csrf:active?.csrf});
      }
      if(!parentLogin)throw new HttpError(503,'Het ouderportaal is hier nog niet beschikbaar.');
      if(req.method==='GET'&&path==='/auth/parent/login')return await parentLogin.login(res);
      if(req.method==='GET'&&path==='/auth/parent/callback')return await parentLogin.callback(res,url.searchParams,requestCookies);
      if(req.method==='GET'&&path==='/auth/parent/email'&&parentMail){
        return res.writeHead(302,{Location:parentMail.landing(url.searchParams)}).end();
      }
      if(req.method==='POST'&&parentMail&&['/api/parent/email/request','/api/parent/email/redeem'].includes(path)){
        if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json')){
          throw new HttpError(403,'Ongeldig verzoek. Herlaad de pagina.');
        }
        const input = await body(req);
        if(path==='/api/parent/email/request'){
          await parentMail.send(input);
          return send(res,200,{ok:true});
        }
        const identity = await parentMail.redeem(input);
        if(identity.invite)await parentPortal.claim(identity,identity.invite);
        parentLogin.createSession(res,identity);
        return send(res,200,{ok:true});
      }
      if(!active)throw new HttpError(401,'Log eerst in als ouder.');
      if(req.method==='POST'&&(req.headers.origin!==origin||req.headers['x-csrf-token']!==active.csrf)){
        throw new HttpError(403,'Ongeldig verzoek. Herlaad de pagina.');
      }
      if(req.method==='POST'&&path==='/api/parent/logout'){
        parentLogin.clear(res);return send(res,200,{ok:true});
      }
      if(req.method==='GET'&&path==='/api/parent')return send(res,200,await parentPortal.dashboard(active));
      if(req.method==='POST'&&path==='/api/parent/claim'){
        if(!active.verifiedMailbox)throw new HttpError(403,'Dit Google-account kan het huidige eigendom van je mailbox niet bevestigen. Vraag je coach om hulp met de koppeling.');
        const input=await body(req);
        return send(res,200,await parentPortal.claim(active,input?.code));
      }
      if(req.method==='POST'&&path==='/api/parent/answer')return send(res,200,await parentPortal.answer(active,await body(req)));
      if(sharedLive&&path==='/api/parent/live'&&req.method==='GET')return send(res,200,await sharedLive.parentRows(active));
      if(sharedLive&&['/api/parent/live/sync','/api/parent/live/offer'].includes(path)&&req.method==='POST'){
        const input=await body(req);
        const row=await sharedLive.parentRow(active,input);
        const result=path.endsWith('/sync')?await sharedLive.sync(row,active.uid,input,false):
          await sharedLive.offer(row,active.uid,false,input.version);
        return send(res,200,result);
      }
      throw new HttpError(404,'Niet gevonden.');
    }
    const sid = requestCookies.coach_session;
    const session = sessions.get(sid);
    if (session && session.expires < Date.now()) sessions.delete(sid);
    let active = session && session.expires >= Date.now() ? session : null;
    if (!active) {
      const saved=openSession(sid,sessionSecret);
      if(saved?.kind==='coach' && typeof saved.email==='string' && typeof saved.csrf==='string' &&
        (appStore ? saved.uid?.startsWith('google:') : allowed.includes(saved.email.toLowerCase())&&saved.tokens)) {
        const auth=client();if(saved.tokens)auth.setCredentials(saved.tokens);active={...saved,auth};if(sessions.size>=200)sessions.delete(sessions.keys().next().value);sessions.set(sid,active);
      }
    }
    const coachAccess=appStore&&active?.kind==='coach'?await appStore.getCoachAccess(active.uid):null;
    if(appStore&&!hasCoachAccess(coachAccess))active=null;
    if (req.method === 'GET' && url.pathname === '/api/session') return send(res, 200, { configured, sharedLiveEnabled:Boolean(sharedLive), parentEnabled, role:active?.kind, authenticated: Boolean(active), email: active?.email, csrf: active?.csrf, dataSource:appStore?'firestore':'sheets' });
    if (req.method === 'GET' && url.pathname === '/auth/login') {
      if (!configured) throw new HttpError(503, 'Google-aanmelding is hier nog niet ingesteld.');
      if (attempts.size > 100) throw new HttpError(429, 'Probeer later opnieuw.');
      const oauth = client(); const state = random();
      const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();
      const nonce = random(); attempts.set(state, { codeVerifier, nonce, expires: Date.now() + 600000 });
      res.setHeader('Set-Cookie', cookie('coach_oauth', sealSession({kind:'oauth',state,codeVerifier,nonce,expires:Date.now()+600000},sessionSecret), 600));
      const scope=['openid','email'];
      if(!appStore)scope.push('https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/forms.body','https://www.googleapis.com/auth/forms.responses.readonly');
      res.writeHead(302, { Location: oauth.generateAuthUrl({ access_type: appStore?'online':'offline', prompt:appStore?'select_account':active?.auth?.credentials.refresh_token?undefined:'consent', scope, state, nonce, code_challenge: codeChallenge, code_challenge_method: 'S256' }) }); return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/auth/callback') {
      const state = url.searchParams.get('state'); const sealed=openSession(requestCookies.coach_oauth,sessionSecret); const attempt=sealed?.kind==='oauth'&&sealed.role!=='parent'&&sealed.state===state?sealed:null;
      if (!attempt || attempt.expires < Date.now()) throw new HttpError(403, 'Inloggen verlopen. Probeer opnieuw.');
      attempts.delete(state);
      const oauth = client();
      const { tokens } = await oauth.getToken({ code: url.searchParams.get('code'), codeVerifier: attempt.codeVerifier });
      oauth.setCredentials(tokens);
      const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
      const profile = ticket.getPayload();
      if (profile?.email_verified!==true || !parentEmail(profile.email)||!googleAccount(profile.sub) || profile.nonce !== attempt.nonce) throw new HttpError(403, 'Google kon dit account niet verifiëren.');
      const uid=googleAccount(profile.sub), access=appStore?await appStore.getCoachAccess(uid):null;
      if(appStore?!hasCoachAccess(access):!allowed.includes(profile.email.toLowerCase())){
        throw new HttpError(403,'Dit Google-account heeft geen coachtoegang.');
      }
      if (sid) sessions.delete(sid);
      const refresh_token=tokens.refresh_token || (active?.email===profile.email?active?.auth?.credentials.refresh_token:undefined);
      const age=!appStore&&refresh_token?30*24*3600:8*3600;
      const credentials=refresh_token?{refresh_token}:{access_token:tokens.access_token,expiry_date:tokens.expiry_date,token_type:tokens.token_type};
      const saved={kind:'coach',email:profile.email,csrf:random(),...(appStore?{uid,verifiedMailbox:authoritativeMailbox(parentEmail(profile.email),profile)}:{tokens:credentials}),expires:Date.now()+age*1000};
      res.setHeader('Set-Cookie', [cookie('coach_session', sealSession(saved,sessionSecret), age), cookie('coach_oauth', '', 0)]);
      res.writeHead(302, { Location: `${origin}/?google=connected` }); return res.end();
    }
    if (!active) throw new HttpError(parentLogin?.session(requestCookies)?403:401,'Log in met je coachaccount.');
    if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['x-csrf-token'] !== active.csrf)) throw new HttpError(403, 'Ongeldig verzoek. Herlaad de pagina.');
    if (req.method === 'POST' && url.pathname === '/api/logout') { sessions.delete(sid); res.setHeader('Set-Cookie', cookie('coach_session', '', 0)); return send(res, 200, { ok: true }); }
    const store = activeStore(active.auth);
    if (path.startsWith('/api/shared-live/')) {
      const input=req.method==='POST'?await body(req):Object.fromEntries(url.searchParams);
      if(!sharedLive||!parentPortal.enabled(input?.teamSeasonId))throw new HttpError(404,'Gedeelde Live is niet beschikbaar.');
      requireCoachTeam(coachAccess,input.teamSeasonId);
      const run=async()=>{
        const snapshot=await store.read();
        const raw=loadTeam(snapshot,input.teamSeasonId), loaded=await loadCoachTeam(snapshot,input.teamSeasonId,raw);
        const row=await sharedLive.row(input.teamSeasonId,input.matchId);
        if(req.method==='GET'&&path==='/api/shared-live/view'){
          if(!loaded.state.catalog.matches.some(m=>m.id===input.matchId))throw new HttpError(404,'Wedstrijd niet gevonden.');
          return {draft:row?sharedLive.view(row,active.uid,true):null,links:row?[]:(await parentPortal.list(input.teamSeasonId)).links};
        }
        if(req.method==='POST'&&path==='/api/shared-live/open')return sharedLive.open(loaded.state,input,active.uid);
        if(req.method!=='POST'||!row||loaded.state.catalog.archived)throw new HttpError(404,'Gedeelde registratie niet gevonden.');
        if(path==='/api/shared-live/sync')return sharedLive.sync(row,active.uid,input,true);
        if(path==='/api/shared-live/offer')return sharedLive.offer(row,active.uid,true,input.version);
        if(path==='/api/shared-live/preview')return sharedLive.preview(row,input,loaded.state);
        if(path!=='/api/shared-live/approve')throw new HttpError(404,'Niet gevonden.');
        if(row.data.status==='processed')return sharedLive.view(row,active.uid,true);
        const approval=sharedLive.approval(row,input,loaded.state);
        const next=withoutParentProjection(approval.state,raw.state,loaded.state);
        await appStore.write(snapshot,stateTables(snapshot,input.teamSeasonId,next,loaded.revision+1),
          sharedLive.store.writes([approval.change]));
        return sharedLive.view(await sharedLive.row(input.teamSeasonId,input.matchId),active.uid,true);
      };
      return send(res,200,await (req.method==='POST'?serial(run):run()));
    }
    if (url.pathname==='/api/parent-access' || url.pathname.startsWith('/api/parent-access/')) {
      if (!parentPortal) throw new HttpError(404, 'Het ouderportaal is niet actief.');
      if (req.method==='GET' && url.pathname==='/api/parent-access') {
        const team=requireCoachTeam(coachAccess,url.searchParams.get('team'));
        loadTeam(await store.read(),team);
        return send(res,200,await parentPortal.list(team));
      }
      if (req.method==='POST') {
        const input=await body(req);
        requireCoachTeam(coachAccess,input?.teamSeasonId);
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
      const teams=tables.TeamSeasons.filter(team=>!appStore||coachAccess.admin||coachAccess.teams.includes(team.teamSeasonId));
      const seasons=appStore?tables.Seasons.filter(season=>teams.some(team=>team.seasonId===season.seasonId)):tables.Seasons;
      const preferred=url.searchParams.get('team'), chosen=teams.find(team=>team.teamSeasonId===preferred)??(teams.length===1?teams[0]:null);
      return send(res, 200, {seasons,teams,...(chosen?{...publicState(await loadCoachTeam(snapshot,chosen.teamSeasonId)),distribution:distributionData(snapshot,chosen.teamSeasonId)}:{})});
    }
    if (req.method === 'GET' && url.pathname === '/api/state') { const snapshot=await store.read(),team=requireCoachTeam(coachAccess,url.searchParams.get('team'));return send(res,200,{...publicState(await loadCoachTeam(snapshot,team)),distribution:distributionData(snapshot,team)}); }
    if (req.method === 'GET' && url.pathname === '/api/forms') {
      const snapshot = await store.read(); const {tables}=snapshot; const team = requireCoachTeam(coachAccess,url.searchParams.get('team'));
      const forms = tables.Forms.filter(f => f.teamSeasonId === team);
      const loaded=await loadCoachTeam(snapshot,team);
      return send(res, 200, { forms, invites: formInvitations(forms,tables.FormInvites),jobs:tables.FormJobs.filter(row=>row.teamSeasonId===team),deliveries:tables.FormDeliveries.filter(row=>row.teamSeasonId===team),mailReady:workerReady(tables)&&tables.FormJobs.some(row=>row.jobId==='worker'&&row.type==='worker-invitations-v3'),revision:loaded.revision,sourceToken:loaded.sourceToken,serviceDataToken:serviceDataToken(tables) });
    }
    if (req.method === 'GET' && url.pathname === '/api/forms/status') {
      const snapshot = await store.read();
      const loaded = loadTeam(snapshot, requireCoachTeam(coachAccess,url.searchParams.get('team')));
      const form = snapshot.tables.Forms.find(form => form.teamSeasonId === loaded.state.catalog.teamSeasonId && form.formId === url.searchParams.get('form'));
      if (!form) throw new HttpError(404, 'Formulier niet gevonden voor dit teamseizoen.');
      return send(res, 200, await checkAvailabilityForm(active.auth, loaded.state, form));
    }
    if (req.method !== 'POST' || !['/api/action', '/api/action-batch', '/api/forms/create', '/api/forms/prepare', '/api/forms/finalize', '/api/forms/invite', '/api/forms/link', '/api/forms/import', '/api/club', '/api/history/import'].includes(url.pathname)) throw new HttpError(404, 'Niet gevonden.');
    const input = await body(req);
    requireCoachTeam(coachAccess,input?.teamSeasonId);
    if(appStore&&(url.pathname.startsWith('/api/forms/')||url.pathname==='/api/club')){
      throw new HttpError(409,'Deze functie is nog niet aangesloten op de Firestore-pilot.');
    }
    const output = await serial(async () => {
      const snapshot = await store.read();
      const raw = loadTeam(snapshot,input.teamSeasonId);
      const loaded = await loadCoachTeam(snapshot,input.teamSeasonId,raw);
      if (loaded.state.catalog.archived) throw new HttpError(403, 'Dit seizoen is gearchiveerd en alleen leesbaar.');
      if(url.pathname==='/api/forms/invite' && snapshot.tables.FormDeliveries.some(row=>row.batchId===input.batchId)) {
        const repeated=queueInvitationBatch(snapshot,loaded.state,input);
        return {...publicState(loaded),deliveries:repeated.deliveries};
      }
      if (url.pathname === '/api/action-batch' && loaded.state.committedBatches?.includes(input.batchId)) return publicState(loaded);
      if (loaded.revision !== input.revision || loaded.sourceToken !== input.sourceToken) throw new HttpError(409, 'Een andere coach of de bron heeft gegevens gewijzigd. Vernieuw de gegevens.');
      if(sharedLive&&parentPortal.enabled(input.teamSeasonId)){
        const requested=path==='/api/action-batch'?input.actions:path==='/api/action'?[input.action]:[];
        if(Array.isArray(requested)){
          const sensitive=requested.filter(a=>a&&['assistant-prepare','assistant-execute','prepare-match','save-result','save-stats','finish','goal','away-goal','edit-goal','undo-goal','swap','keeper','phase','set-period','toggle-clock','set-periods','set-field-size'].includes(a.type));
          for(const match of new Set(sensitive.map(a=>a.type==='prepare-match'?loaded.state.catalog.liveMatchId:a.matchId??loaded.state.catalog.liveMatchId).filter(Boolean))){
            const row=await sharedLive.row(input.teamSeasonId,match);
            if(row&&row.data.status!=='processed')throw new HttpError(409,'Deze wedstrijd heeft gedeelde Live-invoer. Gebruik die registratie voor controle en verwerking.');
          }
        }
      }
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


