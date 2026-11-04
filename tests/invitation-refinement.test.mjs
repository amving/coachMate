import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {safeShortFormUrl,personalFormUrl} from '../src/form-links.ts';
import {invitationText,normalizeInvitationMessage} from '../src/invitations.ts';
import {formInvitations} from '../server/forms.mjs';
import {queueInvitationBatch} from '../server/invitations.mjs';
import {schema} from '../server/schema.mjs';
const mailSource=readFileSync('scripts/google-sheets/AvailabilityMail.gs','utf8');
const distributionSource=readFileSync('scripts/google-sheets/Distribution.gs','utf8');
const base='https://docs.google.com/forms/d/e/test/viewform';
const form={teamSeasonId:'team',formId:'f',round:2,matchId:'',url:base,codeEntryId:'123',prefillDefaults:'{"entry.456":"Aanwezig"}',statusQuestion:'{"m":"q"}'};
const start=personalFormUrl(base,'123','personal',form.prefillDefaults),edit=base+'?edit2=opaque';
function context(){const ctx=vm.createContext({});vm.runInContext(mailSource+'\n'+distributionSource,ctx);return ctx;}
function fixture(){return {state:{catalog:{teamSeasonId:'team',players:[{id:'p',name:'Sam',parentEmail:'parent@example.test'}],matches:[{id:'m',availabilityRound:2}]}},snapshot:{tables:{Forms:[form],FormInvites:[{formId:'f',playerId:'p',code:'personal'}],FormJobs:[{jobId:'worker',type:'worker-invitations-v3',status:'ready',completedAt:new Date().toISOString()}],FormDeliveries:[]}},input:{formId:'f',playerIds:['p'],batchId:'batch-message-123',message:'Hallo {speler},\nGraag voor vrijdag invullen.'}};}
test('short links require an exact current personal target and a genuine Google short-link host',()=>{
 assert.equal(safeShortFormUrl('https://forms.gle/abc',start,start),'https://forms.gle/abc');
 assert.equal(safeShortFormUrl('https://goo.gl/forms/abc',start,start),'https://goo.gl/forms/abc');
 for(const value of ['https://evil.test/abc','http://forms.gle/abc','https://forms.gle.evil.test/abc','https://user@forms.gle/abc','https://forms.gle/abc?x=y','https://forms.gle/abc#x','https://goo.gl/other/abc'])assert.equal(safeShortFormUrl(value,start,start),'');
 assert.equal(safeShortFormUrl('https://forms.gle/abc',edit,start),'');assert.equal(safeShortFormUrl('https://forms.gle/abc','',''),'');
});
test('API discards stale short links after form defaults change without losing codes or canonical links',()=>{
 const invite={formId:'f',playerId:'p',code:'personal',personalUrl:start,shortUrl:'https://forms.gle/start',shortUrlSource:start,editUrl:edit,shortEditUrl:'https://forms.gle/edit',shortEditUrlSource:edit};
 const before=structuredClone(invite);assert.equal(formInvitations([form],[invite])[0].shortUrl,invite.shortUrl);
 const row=formInvitations([{...form,prefillDefaults:'{"entry.456":"Ja"}'}],[invite])[0];assert.equal(row.shortUrl,'');assert.equal(new URL(row.personalUrl).searchParams.get('entry.456'),'Ja');assert.equal(row.shortEditUrl,invite.shortEditUrl);assert.deepEqual(invite,before);
});
test('a queued invitation freezes its custom text and a retry cannot silently replace it',()=>{
 const {state,snapshot,input}=fixture();const result=queueInvitationBatch(snapshot,state,input);assert.equal(result.deliveries[0].message,input.message);snapshot.tables.FormDeliveries=result.deliveries;
 assert.equal(queueInvitationBatch(snapshot,state,input).repeated,true);
 assert.throws(()=>queueInvitationBatch(snapshot,state,{...input,message:'Een ander bericht'}),error=>error.status===409);
});
test('old workers and invalid messages fail before any recipient is queued',()=>{
 for(const message of [17,'x'.repeat(2001),'bad\u0000body']){const f=fixture();assert.throws(()=>queueInvitationBatch(f.snapshot,f.state,{...f.input,message}),error=>error.status===422);assert.deepEqual(f.snapshot.tables.FormDeliveries,[]);}
 const f=fixture();f.snapshot.tables.FormJobs[0].type='worker';assert.throws(()=>queueInvitationBatch(f.snapshot,f.state,f.input),/Werk de verzendkoppeling bij/);assert.deepEqual(f.snapshot.tables.FormDeliveries,[]);
 assert.equal(normalizeInvitationMessage(' een\r\ntwee '),'een\ntwee');
});
test('actual email text matches the preview, uses short links, and escapes coach text in HTML',()=>{
 const ctx=context();const invite={personalUrl:start,editUrl:edit,shortUrl:'https://forms.gle/start',shortUrlSource:start,shortEditUrl:'https://forms.gle/edit',shortEditUrlSource:edit};
 const message='Hoi {speler}, vul {wedstrijden} wedstrijden voor {team} in.\n<script>alert(1)</script>';
 const data={form,invite,player:{name:'Sam <b>',shortName:'Sam'},team:{teamName:'JO10-2',clubName:'EDO'},season:{name:'2026/2027'}};
 for(const editing of [false,true]){
  const mail=ctx.coachMateInvitationMail_(data,editing?edit:'',false,message);
  const preview=invitationText({playerName:data.player.name,shortName:data.player.shortName,teamName:'EDO · JO10-2',seasonName:data.season.name,round:2,count:1,url:editing?invite.shortEditUrl:invite.shortUrl,startUrl:invite.shortUrl,editing,message});
  assert.equal(mail.body.trim(),preview.trim());assert.doesNotMatch(mail.body,/docs.google.com/);assert.doesNotMatch(mail.htmlBody,/<script>/);if(!editing)assert.match(mail.htmlBody,/&lt;script&gt;/);
  if(editing){assert.match(mail.body,/https:\/\/forms\.gle\/edit/);assert.doesNotMatch(mail.body,/https:\/\/forms\.gle\/start/);}
 }
});
test('Google receives the full personal start/edit URL exactly once; stale edits get a new short link',()=>{
 const ctx=context(),calls=[],writes=[];const invite={personalUrl:start,editUrl:edit};
 const parent={shortenFormUrl:url=>{calls.push(url);return 'https://forms.gle/link'+calls.length;}};
 const write=(key,value)=>writes.push([key,value]);ctx.coachMateEnsureShortLinks_(parent,invite,write);assert.deepEqual(calls,[start,edit]);assert.equal(invite.shortUrlSource,start);assert.equal(invite.shortEditUrlSource,edit);
 ctx.coachMateEnsureShortLinks_(parent,invite,write);assert.equal(calls.length,2);
 invite.editUrl=base+'?edit2=new';ctx.coachMateEnsureShortLinks_(parent,invite,write);assert.equal(calls.length,3);assert.equal(calls[2],invite.editUrl);assert.equal(invite.personalUrl,start);
 for(const shorten of [()=>{throw Error('unavailable');},()=> 'https://evil.test/link']){const row={personalUrl:start};ctx.coachMateEnsureShortLinks_({shortenFormUrl:shorten},row,()=>assert.fail('invalid links cannot be stored'));assert.equal(row.personalUrl,start);assert.equal(row.shortUrl,undefined);}
});
test('delivery table upgrades only its optional message column and preserves old rows',()=>{
 const ctx=context(),writes=[];const table={headers:schema.FormDeliveries.slice(0,11),rows:[{deliveryId:'old',status:'sent'}],sheet:{getRange:(r,c)=>({setValue:v=>writes.push([r,c,v])})}};
 ctx.coachMateRows_=()=>table;const upgraded=ctx.coachMateDistributionTable_({getSheetByName:()=>table.sheet},'FormDeliveries',schema.FormDeliveries);assert.equal(upgraded.rows[0].deliveryId,'old');assert.deepEqual(writes,[[1,12,'message'],[1,13,'renderedMessage']]);assert.deepEqual(table.headers,schema.FormDeliveries);
});
test('background short-link preparation excludes archived/foreign identities and never sends a message',()=>{
 const ctx=context(),writes=[],calls=[];
 const data={Forms:[form,{...form,formId:'archived',teamSeasonId:'old-team'}],TeamSeasons:[{teamSeasonId:'team',seasonId:'s'},{teamSeasonId:'old-team',seasonId:'old'}],Seasons:[{seasonId:'s',archived:false},{seasonId:'old',archived:true}],Players:[{teamSeasonId:'team',playerId:'p',name:'Sam'}],FormInvites:[{_row:2,formId:'f',playerId:'p',code:'personal',personalUrl:start},{_row:3,formId:'f',playerId:'foreign',code:'foreign'},{_row:4,formId:'archived',playerId:'p',code:'old'}]};
 ctx.coachMateRows_=(_,name)=>({rows:data[name],headers:[...schema[name]],sheet:{getRange:()=>({setValue:()=>{}})}});
 ctx.coachMateWriteFields_=(_,row,fields)=>writes.push({row,fields});ctx.FormApp={openById:id=>({shortenFormUrl:url=>{calls.push({id,url});return 'https://forms.gle/short';}})};ctx.MailApp={sendEmail:()=>assert.fail('backfill cannot send')};
 ctx.coachMatePrepareShortLinks_({});assert.equal(calls.length,1);assert.equal(calls[0].url,start);assert.ok(writes.every(w=>w.row===2));assert.equal(data.FormInvites[0].code,'personal');
});
test('legacy single-match forms resolve custom message counts without parsing a question ID as JSON',()=>{const ctx=context();assert.equal(ctx.coachMateInvitationMessage_('{wedstrijden} wedstrijd',{player:{name:'Sam'},team:{teamName:'Team'},season:{name:'2026'},form:{matchId:'old',statusQuestion:'legacy-question-id',round:1}}),'1 wedstrijd');});
