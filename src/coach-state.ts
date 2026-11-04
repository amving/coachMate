import {validateFormationCatalog,validateFormations,validatePreparedFormation,type Formation} from './formations.ts';
import { normalizePolicy, revisePolicy, type SubstitutionPolicy } from './substitution/policy.ts';
import type { Occupancy } from './substitution/types.ts';
import type { PlayerProfile } from './substitution/types.ts';
import { validateProfile } from './substitution/profile.ts';
import { reduceAdvice, validateAdviceStorage, adviceFor, type AdviceSession, type AdviceAction } from './substitution/recommendations.ts';

export type Tab = "dashboard" | "live" | "availability" | "stats";
export type Availability = "available" | "unavailable" | "pending";
export type Phase = "Spelen" | "Rust" | "Einde";
export type Periods = 2 | 4;
export type FieldSize = 6 | 8 | 11;

export type Player = { substitutionProfile?: PlayerProfile; id: string; number: number; name: string; shortName: string; parent: string; parentName?: string; parentEmail?: string; parentPhone?: string; position: string };
export type Match = { id: string; pool: string; date: string; shortDate: string; time: string; opponent: string; venue: "Thuis" | "Uit"; availabilityRound: number };
export type MatchStat = { targetMinutes?: number; minutesKnown?: boolean; keeperMinutesKnown?: boolean; matchId: string; playerId: string; present: boolean; minutes: number; keeperMinutes: number; goals: number };
export type LiveGoal = { playerId: string | null; minute: number | null; ownGoal: boolean; sequence?: number; scoreFor?: number; scoreAgainst?: number };

export const STORAGE_KEY = "coachmate:v1";
export const LIVE_MATCH_ID = "m-021";
export const MATCH_DURATION_MINUTES = 50;
export type AvailabilityMap = Record<string, Record<string, Availability>>;
export type LiveMatch = {
  preparation?: { keeperSchedule?:string[]; formation?:number[]; confirmedAt:number; presentIds:string[]; keeperIds:string[]; startingKeeperId:string; cadence?:'period'|'5-min'|'10-min'|'auto'; startingField?:string[]; startingPositions?:Record<string,'V'|'M'|'A'> };
  keeperChanges?: {from:string;to:string;atMs:number}[];
  adviceEpoch?: number;
  occupancy?: Occupancy[];
  phase: Phase;
  periods: Periods;
  period: number;
  elapsedMs: number;
  periodTimes?: Record<string, number>;
  breakMs?: number;
  breakSince?: number | null;
  runningSince: number | null;
  keeperId: string;
  field: string[];
  played: Record<string, { milliseconds: number; keeperMilliseconds: number }>;
  goals: LiveGoal[];
  awayGoals: LiveGoal[];
  swaps: { out: string; in: string; minute: number; atMs?: number }[];
};
export type Catalog = { clubId?: string; clubName?: string; seasonId: string; seasonName: string; teamSeasonId: string; teamName: string; archived: boolean; players: Player[]; matches: Match[]; liveMatchId: string };
export const demoCatalog = (): Catalog => ({ seasonId: "2026-2027", seasonName: "2026/2027", teamSeasonId: "demo-jo10-1", teamName: "JO10-1", archived: false, players, matches, liveMatchId: LIVE_MATCH_ID });
export type CoachState = {
  formUpdates?: Record<string,{time:string;manual?:boolean}>;
  assistant?: Record<string, AdviceSession>;
  committedBatches?: string[];
  catalog?: Catalog;
  matchResults?: Record<string, { goalsFor: number; goalsAgainst: number; duration: number; sourceHash: string }>;
  liveArchive?: Record<string, LiveMatch>;
  version: 2;
  team: { fullStatsFromRound?:number; formationCatalog?:Formation[]; formations?:Formation[]; periods: Periods; fieldSize?: FieldSize; substitutionPolicy?: SubstitutionPolicy; substitutionPolicyHistory?: SubstitutionPolicy[] };
  opponentOwnGoals: Record<string, number>;
  availability: AvailabilityMap;
  rounds: AvailabilityMap[];
  currentRound?: number;
  stats: MatchStat[];
  live: LiveMatch;
};
export type Action = AdviceAction
  | {type:"set-formations";formations:Formation[];replaceDefaults?:true}
  | { type:'set-substitution-profiles'; profiles:Record<string,PlayerProfile> }
  | { type: "set-substitution-policy"; expectedVersion: number; policy?: SubstitutionPolicy }
  | { type: "prepare-match"; matchId: string }
  | { type: "clock"; now: number }
  | { type: "toggle-clock"; now: number }
  | { type: "phase"; now: number }
  | { type: "finish"; now: number }
  | { type: "set-field-size"; fieldSize: FieldSize; now: number }
  | { type: "set-periods"; periods: Periods; now: number }
  | { type: "set-period"; period: number; now: number }
  | { type: "goal"; playerId: string | null; ownGoal?: boolean; now: number; minute?:number; allowOffField?:boolean; unknownScorer?:boolean }
  | { type: "away-goal"; delta: 1 | -1; ownGoalPlayerId?: string; now?: number; minute?:number; allowOffField?:boolean }
  | { type: "edit-goal"; side:"ours"|"theirs"; index:number; expected:string; matchId:string; playerId:string|null; minute:number|null }
  | { type: "undo-goal" }
  | { type: "keeper"; playerId: string; now: number }
  | { type: "swap"; out: string; in: string; now: number }
  | { type: "availability-batch"; matchId: string; changes: Record<string, Availability>; now?: number }
  | { type: "availability"; matchId: string; playerId: string; value: Availability; now?: number }
  | { type: "new-round" | "add-matches"; matches?: Match[] }
  | { type: "save-round-matches"; round:number; matches:Match[] }
  | { type: "save-stats"; matchId: string; rows: MatchStat[]; opponentOwnGoals?: number };

export const players: Player[] = [
  { id: "p01", number: 1, name: "Daan de Vries", shortName: "Daan", parent: "Sanne de Vries", position: "K" },
  { id: "p02", number: 2, name: "Mats Bakker", shortName: "Mats", parent: "Mark Bakker", position: "V" },
  { id: "p03", number: 3, name: "Levi Jansen", shortName: "Levi", parent: "Nora Jansen", position: "V" },
  { id: "p04", number: 4, name: "Siem van Dijk", shortName: "Siem", parent: "Lotte van Dijk", position: "M" },
  { id: "p05", number: 5, name: "Finn Meijer", shortName: "Finn", parent: "Joris Meijer", position: "V" },
  { id: "p06", number: 6, name: "Ties Post", shortName: "Ties", parent: "Eva Post", position: "M" },
  { id: "p07", number: 7, name: "Noah de Groot", shortName: "Noah", parent: "Iris de Groot", position: "M" },
  { id: "p08", number: 8, name: "Lucas Mulder", shortName: "Lucas", parent: "Peter Mulder", position: "A" },
  { id: "p09", number: 9, name: "Jayden Boer", shortName: "Jayden", parent: "Kim Boer", position: "A" },
  { id: "p10", number: 10, name: "Milan Smit", shortName: "Milan", parent: "Romy Smit", position: "A" },
];

