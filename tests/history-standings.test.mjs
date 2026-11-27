import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamState,demoCatalog,scoreInVenueOrder} from '../src/coach-state.ts';
import {matchStanding,registeredMatchResults} from '../src/history-standings.ts';

test('history totals count each recorded result once, use team-relative scores and leave unknown scores open',()=>{
 const catalog=demoCatalog();
 catalog.matches=[
  {...catalog.matches[0],id:'win',venue:'Uit',availabilityRound:1},
  {...catalog.matches[0],id:'draw',availabilityRound:1},
  {...catalog.matches[0],id:'loss',availabilityRound:2},
  {...catalog.matches[0],id:'unknown',availabilityRound:2},
  {...catalog.matches[0],id:'future',availabilityRound:3},
 ];
 catalog.liveMatchId='future';
 const state=createTeamState(catalog);
 state.resultOnly={win:{goalsFor:7,goalsAgainst:5,events:[]}};
 state.matchResults={draw:{goalsFor:0,goalsAgainst:0}};
 state.liveArchive={loss:{...state.live,phase:'Einde',goals:[],awayGoals:[{playerId:null,minute:null,ownGoal:false}]}};
 state.stats=['draw','loss','unknown'].flatMap(matchId=>catalog.players.map(player=>({
  matchId,playerId:player.id,present:true,minutes:50,keeperMinutes:0,goals:0,
 })));
 const rows=registeredMatchResults(state,catalog.matches);
 assert.deepEqual(rows.map(({match,result})=>[match.id,result?.outcome,result?.points]),[
  ['win','win',3],['draw','draw',1],['loss','loss',0],['unknown',undefined,undefined],
 ]);
 const [away]=rows;
 assert.deepEqual(scoreInVenueOrder(away.match,away.result.goalsFor,away.result.goalsAgainst),[5,7]);
 assert.deepEqual(matchStanding(rows),{played:4,unknown:1,win:1,draw:1,loss:1,points:4,goalDifference:1});
 assert.deepEqual(matchStanding(rows.filter(row=>row.match.availabilityRound===2)),{
  played:2,unknown:1,win:0,draw:0,loss:1,points:0,goalDifference:-1,
 });
 assert.deepEqual(matchStanding([]),{played:0,unknown:0,win:0,draw:0,loss:0,points:0,goalDifference:0});
});
