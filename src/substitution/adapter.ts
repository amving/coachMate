import { demoCatalog, settleLive, goalsOnlyMatch, MATCH_DURATION_MINUTES, type CoachState, type Match } from '../coach-state.ts';
import { validateMatchState } from './rules.ts';
import { validateProfile } from './profile.ts';
import type { MatchState, PlayerProfile } from './types.ts';

export function dateKey(match: Match): string | null {
  const months = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(match.date);
  const local = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(match.date);
  const dutch = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec(match.date.toLowerCase());
  const parts = iso ? [+iso[1],+iso[2],+iso[3]] : local ? [+local[3],+local[2],+local[1]] : dutch && months.includes(dutch[2]) ? [+dutch[3],months.indexOf(dutch[2])+1,+dutch[1]] : null;
  if (!parts) return null;
  const [y,m,d] = parts;
  const key = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10) === key ? `${key}T${match.time}` : null;
}
// A read-only snapshot of the real reducer. No clock, write or extra roster lives here.
export function adaptMatchState(source: CoachState, options: {now:number; revision?:number; profiles?:Record<string,PlayerProfile>}): MatchState {
  if (!Number.isSafeInteger(options.now)||options.now<0||options.revision!==undefined&&(!Number.isSafeInteger(options.revision)||options.revision<0)) throw new Error('Ongeldig moment of revisienummer.');
  const catalog = source.catalog ?? demoCatalog();
  const match = catalog.matches.find(m=>m.id===catalog.liveMatchId);
  if (!match) throw new Error('Geen actieve wedstrijd.');
  const warnings: string[] = [];
  const live = settleLive(source.live,options.now);
  const durationMs = MATCH_DURATION_MINUTES*60000;
  const keeperSchedule=live.preparation?.keeperSchedule?[...live.preparation.keeperSchedule]:undefined;
  // Explicit actual corrections govern the remaining current planned period;
  // retain future assignments and the original confirmed schedule in the audit.
  const scheduledPeriod=Math.min(live.periods-1,Math.floor(live.elapsedMs/(durationMs/live.periods)));
  const correction=live.keeperChanges?.at(-1);
  const corrected=Boolean(keeperSchedule&&correction&&correction.to===live.keeperId&&correction.atMs>=scheduledPeriod*durationMs/live.periods);
  if(keeperSchedule&&corrected)keeperSchedule[scheduledPeriod]=live.keeperId;
  const currentDate = dateKey(match);
  const history = catalog.matches.filter(m=>m.id!==match.id && !goalsOnlyMatch(source,m.id) && source.stats.some(r=>r.matchId===m.id) && currentDate && dateKey(m) && dateKey(m)! < currentDate)
    .sort((a,b)=>dateKey(b)!.localeCompare(dateKey(a)!) || a.id.localeCompare(b.id));
  if (!currentDate) warnings.push('UNKNOWN_MATCH_DATE');
  if (source.live.breakMs === undefined && live.elapsedMs>0) warnings.push('UNKNOWN_LEGACY_BREAK_TIME');
  const profiles = options.profiles ?? {};
  if (Object.keys(profiles).some(id=>!catalog.players.some(p=>p.id===id))) throw new Error('Spelersprofiel hoort niet bij dit teamseizoen.');
  const players = catalog.players.map(p=>{
    const profile = {...p.substitutionProfile,...profiles[p.id]};
    validateProfile(profile);
    const available = source.availability[match.id]?.[p.id] === 'available';
    const observed = live.occupancy ?? [];
    let consecutive = 0, cursor = live.elapsedMs;
    const onField = live.field.includes(p.id);
    for (let i=observed.length-1;i>=0;i--) {
      const s=observed[i];
      if(s.endMs!==cursor || s.field.includes(p.id)!==onField) break;
      consecutive+=s.endMs-s.startMs; cursor=s.startMs;
    }
    const previous = observed.find(s=>s.endMs===cursor);
    const knownStreak = live.elapsedMs===0 || cursor===0 || Boolean(previous&&previous.field.includes(p.id)!==onField);
    const entries = live.swaps.filter(s=>s.in===p.id), exits = live.swaps.filter(s=>s.out===p.id);
    let lastEntryMs=entries.at(-1)?.atMs??(entries.at(-1)?.minute===undefined?null:entries.at(-1)!.minute*60000);
    let lastExitMs=exits.at(-1)?.atMs??(exits.at(-1)?.minute===undefined?null:exits.at(-1)!.minute*60000);
    for (let i=1;i<observed.length;i++) {
      if (!observed[i-1].field.includes(p.id)&&observed[i].field.includes(p.id)) lastEntryMs=Math.max(lastEntryMs??0,observed[i].startMs);
      if (observed[i-1].field.includes(p.id)&&!observed[i].field.includes(p.id)) lastExitMs=Math.max(lastExitMs??0,observed[i].startMs);
    }
    return {id:p.id,available,position:p.position||null,
      // A current, coach-selected keeper is evidence; explicit false still wins.
      goalkeeperEligible:live.preparation ? live.preparation.keeperIds.includes(p.id)||corrected&&p.id===live.keeperId : profile.goalkeeperEligible ?? (p.position==='K'||p.id===live.keeperId),
      goalkeeperQuality:profile.goalkeeperQuality??null,goalkeeperPreference:profile.goalkeeperPreference??null,
      positionQualities:{...profile.positionQualities},
      availableFromMs:profile.availableFromMs??0,availableUntilMs:profile.availableUntilMs??Math.max(durationMs,live.elapsedMs),
      maxTotalMs:profile.maxMinutes===undefined?Math.max(durationMs,live.elapsedMs):profile.maxMinutes*60000,
      playedMs:live.played[p.id].milliseconds,keeperMs:live.played[p.id].keeperMilliseconds,
      consecutivePlayMs:knownStreak?(onField?consecutive:0):null,consecutiveBenchMs:knownStreak?(onField?0:consecutive):null,
      substitutionCount:entries.length+exits.length,lastEntryMs,lastExitMs,
      history:history.flatMap(m=>{
        const row=source.stats.find(r=>r.matchId===m.id&&r.playerId===p.id);
        return row?.present?[{matchId:m.id,playedMs:row.minutesKnown===false?null:row.minutes*60000,targetMs:row.targetMinutes===undefined?null:row.targetMinutes*60000,keeperMs:row.keeperMinutesKnown===false?null:row.keeperMinutes*60000}]:[];
      }),
    };
  }).sort((a,b)=>a.id.localeCompare(b.id));
  if (players.some(p=>source.availability[match.id]?.[p.id]==='pending')) warnings.push('PENDING_AVAILABILITY_EXCLUDED');
  if (live.elapsedMs>0 && !live.occupancy?.length) warnings.push('UNKNOWN_LEGACY_ROTATION');
  const startingLineup=live.elapsedMs===0?{field:[...live.field],keeperId:live.keeperId}:live.occupancy?.[0]?.startMs===0?{field:[...live.occupancy[0].field],keeperId:live.occupancy[0].keeperId}:null;
  const executedSubstitutions=live.swaps.map(s=>{
    const exact=live.occupancy?.find((interval,i,array)=>i>0&&Math.floor(interval.startMs/60000)===s.minute&&array[i-1].field.includes(s.out)&&!interval.field.includes(s.out)&&!array[i-1].field.includes(s.in)&&interval.field.includes(s.in));
    return {out:s.out,in:s.in,atMs:s.atMs??exact?.startMs??s.minute*60000,precision:s.atMs!==undefined||exact?'millisecond' as const:'minute' as const};
  });
  if (players.some(p=>p.history.some(h=>h.targetMs===null))) warnings.push('UNKNOWN_HISTORICAL_TARGETS');
  const state: MatchState = {teamSeasonId:catalog.teamSeasonId,matchId:match.id,stateVersion:'',archived:catalog.archived,
    phase:live.phase,running:live.runningSince!==null,currentPeriod:live.period,actualPeriodTimesMs:{...live.periodTimes},
    clock:{matchMs:live.elapsedMs,breakMs:source.live.breakMs===undefined&&live.elapsedMs>0?null:live.breakMs??0,elapsedRealMs:source.live.breakMs===undefined&&live.elapsedMs>0?null:live.elapsedMs+(live.breakMs??0)},
    rules:{...(keeperSchedule?{keeperSchedule}:{}),fieldSize:source.team.fieldSize??6,durationMs,periodBoundariesMs:Array.from({length:live.periods},(_,i)=>durationMs*(i+1)/live.periods),...(live.preparation&&live.elapsedMs===0&&!live.swaps.length&&live.keeperId===live.preparation.startingKeeperId?{startingKeeperId:live.preparation.startingKeeperId,...(live.preparation.startingField?{startingField:[...live.preparation.startingField]}:{})}:{}),...(live.preparation?.cadence&&live.preparation.cadence!=='auto'?{rotationIntervalMs:live.preparation.cadence==='period'?durationMs/live.periods:live.preparation.cadence==='10-min'?600000:300000}:{})},
    field:[...live.field],bench:players.filter(p=>p.available&&!live.field.includes(p.id)).map(p=>p.id),keeperId:live.keeperId,startingLineup,executedSubstitutions,
    players,observedIntervals:structuredClone(live.occupancy??[]),warnings};
  // Exact canonical token, not a lossy hash: changes at the same persisted revision count.
  state.stateVersion=JSON.stringify([options.revision??0,state,live,source.team.substitutionPolicy??null]);
  const result=validateMatchState(state);
  if (!result.valid) throw new Error(result.issues.map(i=>`${i.code}: ${i.detail}`).join('; '));
  return state;
}