export const matches: Match[] = [
  { id: "m-014", pool: "P02", date: "14 september 2026", shortDate: "14 sep", time: "10:00", opponent: "FC Waterwijk", venue: "Thuis", availabilityRound: 1 },
  { id: "m-021", pool: "P02", date: "21 september 2026", shortDate: "21 sep", time: "09:30", opponent: "SV De Meer", venue: "Uit", availabilityRound: 1 },
  { id: "m-028", pool: "P02", date: "28 september 2026", shortDate: "28 sep", time: "11:00", opponent: "ASC Nieuwland", venue: "Thuis", availabilityRound: 1 },
  { id: "m-005", pool: "P01", date: "5 september 2026", shortDate: "5 sep", time: "10:30", opponent: "VV Buitenveldert", venue: "Uit", availabilityRound: 1 },
];

export const initialAvailability: Record<string, Record<string, Availability>> = {
  "m-014": { p01: "available", p02: "available", p03: "available", p04: "available", p05: "available", p06: "available", p07: "available", p08: "available", p09: "unavailable", p10: "available" },
  "m-021": { p01: "available", p02: "available", p03: "pending", p04: "available", p05: "pending", p06: "available", p07: "unavailable", p08: "available", p09: "available", p10: "pending" },
  "m-028": { p01: "available", p02: "pending", p03: "available", p04: "pending", p05: "available", p06: "available", p07: "available", p08: "available", p09: "pending", p10: "available" },
  "m-005": { p01: "available", p02: "available", p03: "available", p04: "available", p05: "unavailable", p06: "available", p07: "available", p08: "available", p09: "available", p10: "available" },
};

export const initialStats: MatchStat[] = [
  { matchId: "m-005", playerId: "p01", present: true, minutes: 42, keeperMinutes: 42, goals: 0 }, { matchId: "m-005", playerId: "p02", present: true, minutes: 42, keeperMinutes: 0, goals: 1 }, { matchId: "m-005", playerId: "p03", present: true, minutes: 42, keeperMinutes: 0, goals: 0 }, { matchId: "m-005", playerId: "p04", present: true, minutes: 30, keeperMinutes: 0, goals: 1 }, { matchId: "m-005", playerId: "p05", present: false, minutes: 0, keeperMinutes: 0, goals: 0 }, { matchId: "m-005", playerId: "p06", present: true, minutes: 24, keeperMinutes: 0, goals: 0 }, { matchId: "m-005", playerId: "p07", present: true, minutes: 36, keeperMinutes: 0, goals: 0 }, { matchId: "m-005", playerId: "p08", present: true, minutes: 30, keeperMinutes: 0, goals: 1 }, { matchId: "m-005", playerId: "p09", present: true, minutes: 36, keeperMinutes: 0, goals: 0 }, { matchId: "m-005", playerId: "p10", present: true, minutes: 24, keeperMinutes: 0, goals: 0 },
  { matchId: "m-014", playerId: "p01", present: true, minutes: 42, keeperMinutes: 24, goals: 1 }, { matchId: "m-014", playerId: "p02", present: true, minutes: 42, keeperMinutes: 18, goals: 0 }, { matchId: "m-014", playerId: "p03", present: true, minutes: 42, keeperMinutes: 0, goals: 0 }, { matchId: "m-014", playerId: "p04", present: true, minutes: 36, keeperMinutes: 0, goals: 1 }, { matchId: "m-014", playerId: "p05", present: true, minutes: 42, keeperMinutes: 0, goals: 0 }, { matchId: "m-014", playerId: "p06", present: true, minutes: 30, keeperMinutes: 0, goals: 0 }, { matchId: "m-014", playerId: "p07", present: true, minutes: 30, keeperMinutes: 0, goals: 0 }, { matchId: "m-014", playerId: "p08", present: true, minutes: 36, keeperMinutes: 0, goals: 0 }, { matchId: "m-014", playerId: "p09", present: true, minutes: 24, keeperMinutes: 0, goals: 0 }, { matchId: "m-014", playerId: "p10", present: true, minutes: 30, keeperMinutes: 0, goals: 0 },
];

export function createInitialState(): CoachState {
  return {
    version: 2,
    team: { periods: 2 },
    opponentOwnGoals: {},
    availability: structuredClone(initialAvailability),
    rounds: [],
    stats: structuredClone(initialStats),
    live: {
      phase: "Spelen", period: 1, periods: 2, elapsedMs: 0, breakMs: 0, breakSince: null, runningSince: null, keeperId: "p01",
      field: ["p01", "p02", "p03", "p04", "p05", "p06"],
      played: Object.fromEntries(players.map(p => [p.id, { milliseconds: 0, keeperMilliseconds: 0 }])),
      goals: [], awayGoals: [], swaps: [], occupancy: [],
    },
  };
}

export function periodLabel(live: LiveMatch): string {
  if (live.phase === "Einde") return "Einde";
  const unit = live.periods === 2 ? "helft" : "kwart";
  return live.phase === "Rust" ? `Rust na ${live.period}e ${unit}` : `${live.period}e ${unit}`;
}

// Storage always uses team-relative goals; presentation always puts the home team first.
export function scoreInVenueOrder(match: Pick<Match,"venue">, goalsFor: number, goalsAgainst: number): [number,number] {
  return match.venue === "Thuis" ? [goalsFor,goalsAgainst] : [goalsAgainst,goalsFor];
}

/** Read known final scores from both historical imports and recorded Live matches. */
export function recordedMatchResult(state:CoachState,matchId:string):{goalsFor:number;goalsAgainst:number}|null {
  const saved=state.matchResults?.[matchId];
  if(saved)return {goalsFor:saved.goalsFor,goalsAgainst:saved.goalsAgainst};
  const liveId=(state.catalog??demoCatalog()).liveMatchId;
  const recorded=state.liveArchive?.[matchId]??(matchId===liveId?state.live:undefined);
  return recorded?.phase==='Einde'?{goalsFor:recorded.goals.length,goalsAgainst:recorded.awayGoals.length}:null;
}

