import test from 'node:test';
import assert from 'node:assert/strict';
import {invitationProgress,invitationMatches} from '../src/invitation-progress.ts';
import {queueInvitationBatch} from '../server/invitations.mjs';

test('submission and invitation registration stay separate across channels',()=>{
 const reply=invitationProgress({submitted:true});
 assert.equal(reply.answered,true);assert.equal(reply.sent,false);assert.equal(reply.invite,false);
 assert.equal(reply.needsConfirmation,true);assert.match(reply.invitation,/niet geregistreerd/);
 for(const channel of ['email','whatsapp']){
  const sent=invitationProgress({delivery:{channel,status:'sent'}});
  assert.equal(sent.waiting,true);assert.equal(sent.invite,false);assert.equal(invitationMatches('waiting',sent),true);
  assert.equal(invitationProgress({submitted:true,delivery:{channel,status:'sent'}}).waiting,false);
 }
 assert.equal(invitationMatches('answered',reply),true);assert.equal(invitationMatches('invite',reply),false);
});
test('opening WhatsApp never means sent; failed registration retains an explicit attestation',()=>{
 const open=invitationProgress({opened:true});assert.equal(open.sent,false);assert.equal(open.invite,true);assert.match(open.invitation,/bevestigen/);
 const local=invitationProgress({opened:true,attested:true});assert.equal(local.sent,false);assert.equal(local.invite,false);assert.equal(local.needsConfirmation,true);assert.match(local.invitation,/nog niet opgeslagen/);
 for(const status of ['queued','processing','uncertain']){const item=invitationProgress({delivery:{status,channel:'email'}});assert.equal(item.invite,false);assert.equal(item.needsConfirmation,false);assert.equal(item.sent,false);assert.equal(item.waiting,false);}
 assert.equal(invitationProgress({delivery:{status:'failed'}}).invite,true);
});
test('all-player filters preserve the whole roster without mixing answers with sent status',()=>{
 const items=[{}, {opened:true}, {submitted:true}, {delivery:{status:'sent',channel:'email'}}, {submitted:true,delivery:{status:'sent',channel:'whatsapp'}}, {attested:true}].map(invitationProgress);
 assert.equal(items.filter(p=>invitationMatches('all',p)).length,6);
 assert.equal(items.filter(p=>invitationMatches('invite',p)).length,2);
 assert.equal(items.filter(p=>invitationMatches('answered',p)).length,2);
 assert.equal(items.filter(p=>invitationMatches('waiting',p)).length,1);
});
function fixture(){return {state:{catalog:{teamSeasonId:'t',players:[{id:'p',name:'Luca',parentEmail:'x@example.test'}],matches:[{availabilityRound:2}]}},snapshot:{tables:{Forms:[{teamSeasonId:'t',formId:'f',round:2,matchId:'',url:'https://docs.google.com/forms/d/e/test/viewform',codeEntryId:'123',prefillDefaults:'{"entry.456":"Aanwezig"}'}],FormInvites:[{formId:'f',playerId:'p',code:'personal',responseId:'reply',editUrl:'https://docs.google.com/forms/d/e/test/viewform?edit2=opaque'}],FormJobs:[{jobId:'worker',status:'ready',type:'worker-invitations-v3',completedAt:new Date().toISOString()}],FormDeliveries:[]}},input:{formId:'f',playerIds:['p'],batchId:'coach-confirmation-123',channel:'whatsapp'}};}
test('a coach may register an already sent WhatsApp after a response without sending another invitation',()=>{
 const f=fixture();const before=structuredClone(f.snapshot.tables.FormInvites);
 assert.throws(()=>queueInvitationBatch(f.snapshot,f.state,{...f.input,channel:'email'}),/al uitgenodigd/);
 const result=queueInvitationBatch(f.snapshot,f.state,f.input);assert.equal(result.deliveries[0].status,'sent');assert.equal(result.deliveries[0].channel,'whatsapp');assert.deepEqual(f.snapshot.tables.FormInvites,before);
 f.snapshot.tables.FormDeliveries=result.deliveries;assert.equal(queueInvitationBatch(f.snapshot,f.state,f.input).repeated,true);
 assert.throws(()=>queueInvitationBatch(f.snapshot,f.state,{...f.input,batchId:'different-batch-123'}),/al uitgenodigd/);
 f.state.catalog.archived=true;assert.throws(()=>queueInvitationBatch(f.snapshot,f.state,f.input),/gearchiveerd/);
});
