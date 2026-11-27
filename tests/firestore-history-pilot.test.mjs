import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCapture, rehearseMigration, summarizeHistory} from '../scripts/firestore-history-pilot.mjs';
import {schema} from '../server/schema.mjs';
import {createTeamState, demoCatalog} from '../src/coach-state.ts';

function capture(){
  const catalog={...structuredClone(demoCatalog()),teamSeasonId:'demo-team',clubId:'testclub',clubName:'Testclub',liveMatchId:''};
  const away=catalog.matches.find(match=>match.venue==='Uit');
  const [scorer]=catalog.players;
  scorer.parentEmail='contact@example.test';
  scorer.parentPhone='+31600000000';
  const state=createTeamState(catalog,4,6);
  state.resultOnly={[away.id]:{goalsFor:1,goalsAgainst:0,
    events:[{scoreFor:1,scoreAgainst:0,playerId:scorer.id,minute:null,ownGoal:false}]}};
  const grid=(name,rows=[])=>[schema[name],...rows.map(row=>schema[name].map(key=>row[key]??''))];
  return {tabs:{
    Seasons:grid('Seasons',[{seasonId:catalog.seasonId,name:catalog.seasonName,archived:false}]),
    TeamSeasons:grid('TeamSeasons',[{...catalog,periods:4}]),
    Players:grid('Players',catalog.players.map(player=>({...player,playerId:player.id,teamSeasonId:catalog.teamSeasonId}))),
    Matches:grid('Matches',catalog.matches.map(match=>({...match,matchId:match.id,teamSeasonId:catalog.teamSeasonId}))),
    State:grid('State',[{teamSeasonId:catalog.teamSeasonId,revision:1,part:0,json:JSON.stringify(state)}]),
    Availability:grid('Availability'),
    MatchStats:grid('MatchStats'),
  }};
}

test('proefmigratie bewaart een uitzege met onbekende goalminuut zonder individuele speelgegevens',async()=>{
  const data=await parseCapture(capture());
  const report=summarizeHistory(data)[0];
  assert.equal(report.played,1);
  assert.equal(report.points,3);
  assert.equal(report.goalsFor,1);
  assert.equal(report.goalsAgainst,0);
  assert.equal(report.teamMinutes,50);
  assert.equal(report.playerGoals,1);
  assert.equal(report.resultOnlyMatches,1);
  assert.equal(report.matchesWithoutCountedAttendance,1);
  assert.deepEqual(data.MatchStats,[]);
  assert.doesNotMatch(JSON.stringify(data),/contact@example\.test|31600000000/);
  const state=JSON.parse(data.State.map(row=>row.json).join(''));
  assert.equal(Object.values(state.resultOnly)[0].events[0].minute,null);
  assert.deepEqual(state.stats,[]);
});

test('proefmigratie weigert ontbrekende State-delen en externe of niet-demo-doelen',async()=>{
  const source=capture();
  source.tabs.State[1][2]=1;
  await assert.rejects(parseCapture(source),/onvolledige State-delen/);
  await assert.rejects(rehearseMigration({}, {host:'firestore.googleapis.com:443',project:'demo-history'}),/lokale Firestore-emulator/);
  await assert.rejects(rehearseMigration({}, {host:'127.0.0.1:4893',project:'coachmate-productie'}),/demo-project/);
});
