import test from 'node:test';
import assert from 'node:assert/strict';
import {ParentPortal, projectParentAnswers, withoutParentProjection} from '../server/parents.mjs';
import {ParentStore} from '../server/parent-store.mjs';
import {parentAuth} from '../server/parent-auth.mjs';
import {OAuth2Client} from 'google-auth-library';
import {createTeamState, demoCatalog} from '../src/coach-state.ts';

class MemoryStore {
  rows = new Map();
  version = 0;
  key(collection,id) {return collection+'/'+id;}
  async get(collection,id) {return structuredClone(this.rows.get(this.key(collection,id))??null);}
  async find(collection,key,value) {
    return [...this.rows.entries()].filter(([name,row])=>name.startsWith(collection+'/')&&row.data[key]===value)
      .map(([,row])=>structuredClone(row));
  }
  async commit(changes) {
    for(const c of changes) {
      const old=this.rows.get(this.key(c.collection,c.id));
      if(old?.version!==c.version) throw Object.assign(new Error('Stale version'),{status:409});
    }
    for(const c of changes)this.rows.set(this.key(c.collection,c.id),{id:c.id,version:String(++this.version),data:structuredClone(c.data)});
  }
}

function fixture(){
  const catalog=demoCatalog();
  catalog.teamSeasonId='test-parent-team';
  catalog.liveMatchId='';
  catalog.matches=[
    {...catalog.matches[0],id:'upcoming',date:'15-06-2030',time:'11:00',venue:'Thuis'},
    {...catalog.matches[1],id:'past',date:'14 juni 2030',time:'11:00',venue:'Uit'},
    {...catalog.matches[2],id:'scored',date:'16 juni 2030',time:'11:00',venue:'Uit'},
  ];
  catalog.players[0].parentEmail='private@example.test';
  catalog.players[1].parentEmail='other-private@example.test';
  const state=createTeamState(catalog,4,6);
  state.resultOnly={scored:{goalsFor:3,goalsAgainst:2,events:[]}};
  let now=Date.parse('2030-06-15T08:59:00Z');
  const store=new MemoryStore();
  const portal=new ParentPortal(store,async team=>team===catalog.teamSeasonId?state:null,new Set([catalog.teamSeasonId]),'https://coachmate.example.test',()=>now);
  const a={uid:'subject-a',email:'parent-a@example.test'}, b={uid:'subject-b',email:'parent-b@example.test'};
  const invite=async (who,playerId='p01')=>new URL((await portal.invite(state,{playerId,email:who.email})).url).hash.split('=')[1];
  return {catalog,state,portal,store,a,b,invite,advance:ms=>{now+=ms;}};
}

test('an invite can be used only by the verified intended account and grants one child',async()=>{
  const {a,b,invite,portal,catalog}=fixture();
  const code=await invite(a);
  await assert.rejects(portal.claim(b,code),{status:404});
  assert.deepEqual(await portal.dashboard(b),{children:[]});
  await portal.claim(a,code);
  await portal.claim(a,code); // Safe retry after a lost confirmation
  await assert.rejects(portal.claim({uid:b.uid,email:a.email},code),{status:404});
  const {children}=await portal.dashboard(a);
  assert.deepEqual(children.map(c=>c.name),[catalog.players[0].name]);
  assert.ok(!JSON.stringify(children).includes(catalog.players[1].name));
  assert.ok(!JSON.stringify(children).includes('private@example.test'));
  assert.deepEqual(children[0].matches.find(m=>m.id==='scored').score,[2,3]);
  assert.equal(children[0].matches.find(m=>m.id==='scored').editable,false);
  assert.deepEqual(children[0].matches.filter(m=>m.editable).map(m=>m.id),['upcoming']);
  await assert.rejects(portal.answer(b,{linkId:children[0].linkId,matchId:'upcoming',status:'available',version:null}),{status:404});
});

