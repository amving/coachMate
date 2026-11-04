import test from 'node:test';
import assert from 'node:assert/strict';
import {sealSession,openSession} from '../server/session.mjs';
import {teamSourceToken,SheetsStore,fingerprint} from '../server/sheets.mjs';
import {createInitialState,demoCatalog,coachReducer} from '../src/coach-state.ts';
import {previewJournalRecovery} from '../src/local-cache.ts';
import {queueInvitationBatch} from '../server/invitations.mjs';
import {invitationText,whatsappInviteUrl} from '../src/invitations.ts';
const now=Date.now();
const state=()=>({...createInitialState(),catalog:demoCatalog()});
test('encrypted sessions survive an application restart and reject expiry, tampering and a different key',()=>{
 const data={kind:'coach',email:'coach@example.test',tokens:{refresh_token:'private-refresh-token'},csrf:'csrf',expires:now+1000};
 const sealed=sealSession(data,'server-secret');assert.doesNotMatch(sealed,/private|coach@|csrf/);
 assert.deepEqual(openSession(sealed,'server-secret',now),data);assert.equal(openSession(sealed,'server-secret',now+1000),null);
 assert.equal(openSession(sealed,'different',now),null);assert.equal(openSession(sealed.slice(0,-6)+'broken','server-secret',now),null);
});
test('team conflict tokens ignore worker heartbeats, personal links and another team but detect this team edits',()=>{
 const snapshot={tables:{TeamSeasons:[{teamSeasonId:'a',seasonId:'s'},{teamSeasonId:'b',seasonId:'s'}],Seasons:[{seasonId:'s',archived:false}],State:[{teamSeasonId:'a',revision:1},{teamSeasonId:'b',revision:1}],Matches:[{teamSeasonId:'a',matchId:'m'}],FormJobs:[],FormInvites:[]}};
 const token=teamSourceToken(snapshot,'a');snapshot.tables.FormJobs.push({jobId:'worker',completedAt:'new'});snapshot.tables.FormInvites.push({shortUrl:'new'});snapshot.tables.State[1].revision++;
 assert.equal(teamSourceToken(snapshot,'a'),token);snapshot.tables.Matches[0].date='2026-10-24';assert.notEqual(teamSourceToken(snapshot,'a'),token);
});
test('Sheets keeps unrelated service updates and still rejects changes to a replaced table',async()=>{
 const snapshot={token:'before',tables:{State:[{json:'old'}],FormJobs:[{completedAt:'before'}]},sheets:{State:{sheetId:1,gridProperties:{rowCount:100,columnCount:4}}},rowCounts:{State:2}};
 const current=structuredClone(snapshot);current.token='after';current.tables.FormJobs[0].completedAt='after';
 const calls=[],store=new SheetsStore({request:async r=>{calls.push(r);return {data:{}};}},'test');store.read=async()=>current;
 await store.write(snapshot,{State:[]});assert.equal(calls.length,1);assert.equal(current.tables.FormJobs[0].completedAt,'after');
 current.tables.State[0].json='changed';await assert.rejects(()=>store.write(snapshot,{State:[]}),/bron is gewijzigd/);assert.equal(calls.length,1);
});
test('journal recovery previews original events on the latest state and cannot cross matches or archived seasons',()=>{
 const base=state(),action={type:'swap',out:base.live.field[1],in:base.catalog.players.find(p=>!base.live.field.includes(p.id)&&base.availability[base.catalog.liveMatchId][p.id]!=='unavailable').id,now};
 const journal={version:1,id:'journal',account:'coach',teamSeasonId:base.catalog.teamSeasonId,revision:1,sourceToken:'old',actions:[action],state:coachReducer(base,action),attempted:true};
 const latest=structuredClone(base);latest.matchResults={};const before=structuredClone(journal);
 const next=previewJournalRecovery(journal,latest);assert.equal(next.live.swaps.length,base.live.swaps.length+1);assert.deepEqual(journal,before);
 latest.catalog.liveMatchId='another';assert.throws(()=>previewJournalRecovery(journal,latest),/andere livewedstrijd/);
 latest.catalog.liveMatchId=base.catalog.liveMatchId;latest.catalog.archived=true;assert.throws(()=>previewJournalRecovery(journal,latest),/actief teamseizoen/);
});
test('the requested default message uses parent first name, player short name and one personal start link',()=>{
 const input={parentName:'Anne Miedema',shortName:'Tijn',playerName:'Tijn Miedema',teamName:'JO10-2',seasonName:'2026/2027',round:2,count:7,url:'https://forms.gle/start'};
 assert.equal(invitationText(input),'Hi Anne,\n\nWil je de beschikbaarheid van Tijn voor speelronde 2 doorgeven?\n\nGeef beschikbaarheid op via deze link\n\nhttps://forms.gle/start\n\nBedankt!');
 const edit=invitationText({...input,editing:true,url:'https://forms.gle/edit',startUrl:'https://forms.gle/start'});assert.match(edit,/forms.gle\/edit/);assert.doesNotMatch(edit,/forms.gle\/start/);
 assert.match(whatsappInviteUrl('+31612345678','persoonlijk',true),/^https:\/\/web.whatsapp.com\/send\?phone=31612345678&text=/);
});
function invitations(){const s=state();s.catalog.players[0].parentEmail='parent@example.test';s.catalog.players[0].parentName='Anne';const form={formId:'f',teamSeasonId:s.catalog.teamSeasonId,round:1,url:'https://docs.google.com/forms/d/e/test/viewform',codeEntryId:'123',prefillDefaults:'{"entry.456":"Aanwezig"}'};return {state:s,snapshot:{tables:{Forms:[form],FormInvites:[{formId:'f',playerId:s.catalog.players[0].id,code:'personal-code'}],FormJobs:[{jobId:'worker',type:'worker-invitations-v3',status:'ready',completedAt:new Date(now).toISOString()}],FormDeliveries:[]}},input:{formId:'f',playerIds:[s.catalog.players[0].id],batchId:'batch-personal-123',message:'Hallo {parentName}, voor {shortName} in ronde {speelronde}.'}};}
test('queued emails freeze the fully rendered personal message and reject a second start invitation',()=>{
 const f=invitations(),first=queueInvitationBatch(f.snapshot,f.state,f.input,now);assert.match(first.deliveries[0].renderedMessage,/Hallo Anne, voor Daan in ronde 1/);
 f.snapshot.tables.FormDeliveries=first.deliveries;f.state.catalog.players[0].parentName='Changed';assert.equal(queueInvitationBatch(f.snapshot,f.state,f.input,now).deliveries[0].renderedMessage,first.deliveries[0].renderedMessage);
 assert.throws(()=>queueInvitationBatch(f.snapshot,f.state,{...f.input,batchId:'second-start-123'},now),/al uitgenodigd/);
});
test('WhatsApp delivery requires explicit coach confirmation, works without mail worker and is idempotent',()=>{
 const f=invitations();f.snapshot.tables.FormJobs=[];const input={...f.input,message:undefined,channel:'whatsapp'};
 const result=queueInvitationBatch(f.snapshot,f.state,input,now);assert.equal(result.deliveries[0].channel,'whatsapp');assert.equal(result.deliveries[0].status,'sent');
 f.snapshot.tables.FormDeliveries=result.deliveries;assert.equal(queueInvitationBatch(f.snapshot,f.state,input,now).repeated,true);
 f.snapshot.tables.FormDeliveries=[];f.snapshot.tables.FormInvites[0].responseId='submitted';assert.equal(queueInvitationBatch(f.snapshot,f.state,input,now).deliveries[0].status,'sent');
});

