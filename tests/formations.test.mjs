import test from 'node:test';
import assert from 'node:assert/strict';
import {formationCatalog,formationsFor,formationsForTeam,formationFitsTeam,validateFormationCatalog,validateFormation,validateFormations,arrangeFormation,formationRoles,positionsForFormation,validatePreparedFormation} from '../src/formations.ts';
import {createTeamState,demoCatalog,coachReducer,parseState} from '../src/coach-state.ts';
import {applyActionBatch} from '../src/action-batch.ts';
import {recommendCadence} from '../src/substitution/preparation.ts';
import {adaptMatchState} from '../src/substitution/adapter.ts';
import {validatePlan} from '../src/substitution/rules.ts';
import {stateTables,loadTeam} from '../server/sheets.mjs';
import {schema} from '../server/schema.mjs';
function fixture(size=8){const c=demoCatalog();c.players=Array.from({length:14},(_,i)=>({id:`p${i}`,name:`Player ${i}`,shortName:`P${i}`,number:i+1,parent:'',position:'',substitutionProfile:{goalkeeperEligible:i<3}}));const s=createTeamState(c,4,size);s.availability[c.liveMatchId]=Object.fromEntries(c.players.map(p=>[p.id,'available']));return s;}
test('presets fit six, eight and eleven including one keeper and support multiple midfield lines',()=>{
 for(const size of [6,8,11])for(const f of formationsFor(size))assert.doesNotThrow(()=>validateFormation(f.lines,size));
 assert.deepEqual(formationsFor(6).map(f=>f.lines.join('-')),['2-2-1','2-1-2']);
 assert.deepEqual(formationRoles([4,2,3,1]),['V','V','V','V','M','M','M','M','M','A']);
 for(const bad of [[2,2,1],[3,3,3],[0,4,3],[2,2.5,2.5],[8],[2,-1,6],['2',3,2]])assert.throws(()=>validateFormation(bad,8));
});
test('arrangement preserves starters and known roles without duplicate players or an extra keeper',()=>{
 const ordered=arrangeFormation([2,2,1],['k','a','b','c','d','e'],'k',{a:'A',b:'V',c:'M',d:'V',e:'M'});
 assert.deepEqual(ordered,['k','b','d','c','e','a']);assert.deepEqual(positionsForFormation([2,2,1],ordered),{b:'V',d:'V',c:'M',e:'M',a:'A'});
 assert.equal(arrangeFormation([2,2,1],['k','a','b'],'k',{}).filter(Boolean).length,3);
});
test('custom variants reject duplicate patterns, bad sizes and corrupt state; store per team without resetting live play',()=>{
 const base=fixture(),formations=[{id:'own-8',fieldSize:8,lines:[2,4,1]},{id:'own-11',fieldSize:11,lines:[3,5,2]}],action={type:'set-formations',formations};
 const next=applyActionBatch(base,[action],1000);assert.deepEqual(next.live,base.live);assert.deepEqual(next.catalog,base.catalog);assert.deepEqual(parseState(JSON.stringify(next)).team.formations,formations);assert.equal(base.team.formations,undefined);
 for(const bad of [[{...formations[0],lines:[2,2,1]}],[...formations,formations[0]],[{...formations[0],lines:[3,3,1]}],[{...formations[0],id:'default-8-2-4-1'}]]){assert.throws(()=>validateFormations(bad));assert.equal(coachReducer(base,{...action,formations:bad}),base);assert.throws(()=>applyActionBatch(base,[{...action,formations:bad}],1000));const corrupt=structuredClone(next);corrupt.team.formations=bad;assert.throws(()=>parseState(JSON.stringify(corrupt)));}
 const archived={...base,catalog:{...base.catalog,archived:true}};assert.equal(coachReducer(archived,action),archived);assert.equal(fixture().team.formations,undefined);
});
test('chosen formations and ordered positions replay with hard starter, keeper and minute constraints for every team size',()=>{
 for(const size of [6,8,11])for(const formation of formationsFor(size).map(f=>f.lines)){
  const base=fixture(size),field=base.live.field,positions=positionsForFormation(formation,field);
  const action={type:'assistant-prepare',id:'plan',eventId:'confirm',expectedEpoch:0,now:1000,matchId:base.catalog.liveMatchId,statuses:base.availability[base.catalog.liveMatchId],keeperIds:['p0','p1'],startingKeeperId:'p0',startingField:field,startingPositions:positions,formation};
  action.cadence=recommendCadence(base,action,1000);const next=applyActionBatch(base,[action],2000),plan=next.assistant[base.catalog.liveMatchId].plan;
  assert.deepEqual(next.live.preparation.formation,formation);assert.deepEqual(next.live.preparation.startingField,field);assert.deepEqual(next.live.preparation.startingPositions,positions);assert.deepEqual(next.catalog.players,base.catalog.players);
  assert.ok(validatePlan(adaptMatchState(next,{now:1000}),plan.intervals).valid);assert.deepEqual([...plan.intervals[0].field].sort(),[...field].sort());assert.equal(Object.values(plan.expectedEndMs).reduce((n,p)=>n+p.playedMs,0),size*50*60000);assert.equal(next.live.swaps.length,0);assert.equal(next.live.elapsedMs,0);
  const invalid={...action,formation:[2,2,1]};if(size!==6)assert.equal(coachReducer(base,invalid),base);
  const corrupt=structuredClone(next);corrupt.live.preparation.startingPositions.p1='A';assert.throws(()=>parseState(JSON.stringify(corrupt)));
 }
});
test('historical formation snapshots remain readable when a custom variant is later removed',()=>{
 const base=fixture(),formation=[2,4,1],field=base.live.field;
 const action={type:'assistant-prepare',id:'plan',eventId:'confirm',expectedEpoch:0,now:1000,matchId:base.catalog.liveMatchId,statuses:base.availability[base.catalog.liveMatchId],keeperIds:['p0'],startingKeeperId:'p0',startingField:field,startingPositions:positionsForFormation(formation,field),formation,cadence:'5-min'};
 const next=coachReducer(coachReducer(base,action),{type:'set-formations',formations:[]});assert.deepEqual(parseState(JSON.stringify(next)).live.preparation.formation,formation);
 const corrupt=structuredClone(next);corrupt.assistant[base.catalog.liveMatchId].events[0].squad.formation=[1,1,1];assert.throws(()=>parseState(JSON.stringify(corrupt)));
});