export function totalGoals(state: CoachState): number {
  return state.stats.reduce((sum, row) => sum + row.goals, 0)
    + Object.values(state.opponentOwnGoals).reduce((sum, count) => sum + count, 0)
    + [...new Set(state.stats.map(r=>r.matchId))].reduce((sum,id)=>sum+(state.liveArchive?.[id]?.goals.filter(g=>!g.ownGoal&&g.playerId===null).length??0),0);
}

// The coach's historical coverage decision belongs to this exact team season.
// Other teams and future seasons retain their original statistics coverage.
export function fullStatsFromRound(state: CoachState): number {
  return state.team.fullStatsFromRound ?? (state.catalog?.teamSeasonId === 'hfc-edo-jo10-2-2026-2027' ? 2 : 1);
}
export function goalsOnlyMatch(state: CoachState, matchId: string): boolean {
  const match = (state.catalog ?? demoCatalog()).matches.find(m => m.id === matchId);
  return Boolean(match && match.availabilityRound < fullStatsFromRound(state));
}
export function individualStatsRows(state: CoachState): MatchStat[] {
  return state.stats.filter(row => !goalsOnlyMatch(state, row.matchId));
}
// Count a processed match once, never sum its players' minutes or infer duration
// from the keeper. Historical entries use 50; tracked matches retain actual time.
export function teamMatchMinutes(state: CoachState): number {
  const liveId = (state.catalog ?? demoCatalog()).liveMatchId;
  return [...new Set(state.stats.map(row => row.matchId))].reduce((sum, id) => {
    const tracked = state.liveArchive?.[id] ?? (id === liveId && state.live.phase === 'Einde' ? state.live : undefined);
    return sum + (goalsOnlyMatch(state, id) ? MATCH_DURATION_MINUTES : tracked ? tracked.elapsedMs / 60000 : state.matchResults?.[id]?.duration ?? MATCH_DURATION_MINUTES);
  }, 0);
}

// Account for wall-clock time, including background tabs and page reloads.
export function settleLive(live: LiveMatch, now: number): LiveMatch {
  if (live.phase === "Rust" && live.breakSince != null) return {...live, breakMs: (live.breakMs ?? 0) + Math.max(0,now-live.breakSince), breakSince: Math.max(now,live.breakSince)};
  if (live.runningSince === null) return live;
  const delta = Math.min(Math.max(0, now - live.runningSince), Math.max(0, 120 * 60000 - live.elapsedMs));
  const occupancy = [...(live.occupancy ?? [])];
  if (delta > 0) {
    const last = occupancy.at(-1);
    if (last && last.endMs === live.elapsedMs && last.keeperId === live.keeperId && last.field.length === live.field.length && last.field.every(id => live.field.includes(id))) occupancy[occupancy.length-1] = {...last,endMs:live.elapsedMs+delta};
    else occupancy.push({startMs:live.elapsedMs,endMs:live.elapsedMs+delta,field:[...live.field],keeperId:live.keeperId});
  }
  return {
    ...live, periodTimes: { ...live.periodTimes, [`${live.periods}:${live.period}`]: (live.periodTimes?.[`${live.periods}:${live.period}`] ?? 0) + delta }, elapsedMs: live.elapsedMs + delta, runningSince: live.elapsedMs + delta >= 120 * 60000 ? null : Math.max(now, live.runningSince),
    occupancy, played: Object.fromEntries(Object.entries(live.played).map(([id, time]) => [id, {
      milliseconds: time.milliseconds + (live.field.includes(id) ? delta : 0),
      keeperMilliseconds: time.keeperMilliseconds + (live.keeperId === id ? delta : 0),
    }])),
  };
}

export function matchRows(state: CoachState, matchId: string): MatchStat[] {
  const { players } = state.catalog ?? demoCatalog();
  return players.map(p => ({ ...(state.stats.find(row => row.matchId === matchId && row.playerId === p.id)
    ?? { matchId, playerId: p.id, present: state.availability[matchId]?.[p.id] === "available", minutes: 0, keeperMinutes: 0, goals: 0, ...(goalsOnlyMatch(state, matchId) ? {minutesKnown:false,keeperMinutesKnown:false} : {}) }) }));
}

// Manually entered historical matches use four quarters of 12.5 minutes.
export function statsMinuteLimit(state: CoachState, matchId: string): number {
  const liveId = (state.catalog ?? demoCatalog()).liveMatchId;
  return state.liveArchive?.[matchId] || matchId === liveId ? 120 : MATCH_DURATION_MINUTES;
}

export function validateRows(rows: MatchStat[], matchId: string, catalog = demoCatalog()): boolean {
  const { players, matches } = catalog;
  return matches.some(m => m.id === matchId) && rows.length === players.length
    && new Set(rows.map(r => r.playerId)).size === players.length
    && rows.every(row => players.some(p => p.id === row.playerId) && row.matchId === matchId
      && typeof row.present === "boolean" && [row.minutes, row.keeperMinutes].every(n => Number.isFinite(n) && n >= 0 && Number.isInteger(n * 2))
      // Integer milliseconds divided by 60000 can round-trip a fraction of an
      // ULP away from an integer. Accept only that representation error.
      && (row.targetMinutes === undefined || Number.isFinite(row.targetMinutes) && row.targetMinutes >= 0 && row.targetMinutes <= 120 && Math.abs(row.targetMinutes*60000-Math.round(row.targetMinutes*60000))<=Number.EPSILON*Math.max(1,row.targetMinutes*60000)*2)
      && Number.isInteger(row.goals) && row.goals >= 0
      && [row.minutesKnown, row.keeperMinutesKnown].every(v => v === undefined || typeof v === "boolean")
      && (row.minutesKnown !== false || row.minutes === 0) && (row.keeperMinutesKnown !== false || row.keeperMinutes === 0)
      && row.minutes <= 120 && row.keeperMinutes <= 120 && (row.minutesKnown === false || row.keeperMinutes <= row.minutes) && row.goals <= 99
      && (row.present || (row.minutes === 0 && row.keeperMinutes === 0 && row.goals === 0)));
}

export function liveMatchRows(state: CoachState, live: LiveMatch = state.live): MatchStat[] {
  const { players, liveMatchId: LIVE_MATCH_ID } = state.catalog ?? demoCatalog();
  return players.map(p => ({
    matchId: LIVE_MATCH_ID, playerId: p.id,
    ...(adviceFor(state)?.targetsMs?.[p.id]!==undefined?{targetMinutes:adviceFor(state)!.targetsMs![p.id]/60000}:{}),
    present: live.played[p.id].milliseconds > 0 || live.field.includes(p.id) || live.goals.some(g => g.playerId === p.id) || live.awayGoals.some(g => g.playerId === p.id),
    minutes: Math.min(120, Math.round(live.played[p.id].milliseconds / 60000)),
    keeperMinutes: Math.min(120, Math.round(live.played[p.id].keeperMilliseconds / 60000)),
    goals: live.goals.filter(g => !g.ownGoal && g.playerId === p.id).length,
  }));
}

