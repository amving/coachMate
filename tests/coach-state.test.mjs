import test from "node:test";
import assert from "node:assert/strict";
import { matches, liveMatchRows, createInitialState, coachReducer, matchRows, parseState, validateRows, LIVE_MATCH_ID, periodLabel, totalGoals, scoreInVenueOrder } from "../src/coach-state.ts";

test("playing and keeper time survive reloads, swaps and half-time without double counting", () => {
  let state = createInitialState();
  state = coachReducer(state, {type:"availability",matchId:LIVE_MATCH_ID,playerId:"p07",value:"available"});
  state = coachReducer(state, { type: "toggle-clock", now: 1000 });
  state = coachReducer(state, { type: "swap", out: "p01", in: "p07", now: 61000 });
  assert.equal(state.live.keeperId, "p07");
  state = parseState(JSON.stringify(state));
  state = coachReducer(state, { type: "phase", now: 121000 });
  state = coachReducer(state, { type: "clock", now: 999999 });
  assert.equal(state.live.elapsedMs, 120000);
  assert.equal(state.live.played.p01.keeperMilliseconds, 60000);
  assert.equal(state.live.played.p07.keeperMilliseconds, 60000);
  state = coachReducer(state, { type: "phase", now: 1000000 });
  state = coachReducer(state, { type: "finish", now: 1060000 });
  assert.equal(state.live.elapsedMs, 180000);
  const rows = matchRows(state, LIVE_MATCH_ID);
  assert.equal(rows.find(r => r.playerId === "p01").minutes, 1);
  assert.equal(rows.find(r => r.playerId === "p07").keeperMinutes, 2);
  assert.equal(rows.reduce((sum, r) => sum + r.minutes, 0), 18);
  assert.deepEqual(coachReducer(state, { type: "finish", now: 2000000 }), state);
});

test("undoing a goal is pure, and finalized matches cannot change through live controls", () => {
  let state = coachReducer(createInitialState(), { type: "goal", playerId: "p02", now: 1000 });
  assert.equal(coachReducer(state, { type: "undo-goal" }).live.goals.length, 0);
  assert.equal(coachReducer(state, { type: "undo-goal" }).live.goals.length, 0);
  assert.equal(state.live.goals.length, 1);
  state = coachReducer(state, { type: "finish", now: 1000 });
  for (const action of [{ type: "goal", playerId: "p02", now: 2000 }, { type: "away-goal", delta: 1 }, { type: "undo-goal" }, { type: "swap", out: "p01", in: "p08", now: 2000 }, { type: "toggle-clock", now: 2000 }]) {
    assert.deepEqual(coachReducer(state, action), state);
  }
});

test("statistics load actual match values and only replace the selected match", () => {
  const state = createInitialState();
  const rows = matchRows(state, "m-005");
  assert.equal(rows.find(r => r.playerId === "p01").keeperMinutes, 42);
  assert.equal(matchRows(state, "m-014").find(r => r.playerId === "p01").keeperMinutes, 24);
  rows[0].goals = 3;
  const result = coachReducer(state, { type: "save-stats", matchId: "m-005", rows });
  assert.equal(result.stats.filter(r => r.matchId === "m-005").length, 10);
  assert.deepEqual(result.stats.filter(r => r.matchId === "m-014"), state.stats.filter(r => r.matchId === "m-014"));
  assert.equal(state.stats.find(r => r.matchId === "m-005" && r.playerId === "p01").goals, 0);
  assert.equal(coachReducer(state, { type: "save-stats", matchId: LIVE_MATCH_ID, rows: matchRows(state, LIVE_MATCH_ID) }), state);
});

test("invalid, absent-player and excessive keeper statistics cannot be saved", () => {
  for (const patch of [{ minutes: -1 }, { minutes: 121 }, { minutes: 1.5 }, { keeperMinutes: 43 }, { present: false }, { goals: NaN }]) {
    const state = createInitialState();
    const rows = matchRows(state, "m-005");
    Object.assign(rows[0], patch);
    assert.equal(validateRows(rows, "m-005"), false);
    assert.equal(coachReducer(state, { type: "save-stats", matchId: "m-005", rows }), state);
  }
});

