import {
  buildGoalkeeperPlan,
  currentMatchSecond,
  formatDateLabel,
  scoreForMatch,
  type ActorStamp,
  type AttendanceStatus,
  type GoalSide,
  type MatchInvite,
  type MatchRecord,
  type Player,
  type PlayerShift,
  type Season
} from "@coachmate/shared";
import {
  type DocumentData,
  type QuerySnapshot,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";

import { parentWebUrl } from "../firebase/config";
import { db, isFirebaseConfigured } from "../firebase/client";

const seasonsCollection = collection(db, "seasons");
const playersCollection = collection(db, "players");
const matchesCollection = collection(db, "matches");
const invitesCollection = collection(db, "invites");

const fallbackId = () => `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const createId = () => globalThis.crypto?.randomUUID?.() ?? fallbackId();

function noop() {
  return undefined;
}

function actor(kind: ActorStamp["kind"], label: string): ActorStamp {
  return {
    kind,
    label,
    updatedAt: new Date().toISOString()
  };
}

function mapDocs<T>(snapshot: QuerySnapshot<DocumentData>): T[] {
  return snapshot.docs.map((entry) => entry.data() as T);
}

function buildAttendance(playerIds: string[]) {
  return playerIds.reduce<Record<string, AttendanceStatus>>((result, playerId) => {
    result[playerId] = "pending";
    return result;
  }, {});
}

function nextClock(match: MatchRecord) {
  const now = new Date().toISOString();

  if (match.clock.isRunning) {
    return {
      elapsedSeconds: currentMatchSecond(match.clock.elapsedSeconds, true, match.clock.runningSince),
      isRunning: false,
      runningSince: null as string | null
    };
  }

  return {
    elapsedSeconds: match.clock.elapsedSeconds,
    isRunning: true,
    runningSince: now
  };
}

function closeOpenShifts(match: MatchRecord, stamp: ActorStamp): PlayerShift[] {
  const second = Math.min(match.durationMinutes * 60, currentMatchSecond(match.clock.elapsedSeconds, match.clock.isRunning, match.clock.runningSince));
  return match.shifts.map((shift) => {
    if (shift.endedAtSecond !== null) {
      return shift;
    }

    return {
      ...shift,
      endedAtSecond: second,
      actor: stamp
    };
  });
}

export function subscribeToSeasons(onData: (items: Season[]) => void) {
  if (!isFirebaseConfigured) {
    onData([]);
    return noop;
  }

  return onSnapshot(query(seasonsCollection, orderBy("startDate", "desc")), (snapshot) => {
    onData(mapDocs<Season>(snapshot));
  });
}

export function subscribeToPlayers(onData: (items: Player[]) => void) {
  if (!isFirebaseConfigured) {
    onData([]);
    return noop;
  }

  return onSnapshot(query(playersCollection, orderBy("jerseyNumber", "asc")), (snapshot) => {
    onData(mapDocs<Player>(snapshot));
  });
}

export function subscribeToMatches(onData: (items: MatchRecord[]) => void) {
  if (!isFirebaseConfigured) {
    onData([]);
    return noop;
  }

  return onSnapshot(query(matchesCollection, orderBy("kickoffAt", "asc")), (snapshot) => {
    onData(mapDocs<MatchRecord>(snapshot));
  });
}

export function subscribeToInvites(onData: (items: MatchInvite[]) => void) {
  if (!isFirebaseConfigured) {
    onData([]);
    return noop;
  }

  return onSnapshot(invitesCollection, (snapshot) => {
    onData(mapDocs<MatchInvite>(snapshot));
  });
}

export async function createSeason(input: { name: string; startDate: string; endDate: string; accentColor: string }) {
  const id = createId();
  const season: Season = {
    id,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    accentColor: input.accentColor,
    playerIds: [],
    createdAt: new Date().toISOString()
  };

  await setDoc(doc(db, "seasons", id), season);
}

export async function createPlayer(input: {
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  parentName: string;
  parentPhone: string;
}) {
  const id = createId();
  const player: Player = {
    id,
    firstName: input.firstName,
    lastName: input.lastName,
    jerseyNumber: input.jerseyNumber,
    parentName: input.parentName,
    parentPhone: input.parentPhone,
    createdAt: new Date().toISOString()
  };

  await setDoc(doc(db, "players", id), player);
}

export async function togglePlayerForSeason(season: Season, playerId: string) {
  const playerIds = season.playerIds.includes(playerId)
    ? season.playerIds.filter((id) => id !== playerId)
    : [...season.playerIds, playerId];

  await updateDoc(doc(db, "seasons", season.id), { playerIds });
}

export async function createMatch(season: Season, input: { opponentName: string; location: string; kickoffAt: string; durationMinutes: number }) {
  const id = createId();
  const stamp = actor("coach", "Coach");
  const match: MatchRecord = {
    id,
    seasonId: season.id,
    opponentName: input.opponentName,
    location: input.location,
    kickoffAt: input.kickoffAt,
    durationMinutes: input.durationMinutes,
    status: "draft",
    attendance: buildAttendance(season.playerIds),
    playerIds: season.playerIds,
    goalkeeperSlots: [],
    goalkeeperPlanMode: "suggested",
    clock: {
      elapsedSeconds: 0,
      isRunning: false,
      runningSince: null
    },
    shifts: [],
    goals: [],
    notes: "",
    shareMode: "per-player-invite",
    lastWrite: stamp,
    createdAt: new Date().toISOString()
  };

  await setDoc(doc(db, "matches", id), match);
  await ensureInvites(match);
}

export async function ensureInvites(match: MatchRecord) {
  const existingSnapshot = await getDocs(query(invitesCollection, where("matchId", "==", match.id)));
  const existingPlayerIds = new Set(existingSnapshot.docs.map((entry) => (entry.data() as MatchInvite).playerId));
  const batch = writeBatch(db);
  const createdAt = new Date().toISOString();

  match.playerIds.forEach((playerId) => {
    if (existingPlayerIds.has(playerId)) {
      return;
    }

    const inviteId = `${match.id}_${playerId}`;
    const invite: MatchInvite = {
      id: inviteId,
      matchId: match.id,
      seasonId: match.seasonId,
      playerId,
      token: `${match.id}-${playerId}-${createId().replace(/-/g, "")}`,
      createdAt,
      lastOpenedAt: null
    };
    batch.set(doc(db, "invites", inviteId), invite);
  });

  await batch.commit();
}

export async function updateAttendance(
  match: MatchRecord,
  players: Player[],
  seasonMatches: MatchRecord[],
  playerId: string,
  status: AttendanceStatus,
  label = "Coach"
) {
  const attendance = {
    ...match.attendance,
    [playerId]: status
  };
  const nextMatch = { ...match, attendance };
  const goalkeeperSlots = match.goalkeeperPlanMode === "suggested"
    ? buildGoalkeeperPlan(nextMatch, players.filter((player) => match.playerIds.includes(player.id)), seasonMatches)
    : match.goalkeeperSlots;

  await updateDoc(doc(db, "matches", match.id), {
    attendance,
    goalkeeperSlots,
    lastWrite: actor(label === "Coach" ? "coach" : "parent", label)
  });
}

export async function restoreSuggestedGoalkeeperPlan(match: MatchRecord, players: Player[], seasonMatches: MatchRecord[]) {
  const goalkeeperSlots = buildGoalkeeperPlan(match, players.filter((player) => match.playerIds.includes(player.id)), seasonMatches);
  await updateDoc(doc(db, "matches", match.id), {
    goalkeeperSlots,
    goalkeeperPlanMode: "suggested",
    lastWrite: actor("coach", "Coach")
  });
}

export async function assignGoalkeeper(match: MatchRecord, slotId: string, playerId: string, label = "Coach") {
  const goalkeeperSlots = match.goalkeeperSlots.map((slot) => (
    slot.id === slotId ? { ...slot, playerId } : slot
  ));

  await updateDoc(doc(db, "matches", match.id), {
    goalkeeperSlots,
    goalkeeperPlanMode: "manual",
    lastWrite: actor(label === "Coach" ? "coach" : "parent", label)
  });
}

export async function toggleMatchClock(match: MatchRecord, label = "Coach") {
  const updatedClock = nextClock(match);
  const nextStatus = updatedClock.isRunning ? "live" : match.status;

  await updateDoc(doc(db, "matches", match.id), {
    clock: updatedClock,
    status: nextStatus,
    lastWrite: actor(label === "Coach" ? "coach" : "parent", label)
  });
}

export async function finishMatch(match: MatchRecord) {
  const stamp = actor("coach", "Coach");
  await updateDoc(doc(db, "matches", match.id), {
    status: "finished",
    clock: {
      elapsedSeconds: Math.min(match.durationMinutes * 60, currentMatchSecond(match.clock.elapsedSeconds, match.clock.isRunning, match.clock.runningSince)),
      isRunning: false,
      runningSince: null
    },
    shifts: closeOpenShifts(match, stamp),
    lastWrite: stamp
  });
}

export async function toggleShift(match: MatchRecord, playerId: string, label = "Coach") {
  const stamp = actor(label === "Coach" ? "coach" : "parent", label);
  const second = Math.min(match.durationMinutes * 60, currentMatchSecond(match.clock.elapsedSeconds, match.clock.isRunning, match.clock.runningSince));
  const openIndex = match.shifts.findIndex((shift) => shift.playerId === playerId && shift.endedAtSecond === null);
  const shifts = [...match.shifts];

  if (openIndex >= 0) {
    shifts[openIndex] = {
      ...shifts[openIndex],
      endedAtSecond: second,
      actor: stamp
    };
  } else {
    shifts.push({
      id: createId(),
      playerId,
      startedAtSecond: second,
      endedAtSecond: null,
      actor: stamp
    });
  }

  await updateDoc(doc(db, "matches", match.id), {
    shifts,
    status: match.status === "draft" ? "live" : match.status,
    lastWrite: stamp
  });
}

export async function updateShift(match: MatchRecord, shiftId: string, startedAtSecond: number, endedAtSecond: number | null, label = "Coach") {
  const stamp = actor(label === "Coach" ? "coach" : "parent", label);
  const shifts = match.shifts.map((shift) => (
    shift.id === shiftId
      ? {
          ...shift,
          startedAtSecond,
          endedAtSecond,
          actor: stamp
        }
      : shift
  ));

  await updateDoc(doc(db, "matches", match.id), {
    shifts,
    lastWrite: stamp
  });
}

export async function removeShift(match: MatchRecord, shiftId: string, label = "Coach") {
  await updateDoc(doc(db, "matches", match.id), {
    shifts: match.shifts.filter((shift) => shift.id !== shiftId),
    lastWrite: actor(label === "Coach" ? "coach" : "parent", label)
  });
}

export async function addGoal(match: MatchRecord, side: GoalSide, scorerPlayerId: string | null, label = "Coach") {
  const stamp = actor(label === "Coach" ? "coach" : "parent", label);
  const second = Math.min(match.durationMinutes * 60, currentMatchSecond(match.clock.elapsedSeconds, match.clock.isRunning, match.clock.runningSince));
  const goals = [
    ...match.goals,
    {
      id: createId(),
      side,
      second,
      scorerPlayerId,
      actor: stamp
    }
  ];

  await updateDoc(doc(db, "matches", match.id), {
    goals,
    status: match.status === "draft" ? "live" : match.status,
    lastWrite: stamp
  });
}

export async function removeGoal(match: MatchRecord, goalId: string, label = "Coach") {
  await updateDoc(doc(db, "matches", match.id), {
    goals: match.goals.filter((goal) => goal.id !== goalId),
    lastWrite: actor(label === "Coach" ? "coach" : "parent", label)
  });
}

export async function updateNotes(match: MatchRecord, notes: string, label = "Coach") {
  await updateDoc(doc(db, "matches", match.id), {
    notes,
    lastWrite: actor(label === "Coach" ? "coach" : "parent", label)
  });
}

export function buildInviteUrl(invite: MatchInvite) {
  return parentWebUrl ? `${parentWebUrl.replace(/\/$/, "")}/invite/${invite.token}` : `/invite/${invite.token}`;
}

export function buildInviteMessage(match: MatchRecord, player: Player, invite: MatchInvite) {
  return [
    `CoachMate uitnodiging voor ${player.firstName}.`,
    `Wedstrijd tegen ${match.opponentName} op ${formatDateLabel(match.kickoffAt)} in ${match.location}.`,
    "Bevestig aanwezigheid en help later live mee via deze link:",
    buildInviteUrl(invite)
  ].join("\n\n");
}

export function buildScoreLabel(match: MatchRecord) {
  const score = scoreForMatch(match);
  return `${score.goalsFor} - ${score.goalsAgainst}`;
}