test('hashed static bundles are compressed and immutable while HTML remains revalidated',async()=>{
 const {mkdtemp,writeFile,mkdir,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{brotliDecompressSync,gunzipSync}=await import('node:zlib'),{serveStatic}=await import('../server/static.mjs');
 const root=await mkdtemp(join(tmpdir(),'coachmate-static-')),source='const x="hello";'.repeat(1000);await mkdir(join(root,'assets'));await writeFile(join(root,'assets','index-12345678.js'),source);await writeFile(join(root,'index.html'),source);
 try{for(const [path,accept,encoding] of [['/assets/index-12345678.js','br, gzip','br'],['/assets/index-12345678.js','br;q=0, gzip','gzip'],['/','identity','']]){
  const output={},res={writeHead:(status,headers)=>Object.assign(output,{status,headers}),end:body=>output.body=body};await serveStatic({url:path,method:'GET',headers:{'accept-encoding':accept}},res,root);
  assert.equal(output.status,200);assert.equal(output.headers['Content-Encoding']||'',encoding);const text=encoding==='br'?brotliDecompressSync(output.body).toString():encoding==='gzip'?gunzipSync(output.body).toString():output.body.toString();assert.equal(text,source);
  assert.equal(output.headers['Cache-Control'],path==='/'?'no-cache':'public, max-age=31536000, immutable');
 }}finally{await rm(root,{recursive:true,force:true});}
});