function goalSnapshot(live: LiveMatch, side: "for" | "against") {
  return { sequence: Math.max(0, ...[...live.goals, ...live.awayGoals].map(g => g.sequence ?? 0)) + 1, scoreFor: live.goals.length + (side === "for" ? 1 : 0), scoreAgainst: live.awayGoals.length + (side === "against" ? 1 : 0) };
}

function complete(state: CoachState, now: number): CoachState {
  const { players, liveMatchId: LIVE_MATCH_ID } = state.catalog ?? demoCatalog();
  if (state.live.phase === "Einde") return state;
  const live = { ...settleLive(state.live, now), phase: "Einde" as Phase, runningSince: null, breakSince: null };
  const rows = liveMatchRows(state, live);
  return { ...state, live, liveArchive: { ...state.liveArchive, [LIVE_MATCH_ID]: live }, stats: [...state.stats.filter(r => r.matchId !== LIVE_MATCH_ID), ...rows],
    opponentOwnGoals: { ...state.opponentOwnGoals, [LIVE_MATCH_ID]: live.goals.filter(g => g.ownGoal).length } };
}

// Reconcile availability without discarding any already tracked playing time.
export function syncLiveSquad(state: CoachState, now?: number): CoachState {
  const catalog = state.catalog ?? demoCatalog();
  if (catalog.archived || state.live.phase === "Einde") return state;
  const eligible = catalog.players.filter(p => state.availability[catalog.liveMatchId]?.[p.id] !== "unavailable").map(p=>p.id);
  const field = [...state.live.field.filter(id=>eligible.includes(id)), ...eligible.filter(id=>!state.live.field.includes(id))].slice(0,state.team.fieldSize ?? 6);
  if (field.join() === state.live.field.join()) return state;
  const live = now === undefined ? state.live : settleLive(state.live, now);
  return { ...state, live: {...live, field, keeperId: field.includes(live.keeperId) ? live.keeperId : field[0] ?? "", runningSince: field.length ? live.runningSince : null} };
}