test('two linked carers require a current version and cannot change past or processed matches',async()=>{
  const {a,b,invite,portal,advance}=fixture();
  await portal.claim(a,await invite(a));await portal.claim(b,await invite(b));
  const [left,right]=await Promise.all([portal.dashboard(a),portal.dashboard(b)]);
  const x=left.children[0],y=right.children[0];
  for(const matchId of ['past','scored'])await assert.rejects(portal.answer(a,{linkId:x.linkId,matchId,status:'available',version:null}),{status:409});
  const saved=await portal.answer(a,{linkId:x.linkId,matchId:'upcoming',status:'available',version:null});
  const version=saved.children[0].matches.find(m=>m.id==='upcoming').version;
  const input={linkId:y.linkId,matchId:'upcoming',status:'unavailable'};
  await assert.rejects(portal.answer(b,{...input,version:null}),{status:409});
  await portal.answer(b,{...input,version});
  const response=(await portal.dashboard(a)).children[0].matches.find(m=>m.id==='upcoming');
  assert.equal(response.actor,'other');
  assert.equal(response.answer,'unavailable');
  // 09:00 UTC is 11:00 CEST. At kickoff the parent's picker is read-only.
  advance(60_000);
  await assert.rejects(portal.answer(b,{...input,version:response.version}),{status:409});
  assert.equal((await portal.dashboard(a)).children[0].matches.find(m=>m.id==='upcoming').editable,false);
});

test('one parent can see more than one linked child, while revocation and expiration are enforced',async()=>{
  const {a,invite,portal,catalog,advance}=fixture();
  const first=await invite(a), oldLink=await invite(a);
  await portal.claim(a,first);
  await portal.claim(a,await invite(a,'p02'));
  const result=await portal.dashboard(a);
  assert.equal(result.children.length,2);
  const link=result.children.find(c=>c.name===catalog.players[0].name);
  advance(1000);
  await portal.revoke(catalog.teamSeasonId,link.linkId);
  await assert.rejects(portal.claim(a,first),{status:404});
  await assert.rejects(portal.claim(a,oldLink),{status:404});
  assert.equal((await portal.dashboard(a)).children.length,1);
  const fresh=await invite(a);
  advance(8*24*60*60*1000);
  await assert.rejects(portal.claim(a,fresh),{status:404});
});

test('coach sees parent answers over legacy form answers, preserves manual precedence and does not write the projection into Sheets',async()=>{
  const {a,invite,portal,state,catalog}=fixture();
  await portal.claim(a,await invite(a));
  const {children:[child]}=await portal.dashboard(a);
  state.availability.upcoming.p01='unavailable';
  state.formUpdates={'upcoming/p01':{time:'2030-06-14T12:00:00Z',manual:false}};
  await portal.answer(a,{linkId:child.linkId,matchId:'upcoming',status:'available',version:null});
  const answers=await portal.coachResponses(catalog.teamSeasonId);
  const loaded={state,sourceToken:'sheet-v1',revision:1};
  const effective=projectParentAnswers(loaded,answers);
  assert.notEqual(effective.sourceToken,loaded.sourceToken);
  assert.equal(effective.state.availability.upcoming.p01,'available');
  assert.equal(state.availability.upcoming.p01,'unavailable');
  assert.equal(withoutParentProjection(structuredClone(effective.state),state,effective.state).availability.upcoming.p01,'unavailable');
  const corrected=structuredClone(effective.state);
  corrected.formUpdates['upcoming/p01']={time:'2030-06-15T08:45:00Z',manual:true};
  assert.equal(withoutParentProjection(corrected,state,effective.state).availability.upcoming.p01,'available');
  state.formUpdates['upcoming/p01'].manual=true;
  const override=projectParentAnswers(loaded,answers);
  assert.equal(override.sourceToken,loaded.sourceToken);
  assert.equal(override.state.availability.upcoming.p01,'unavailable');
  assert.deepEqual(override.parentAnswers['upcoming/p01'],{status:'available',coachOverride:true});
  assert.equal((await portal.dashboard(a)).children[0].matches.find(m=>m.id==='upcoming').coachOverride,true);
});

