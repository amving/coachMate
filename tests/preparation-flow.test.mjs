import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamState,demoCatalog,coachReducer,parseState} from '../src/coach-state.ts';
import {newPreparationDraft,readPreparationDraft,keeperScheduleValid,startingLineupValid,startingLineupIssue,preparationPlanCurrent,calculatePreparation} from '../src/preparation-flow.ts';
import {prepareSquad} from '../src/substitution/preparation.ts';
import {adaptMatchState} from '../src/substitution/adapter.ts';
import {generateAdvice} from '../src/substitution/recommendations.ts';
import {validatePlan,validateExecution} from '../src/substitution/rules.ts';
import {applyActionBatch} from '../src/action-batch.ts';
const MIN=60000;
function fixture(periods=4){const c=demoCatalog();c.players=c.players.slice(0,9);c.matches=[{...c.matches[0],id:'match'}];c.liveMatchId='match';const s=createTeamState(c,periods,6);s.availability.match=Object.fromEntries(c.players.map(p=>[p.id,'available']));return s;}
function draft(s,slots=['p01','p01','p02','p02']){return {...newPreparationDraft(s,'match'),slots};}
function calculate(s,d,confirmed=false,id='proposal'){return calculatePreparation(s,d,{id,eventId:`event-${id}`,now:1000},confirmed);}
function lineup(d,field=['p01','p03','p04','p05','p08','p09']){return {...d,manualLineup:true,field,formation:[2,2,1],dirty:true};}