function reduceCoachState(state: CoachState, action: Action): CoachState {
  const { players, matches, liveMatchId: LIVE_MATCH_ID, archived } = state.catalog ?? demoCatalog();
  if (archived && action.type !== "clock") return state;
  const live = state.live;
  switch (action.type) {
    case 'set-formations': {
      if(action.replaceDefaults!==undefined&&action.replaceDefaults!==true)return state;
      try{if(action.replaceDefaults)validateFormationCatalog(action.formations);else validateFormations(action.formations);}catch{return state;}
      return {...state,team:{...state.team,...(action.replaceDefaults?{formationCatalog:structuredClone(action.formations)}:{formations:structuredClone(action.formations)})}};
    }
    case 'set-substitution-profiles': {
      if(!action.profiles||typeof action.profiles!=='object'||Array.isArray(action.profiles)||!Object.keys(action.profiles).length||Object.keys(action.profiles).some(id=>!players.some(p=>p.id===id)))return state;
      try { Object.values(action.profiles).forEach(validateProfile); }catch{return state;}
      const catalog=state.catalog??demoCatalog();
      return {...state,catalog:{...catalog,players:catalog.players.map(p=>action.profiles[p.id]!==undefined?{...p,substitutionProfile:structuredClone(action.profiles[p.id])}:p)}};
    }
    case 'assistant-prepare':case 'assistant-plan':case 'assistant-decision':case 'assistant-adjust':case 'assistant-execute':
      try { return reduceAdvice(state,action); } catch { return state; }
    case "set-substitution-policy": {
      if (action.expectedVersion !== (state.team.substitutionPolicy?.version ?? 0)) return state;
      try {
        const policy = revisePolicy(state.team.substitutionPolicy, action.policy);
        return {...state,team:{...state.team,substitutionPolicy:policy,substitutionPolicyHistory:[...(state.team.substitutionPolicyHistory ?? []),policy]}};
      } catch { return state; }
    }
    case "prepare-match": {
      if (live.phase !== "Einde" && LIVE_MATCH_ID || !players.length || action.matchId === LIVE_MATCH_ID || !matches.some(m => m.id === action.matchId) || state.stats.some(r => r.matchId === action.matchId)) return state;
      const catalog = { ...(state.catalog ?? demoCatalog()), liveMatchId: action.matchId };
      return syncLiveSquad({ ...state, catalog, live: createTeamState(catalog, state.team.periods, state.team.fieldSize ?? 6).live });
    }
    case "set-field-size":
      if (![6,8,11].includes(action.fieldSize)) return state;
      return syncLiveSquad({...state,team:{...state.team,fieldSize:action.fieldSize}},action.now);
    case "set-periods": {
      if (![2, 4].includes(action.periods) || action.periods === state.team.periods) return state;
      if (live.phase === "Einde") return { ...state, team: { ...state.team, periods: action.periods } };
      const period = Math.floor((live.period - 1) / live.periods * action.periods) + 1;
      // Quarter assignments cannot silently become half assignments. Their
      // original values remain in the advice journal and scoped preparation draft.
      const preparation=live.preparation?{...live.preparation,keeperSchedule:undefined}:undefined;
      return { ...state, team: { ...state.team, periods: action.periods }, live: { ...settleLive(live, action.now), breakSince: null,
        ...(preparation?{preparation}:{}),periods: action.periods, period, phase: "Spelen", runningSince: null } };
    }
    case "set-period":
      if (live.phase === "Einde" || !Number.isInteger(action.period) || action.period < 1 || action.period > live.periods) return state;
      return { ...state, live: { ...settleLive(live, action.now), period: action.period, phase: "Spelen", runningSince: null, breakSince: null } };
    case "clock": return live.runningSince === null && live.breakSince == null ? state : { ...state, live: settleLive(live, action.now) };
    case "toggle-clock":
      if (!live.field.length || live.phase === "Rust" || live.phase === "Einde" || live.elapsedMs >= 120 * 60000) return state;
      return { ...state, live: { ...settleLive(live, action.now), runningSince: live.runningSince === null ? action.now : null } };
    case "phase":
      if (live.phase === "Einde") return state;
      if (live.period === live.periods) return complete(state, action.now);
      return { ...state, live: { ...settleLive(live, action.now),
        phase: live.phase === "Rust" ? "Spelen" : "Rust",
        breakSince: live.phase === "Rust" ? null : action.now,
        period: live.phase === "Rust" ? live.period + 1 : live.period,
        runningSince: live.phase === "Rust" && live.field.length > 0 && live.elapsedMs < 120 * 60000 ? action.now : null } };
    case "finish": return complete(state, action.now);
    case "goal": {
      const ownGoal = action.ownGoal === true;
      const scorerValid=action.playerId===null? action.unknownScorer===true : players.some(p=>p.id===action.playerId)&&(live.field.includes(action.playerId)||action.allowOffField===true);
      if (live.phase === "Einde" || (ownGoal ? action.playerId !== null : !scorerValid)
        || live.goals.filter(g => g.playerId === action.playerId).length >= 99) return state;
      const settled = settleLive(live, action.now);
      const minute=action.minute??Math.floor(settled.elapsedMs/60000);
      if(!Number.isInteger(minute)||minute<0||minute>Math.floor(settled.elapsedMs/60000))return state;
      return { ...state, live: { ...settled, goals: [...live.goals, { ...goalSnapshot(live, "for"), playerId: action.playerId, ownGoal, minute }] } };
    }
    case "undo-goal": return live.phase === "Einde" ? state : { ...state, live: { ...live, goals: live.goals.slice(0, -1) } };
    case "away-goal": {
      if (live.phase === "Einde") return state;
      if (action.delta === -1) return { ...state, live: { ...live, awayGoals: live.awayGoals.slice(0, -1) } };
      if (live.awayGoals.length >= 99 || (action.ownGoalPlayerId !== undefined && (!players.some(p=>p.id===action.ownGoalPlayerId)||!live.field.includes(action.ownGoalPlayerId)&&action.allowOffField!==true))) return state;
      const settled = action.now === undefined ? live : settleLive(live, action.now);
      const minute=action.minute??Math.floor(settled.elapsedMs/60000);
      if(!Number.isInteger(minute)||minute<0||minute>Math.floor(settled.elapsedMs/60000))return state;
      return { ...state, live: { ...settled, awayGoals: [...live.awayGoals, {
        ...goalSnapshot(live, "against"), playerId: action.ownGoalPlayerId ?? null, ownGoal: action.ownGoalPlayerId !== undefined, minute,
      }] } };
    }
    case "edit-goal": {
      if(state.catalog?.archived||action.matchId!==LIVE_MATCH_ID||!['ours','theirs'].includes(action.side)||!Number.isInteger(action.index))return state;
      const key=action.side==='ours'?'goals':'awayGoals',event=live[key][action.index];
      if(!event||JSON.stringify(event)!==action.expected||!(action.minute===null||Number.isInteger(action.minute)&&action.minute>=0&&action.minute<=Math.floor(live.elapsedMs/60000)))return state;
      const personal=action.side==='ours'?!event.ownGoal:event.ownGoal;
      if(personal?!(action.playerId===null&&!event.ownGoal||players.some(p=>p.id===action.playerId)):action.playerId!==null)return state;
      if(action.side==='ours'&&live.goals.filter((g,i)=>i!==action.index&&g.playerId===action.playerId).length>=99)return state;
      const corrected={...live,[key]:live[key].map((g,i)=>i===action.index?{...g,playerId:action.playerId,minute:action.minute}:g)};
      return {...state,live:corrected,...(live.phase==='Einde'?{liveArchive:{...state.liveArchive,[LIVE_MATCH_ID]:corrected},stats:state.stats.map(row=>row.matchId===LIVE_MATCH_ID?{...row,goals:corrected.goals.filter(g=>!g.ownGoal&&g.playerId===row.playerId).length,present:row.present||corrected.goals.some(g=>g.playerId===row.playerId)||corrected.awayGoals.some(g=>g.playerId===row.playerId)}:row)}:{})};
    }
    case "keeper":
      if (live.phase === "Einde" || !live.field.includes(action.playerId)) return state;
      return { ...state, live: { ...settleLive(live, action.now), keeperId: action.playerId } };
    case "swap": {
      if (live.phase === "Einde" || !live.field.includes(action.out) || live.field.includes(action.in) || !players.some(p => p.id === action.in) || state.availability[LIVE_MATCH_ID]?.[action.in] === "unavailable") return state;
      const settled = settleLive(live, action.now);
      return { ...state, live: { ...settled, field: live.field.map(id => id === action.out ? action.in : id),
        keeperId: live.keeperId === action.out ? action.in : live.keeperId,
        swaps: [...live.swaps, { out: action.out, in: action.in, minute: Math.floor(settled.elapsedMs / 60000), atMs: settled.elapsedMs }],
      } };
    }
    case "availability-batch": {
      if (state.stats.some(r=>r.matchId===action.matchId) || !matches.some(m=>m.id===action.matchId) || !action.changes || typeof action.changes!=="object" || Array.isArray(action.changes)) return state;
      const changes=Object.entries(action.changes);
      if (!changes.length || !changes.every(([id,value])=>players.some(p=>p.id===id) && ["available","unavailable","pending"].includes(value))) return state;
      return syncLiveSquad({...state,availability:{...state.availability,[action.matchId]:{...state.availability[action.matchId],...action.changes}}},action.now);
    }
    case "availability":
      if (state.stats.some(r => r.matchId === action.matchId)) return state;
      if (!matches.some(m => m.id === action.matchId) || !players.some(p => p.id === action.playerId) || !["available", "unavailable", "pending"].includes(action.value)) return state;
      return syncLiveSquad({ ...state, availability: { ...state.availability, [action.matchId]: { ...state.availability[action.matchId], [action.playerId]: action.value } } }, action.now);
    case "save-round-matches": {
      if(!Number.isInteger(action.round)||action.round<1||action.round>currentRound(state)+1||!Array.isArray(action.matches)||!action.matches.length||action.matches.some(m=>!m||typeof m!=='object'))return state;
      const supplied=action.matches,existing=matches.filter(m=>m.availabilityRound===action.round);
      if(new Set(supplied.map(m=>m.id)).size!==supplied.length||existing.some(m=>!supplied.some(row=>row.id===m.id))||supplied.some(m=>m.availabilityRound!==action.round||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||!Number.isFinite(Date.parse(m.date+'T12:00:00Z'))||new Date(m.date+'T12:00:00Z').toISOString().slice(0,10)!==m.date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time)||matches.some(old=>old.id===m.id&&old.availabilityRound!==action.round)))return state;
      if(supplied.some(m=>{const old=matches.find(row=>row.id===m.id);return old&&(state.stats.some(r=>r.matchId===m.id)||m.id===LIVE_MATCH_ID&&(live.elapsedMs>0||live.runningSince!==null))&&['opponent','date','shortDate','time','venue','pool'].some(key=>old[key as keyof Match]!==m[key as keyof Match]);}))return state;
      const catalog={...(state.catalog??demoCatalog()),matches:[...matches.map(m=>supplied.find(row=>row.id===m.id)??m),...supplied.filter(m=>!matches.some(old=>old.id===m.id))]};
      try{validateCatalog(catalog);}catch{return state;}
      return {...state,catalog,currentRound:Math.max(currentRound(state),action.round),availability:{...state.availability,...Object.fromEntries(supplied.filter(m=>!matches.some(old=>old.id===m.id)).map(m=>[m.id,Object.fromEntries(players.map(p=>[p.id,'pending' as Availability]))]))}};
    }
    case "new-round":
    case "add-matches": {
      const round = currentRound(state) + (action.type === "new-round" ? 1 : 0);
      if (!Array.isArray(action.matches) || !action.matches.length || action.matches.some(m => m.availabilityRound !== round || !/^\d{4}-\d{2}-\d{2}$/.test(m.date) || !Number.isFinite(Date.parse(m.date+"T12:00:00Z")) || new Date(m.date+"T12:00:00Z").toISOString().slice(0,10)!==m.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time))) return state;
      const catalog = { ...(state.catalog ?? demoCatalog()), matches: [...matches, ...action.matches] };
      try { validateCatalog(catalog); } catch { return state; }
      return { ...state, catalog, currentRound: round, availability: { ...state.availability,
        ...Object.fromEntries(action.matches.map(m => [m.id, Object.fromEntries(players.map(p => [p.id, "pending" as Availability]))])) } };
    }
    case "save-stats":
      if ((action.matchId === LIVE_MATCH_ID && live.phase !== "Einde") || !validateRows(action.rows, action.matchId, state.catalog)
        || action.rows.some(row => Math.max(row.minutes, row.keeperMinutes) > statsMinuteLimit(state, action.matchId))) return state;
      if (action.opponentOwnGoals !== undefined && (!Number.isInteger(action.opponentOwnGoals) || action.opponentOwnGoals < 0 || action.opponentOwnGoals > 99)) return state;
      return { ...state, stats: [...state.stats.filter(r => r.matchId !== action.matchId), ...action.rows.map(r => {
        if (!goalsOnlyMatch(state, action.matchId)) return {...r};
        const prior=state.stats.find(row=>row.matchId===action.matchId&&row.playerId===r.playerId);
        // A goal correction must not erase hidden historical figures or turn
        // uncollected minutes into known zeros through an old local draft.
        return {...(prior??{...r,minutes:0,minutesKnown:false,keeperMinutes:0,keeperMinutesKnown:false}),goals:r.goals,present:(prior?.present??r.present)||r.goals>0};
      })],
        ...(state.matchResults?.[action.matchId] ? { matchResults: { ...state.matchResults, [action.matchId]: { ...state.matchResults[action.matchId], goalsFor: action.rows.reduce((sum, row) => sum + row.goals, 0) + (action.opponentOwnGoals ?? state.opponentOwnGoals[action.matchId] ?? 0) } } } : {}),
        opponentOwnGoals: { ...state.opponentOwnGoals, [action.matchId]: action.opponentOwnGoals ?? state.opponentOwnGoals[action.matchId] ?? 0 } };
  }
}

