import {
  buildGoalkeeperPlan,
  currentMatchSecond,
  scoreForMatch,
  type AttendanceStatus,
  type GoalEvent,
  type GoalSide,
  type MatchInvite,
  type MatchRecord,
  type ParentActionRequest,
  type ParentMatchView,
  type Player,
  type Season
} from "@coachmate/shared";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();

function actor(label: string) {
  return {
    kind: "parent" as const,
    label,
    updatedAt: new Date().toISOString()
  };
}

function safePlayerName(player: Player | undefined) {
  return player ? `${player.firstName} ${player.lastName}` : "Onbekend";
}

async function loadPlayers(playerIds: string[]) {
  const snapshots = await Promise.all(playerIds.map((playerId) => db.collection("players").doc(playerId).get()));
  return snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => snapshot.data() as Player);
}

async function loadSeason(seasonId: string) {
  const snapshot = await db.collection("seasons").doc(seasonId).get();
  return snapshot.exists ? (snapshot.data() as Season) : null;
}

async function loadInvitesForMatch(matchId: string) {
  const snapshot = await db.collection("invites").where("matchId", "==", matchId).get();
  return snapshot.docs.map((doc) => doc.data() as MatchInvite);
}

async function loadSeasonMatches(seasonId: string) {
  const snapshot = await db.collection("matches").where("seasonId", "==", seasonId).get();
  return snapshot.docs.map((doc) => doc.data() as MatchRecord);
}

function buildParentView(
  token: string,
  invite: MatchInvite,
  match: MatchRecord,
  season: Season | null,
  players: Player[]
): ParentMatchView {
  const score = scoreForMatch(match);

  return {
    token,
    inviteId: invite.id,
    matchId: match.id,
    seasonId: match.seasonId,
    seasonName: season?.name ?? "Onbekend seizoen",
    playerId: invite.playerId,
    playerName: safePlayerName(players.find((player) => player.id === invite.playerId)),
    opponentName: match.opponentName,
    location: match.location,
    kickoffAt: match.kickoffAt,
    durationMinutes: match.durationMinutes,
    status: match.status,
    scoreFor: score.goalsFor,
    scoreAgainst: score.goalsAgainst,
    clock: match.clock,
    goalkeeperPlanMode: match.goalkeeperPlanMode,
    goalkeeperSlots: match.goalkeeperSlots.map((slot) => ({
      ...slot,
      playerName: safePlayerName(players.find((player) => player.id === slot.playerId))
    })),
    players: players.map((player) => ({
      id: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      jerseyNumber: player.jerseyNumber,
      attendanceStatus: match.attendance[player.id] ?? "pending",
      isInvitePlayer: player.id === invite.playerId
    })),
    goals: match.goals.map((goal) => ({
      id: goal.id,
      side: goal.side,
      second: goal.second,
      scorerName: goal.scorerPlayerId ? safePlayerName(players.find((player) => player.id === goal.scorerPlayerId)) : null,
      actorLabel: goal.actor.label
    })),
    shifts: match.shifts.map((shift) => ({
      id: shift.id,
      playerId: shift.playerId,
      playerName: safePlayerName(players.find((player) => player.id === shift.playerId)),
      startedAtSecond: shift.startedAtSecond,
      endedAtSecond: shift.endedAtSecond,
      actorLabel: shift.actor.label
    })),
    notes: match.notes,
    lastWrite: match.lastWrite,
    updatedAt: new Date().toISOString()
  };
}

async function syncParentViewsForMatch(match: MatchRecord) {
  const [invites, players, season] = await Promise.all([
    loadInvitesForMatch(match.id),
    loadPlayers(match.playerIds),
    loadSeason(match.seasonId)
  ]);

  const batch = db.batch();
  invites.forEach((invite) => {
    const parentView = buildParentView(invite.token, invite, match, season, players);
    batch.set(db.collection("parentViews").doc(invite.token), parentView);
  });
  await batch.commit();
}

async function resolveInviteByToken(token: string) {
  const snapshot = await db.collection("invites").where("token", "==", token).limit(1).get();
  if (snapshot.empty) {
    return null;
  }

  const invite = snapshot.docs[0].data() as MatchInvite;
  const matchSnapshot = await db.collection("matches").doc(invite.matchId).get();
  if (!matchSnapshot.exists) {
    return null;
  }

  const match = matchSnapshot.data() as MatchRecord;
  return { invite, match };
}

function closeOrOpenShift(match: MatchRecord, playerId: string, label: string) {
  const second = Math.min(match.durationMinutes * 60, currentMatchSecond(match.clock.elapsedSeconds, match.clock.isRunning, match.clock.runningSince));
  const index = match.shifts.findIndex((shift) => shift.playerId === playerId && shift.endedAtSecond === null);
  const shifts = [...match.shifts];

  if (index >= 0) {
    shifts[index] = {
      ...shifts[index],
      endedAtSecond: second,
      actor: actor(label)
    };
  } else {
    shifts.push({
      id: `${Date.now()}-${playerId}`,
      playerId,
      startedAtSecond: second,
      endedAtSecond: null,
      actor: actor(label)
    });
  }

  return shifts;
}

