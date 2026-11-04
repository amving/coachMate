// All optimizer time is integer milliseconds of active play, never wall time.
export type Occupancy = { startMs: number; endMs: number; field: string[]; keeperId: string };
export type FieldPosition = 'V'|'M'|'A';
export type PlayerProfile = {
  goalkeeperEligible?: boolean; goalkeeperQuality?: number; goalkeeperPreference?: number;
  positionQualities?: Record<string, number>; // supplied 0..1 scores, never inferred
  maxMinutes?: number; availableFromMs?: number; availableUntilMs?: number;
};
export type OptimizerPlayer = {
  id: string; available: boolean; position: string | null;
  goalkeeperEligible: boolean; goalkeeperQuality: number | null; goalkeeperPreference: number | null;
  positionQualities: Record<string, number>;
  availableFromMs: number; availableUntilMs: number; maxTotalMs: number;
  playedMs: number; keeperMs: number;
  consecutivePlayMs: number | null; consecutiveBenchMs: number | null;
  substitutionCount: number; lastEntryMs: number | null; lastExitMs: number | null;
  history: { matchId: string; playedMs: number | null; targetMs: number | null; keeperMs: number | null }[];
};
export type MatchState = {
  teamSeasonId: string; matchId: string; stateVersion: string; archived: boolean;
  phase: 'Spelen' | 'Rust' | 'Einde'; running: boolean;
  currentPeriod: number; actualPeriodTimesMs: Record<string, number>;
  clock: { matchMs: number; breakMs: number | null; elapsedRealMs: number | null };
  rules: { fieldSize: number; durationMs: number; periodBoundariesMs: number[]; keeperSchedule?:string[]; startingKeeperId?:string; startingField?:string[]; rotationIntervalMs?:number };
  field: string[]; bench: string[]; keeperId: string;
  startingLineup: {field:string[];keeperId:string} | null;
  executedSubstitutions: {out:string;in:string;atMs:number;precision:'millisecond'|'minute'}[];
  players: OptimizerPlayer[]; observedIntervals: Occupancy[]; warnings: string[];
};
export type Issue = { code: string; detail: string };
export type Validation = { valid: boolean; issues: Issue[] };
export type Scenario = {
  id: string; matchId: string; teamSeasonId: string; stateVersion: string;
  rulesVersion: string; policyVersion: number; intervals: Occupancy[];
  targetsMs: Record<string, number>;
  expectedEndMs: Record<string, { playedMs: number; keeperMs: number; fieldMs: number }>;
  scores: { fairness: number; rotation: number; tactical: number | null; calm: number; total: number };
  fairnessErrorMs: number; reasonCodes: string[];
};
