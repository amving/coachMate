import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRoundRows,sameRoundRows,roundDateValue,preparationComplete} from '../src/availability-workflow.ts';
import {createTeamState,demoCatalog,coachReducer,parseState} from '../src/coach-state.ts';
const match=(id='new')=>({id,pool:'',date:'2030-11-10',shortDate:'10 nov',time:'10:00',venue:'Thuis',opponent:'Club',availabilityRound:2});

test('preparation ends at a verified form with every personal code and unchanged saved matches',()=>{
 const rows=[match()],ready={published:true,accepting:true,issues:[],codeEntryId:'123',prefillDefaults:'{"entry.456":"Aanwezig"}'};
 assert.equal(preparationComplete(rows,structuredClone(rows),ready,true),true);
 for(const status of [null,{...ready,published:null},{...ready,published:false},{...ready,accepting:false},{...ready,issues:['question missing']},{...ready,codeEntryId:''},{...ready,prefillDefaults:''}])assert.equal(preparationComplete(rows,rows,status,true),false);
 assert.equal(preparationComplete(rows,rows,ready,false),false);
 assert.equal(preparationComplete([{...rows[0],time:'12:00'}],rows,ready,true),false);
 assert.equal(preparationComplete(rows,[{...rows[0],opponent:'Source changed'}],ready,true),false);
 assert.equal(preparationComplete([],[],ready,true),false);
 // An already shared request has completed preparation, even when Google is now
 // unreachable or the form was subsequently closed. Unsaved edits still survive.
 const unknown={published:null,accepting:null,issues:[]};
 assert.equal(preparationComplete(rows,rows,unknown,false,true),true);
 assert.equal(preparationComplete([{...rows[0],time:'12:00'}],rows,unknown,false,true),false);
 assert.equal(preparationComplete(rows,rows,null,false,true),false);
});

test('refresh merges source updates and local additions without changing identities',()=>{
 const base=[match('a')],local=[...base,match('b')],fresh=[{...base[0],time:'11:00'},match('c')];
 const result=mergeRoundRows(base,local,fresh);assert.deepEqual(result.conflicts,[]);assert.deepEqual(result.rows.map(m=>m.id),['a','c','b']);assert.equal(result.rows[0].time,'11:00');assert.equal(sameRoundRows(fresh,[...fresh].reverse()),true);
});
test('refresh reports conflicting edits and deletions, preserving local values for explicit resolution',()=>{
 const base=[match('a')],local=[{...base[0],opponent:'Coach choice'}];
 assert.deepEqual(mergeRoundRows(base,local,[{...base[0],opponent:'Sheet choice'}]).conflicts,['a']);
 assert.equal(mergeRoundRows(base,local,[]).rows[0].opponent,'Coach choice');assert.deepEqual(mergeRoundRows(base,local,[]).conflicts,['a']);assert.deepEqual(mergeRoundRows(base,base,[]).rows,[]);
});
test('saving a round updates existing matches and adds new unknown attendance without clearing prior answers or history',()=>{
 const state=createTeamState(demoCatalog(),4,6),existing=match('a');let next=coachReducer(state,{type:'save-round-matches',round:2,matches:[existing]});
 assert.notEqual(next,state);next.availability.a.p01='available';next.formUpdates={'a/p01':{manual:true,time:'2030-01-01T00:00:00Z'}};const before=structuredClone(next);
 next=coachReducer(next,{type:'save-round-matches',round:2,matches:[{...existing,opponent:'Changed'},match('b')]});
 assert.equal(next.catalog.matches.find(m=>m.id==='a').opponent,'Changed');assert.deepEqual(next.availability.a,before.availability.a);assert.deepEqual(next.formUpdates,before.formUpdates);assert.deepEqual(next.live,before.live);assert.deepEqual(next.stats,before.stats);assert.ok(Object.values(next.availability.b).every(value=>value==='pending'));assert.deepEqual(parseState(JSON.stringify(next)).availability,next.availability);
});
test('round saving rejects invalid dates, duplicate or foreign match IDs and deletion of stored matches',()=>{
 let state=createTeamState(demoCatalog(),4,6);state=coachReducer(state,{type:'save-round-matches',round:2,matches:[match('a')]});
 for(const matches of [[null],[match('a'),match('a')],[{...match('a'),date:'2030-02-31'}],[match('b')],[match(state.catalog.matches[0].id)]])assert.equal(coachReducer(state,{type:'save-round-matches',round:2,matches}),state);
 assert.equal(coachReducer(state,{type:'save-round-matches',round:6,matches:[{...match(),availabilityRound:6}]}),state);
 const archived={...state,catalog:{...state.catalog,archived:true}};assert.equal(coachReducer(archived,{type:'save-round-matches',round:2,matches:[match('a')]}),archived);
});
test('processed and ongoing matches cannot be edited through round preparation',()=>{
 const state=createTeamState(demoCatalog(),4,6),id=state.catalog.liveMatchId,old=state.catalog.matches.find(m=>m.id===id),row={...old,date:'2030-11-10',opponent:'Edited'};
 for(const base of [{...state,stats:[{matchId:id,playerId:state.catalog.players[0].id,present:true,minutes:10,keeperMinutes:0,goals:0}]},{...state,live:{...state.live,elapsedMs:1000}}])assert.equal(coachReducer(base,{type:'save-round-matches',round:old.availabilityRound,matches:base.catalog.matches.filter(m=>m.availabilityRound===old.availabilityRound).map(m=>m.id===id?row:m)}),base);
});


test('source date formats normalize for the date control and reject impossible dates',()=>{
 for(const value of ['2030-11-01','01-11-2030','1 november 2030'])assert.equal(roundDateValue(value),'2030-11-01');assert.equal(roundDateValue('29 februari 2032'),'2032-02-29');for(const bad of [null,undefined,'31 februari 2030','2030-02-29','12-13-2030','not a date',''])assert.equal(roundDateValue(bad),'');
});