test("competition rounds add matches without resetting any previous availability", () => {
  const before=createInitialState();
  const match={...matches[0],id:"new-round-match",date:"2026-10-20",availabilityRound:2};
  const state=coachReducer(before,{type:"new-round",matches:[match]});
  assert.deepEqual(state.availability[LIVE_MATCH_ID],before.availability[LIVE_MATCH_ID]);
  assert.equal(state.currentRound,2);
  assert.ok(Object.values(state.availability[match.id]).every(v=>v==='pending'));
  assert.deepEqual(parseState(JSON.stringify(state)),state);
  assert.equal(coachReducer(before,{type:"new-round"}),before);
  assert.equal(coachReducer(state,{type:"add-matches",matches:[match]}),state);
});

test("corrupt and incompatible storage is rejected, including missing live player records", () => {
  assert.throws(() => parseState("not json"));
  assert.throws(() => parseState('{"version":2}'));
  const state = createInitialState();
  delete state.live.played.p01;
  assert.throws(() => parseState(JSON.stringify(state)));
});

test("long background sessions stop at the same 120-minute limit as manual statistics", () => {
  let state = coachReducer(createInitialState(), { type: "toggle-clock", now: 1000 });
  state = coachReducer(state, { type: "clock", now: 24 * 60 * 60 * 1000 });
  assert.equal(state.live.elapsedMs, 120 * 60000);
  assert.equal(state.live.runningSince, null);
  state = coachReducer(state, { type: "finish", now: 24 * 60 * 60 * 1000 });
  assert.ok(validateRows(matchRows(state, LIVE_MATCH_ID), LIVE_MATCH_ID));
});

for (const periods of [2, 4]) {
  test(`${periods} periods advance through every break, excluding breaks from playing time`, () => {
    let state = coachReducer(createInitialState(), { type: "set-periods", periods, now: 1000 });
    state = coachReducer(state, { type: "toggle-clock", now: 1000 });
    let now = 1000;
    for (let period = 1; period <= periods; period++) {
      assert.equal(periodLabel(state.live), `${period}e ${periods === 2 ? "helft" : "kwart"}`);
      now += 60000;
      state = coachReducer(state, { type: "phase", now });
      if (period < periods) {
        assert.equal(state.live.phase, "Rust");
        assert.equal(state.live.runningSince, null);
        state = parseState(JSON.stringify(state));
        now += 30000;
        state = coachReducer(state, { type: "phase", now });
      }
    }
    assert.equal(state.live.phase, "Einde");
    assert.equal(state.live.elapsedMs, periods * 60000);
    assert.equal(matchRows(state, LIVE_MATCH_ID)[0].keeperMinutes, periods);
    assert.equal(state.stats.filter(r => r.matchId === LIVE_MATCH_ID).length, 10);
  });
}

test("correcting the team format pauses the clock but preserves scores and minutes", () => {
  let state = coachReducer(createInitialState(), { type: "toggle-clock", now: 1000 });
  state = coachReducer(state, { type: "goal", playerId: "p02", now: 1000 });
  state = coachReducer(state, { type: "set-periods", periods: 4, now: 61000 });
  assert.equal(state.team.periods, 4);
  assert.equal(state.live.runningSince, null);
  assert.equal(state.live.played.p02.milliseconds, 60000);
  assert.equal(state.live.goals.length, 1);
  state = coachReducer(state, { type: "set-period", period: 4, now: 62000 });
  state = coachReducer(state, { type: "set-periods", periods: 2, now: 63000 });
  assert.equal(state.live.period, 2);
  assert.equal(periodLabel(state.live), "2e helft");
  const finished = coachReducer(state, { type: "finish", now: 64000 });
  const changed = coachReducer(finished, { type: "set-periods", periods: 4, now: 65000 });
  assert.equal(changed.team.periods, 4);
  assert.deepEqual(changed.live, finished.live);
  assert.deepEqual(changed.stats, finished.stats);
});