test('Firestore commits check both document versions and never retry a mutation blindly',async()=>{
  const calls=[];
  const store=new ParentStore({request:async x=>{calls.push(x);return {data:{}};}},'fixture-project');
  await store.commit([
    {collection:'Links',id:'scope',version:'version-1',data:{uid:'test',revokedAt:0}},
    {collection:'Answers',id:'new',data:{status:'available'}},
  ]);
  assert.equal(calls[0].retry,false);
  assert.deepEqual(calls[0].data.writes.map(row=>row.currentDocument),[{updateTime:'version-1'},{exists:false}]);
});
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import http from 'node:http';
import {sealSession} from '../server/session.mjs';

test('the HTTPS callback issues only a host-bound parent session and verifies the parent audience',async t=>{
  const origin='https://ouders.example.test',clientId='parent-client.apps.googleusercontent.com';
  const auth=parentAuth({clientId,clientSecret:'fixture-parent-client',secret:'separate-fixture-session-key-32-chars',origin,apiOrigin:origin});
  const response=()=>({
    cookies:[],location:null,
    setHeader(name,value){assert.equal(name,'Set-Cookie');this.cookies=[value].flat();},
    writeHead(status,headers){assert.equal(status,302);this.location=headers.Location;return this;},
    end(){},
  });
  const login=response();
  await auth.login(login);
  const redirect=new URL(login.location),state=redirect.searchParams.get('state'),nonce=redirect.searchParams.get('nonce');
  const cookieValue=value=>value.split(';')[0].split('=')[1];
  assert.match(login.cookies[0],/^__Host-coachmate_parent_oauth=.*; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  t.mock.method(OAuth2Client.prototype,'getToken',async ({code,codeVerifier})=>{
    assert.equal(code,'fixture-code');
    assert.match(codeVerifier,/^[\w.~\-]+$/);
    return {tokens:{id_token:'fixture-id',access_token:'discarded-access',refresh_token:'discarded-refresh'}};
  });
  t.mock.method(OAuth2Client.prototype,'verifyIdToken',async ({idToken,audience})=>{
    assert.equal(idToken,'fixture-id');
    assert.equal(audience,clientId);
    return {getPayload:()=>({sub:'fixture-parent-sub',email:'parent@gmail.com',email_verified:true,nonce})};
  });
  const done=response(),params=new URLSearchParams({state,code:'fixture-code'});
  await auth.callback(done,params,{'__Host-coachmate_parent_oauth':cookieValue(login.cookies[0])});
  assert.equal(done.location,origin+'/?parent=1');
  assert.match(done.cookies[0],/^__Host-coachmate_parent=.*; Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800; Secure$/);
  assert.match(done.cookies[1],/^__Host-coachmate_parent_oauth=;.*Max-Age=0/);
  const saved=auth.session({'__Host-coachmate_parent':cookieValue(done.cookies[0])});
  assert.deepEqual(Object.keys(saved).sort(),['csrf','email','expires','kind','uid','verifiedMailbox']);
  assert.equal(saved.uid,'fixture-parent-sub');
  assert.equal(saved.verifiedMailbox,true);
});

test('the parent client, callback, cookie and permissions are independent from the coach session',async t=>{
  const temp=http.createServer();
  await new Promise(resolve=>temp.listen(0,'127.0.0.1',resolve));
  const port=temp.address().port;
  await new Promise(resolve=>temp.close(resolve));
  const base='http://127.0.0.1:'+port, secret='local-coach-test-key',parentSecret='local-parent-session-test-key-32-chars';
  const server=spawn(process.execPath,['--experimental-strip-types','server/index.mjs'],{
    env:{...process.env,NODE_ENV:'test',PORT:String(port),APP_ORIGIN:base,API_ORIGIN:base,
      GOOGLE_CLIENT_ID:'fake-client.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fake-client-secret',
      GOOGLE_SESSION_SECRET:secret,GOOGLE_SPREADSHEET_ID:'fixture-sheet',COACH_EMAILS:'coach@example.test',
      COACHMATE_PARENT_PROJECT:'fixture-project',COACHMATE_PARENT_TEAMS:'test-parent-team',
      COACHMATE_PARENT_ENABLED:'true',COACHMATE_PARENT_CLIENT_ID:'fake-parent.apps.googleusercontent.com',
      COACHMATE_PARENT_CLIENT_SECRET:'fake-parent-secret',COACHMATE_PARENT_SESSION_SECRET:parentSecret},
    stdio:['ignore','pipe','pipe'],
  });
  t.after(async()=>{if(server.exitCode===null&&!server.killed){const exited=once(server,'close');server.kill();await exited;}});
  const ready=await Promise.race([once(server.stdout,'data').then(()=>true),once(server,'exit').then(()=>false)]);
  assert.equal(ready,true);
  const legacy=await fetch(base+'/auth/login?role=parent',{redirect:'manual'});
  assert.equal(legacy.headers.get('location'),base+'/auth/parent/login');
  const signIn=await fetch(base+'/auth/parent/login',{redirect:'manual'});
  assert.equal(signIn.status,302);
  const google=new URL(signIn.headers.get('location'));
  assert.equal(google.host,'accounts.google.com');
  assert.deepEqual(google.searchParams.get('scope').split(' '),['openid','email']);
  assert.equal(google.searchParams.get('access_type'),'online');
  assert.equal(google.searchParams.get('client_id'),'fake-parent.apps.googleusercontent.com');
  assert.equal(google.searchParams.get('redirect_uri'),base+'/auth/parent/callback');
  assert.match(signIn.headers.get('set-cookie'),/^coachmate_parent_oauth=.*HttpOnly; SameSite=Lax/);
  const attempt=signIn.headers.get('set-cookie').split(';')[0];
  const state=google.searchParams.get('state');
  assert.equal((await fetch(base+'/auth/callback?state='+state,{headers:{cookie:attempt},redirect:'manual'})).status,403);
  assert.equal((await fetch(base+'/auth/parent/callback?state='+state+'&error=access_denied',{headers:{cookie:attempt},redirect:'manual'})).headers.get('location'),base+'/?parent=1&auth=cancelled');
  const parent={kind:'parent',uid:'test-parent',email:'parent@example.test',csrf:'test-csrf',expires:Date.now()+10000};
  const headers={cookie:'coachmate_parent='+sealSession(parent,parentSecret),origin:base,'x-csrf-token':parent.csrf,'content-type':'application/json'};
  const session=await fetch(base+'/api/parent/session',{headers});
  assert.equal((await session.json()).role,'parent');
  assert.equal((await (await fetch(base+'/api/session',{headers})).json()).authenticated,false);
  for(const path of ['/api/teams','/api/state?team=test-parent-team','/api/forms?team=test-parent-team','/api/parent-access?team=test-parent-team']){
    assert.equal((await fetch(base+path,{headers})).status,403);
  }
  assert.equal((await fetch(base+'/api/action',{method:'POST',headers,body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/parent/answer',{method:'POST',headers:{...headers,'x-csrf-token':'incorrect'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/parent/claim',{method:'POST',headers,body:'{}'})).status,403);
  const coach={kind:'coach',email:'coach@example.test',csrf:'coach-csrf',tokens:{access_token:'fixture'},expires:Date.now()+10000};
  const both={...headers,cookie:headers.cookie+'; coach_session='+sealSession(coach,secret)};
  assert.equal((await (await fetch(base+'/api/session',{headers:both})).json()).role,'coach');
  assert.equal((await (await fetch(base+'/api/parent/session',{headers:both})).json()).role,'parent');
  assert.match((await fetch(base+'/api/parent/logout',{method:'POST',headers:both})).headers.get('set-cookie'),/^coachmate_parent=;.*Max-Age=0/);
  const wrongKey={cookie:'coachmate_parent='+sealSession(parent,secret)};
  assert.equal((await (await fetch(base+'/api/parent/session',{headers:wrongKey})).json()).authenticated,false);
});