test('every period needs a present keeper; duplicates are valid assignments, not extra people',()=>{
 const s=fixture(),d=draft(s);assert.equal(keeperScheduleValid(s,newPreparationDraft(s,'match')),false);assert.equal(keeperScheduleValid(s,d),true);assert.equal(startingLineupValid(s,d),false);
 for(const slots of [['p01','p02','p02'],['p01','','p02','p02'],['p01','foreign','p02','p02']])assert.equal(keeperScheduleValid(s,{...d,slots}),false);
 d.statuses.p02='unavailable';assert.equal(keeperScheduleValid(s,d),false);
});
for(const [label,slots,expected] of [
 ['2+2',['p01','p01','p02','p02'],{p01:25,p02:25}],
 ['3+1',['p01','p01','p01','p02'],{p01:37.5,p02:12.5}],
 ['one keeper',['p01','p01','p01','p01'],{p01:50}],
 ['four keepers',['p01','p02','p03','p04'],{p01:12.5,p02:12.5,p03:12.5,p04:12.5}],
 ['three keepers',['p01','p02','p03','p01'],{p01:25,p02:12.5,p03:12.5}]
])test(`the ${label} keeper schedule is a hard constraint in every candidate and conserves field/bench occupancy`,()=>{
 const s=fixture(),raw=JSON.stringify(s),result=calculate(s,draft(s,slots)),snapshot=adaptMatchState(result.state,{now:1000});
 assert.equal(JSON.stringify(s),raw);assert.equal(s.live.preparation,undefined);assert.equal(result.state.assistant.match.status,'proposed');assert.equal(preparationPlanCurrent(s,result.draft),true);
 for(const [id,minutes] of Object.entries(expected))assert.equal(result.draft.plan.expectedEndMs[id].keeperMs,minutes*MIN);
 for(const interval of result.draft.plan.intervals){assert.equal(interval.field.length,6);assert.equal(s.catalog.players.filter(p=>!interval.field.includes(p.id)).length,3);for(let q=0;q<4;q++)if(Math.max(interval.startMs,q*12.5*MIN)<Math.min(interval.endMs,(q+1)*12.5*MIN))assert.equal(interval.keeperId,slots[q]);}
 assert.ok(validatePlan(snapshot,result.draft.plan.intervals).valid);assert.doesNotThrow(()=>parseState(JSON.stringify(result.state)));
 const wrong=structuredClone(result.draft.plan.intervals);const replacement=slots.find(id=>id!==wrong[0].keeperId)??'p03';wrong[0].keeperId=replacement;assert.ok(!validatePlan(snapshot,wrong).valid);
});
test('coach lineup is recomputed as a hard constraint; one final action confirms it atomically without playing or recording swaps',()=>{
 const s=fixture(),preview=calculate(s,draft(s)),chosen=lineup(preview.draft);assert.ok(startingLineupValid(s,chosen));assert.ok(!preparationPlanCurrent(s,chosen));const result=calculate(s,chosen,true,'final');
 assert.equal(result.state.assistant.match.status,'accepted');assert.deepEqual([...result.state.live.field].sort(),[...chosen.field].sort());assert.deepEqual(result.state.live.preparation.startingField,chosen.field);assert.deepEqual(result.state.live.preparation.keeperSchedule,chosen.slots);assert.equal(result.state.live.elapsedMs,0);assert.equal(result.state.live.runningSince,null);assert.deepEqual(result.state.live.swaps,[]);assert.equal(result.state.assistant.match.events.length,1);assert.equal(result.state.assistant.match.events[0].kind,'accepted');
 assert.deepEqual(applyActionBatch(s,[result.action],1000),result.state);assert.deepEqual(applyActionBatch(result.state,[result.action],1000),result.state);assert.ok(preparationPlanCurrent(result.state,result.draft));
});
test('partial lineup choices survive calculation but cannot be confirmed until all places are filled',()=>{
 const s=fixture(),partial=lineup(draft(s),['p01','p03','','p05','p08','p09']);assert.ok(!startingLineupValid(s,partial));assert.throws(()=>calculate(s,partial,true),/opstelling/);const result=calculate(s,partial);assert.deepEqual(result.draft.field,partial.field);assert.equal(result.draft.manualLineup,true);
});
test('lineup validation identifies the missing formation slot and clears only for a complete valid lineup',()=>{
 const s=fixture(),d={...lineup(draft(s),['p01','p02','p03','p08','','p05']),formation:[2,1,2]};
 assert.equal(startingLineupIssue(s,d),'Kies een speler voor Spits 1.');
 assert.equal(startingLineupValid(s,d),false);
 const complete={...d,field:d.field.map(id=>id||'p06')};
 assert.equal(startingLineupIssue(s,complete),null);assert.equal(startingLineupValid(s,complete),true);
 assert.match(startingLineupIssue(s,{...complete,field:['p01','p02','p03','p08','p05','p05']}),/meer dan één/);
 assert.match(startingLineupIssue(s,{...complete,statuses:{...d.statuses,p06:'unavailable'}}),/niet aanwezig/);
 assert.match(startingLineupIssue(s,{...d,field:['p01','','p03','p08','','p05']}),/nog 2 spelers/);
 assert.match(startingLineupIssue(s,{...d,manualLineup:false}),/voorstel/);
});
test('two-half teams use one required keeper per half and preserve 25/25 minutes',()=>{
 const s=fixture(2),result=calculate(s,draft(s,['p01','p02']));assert.equal(result.draft.plan.expectedEndMs.p01.keeperMs,25*MIN);assert.equal(result.draft.plan.expectedEndMs.p02.keeperMs,25*MIN);assert.equal(result.state.live.preparation.keeperSchedule.length,2);
});
test('legacy drafts retain their choices, but whole-match keeper candidates are never silently treated as quarters',()=>{
 const s=fixture(),old={version:2,planId:'old',slots:['p01','p02','',''],cadence:'5-min',field:['p01','p03','p04','p05','p08','p09'],positions:{p03:'V'},statuses:{...s.availability.match},manualLineup:true,dirty:true,formation:[2,2,1]};
 const restored=readPreparationDraft(JSON.stringify(old),s,'match');assert.deepEqual(restored.legacy,old);assert.deepEqual(restored.field,old.field);assert.deepEqual(restored.slots,['','','','']);assert.equal(restored.keepersConfirmed,false);assert.equal(keeperScheduleValid(s,restored),false);
 const computed=calculate(s,draft(s));assert.deepEqual(readPreparationDraft(JSON.stringify(computed.draft),s,'match'),computed.draft);assert.equal(readPreparationDraft(JSON.stringify({...computed.draft,teamSeasonId:'foreign'}),s,'match'),null);
});
test('changing attendance or source data invalidates preview without modifying any confirmed match',()=>{
 const s=fixture(),result=calculate(s,draft(s)),changed=structuredClone(s);changed.availability.match.p09='unavailable';assert.ok(!preparationPlanCurrent(changed,result.draft));assert.equal(s.live.preparation,undefined);assert.ok(!preparationPlanCurrent(s,{...result.draft,slots:['p01','p01','p01','p02']}));
});
test('impossible keeper limits fail closed and corrupt saved schedules cannot be loaded',()=>{
 const s=fixture();s.catalog.players[0].substitutionProfile={maxMinutes:30};const raw=JSON.stringify(s);assert.throws(()=>calculate(s,draft(s,['p01','p01','p01','p02'])));assert.equal(JSON.stringify(s),raw);
 const good=calculate(fixture(),draft(fixture())).state;
 for(const schedule of [null,[],['p01','p02'],['foreign','p01','p02','p02']]){const copy=structuredClone(good);copy.live.preparation.keeperSchedule=schedule;assert.throws(()=>parseState(JSON.stringify(copy)));}
 const event=structuredClone(good);event.assistant.match.events[0].squad.keeperSchedule=['p01'];assert.throws(()=>parseState(JSON.stringify(event)));
});
test('scheduled keeper changes cannot be executed in an earlier quarter, while late actual times remain explicit',()=>{
 const s=fixture(),result=calculate(s,lineup(draft(s)),true),snapshot=adaptMatchState(result.state,{now:1000});const proposal={stateVersion:snapshot.stateVersion,policyVersion:1,atMs:0,field:[...snapshot.field.filter(id=>id!=='p01'),'p02'],keeperId:'p02'};
 assert.ok(validateExecution(snapshot,proposal,1,{accepted:true,executed:true}).issues.some(i=>i.code==='KEEPER_SCHEDULE'));
 const bad={type:'assistant-prepare',id:'bad',eventId:'bad-event',now:1000,expectedEpoch:0,matchId:'match',statuses:s.availability.match,keeperIds:['p01','p02'],startingKeeperId:'p01',keeperSchedule:['p01','p01','p02']};assert.throws(()=>prepareSquad(s,bad,1000));assert.equal(coachReducer(s,bad),s);
});