test("own goals count on the correct side and never inflate player goal statistics", () => {
  let state = createInitialState();
  const before = totalGoals(state);
  state = coachReducer(state, { type: "goal", playerId: "p02", now: 1000 });
  state = coachReducer(state, { type: "goal", playerId: null, ownGoal: true, now: 1000 });
  state = coachReducer(state, { type: "away-goal", delta: 1, ownGoalPlayerId: "p02", now: 1000 });
  state = coachReducer(state, { type: "away-goal", delta: 1, now: 1000 });
  assert.equal(state.live.goals.length, 2);
  assert.equal(state.live.awayGoals.length, 2);
  assert.equal(state.live.awayGoals[0].ownGoal, true);
  assert.equal(state.live.awayGoals[0].playerId, "p02");
  state = parseState(JSON.stringify(state));
  const undoFor = coachReducer(state, { type: "undo-goal" });
  assert.deepEqual(undoFor.live.goals, [state.live.goals[0]]);
  const undoAgainst = coachReducer(state, { type: "away-goal", delta: -1 });
  assert.deepEqual(undoAgainst.live.awayGoals, [state.live.awayGoals[0]]);
  assert.equal(coachReducer(undoAgainst, { type: "away-goal", delta: -1 }).live.awayGoals.length, 0);
  state = coachReducer(state, { type: "finish", now: 1000 });
  assert.equal(matchRows(state, LIVE_MATCH_ID).find(r => r.playerId === "p02").goals, 1);
  assert.equal(state.opponentOwnGoals[LIVE_MATCH_ID], 1);
  assert.equal(totalGoals(state), before + 2);
  const corrected = coachReducer(state, { type: "save-stats", matchId: LIVE_MATCH_ID, rows: matchRows(state, LIVE_MATCH_ID), opponentOwnGoals: 0 });
  assert.equal(totalGoals(corrected), before + 1);
  assert.deepEqual(parseState(JSON.stringify(corrected)), corrected);
});

test("old browser storage migrates losslessly, including a running second half and counter-only away goals", () => {
  const legacy = createInitialState();
  legacy.version = 1;
  delete legacy.team;
  delete legacy.opponentOwnGoals;
  delete legacy.live.period;
  delete legacy.live.periods;
  delete legacy.live.awayGoals;
  legacy.live.phase = "Tweede helft";
  legacy.live.runningSince = 1000;
  legacy.live.goals = [{ playerId: "p02", minute: 12 }];
  legacy.live.awayScore = 2;
  const migrated = parseState(JSON.stringify(legacy));
  assert.equal(migrated.version, 2);
  assert.equal(migrated.live.period, 2);
  assert.equal(migrated.live.runningSince, 1000);
  assert.deepEqual(migrated.live.goals, [{ playerId: "p02", minute: 12, ownGoal: false }]);
  assert.equal(migrated.live.awayGoals.length, 2);
  assert.equal(migrated.live.awayGoals[0].minute, null);
  assert.deepEqual(migrated.stats, legacy.stats);
  assert.deepEqual(migrated.availability, legacy.availability);
  assert.deepEqual(parseState(JSON.stringify(migrated)), migrated);
});

test("invalid periods and own-goal attribution are rejected", () => {
  const state = createInitialState();
  for (const action of [{ type: "set-periods", periods: 3, now: 1000 }, { type: "set-period", period: 3, now: 1000 }, { type: "goal", playerId: "p02", ownGoal: true, now: 1000 }, { type: "away-goal", delta: 1, ownGoalPlayerId: "p10", now: 1000 }]) {
    assert.equal(coachReducer(state, action), state);
  }
  state.live.period = 3;
  assert.throws(() => parseState(JSON.stringify(state)));
});

test('historical playing time accepts half minutes up to 50 and survives storage', () => {
  const initial = createInitialState();
  const rows = matchRows(initial, 'm-005');
  rows[0] = { ...rows[0], minutes: 50, keeperMinutes: 12.5 };
  rows[1] = { ...rows[1], minutes: 37.5 };
  const action = { type: 'save-stats', matchId: 'm-005', rows };
  const saved = parseState(JSON.stringify(coachReducer(initial, action)));
  assert.equal(matchRows(saved, 'm-005')[0].keeperMinutes, 12.5);
  assert.equal(matchRows(saved, 'm-005')[1].minutes, 37.5);
  assert.equal(coachReducer(saved, { ...action, rows: rows.map((r,i) => i === 0 ? {...r, minutes:50.5} : r) }), saved);
  assert.equal(coachReducer(saved, { ...action, rows: rows.map((r,i) => i === 0 ? {...r, minutes:12.5, keeperMinutes:13} : r) }), saved);
});

test('a completed live match above 50 minutes retains its actual playing time', () => {
  let state = coachReducer(createInitialState(), { type: 'toggle-clock', now: 1000 });
  state = coachReducer(state, { type: 'finish', now: 1000 + 55 * 60000 });
  const rows = matchRows(state, LIVE_MATCH_ID);
  assert.equal(rows[0].minutes, 55);
  const saved = coachReducer(state, { type: 'save-stats', matchId: LIVE_MATCH_ID, rows });
  assert.equal(matchRows(parseState(JSON.stringify(saved)), LIVE_MATCH_ID)[0].minutes, 55);
});

