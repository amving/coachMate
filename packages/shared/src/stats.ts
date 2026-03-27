import type { MatchRecord, PlayerSeasonStats, TeamSeasonStats } from "./domain.js";

function shiftDurationSeconds(startedAtSecond: number, endedAtSecond: number | null, matchDurationSeconds: number): number {
  const end = endedAtSecond ?? matchDurationSeconds;
  return Math.max(0, end - startedAtSecond);
}

export function scoreForMatch(match: MatchRecord): { goalsFor: number; goalsAgainst: number } {
  return match.goals.reduce(
    (score, goal) => {
      if (goal.side === "coachmate") {
        score.goalsFor += 1;
      } else {
        score.goalsAgainst += 1;
      }

      return score;
    },
    { goalsFor: 0, goalsAgainst: 0 }
  );
}

export function buildPlayerSeasonStats(matches: MatchRecord[], playerIds: string[]): Record<string, PlayerSeasonStats> {
  return playerIds.reduce<Record<string, PlayerSeasonStats>>((stats, playerId) => {
    const playerMatches = matches.filter((match) => match.playerIds.includes(playerId));
    const minutesPlayed = playerMatches.reduce((sum, match) => {
      const matchDuration = match.durationMinutes * 60;
      return sum + match.shifts
        .filter((shift) => shift.playerId === playerId)
        .reduce((shiftSum, shift) => shiftSum + shiftDurationSeconds(shift.startedAtSecond, shift.endedAtSecond, matchDuration), 0);
    }, 0);
    const goalkeeperMinutes = playerMatches.reduce((sum, match) => {
      return sum + match.goalkeeperSlots
        .filter((slot) => slot.playerId === playerId)
        .reduce((slotSum, slot) => slotSum + Math.max(0, slot.endSecond - slot.startSecond), 0);
    }, 0);
    const goalsScored = playerMatches.reduce((sum, match) => {
      return sum + match.goals.filter((goal) => goal.side === "coachmate" && goal.scorerPlayerId === playerId).length;
    }, 0);
    const matchesPlayed = playerMatches.filter((match) => {
      return (
        match.shifts.some((shift) => shift.playerId === playerId) ||
        match.goalkeeperSlots.some((slot) => slot.playerId === playerId) ||
        match.goals.some((goal) => goal.side === "coachmate" && goal.scorerPlayerId === playerId)
      );
    }).length;

    stats[playerId] = {
      playerId,
      matchesPlayed,
      goalsScored,
      minutesPlayed,
      goalkeeperMinutes
    };

    return stats;
  }, {});
}

export function buildTeamSeasonStats(matches: MatchRecord[]): TeamSeasonStats {
  return matches.reduce<TeamSeasonStats>(
    (stats, match) => {
      stats.matches += 1;
      const score = scoreForMatch(match);

      if (match.status === "finished") {
        stats.finishedMatches += 1;

        if (score.goalsFor > score.goalsAgainst) {
          stats.wins += 1;
        } else if (score.goalsFor < score.goalsAgainst) {
          stats.losses += 1;
        } else {
          stats.draws += 1;
        }
      }

      stats.goalsFor += score.goalsFor;
      stats.goalsAgainst += score.goalsAgainst;
      return stats;
    },
    {
      matches: 0,
      finishedMatches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0
    }
  );
}
