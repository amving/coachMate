import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SharedLive} from '../server/shared-live.mjs';
import {ParentPortal} from '../server/parents.mjs';
import {HttpError} from '../server/sheets.mjs';
import {createTeamState,demoCatalog,recordedMatchResult,teamMatchMinutes} from '../src/coach-state.ts';
import {isProcessed} from '../src/result-only.ts';

test('a coach and two active parent accounts merge offline input and count only the approved game',async()=>{
  const docs=new Map();
  let revision=0,now=Date.now();
  const store={
    get:async (collection,id)=>structuredClone(docs.get(collection+'/'+id)??null),
    find:async (collection,field,value)=>[...docs].filter(([key,row])=>key.startsWith(collection+'/')&&row.data[field]===value).map(([,row])=>structuredClone(row)),
    commit:async changes=>{
      for(const {collection,id,version} of changes){
        if(docs.get(collection+'/'+id)?.version!==version)throw new HttpError(409,'Conflict');
      }
      changes.forEach(({collection,id,data})=>docs.set(collection+'/'+id,{id,version:String(++revision),data:structuredClone(data)}));
    },
  };
  const catalog={...demoCatalog(),teamSeasonId:'test-shared-live-team'};
  const match=catalog.liveMatchId, team=catalog.teamSeasonId;
  const base=createTeamState(catalog,4,6);
  const portal=new ParentPortal(store,async()=>base,new Set([team]),'https://coachmate.example.test',()=>now);
  const shared=new SharedLive(portal,()=>now);
  const coach='coach@example.test', parentA={uid:'parent-a',email:'a@example.test'},parentB={uid:'parent-b',email:'b@example.test'};
  for(const [identity,player] of [[parentA,'p01'],[parentB,'p02']]){
    const invite=await portal.invite(base,{email:identity.email,playerId:player});
    await portal.claim(identity,new URLSearchParams(new URL(invite.url).hash.slice(1)).get('uitnodiging'));
  }
  const links=(await portal.list(team)).links.map(link=>link.id);
  let board=await shared.open(base,{matchId:match,links},coach);
  assert.equal(board.helpers.length,2);
  const input={teamSeasonId:team,matchId:match};
  const deviceCoach=randomUUID(),deviceA=randomUUID(),deviceB=randomUUID();
  const make=(type,fields={})=>({id:randomUUID(),type,now,...fields});
  const toCoach=events=>shared.row(team,match).then(row=>shared.sync(row,coach,{...input,events,device:deviceCoach},true));
  const toParent=(identity,device,events)=>shared.parentRow(identity,input).then(row=>shared.sync(row,identity.uid,{...input,events,device},false));
  await assert.rejects(shared.parentRow({uid:'unassigned'},input),{status:404});
  await assert.rejects(toParent(parentA,deviceA,[make('toggle-clock')]),{status:422});
  await toCoach([make('toggle-clock')]);
  now+=21000;
  const goalA=make('goal',{playerId:base.live.field[0]});
  now+=3000;
  const goalB=make('goal',{playerId:base.live.field[0]});
  now+=12000;
  const away=make('away-goal');
  await toParent(parentA,deviceA,[goalA]);
  await toParent(parentA,deviceA,[goalA]);
  now+=40000;
  board=await toCoach([make('toggle-clock')]);
  board=await shared.offer(await shared.row(team,match),coach,true,board.version);
  assert.equal(board.status,'review');
  assert.equal(board.events.length,3);
  assert.equal(isProcessed(base,match),false);
  assert.equal(teamMatchMinutes(base),0);

  await toParent(parentB,deviceB,[goalB,away]);
  const review=await shared.row(team,match);
  const merged=shared.view(review,coach,true);
  assert.equal(merged.events.length,5);
  assert.deepEqual(merged.duplicates,[goalB.id,goalA.id]);
  assert.ok(!merged.submitted.includes(away.id));
  const decision={version:merged.version,excluded:[goalB.id],checkedDuplicates:true};
  await assert.rejects(shared.approval(review,{...decision,version:board.version},base),{status:409});
  assert.deepEqual(shared.preview(review,decision,base).score,[1,1]);
  const approval=await shared.approval(review,decision,base);
  assert.equal(isProcessed(approval.state,match),true);
  assert.equal(recordedMatchResult(approval.state,match).goalsFor,1);
  assert.equal(recordedMatchResult(approval.state,match).goalsAgainst,1);
  assert.equal(approval.state.stats.filter(row=>row.matchId===match).reduce((sum,row)=>sum+row.goals,0),1);
  assert.ok(teamMatchMinutes(approval.state)>=1);
  assert.equal((await shared.approval(await shared.row(team,match),decision,approval.state)).state,approval.state);
  await shared.processed(team,match);
  const processed=await shared.row(team,match);
  assert.equal(await shared.approval(processed,decision,approval.state),null);
  assert.equal(shared.view(processed,coach,true).live.goals.length,1);
});