test('custom formations survive the shared Sheets State roundtrip without leaking into another team season',()=>{
 const base=fixture(),other=fixture();other.catalog={...other.catalog,teamSeasonId:'other-season'};
 const tables=Object.fromEntries(Object.keys(schema).map(k=>[k,[]]));tables.Seasons=[{seasonId:base.catalog.seasonId,name:'Season',archived:false}];
 for(const state of [base,other]){const c=state.catalog;tables.TeamSeasons.push({teamSeasonId:c.teamSeasonId,seasonId:c.seasonId,teamName:c.teamName,periods:4,liveMatchId:c.liveMatchId});tables.Players.push(...c.players.map(({id,substitutionProfile,...p})=>({...p,playerId:id,teamSeasonId:c.teamSeasonId,substitutionProfile:JSON.stringify(substitutionProfile),CoachNote:'keep'})));tables.Matches.push(...c.matches.map(({id,...m})=>({...m,matchId:id,teamSeasonId:c.teamSeasonId})));}
 const snapshot={tables,token:'test'};Object.assign(tables,stateTables(snapshot,other.catalog.teamSeasonId,other,1));
 const formations=[{id:'own-8',fieldSize:8,lines:[2,4,1]}],next=coachReducer(base,{type:'set-formations',formations});Object.assign(tables,stateTables(snapshot,base.catalog.teamSeasonId,next,2));
 assert.deepEqual(loadTeam(snapshot,base.catalog.teamSeasonId).state.team.formations,formations);assert.equal(loadTeam(snapshot,other.catalog.teamSeasonId).state.team.formations,undefined);assert.ok(tables.Players.every(p=>p.CoachNote==='keep'));
});

