export type AttendanceStatus = "pending" | "attending" | "absent";
export type MatchStatus = "draft" | "live" | "finished";
export type GoalSide = "coachmate" | "opponent";
export type ActorKind = "coach" | "parent";

export interface ActorStamp {
  kind: ActorKind;
  label: string;
  updatedAt: string;
}

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  accentColor: string;
  playerIds: string[];
  createdAt: string;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  parentName: string;
  parentPhone: string;
  createdAt: string;
}

export interface GoalkeeperSlot {
  id: string;
  playerId: string;
  startSecond: number;
  endSecond: number;
}

export interface PlayerShift {
  id: string;
  playerId: string;
  startedAtSecond: number;
  endedAtSecond: number | null;
  actor: ActorStamp;
}

export interface GoalEvent {
  id: string;
  side: GoalSide;
  second: number;
  scorerPlayerId: string | null;
  actor: ActorStamp;
}

export interface MatchClock {
  elapsedSeconds: number;
  isRunning: boolean;
  runningSince: string | null;
}

export interface MatchRecord {
  id: string;
  seasonId: string;
  opponentName: string;
  location: string;
  kickoffAt: string;
  durationMinutes: number;
  status: MatchStatus;
  attendance: Record<string, AttendanceStatus>;
  playerIds: string[];
  goalkeeperSlots: GoalkeeperSlot[];
  goalkeeperPlanMode: "suggested" | "manual";
  clock: MatchClock;
  shifts: PlayerShift[];
  goals: GoalEvent[];
  notes: string;
  shareMode: "per-player-invite";
  lastWrite: ActorStamp;
  createdAt: string;
}

export interface MatchInvite {
  id: string;
  matchId: string;
  seasonId: string;
  playerId: string;
  token: string;
  createdAt: string;
  lastOpenedAt: string | null;
}

export interface ParentViewPlayer {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  attendanceStatus: AttendanceStatus;
  isInvitePlayer: boolean;
}

export interface ParentViewGoal {
  id: string;
  side: GoalSide;
  second: number;
  scorerName: string | null;
  actorLabel: string;
}

export interface ParentViewShift {
  id: string;
  playerId: string;
  playerName: string;
  startedAtSecond: number;
  endedAtSecond: number | null;
  actorLabel: string;
}

export interface ParentMatchView {
  token: string;
  inviteId: string;
  matchId: string;
  seasonId: string;
  seasonName: string;
  playerId: string;
  playerName: string;
  opponentName: string;
  location: string;
  kickoffAt: string;
  durationMinutes: number;
  status: MatchStatus;
  scoreFor: number;
  scoreAgainst: number;
  clock: MatchClock;
  goalkeeperPlanMode: "suggested" | "manual";
  goalkeeperSlots: Array<GoalkeeperSlot & { playerName: string }>;
  players: ParentViewPlayer[];
  goals: ParentViewGoal[];
  shifts: ParentViewShift[];
  notes: string;
  lastWrite: ActorStamp;
  updatedAt: string;
}

export type ParentActionType =
  | "open"
  | "setAttendance"
  | "toggleClock"
  | "toggleShift"
  | "addGoal"
  | "removeGoal";

export interface ParentActionRequest {
  token: string;
  label: string;
  action: ParentActionType;
  payload?: {
    status?: AttendanceStatus;
    playerId?: string;
    side?: GoalSide;
    scorerPlayerId?: string | null;
    goalId?: string;
  };
}

export interface PlayerSeasonStats {
  playerId: string;
  matchesPlayed: number;
  goalsScored: number;
  minutesPlayed: number;
  goalkeeperMinutes: number;
}

export interface TeamSeasonStats {
  matches: number;
  finishedMatches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}