// Reject malformed or incompatible backups rather than silently overwriting them.
export function coachReducer(state:CoachState,action:Action):CoachState {
  let next=reduceCoachState(state,action);
  if(next!==state&&!['prepare-match','assistant-prepare'].includes(action.type)&&state.live.keeperId!==next.live.keeperId&&state.live.keeperId&&next.live.keeperId)next={...next,live:{...next.live,keeperChanges:[...(state.live.keeperChanges??[]),{from:state.live.keeperId,to:next.live.keeperId,atMs:next.live.elapsedMs}]}};
  const changes=['prepare-match','phase','finish','set-field-size','set-periods','set-period','goal','away-goal','undo-goal','keeper','swap','availability-batch','availability','set-substitution-policy','set-substitution-profiles','save-stats'];
  return next!==state&&next.live.phase!=='Einde'&&changes.includes(action.type)?{...next,live:{...next.live,adviceEpoch:(state.live.adviceEpoch??0)+1}}:next;
}

export function parseState(raw: string): CoachState {
  type LegacyState = Omit<CoachState, "version" | "team" | "opponentOwnGoals" | "live"> & {
    version: 1;
    live: Omit<LiveMatch, "phase" | "period" | "periods" | "awayGoals" | "goals"> & {
      phase: "Eerste helft" | "Tweede helft" | "Rust" | "Einde";
      goals: { playerId: string; minute: number }[];
      awayScore: number;
    };
  };
  const parsed = JSON.parse(raw) as CoachState | LegacyState;
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Ongeldige opslag: wedstrijdgegevens ontbreken.');
  let data: CoachState;
  if (parsed?.version === 1) {
    const legacy = parsed.live;
    if (!legacy || !["Eerste helft", "Tweede helft", "Rust", "Einde"].includes(legacy.phase)
      || !Array.isArray(legacy.goals) || !Number.isInteger(legacy.awayScore) || legacy.awayScore < 0 || legacy.awayScore > 99) throw new Error("Ongeldige oude opslag");
    const { awayScore, ...oldLive } = legacy;
    data = { ...parsed, version: 2, team: { periods: 2 }, opponentOwnGoals: {}, live: {
      ...oldLive, periods: 2, period: ["Tweede helft", "Einde"].includes(legacy.phase) ? 2 : 1,
      phase: legacy.phase === "Rust" || legacy.phase === "Einde" ? legacy.phase : "Spelen",
      goals: legacy.goals.map(g => ({ ...g, ownGoal: false })),
      // Old counter-only records have no known scorer or event time.
      awayGoals: Array.from({ length: awayScore }, () => ({ playerId: null, minute: null, ownGoal: false })),
    } };
  } else data = parsed;
  if (data.committedBatches !== undefined && (!Array.isArray(data.committedBatches) || data.committedBatches.length > 100 || !data.committedBatches.every(id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(id)))) throw new Error('Ongeldige opslagbevestigingen');
  const catalog = data.catalog ?? demoCatalog();
  if (data.team?.substitutionPolicy) {
    normalizePolicy(data.team.substitutionPolicy);
    const history = data.team.substitutionPolicyHistory;
    if (!Array.isArray(history) || history.length !== data.team.substitutionPolicy.version || history.some((p,i)=>{normalizePolicy(p);return p.version!==i+1;}) || JSON.stringify(history.at(-1)) !== JSON.stringify(data.team.substitutionPolicy)) throw new Error('Ongeldige beleidshistorie.');
  } else if (data.team?.substitutionPolicyHistory !== undefined) throw new Error('Beleid ontbreekt bij beleidshistorie.');
  if(data.team?.formations!==undefined)validateFormations(data.team.formations);
  if(data.team?.formationCatalog!==undefined)validateFormationCatalog(data.team.formationCatalog);
  if(data.team?.fullStatsFromRound!==undefined&&(!Number.isInteger(data.team.fullStatsFromRound)||data.team.fullStatsFromRound<1||data.team.fullStatsFromRound>100))throw new Error('Ongeldige statistiekenperiode.');
  validateCatalog(catalog);
  const { players, matches } = catalog;
  const playerId = (id: unknown) => players.some(p => p.id === id);
  const number = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  const availability = (value: AvailabilityMap) => value && matches.every(m => value[m.id] && players.every(p => ["available", "unavailable", "pending"].includes(value[m.id][p.id])));
  if (!data || data.version !== 2 || !data.team || ![2, 4].includes(data.team.periods) || (data.team.fieldSize !== undefined && ![6,8,11].includes(data.team.fieldSize))
    || !data.opponentOwnGoals || typeof data.opponentOwnGoals !== "object" || Array.isArray(data.opponentOwnGoals)
    || !Object.entries(data.opponentOwnGoals).every(([id, count]) => matches.some(m => m.id === id) && Number.isInteger(count) && count >= 0 && count <= 99)
    || !availability(data.availability) || !Array.isArray(data.rounds) || !data.rounds.every(value => value && Object.entries(value).every(([id, responses]) => matches.some(m => m.id === id) && responses&&players.every(p => ["available", "unavailable", "pending"].includes(responses[p.id]))))
    || (data.currentRound !== undefined && (!Number.isInteger(data.currentRound) || data.currentRound < 1))) throw new Error("Ongeldige opslag: teaminstellingen, beschikbaarheid of speelronde klopt niet.");
  if(!Array.isArray(data.stats)||!data.stats.every(r=>r&&matches.some(m=>m.id===r.matchId)))throw new Error('Ongeldige opslag: wedstrijdcijfers verwijzen naar een onbekende wedstrijd.');
  const invalidStats=[...new Set(data.stats.map(r=>r.matchId))].find(id=>!validateRows(data.stats.filter(r=>r.matchId===id),id,catalog));
  if(invalidStats){const match=matches.find(m=>m.id===invalidStats)!;throw new Error(`Ongeldige opslag: wedstrijdcijfers van ${match.opponent} (${match.date}) kloppen niet.`);}
  if (data.matchResults && (typeof data.matchResults !== "object" || Array.isArray(data.matchResults) || !Object.entries(data.matchResults).every(([id,r]) => matches.some(m=>m.id===id) && r && [r.goalsFor,r.goalsAgainst].every(n=>Number.isInteger(n)&&n>=0&&n<=99) && r.duration===50 && typeof r.sourceHash==="string"))) throw new Error("Ongeldige wedstrijduitslag");
  const live = data.live;
  for(const saved of [live,...Object.values(data.liveArchive??{})])if(saved?.preparation){const p=saved.preparation;if(!Number.isSafeInteger(p.confirmedAt)||p.confirmedAt<0||p.cadence!==undefined&&!['period','5-min','10-min','auto'].includes(p.cadence)||![p.presentIds,p.keeperIds].every(ids=>Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(playerId))||!p.keeperIds.every(id=>p.presentIds.includes(id))||!p.keeperIds.includes(p.startingKeeperId))throw new Error('Ongeldige wedstrijdvoorbereiding.');}
  for(const saved of [live,...Object.values(data.liveArchive??{})])if(saved?.preparation){const p=saved.preparation;if(p.startingField!==undefined&&(!Array.isArray(p.startingField)||![6,8,11].includes(p.startingField.length)||new Set(p.startingField).size!==p.startingField.length||!p.startingField.every(id=>p.presentIds.includes(id))||!p.startingField.includes(p.startingKeeperId)))throw new Error('Ongeldige bevestigde startopstelling.');if(p.startingPositions!==undefined&&(!p.startingPositions||typeof p.startingPositions!=='object'||Array.isArray(p.startingPositions)||Object.entries(p.startingPositions).some(([id,role])=>!p.presentIds.includes(id)||p.startingField!==undefined&&!p.startingField.includes(id)||id===p.startingKeeperId||!['V','M','A'].includes(role))))throw new Error('Ongeldige startposities.');}
  for(const saved of [live,...Object.values(data.liveArchive??{})])if(saved?.preparation)validatePreparedFormation(saved.preparation);
  for(const saved of [live,...Object.values(data.liveArchive??{})])if(saved?.preparation&&saved.preparation.keeperSchedule!==undefined){const p=saved.preparation;if(!Array.isArray(p.keeperSchedule)||p.keeperSchedule.length!==saved.periods||p.keeperSchedule[0]!==p.startingKeeperId||!p.keeperSchedule.every(id=>p.keeperIds.includes(id))||!p.keeperIds.every(id=>p.keeperSchedule!.includes(id)))throw new Error('Ongeldig keeperschema.');}
  if(live?.keeperChanges!==undefined&&(!Array.isArray(live.keeperChanges)||!live.keeperChanges.every(e=>playerId(e.from)&&playerId(e.to)&&e.from!==e.to&&Number.isSafeInteger(e.atMs)&&e.atMs>=0&&e.atMs<=live.elapsedMs)))throw new Error('Ongeldige keeperwissels.');
  if(live?.adviceEpoch!==undefined&&(!Number.isSafeInteger(live.adviceEpoch)||live.adviceEpoch<0))throw new Error('Ongeldige adviesversie.');
  validateAdviceStorage(data);
  if (live?.occupancy !== undefined) {
    let cursor: number | null = null;
    if (!Array.isArray(live.occupancy) || !live.occupancy.every(s=>{
      const valid = s && Number.isSafeInteger(s.startMs) && Number.isSafeInteger(s.endMs) && s.startMs >= 0 && s.endMs > s.startMs && s.endMs <= live.elapsedMs && (cursor === null || cursor === s.startMs)
        && Array.isArray(s.field) && s.field.length > 0 && s.field.length <= 11 && new Set(s.field).size === s.field.length && s.field.every(playerId) && s.field.includes(s.keeperId);
      cursor = s.endMs; return valid;
    })) throw new Error('Ongeldige bezettingsintervallen.');
    if (live.occupancy.length && live.occupancy.at(-1)!.endMs !== live.elapsedMs) throw new Error('Bezettingsintervallen missen de laatste speeltijd.');
    for (const p of players) {
      const played=live.occupancy.reduce((sum,s)=>sum+(s.field.includes(p.id)?s.endMs-s.startMs:0),0);
      const keeper=live.occupancy.reduce((sum,s)=>sum+(s.keeperId===p.id?s.endMs-s.startMs:0),0);
      const complete=live.occupancy.length>0&&live.occupancy[0].startMs===0&&live.occupancy.at(-1)!.endMs===live.elapsedMs;
      if (!live.played?.[p.id] || played>live.played[p.id].milliseconds || keeper>live.played[p.id].keeperMilliseconds || complete&&(played!==live.played[p.id].milliseconds||keeper!==live.played[p.id].keeperMilliseconds)) throw new Error('Bezettingsintervallen en speelminuten verschillen.');
    }
  }
  if (live && ((live.breakMs !== undefined && !number(live.breakMs)) || (live.breakSince != null && (!number(live.breakSince) || live.phase !== "Rust")))) throw new Error("Ongeldige rusttijd");
  if (!live || !["Spelen", "Rust", "Einde"].includes(live.phase) || !number(live.elapsedMs)
    || ![2, 4].includes(live.periods) || !Number.isInteger(live.period) || live.period < 1 || live.period > live.periods
    || (live.phase === "Rust" && live.period === live.periods)
    || !(live.runningSince === null || number(live.runningSince)) || (["Rust", "Einde"].includes(live.phase) && live.runningSince !== null)
    || !Array.isArray(live.field) || live.field.length > Math.min(11, players.length) || new Set(live.field).size !== live.field.length || !live.field.every(playerId)
    || (live.field.length > 0 ? !live.field.includes(live.keeperId) : live.keeperId !== "") || !live.played || !players.every(p => live.played[p.id]
      && number(live.played[p.id].milliseconds) && number(live.played[p.id].keeperMilliseconds)
      && live.played[p.id].keeperMilliseconds <= live.played[p.id].milliseconds && live.played[p.id].milliseconds <= live.elapsedMs)
    || !Array.isArray(live.goals) || !live.goals.every(g => g && typeof g.ownGoal === "boolean" && (g.minute===null||number(g.minute))
      && (g.ownGoal ? g.playerId === null : g.playerId===null||playerId(g.playerId)))
    || live.goals.filter(g => g.ownGoal).length > 99
    || !Array.isArray(live.awayGoals) || live.awayGoals.length > 99 || !live.awayGoals.every(g => g && typeof g.ownGoal === "boolean"
      && (g.minute === null || number(g.minute)) && (g.ownGoal ? playerId(g.playerId) : g.playerId === null))
    || !Array.isArray(live.swaps) || !live.swaps.every(s => s && playerId(s.out) && playerId(s.in) && s.out !== s.in && number(s.minute) && (s.atMs === undefined || Number.isSafeInteger(s.atMs) && s.atMs >= 0 && s.atMs <= live.elapsedMs && Math.floor(s.atMs/60000) === s.minute))) throw new Error("Ongeldige wedstrijdopslag");
  if (live.periodTimes !== undefined && (!live.periodTimes || typeof live.periodTimes !== "object" || Array.isArray(live.periodTimes) || !Object.entries(live.periodTimes).every(([key, value]) => /^(2:[12]|4:[1-4])$/.test(key) && number(value)) || Object.values(live.periodTimes).reduce((sum, value) => sum + value, 0) > live.elapsedMs + 0.000001)) throw new Error("Ongeldige periodetijden");
  if (![...live.goals, ...live.awayGoals].every(g => (g.sequence === undefined || Number.isInteger(g.sequence) && g.sequence > 0) && (g.scoreFor === undefined && g.scoreAgainst === undefined || [g.scoreFor, g.scoreAgainst].every(n => Number.isInteger(n) && Number(n) >= 0)))) throw new Error("Ongeldige doelpunthistorie");
  return syncLiveSquad(data);
}



