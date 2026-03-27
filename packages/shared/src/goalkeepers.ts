import type { GoalkeeperSlot, MatchRecord, Player } from "./domain.js";

function priorGoalkeeperUsage(matches: MatchRecord[], seasonId: string, currentMatchId: string): Record<string, number> {
  return matches
    .filter((match) => match.seasonId === seasonId && match.id !== currentMatchId)
    .reduce<Record<string, number>>((usage, match) => {
      match.goalkeeperSlots.forEach((slot) => {
        usage[slot.playerId] = (usage[slot.playerId] ?? 0) + Math.max(0, slot.endSecond - slot.startSecond);
      });
      return usage;
    }, {});
}

export function buildGoalkeeperPlan(match: MatchRecord, players: Player[], seasonMatches: MatchRecord[]): GoalkeeperSlot[] {
  const availablePlayers = players.filter((player) => match.attendance[player.id] === "attending");

  if (availablePlayers.length === 0) {
    return [];
  }

  const slotLength = 15 * 60;
  const usage = priorGoalkeeperUsage(seasonMatches, match.seasonId, match.id);
  const slotCount = Math.max(1, Math.ceil((match.durationMinutes * 60) / slotLength));
  const slots: GoalkeeperSlot[] = [];

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const startSecond = slotIndex * slotLength;
    const endSecond = Math.min(match.durationMinutes * 60, startSecond + slotLength);
    const chosenPlayer = [...availablePlayers].sort((left, right) => {
      const leftUsage = usage[left.id] ?? 0;
      const rightUsage = usage[right.id] ?? 0;

      if (leftUsage !== rightUsage) {
        return leftUsage - rightUsage;
      }

      return left.jerseyNumber - right.jerseyNumber;
    })[0];

    slots.push({
      id: `${match.id}-keeper-${slotIndex}`,
      playerId: chosenPlayer.id,
      startSecond,
      endSecond
    });

    usage[chosenPlayer.id] = (usage[chosenPlayer.id] ?? 0) + (endSecond - startSecond);
  }

  return slots;
}