test('actual keeper corrections override only the remaining current planned period and retain original choices',()=>{
 const initial=calculate(fixture(),lineup(draft(fixture())),true).state;
 const corrected=coachReducer(initial,{type:'keeper',playerId:'p03',now:1000});
 assert.equal(corrected.live.keeperId,'p03');assert.deepEqual(corrected.live.preparation.keeperSchedule,['p01','p01','p02','p02']);
 const snapshot=adaptMatchState(corrected,{now:1000});assert.deepEqual(snapshot.rules.keeperSchedule,['p03','p01','p02','p02']);assert.ok(snapshot.players.find(p=>p.id==='p03').goalkeeperEligible);
 assert.doesNotThrow(()=>parseState(JSON.stringify(corrected)));assert.equal(snapshot.clock.matchMs,0);const next=generateAdvice(corrected,1000);assert.equal(next.plan.intervals[0].keeperId,'p03');assert.equal(next.plan.expectedEndMs.p02.keeperMs,25*MIN);
});
test('changing the match format retains the original schedule in the audit and requires new period choices',()=>{
 const initial=calculate(fixture(),lineup(draft(fixture())),true).state;
 const changed=coachReducer(initial,{type:'set-periods',periods:2,now:1000});assert.equal(changed.live.periods,2);assert.equal(changed.live.preparation.keeperSchedule,undefined);assert.deepEqual(changed.assistant.match.events[0].squad.keeperSchedule,['p01','p01','p02','p02']);assert.doesNotThrow(()=>parseState(JSON.stringify(changed)));
 const d=newPreparationDraft(changed,'match');assert.deepEqual(d.slots,['','']);assert.ok(!keeperScheduleValid(changed,d));
 const smaller=coachReducer(initial,{type:'set-field-size',fieldSize:8,now:1000});const fresh=newPreparationDraft(smaller,'match');assert.equal(fresh.field.length,8);assert.equal(fresh.manualLineup,false);
});
test('damaged cached plans cannot crash the flow; recipient choices survive for recomputation',()=>{
 const s=fixture(),valid=calculate(s,draft(s)).draft;
 for(const plan of [{...valid.plan,intervals:[]},{...valid.plan,fairnessErrorMs:null},{...valid.plan,intervals:[{startMs:0,endMs:3000000,field:null}]}]){const loaded=readPreparationDraft(JSON.stringify({...valid,plan}),s,'match');assert.deepEqual(loaded.slots,valid.slots);assert.equal(loaded.plan,undefined);assert.equal(loaded.dirty,true);}
});

test('a shared confirmed preparation can be restored without a local draft and never invents a new decision',()=>{
 const saved=calculate(fixture(),lineup(draft(fixture())),true).state,raw=JSON.stringify(saved),restored=newPreparationDraft(saved,'match');assert.equal(restored.dirty,false);assert.equal(restored.keepersConfirmed,true);assert.ok(preparationPlanCurrent(saved,restored));assert.equal(JSON.stringify(saved),raw);
});
