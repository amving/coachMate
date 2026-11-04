import test from 'node:test';
import assert from 'node:assert/strict';
import {matchShareText} from '../src/match-share.ts';
import {createTeamState,demoCatalog,coachReducer,recordedMatchResult,scoreInVenueOrder,parseState} from '../src/coach-state.ts';

const match={id:'first',opponent:'HYS O10-1',date:'2026-10-03',shortDate:'3 okt',time:'11:00',venue:'Thuis',availabilityRound:1,pool:''};
const ours=[{playerId:'t',minute:12,ownGoal:false,sequence:1},{playerId:'s',minute:20,ownGoal:false,sequence:3}];
const theirs=[{playerId:null,minute:14,ownGoal:false,sequence:2}];
const name=id=>({t:'Tijn',s:'Sebas'})[id];

test('share separates match/date and final score, with one chronological cumulative goal timeline',()=>{
 assert.equal(matchShareText(match,'EDO hfc JO10-2',ours,theirs,name),"EDO hfc JO10-2 – HYS O10-1\n3 oktober 2026\n\nEindstand\n2–1\n\nScoreverloop\n1-0 Tijn '12\n1-1 - '14\n2-1 Sebas '20");
 const away=matchShareText({...match,venue:'Uit'},'EDO hfc JO10-2',ours,theirs,name);
 assert.ok(away.startsWith('HYS O10-1 – EDO hfc JO10-2\n3 oktober 2026'));
 assert.ok(away.includes("Eindstand\n1–2"));assert.ok(away.endsWith("0-1 Tijn '12\n1-1 - '14\n1-2 Sebas '20"));
});

test('share handles own goals, stopped-clock goals, undo gaps and missing legacy chronology honestly',()=>{
 const events=[{...ours[0],sequence:1,minute:0},{...ours[1],sequence:4,minute:0,scoreFor:2,scoreAgainst:1}];
 const text=matchShareText(match,'EDO',events,[],name);assert.ok(text.endsWith("1-0 Tijn '0\n2-0 Sebas '0"));
 const own=matchShareText(match,'EDO',[{playerId:null,minute:5,ownGoal:true,sequence:1}],[{playerId:'t',minute:6,ownGoal:true,sequence:2}],name);
 assert.ok(own.includes("1-0 Eigen doelpunt tegenstander '5\n1-1 Tijn (e.d.) '6"));
 const legacy=matchShareText(match,'EDO',ours.map(g=>({...g,sequence:undefined,minute:null})),theirs.map(g=>({...g,sequence:undefined,minute:null})),name);
 assert.ok(legacy.includes('tussenstanden onbekend'));assert.ok(legacy.includes("?–? Tijn '?"));assert.ok(!legacy.includes('1-0'));
 assert.ok(matchShareText(match,'EDO',[],[],name).endsWith('Eindstand\n0–0\n\nGeen doelpunten.'));
});

test('legacy snapshots or distinct known minutes can establish chronology without inventing times',()=>{
 const a=[{...ours[0],sequence:undefined,scoreFor:1,scoreAgainst:0},{...ours[1],sequence:undefined,scoreFor:2,scoreAgainst:1}];
 const b=[{...theirs[0],sequence:undefined,scoreFor:1,scoreAgainst:1}];
 assert.ok(matchShareText(match,'EDO',a,b,name).endsWith("1-0 Tijn '12\n1-1 - '14\n2-1 Sebas '20"));
 assert.ok(!matchShareText(match,'EDO',ours.map(g=>({...g,sequence:undefined})),theirs.map(g=>({...g,sequence:undefined})),name).includes('onbekend'));
});

test('both recent Live finals remain readable after moving to another match; imported results and unknowns stay distinct',()=>{
 const catalog=demoCatalog();catalog.players=catalog.players.slice(0,6);catalog.matches=[match,{...match,id:'second',date:'2026-10-24',venue:'Uit'},{...match,id:'unknown'}];catalog.liveMatchId='first';
 let s=createTeamState(catalog,4,6);const scorer=catalog.players[0].id;
 assert.equal(recordedMatchResult(s,'first'),null);
 for(let i=0;i<5;i++)s=coachReducer(s,{type:'goal',playerId:scorer,now:1000});
 for(let i=0;i<6;i++)s=coachReducer(s,{type:'away-goal',delta:1,now:1000});
 s=coachReducer(s,{type:'finish',now:1000});
 assert.deepEqual(recordedMatchResult(s,'first'),{goalsFor:5,goalsAgainst:6});
 s=coachReducer(s,{type:'prepare-match',matchId:'second'});
 s=coachReducer(s,{type:'goal',playerId:s.live.field[0],now:2000});s=coachReducer(s,{type:'finish',now:2000});
 const restored=parseState(JSON.stringify(s));
 assert.deepEqual(recordedMatchResult(restored,'first'),{goalsFor:5,goalsAgainst:6});
 const second=recordedMatchResult(restored,'second');assert.deepEqual(scoreInVenueOrder(catalog.matches[1],second.goalsFor,second.goalsAgainst),[0,1]);
 assert.equal(recordedMatchResult(restored,'unknown'),null);
 restored.matchResults={first:{goalsFor:4,goalsAgainst:6,duration:50,sourceHash:'manual'}};
 assert.deepEqual(recordedMatchResult(restored,'first'),{goalsFor:4,goalsAgainst:6});
});