export function validateCatalog(catalog: Catalog): void {
  if (Array.isArray(catalog?.players)) for (const p of catalog.players) if (p.substitutionProfile !== undefined) validateProfile(p.substitutionProfile);
  const id = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v) && !["__proto__", "constructor", "prototype"].includes(v);
  const text = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 200;
  if (!catalog || !id(catalog.seasonId) || !id(catalog.teamSeasonId) || !text(catalog.seasonName) || !text(catalog.teamName)
    || ((catalog.clubId !== undefined || catalog.clubName !== undefined) && (!id(catalog.clubId) || !text(catalog.clubName)))
    || typeof catalog.archived !== "boolean" || !Array.isArray(catalog.players) || !Array.isArray(catalog.matches)
    || catalog.players.length > 50 || catalog.matches.length > 200
    || new Set(catalog.players.map(p => p.id)).size !== catalog.players.length
    || new Set(catalog.matches.map(m => m.id)).size !== catalog.matches.length
    || !catalog.players.every(p => id(p.id) && text(p.name) && text(p.shortName) && (p.parentName===undefined || (typeof p.parentName==="string" && p.parentName.length<=200)) && (p.parentEmail===undefined || (typeof p.parentEmail==="string" && p.parentEmail.length<=254)) && (p.parentPhone===undefined || (typeof p.parentPhone==="string" && p.parentPhone.length<=40)) && typeof p.parent === "string" && typeof p.position === "string" && Number.isInteger(p.number))
    || !catalog.matches.every(m => id(m.id) && text(m.opponent) && text(m.date) && text(m.shortDate) && text(m.time) && typeof m.pool === "string" && ["Thuis", "Uit"].includes(m.venue) && Number.isInteger(m.availabilityRound) && m.availabilityRound >= 1)
    || !(catalog.liveMatchId === "" || catalog.matches.some(m => m.id === catalog.liveMatchId))) throw new Error("Ongeldige seizoen- of teamgegevens");
}

export function createTeamState(catalog: Catalog, periods: Periods = 2, fieldSize: FieldSize = 6): CoachState {
  validateCatalog(catalog);
  const field = catalog.players.slice(0, fieldSize).map(p => p.id);
  return { version: 2, catalog, team: { periods, fieldSize }, opponentOwnGoals: {}, rounds: [], stats: [],
    availability: Object.fromEntries(catalog.matches.map(m => [m.id, Object.fromEntries(catalog.players.map(p => [p.id, "pending" as Availability]))])),
    live: { phase: catalog.liveMatchId && field.length ? "Spelen" : "Einde", period: 1, periods, elapsedMs: 0, breakMs: 0, breakSince: null, runningSince: null,
      keeperId: field[0] ?? "", field, played: Object.fromEntries(catalog.players.map(p => [p.id, { milliseconds: 0, keeperMilliseconds: 0 }])), goals: [], awayGoals: [], swaps: [], occupancy: [] },
  };
}



export const currentRound = (state: CoachState) => Math.max(state.currentRound ?? state.rounds.length + 1, 1, ...(state.catalog ?? demoCatalog()).matches.map(m => m.availabilityRound));