test('historical availability cannot be changed', () => {
  const state = createInitialState();
  const row = state.stats[0];
  const changed = coachReducer(state, {type:'availability', matchId:row.matchId, playerId:row.playerId, value:'pending'});
  assert.equal(changed,state);
});

test("preparing another match preserves history, rejects unfinished/completed games and updates live identity", () => {
 let state = createInitialState();
 assert.equal(coachReducer(state, {type:'prepare-match',matchId:'m-028'}), state);
 state = coachReducer(state,{type:'finish',now:0});
 const previous = JSON.stringify(state.stats);
 assert.equal(coachReducer(state,{type:'prepare-match',matchId:'m-014'}),state);
 const next=coachReducer(state,{type:'prepare-match',matchId:'m-028'});
 assert.equal(next.catalog.liveMatchId,'m-028');
 assert.equal(next.live.phase,'Spelen');
 assert.equal(next.live.elapsedMs,0);
 assert.equal(JSON.stringify(next.stats),previous);
 assert.ok(next.liveArchive['m-021']);
 assert.doesNotThrow(()=>parseState(JSON.stringify(next)));
});

test('actual period times and goal snapshots survive corrections, undo and reload', () => {
  let s = createInitialState();
  s = coachReducer(s, {type:'toggle-clock',now:1000});
  s = coachReducer(s, {type:'goal',playerId:'p02',now:61000});
  s = coachReducer(s, {type:'away-goal',delta:1,now:61001});
  assert.deepEqual([s.live.goals[0].scoreFor,s.live.goals[0].scoreAgainst],[1,0]);
  assert.deepEqual([s.live.awayGoals[0].scoreFor,s.live.awayGoals[0].scoreAgainst],[1,1]);
  assert.equal(s.live.awayGoals[0].sequence,2);
  s = coachReducer(s, {type:'phase',now:121000});
  s = coachReducer(s, {type:'phase',now:999000});
  s = coachReducer(s, {type:'clock',now:1029000});
  assert.deepEqual(s.live.periodTimes,{'2:1':120000,'2:2':30000});
  s = parseState(JSON.stringify(s));
  s = coachReducer(s, {type:'away-goal',delta:-1});
  assert.equal(s.live.goals[0].scoreAgainst,0);
  s = coachReducer(s,{type:'set-periods',periods:4,now:1029000});
  assert.equal(s.live.elapsedMs,150000);
  assert.deepEqual(s.live.periodTimes,{'2:1':120000,'2:2':30000});
  assert.equal(parseState(JSON.stringify(s)).live.elapsedMs,150000);
});

test('invalid optional timing and score history are rejected, legacy fields remain optional', () => {
  const s=createInitialState();
  assert.doesNotThrow(()=>parseState(JSON.stringify(s)));
  s.live.periodTimes={'2:1':1};
  assert.throws(()=>parseState(JSON.stringify(s)));
  s.live.periodTimes={};
  s.live.goals=[{playerId:'p02',minute:0,ownGoal:false,scoreFor:-1,scoreAgainst:0}];
  assert.throws(()=>parseState(JSON.stringify(s)));
});


test('closing preview uses exactly the rows saved, including own goals and attendance', () => {
 let s=createInitialState();
 s=coachReducer(s,{type:'toggle-clock',now:1000});
 s=coachReducer(s,{type:'goal',playerId:null,ownGoal:true,now:92000});
 s=coachReducer(s,{type:'away-goal',delta:1,ownGoalPlayerId:'p02',now:92000});
 s=coachReducer(s,{type:'toggle-clock',now:92000});
 const preview=liveMatchRows(s);
 s=coachReducer(s,{type:'finish',now:999000});
 assert.deepEqual(s.stats.filter(r=>r.matchId===LIVE_MATCH_ID),preview);
 assert.equal(s.opponentOwnGoals[LIVE_MATCH_ID],1);
 assert.equal(preview.find(r=>r.playerId==='p01').keeperMinutes,2);
 assert.equal(preview.find(r=>r.playerId==='p02').goals,0);
 assert.equal(preview.find(r=>r.playerId==='p10').present,false);
});