test('standard variants can be edited and deleted by player count without coming back after replay or reload',()=>{
 const base=fixture(),catalog=formationCatalog(base.team),target=catalog.find(f=>f.id==='default-8-3-3-1'),deleted='default-8-3-2-2';
 const updated=catalog.filter(f=>f.id!==deleted).map(f=>f.id===target.id?{...f,lines:[2,4,1]}:f);
 const action={type:'set-formations',formations:updated,replaceDefaults:true},next=applyActionBatch(base,[action],1000),loaded=parseState(JSON.stringify(next));
 assert.deepEqual(next.live,base.live);assert.deepEqual(formationCatalog(loaded.team),updated);
 assert.deepEqual(formationsFor(8,loaded.team.formations,loaded.team.formationCatalog).map(f=>f.lines),[[2,4,1],[2,3,2]]);
 for(const size of [6,11])assert.deepEqual(formationsFor(size,[],loaded.team.formationCatalog),formationsFor(size));
 const empty=coachReducer(next,{...action,formations:updated.filter(f=>f.fieldSize!==8)});assert.deepEqual(formationsFor(8,[],parseState(JSON.stringify(empty)).team.formationCatalog),[]);
 assert.deepEqual(applyActionBatch(base,[action],1000),next);assert.equal(base.team.formationCatalog,undefined);
});
test('edited standard catalog validates duplicate patterns, reserved ids and totals and leaves old custom commands unchanged',()=>{
 const base=fixture(),original=formationCatalog(),badLists=[original.map(f=>f.id==='default-8-3-3-1'?{...f,lines:[2,3,2]}:f),[{id:'default-8-unknown',fieldSize:8,lines:[2,4,1]}],[{id:'default-8-3-3-1',fieldSize:6,lines:[2,2,1]}],original.map(f=>f.fieldSize===8?{...f,lines:[1,1,1]}:f)];
 for(const formations of badLists){assert.throws(()=>validateFormationCatalog(formations));assert.equal(coachReducer(base,{type:'set-formations',formations,replaceDefaults:true}),base);assert.throws(()=>applyActionBatch(base,[{type:'set-formations',formations,replaceDefaults:true}],1000));const corrupt=structuredClone(base);corrupt.team.formationCatalog=formations;assert.throws(()=>parseState(JSON.stringify(corrupt)));}
 const legacy={type:'set-formations',formations:[{id:'old-custom',fieldSize:8,lines:[2,4,1]}]},restored=applyActionBatch(base,[legacy],1000);assert.equal(restored.team.formationCatalog,undefined);assert.equal(formationCatalog(restored.team).filter(f=>f.fieldSize===8).length,4);
 const archived={...base,catalog:{...base.catalog,archived:true}};assert.equal(coachReducer(archived,{type:'set-formations',formations:[],replaceDefaults:true}),archived);
});


test('active team-season field size determines formations and optimizer occupancy independently of roster and attendance',()=>{
 for(const size of [6,8,11]){
  const state=fixture(size);state.team.formationCatalog=formationCatalog();
  assert.equal(state.catalog.players.length,14);
  state.availability[state.catalog.liveMatchId].p13='unavailable';
  const options=formationsForTeam(state.team);
  assert.ok(options.length>0);
  assert.ok(options.every(f=>f.fieldSize===size&&f.lines.reduce((a,b)=>a+b,0)===size-1));
  assert.equal(adaptMatchState(state,{now:1000}).rules.fieldSize,size);
  assert.equal(formationFitsTeam([2,3,2],state.team),size===8);
  for(const bad of [undefined,[2,2.5,2.5],[0,6,1]])assert.equal(formationFitsTeam(bad,state.team),false);
 }
});