function appendGoal(match: MatchRecord, side: GoalSide | undefined, scorerPlayerId: string | null, label: string): GoalEvent[] {
  const second = Math.min(match.durationMinutes * 60, currentMatchSecond(match.clock.elapsedSeconds, match.clock.isRunning, match.clock.runningSince));
  return [
    ...match.goals,
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      side: side ?? "coachmate",
      second,
      scorerPlayerId,
      actor: actor(label)
    }
  ];
}

function toggleClock(match: MatchRecord) {
  if (match.clock.isRunning) {
    return {
      elapsedSeconds: currentMatchSecond(match.clock.elapsedSeconds, true, match.clock.runningSince),
      isRunning: false,
      runningSince: null
    };
  }

  return {
    elapsedSeconds: match.clock.elapsedSeconds,
    isRunning: true,
    runningSince: new Date().toISOString()
  };
}

export const syncParentViewsOnMatchWrite = onDocumentWritten("matches/{matchId}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) {
    return;
  }

  await syncParentViewsForMatch(after.data() as MatchRecord);
});

export const syncParentViewsOnInviteWrite = onDocumentWritten("invites/{inviteId}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) {
    return;
  }

  const invite = after.data() as MatchInvite;
  const matchSnapshot = await db.collection("matches").doc(invite.matchId).get();
  if (!matchSnapshot.exists) {
    return;
  }

  await syncParentViewsForMatch(matchSnapshot.data() as MatchRecord);
});

export const parentAction = onRequest({ cors: true }, async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = request.body as ParentActionRequest;
  if (!body?.token || !body?.action) {
    response.status(400).json({ error: "Missing token or action" });
    return;
  }

  const resolved = await resolveInviteByToken(body.token);
  if (!resolved) {
    response.status(404).json({ error: "Invite not found" });
    return;
  }

  const { invite, match } = resolved;
  const label = (body.label || "Ouder").slice(0, 50);
  const matchRef = db.collection("matches").doc(match.id);
  const seasonMatches = await loadSeasonMatches(match.seasonId);
  const players = await loadPlayers(match.playerIds);

  if (body.action === "open") {
    await db.collection("invites").doc(invite.id).update({ lastOpenedAt: new Date().toISOString() });
    response.status(200).json({ ok: true });
    return;
  }

  if (body.action === "setAttendance") {
    const status = body.payload?.status as AttendanceStatus | undefined;
    if (!status) {
      response.status(400).json({ error: "Missing attendance status" });
      return;
    }

    const attendance = {
      ...match.attendance,
      [invite.playerId]: status
    };
    const goalkeeperSlots = match.goalkeeperPlanMode === "suggested"
      ? buildGoalkeeperPlan({ ...match, attendance }, players, seasonMatches)
      : match.goalkeeperSlots;

    await matchRef.update({
      attendance,
      goalkeeperSlots,
      lastWrite: actor(label)
    });
    response.status(200).json({ ok: true });
    return;
  }

  if (body.action === "toggleClock") {
    const next = toggleClock(match);
    await matchRef.update({
      clock: next,
      status: next.isRunning ? "live" : match.status,
      lastWrite: actor(label)
    });
    response.status(200).json({ ok: true });
    return;
  }

  if (body.action === "toggleShift") {
    const playerId = body.payload?.playerId;
    if (!playerId || !match.playerIds.includes(playerId)) {
      response.status(400).json({ error: "Invalid player" });
      return;
    }

    await matchRef.update({
      shifts: closeOrOpenShift(match, playerId, label),
      status: match.status === "draft" ? "live" : match.status,
      lastWrite: actor(label)
    });
    response.status(200).json({ ok: true });
    return;
  }

  if (body.action === "addGoal") {
    await matchRef.update({
      goals: appendGoal(match, body.payload?.side, body.payload?.scorerPlayerId ?? null, label),
      status: match.status === "draft" ? "live" : match.status,
      lastWrite: actor(label)
    });
    response.status(200).json({ ok: true });
    return;
  }

  if (body.action === "removeGoal") {
    const goalId = body.payload?.goalId;
    if (!goalId) {
      response.status(400).json({ error: "Missing goalId" });
      return;
    }

    await matchRef.update({
      goals: match.goals.filter((goal) => goal.id !== goalId),
      lastWrite: actor(label)
    });
    response.status(200).json({ ok: true });
    return;
  }

  response.status(400).json({ error: "Unsupported action" });
});