test('late absence settles live time, updates squad and keeper, and preserves history through reload',()=>{
 let s=createInitialState(); s=coachReducer(s,{type:'toggle-clock',now:1000});
 s=coachReducer(s,{type:'availability',matchId:LIVE_MATCH_ID,playerId:'p01',value:'unavailable',now:61000});
 assert.equal(s.live.played.p01.milliseconds,60000);
 assert.equal(s.live.field.includes('p01'),false);
 assert.equal(s.live.field.includes('p07'),false);
 assert.notEqual(s.live.keeperId,'p01');
 s=parseState(JSON.stringify(s));
 const unchanged=s; assert.equal(coachReducer(s,{type:'swap',out:s.live.field[0],in:'p01',now:61000}),unchanged);
 for(let i=1;i<=10;i++) s=coachReducer(s,{type:'availability',matchId:LIVE_MATCH_ID,playerId:`p${String(i).padStart(2,'0')}`,value:'unavailable',now:61000});
 assert.equal(s.live.field.length,0); assert.equal(s.live.keeperId,''); assert.equal(s.live.runningSince,null);
 assert.doesNotThrow(()=>parseState(JSON.stringify(s)));
 const paused=s; assert.equal(coachReducer(s,{type:'toggle-clock',now:71000}),paused);
 s=coachReducer(s,{type:'availability',matchId:LIVE_MATCH_ID,playerId:'p01',value:'available',now:71000});
 assert.deepEqual(s.live.field,['p01']); assert.equal(s.live.played.p01.milliseconds,60000);
});

 test("venue order changes presentation without changing team attribution",()=>{assert.deepEqual(scoreInVenueOrder({venue:"Thuis"},3,1),[3,1]);assert.deepEqual(scoreInVenueOrder({venue:"Uit"},3,1),[1,3]);});

test("field size persists, settles players before resizing, and preserves settings across match preparation",()=>{
 let s=createInitialState();s=coachReducer(s,{type:"toggle-clock",now:1000});s=coachReducer(s,{type:"set-field-size",fieldSize:8,now:61000});assert.equal(s.live.field.length,8);assert.equal(s.live.played.p01.milliseconds,60000);assert.equal(s.live.played.p08.milliseconds,0);s=parseState(JSON.stringify(s));assert.equal(s.team.fieldSize,8);s=coachReducer(s,{type:"set-periods",periods:4,now:61000});assert.equal(s.team.fieldSize,8);s=coachReducer(s,{type:"finish",now:61000});s=coachReducer(s,{type:"prepare-match",matchId:"m-028"});assert.equal(s.live.field.length,8);assert.equal(s.team.fieldSize,8);
});
test("rest timing survives reload and never accrues player minutes",()=>{
 let s=createInitialState();s=coachReducer(s,{type:"toggle-clock",now:1000});s=coachReducer(s,{type:"phase",now:61000});s=coachReducer(s,{type:"clock",now:91000});assert.equal(s.live.breakMs,30000);assert.equal(s.live.elapsedMs,60000);assert.equal(s.live.played.p01.milliseconds,60000);s=parseState(JSON.stringify(s));s=coachReducer(s,{type:"phase",now:121000});assert.equal(s.live.breakMs,60000);s=coachReducer(s,{type:"finish",now:151000});assert.equal(s.live.elapsedMs,90000);assert.equal(s.live.breakMs,60000);assert.equal(s.live.breakSince,null);
});

test("batch attendance applies all players atomically and reconciles playing time once",()=>{
 let s=createInitialState();s=coachReducer(s,{type:"toggle-clock",now:1000});const bad=coachReducer(s,{type:"availability-batch",matchId:LIVE_MATCH_ID,changes:{p01:"unavailable",unknown:"available"},now:61000});assert.equal(bad,s);
 s=coachReducer(s,{type:"availability-batch",matchId:LIVE_MATCH_ID,changes:{p01:"unavailable",p02:"unavailable",p07:"available"},now:61000});assert.equal(s.live.elapsedMs,60000);assert.equal(s.live.played.p01.milliseconds,60000);assert.equal(s.live.field.includes("p01"),false);assert.equal(s.live.field.includes("p02"),false);assert.equal(s.availability[LIVE_MATCH_ID].p07,"available");
 s=coachReducer(s,{type:"finish",now:61000});assert.equal(coachReducer(s,{type:"availability-batch",matchId:LIVE_MATCH_ID,changes:{p01:"available"}}),s);
});
