import {
  currentMatchSecond,
  formatClock,
  formatDateLabel,
  formatMinutes,
  scoreForMatch
} from "@coachmate/shared";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { Field, Pill, PrimaryButton, ScreenCard, SectionTitle } from "../../src/components/ui";
import { useCoachData } from "../../src/hooks/useCoachData";
import {
  addGoal,
  assignGoalkeeper,
  buildInviteMessage,
  ensureInvites,
  finishMatch,
  removeGoal,
  removeShift,
  restoreSuggestedGoalkeeperPlan,
  toggleMatchClock,
  toggleShift,
  updateAttendance,
  updateNotes,
  updateShift
} from "../../src/services/coachMateService";

export default function MatchDetailScreen() {
  const params = useLocalSearchParams<{ matchId: string }>();
  const { invites, matches, players, seasons } = useCoachData();
  const [notesDraft, setNotesDraft] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);

  const match = matches.find((entry) => entry.id === params.matchId);
  const season = seasons.find((entry) => entry.id === match?.seasonId);
  const rosterPlayers = players.filter((player) => match?.playerIds.includes(player.id));
  const seasonMatches = matches.filter((entry) => entry.seasonId === match?.seasonId);

  useEffect(() => {
    if (match) {
      setNotesDraft(match.notes);
    }
  }, [match]);

  if (!match || !season) {
    return (
      <View style={styles.emptyState}>
        <ScreenCard>
          <SectionTitle title="Wedstrijd niet gevonden" subtitle="Ga terug naar het overzicht en open de wedstrijd opnieuw." />
        </ScreenCard>
      </View>
    );
  }

  const score = scoreForMatch(match);
  const currentSecond = Math.min(match.durationMinutes * 60, currentMatchSecond(match.clock.elapsedSeconds, match.clock.isRunning, match.clock.runningSince, now));
  const attendingPlayers = rosterPlayers.filter((player) => match.attendance[player.id] === "attending");

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenCard style={styles.heroCard}>
        <SectionTitle title={`CoachMate vs ${match.opponentName}`} subtitle={`${season.name} - ${formatDateLabel(match.kickoffAt)} - ${match.location}`} />
        <View style={styles.scoreRow}>
          <Text style={styles.heroScore}>{score.goalsFor}</Text>
          <Text style={styles.heroDash}>-</Text>
          <Text style={styles.heroScore}>{score.goalsAgainst}</Text>
        </View>
        <View style={styles.rowWrap}>
          <Pill label={match.status} active />
          <Pill label={formatClock(currentSecond)} />
          <Pill label={match.lastWrite.label} />
        </View>
        <View style={styles.buttonRow}>
          <PrimaryButton label={match.clock.isRunning ? "Klok pauzeren" : "Klok starten"} onPress={() => toggleMatchClock(match)} />
          <PrimaryButton label="Wedstrijd afronden" onPress={() => finishMatch(match)} tone="secondary" />
        </View>
      </ScreenCard>

      <ScreenCard>
        <Text style={styles.cardTitle}>Aanwezigheid en ouderlinks</Text>
        {rosterPlayers.map((player) => {
          const invite = invites.find((entry) => entry.matchId === match.id && entry.playerId === player.id);

          return (
            <View key={player.id} style={styles.lineBlock}>
              <View style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerTitle}>#{player.jerseyNumber} {player.firstName} {player.lastName}</Text>
                  <Text style={styles.playerMeta}>{player.parentName} - {player.parentPhone}</Text>
                </View>
                <PrimaryButton
                  label="Deel link"
                  onPress={async () => {
                    if (!invite) {
                      await ensureInvites(match);
                      return;
                    }
                    await Share.share({ message: buildInviteMessage(match, player, invite) });
                  }}
                  tone="secondary"
                />
              </View>
              <View style={styles.rowWrap}>
                <Pill label="Ja" active={match.attendance[player.id] === "attending"} onPress={() => updateAttendance(match, rosterPlayers, seasonMatches, player.id, "attending")} />
                <Pill label="Nee" active={match.attendance[player.id] === "absent"} onPress={() => updateAttendance(match, rosterPlayers, seasonMatches, player.id, "absent")} />
                <Pill label="Open" active={match.attendance[player.id] === "pending"} onPress={() => updateAttendance(match, rosterPlayers, seasonMatches, player.id, "pending")} />
              </View>
            </View>
          );
        })}
      </ScreenCard>

      <ScreenCard>
        <Text style={styles.cardTitle}>Keepersplanning</Text>
        <Text style={styles.helper}>CoachMate stelt automatisch een planning voor zodra aanwezigheid bekend is. Je kunt daarna handmatig wisselen.</Text>
        <View style={styles.rowWrap}>
          <Pill label={match.goalkeeperPlanMode === "suggested" ? "Automatisch" : "Handmatig"} active />
          <Pill label="Herstel voorstel" onPress={() => restoreSuggestedGoalkeeperPlan(match, rosterPlayers, seasonMatches)} />
        </View>
        {match.goalkeeperSlots.map((slot) => (
          <View key={slot.id} style={styles.lineBlock}>
            <Text style={styles.playerTitle}>{formatClock(slot.startSecond)} - {formatClock(slot.endSecond)}</Text>
            <View style={styles.rowWrap}>
              {attendingPlayers.map((player) => (
                <Pill
                  key={player.id}
                  label={player.firstName}
                  active={slot.playerId === player.id}
                  onPress={() => assignGoalkeeper(match, slot.id, player.id)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScreenCard>

      <ScreenCard>
        <Text style={styles.cardTitle}>Invalbeurten</Text>
        {attendingPlayers.map((player) => {
          const openShift = match.shifts.find((shift) => shift.playerId === player.id && shift.endedAtSecond === null);
          const secondsPlayed = match.shifts
            .filter((shift) => shift.playerId === player.id)
            .reduce((sum, shift) => sum + ((shift.endedAtSecond ?? currentSecond) - shift.startedAtSecond), 0);

          return (
            <View key={player.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.playerTitle}>{player.firstName}</Text>
                <Text style={styles.playerMeta}>Speelminuten: {formatMinutes(secondsPlayed)}</Text>
              </View>
              <PrimaryButton
                label={openShift ? "Stop" : "Start"}
                onPress={() => toggleShift(match, player.id)}
                tone={openShift ? "danger" : "primary"}
              />
            </View>
          );
        })}
      </ScreenCard>

      <ScreenCard>
        <Text style={styles.cardTitle}>Doelpunten</Text>
        <View style={styles.buttonRow}>
          <PrimaryButton label="Tegendoelpunt" onPress={() => addGoal(match, "opponent", null)} tone="danger" />
          <PrimaryButton label="Doelpunt zonder scorer" onPress={() => addGoal(match, "coachmate", null)} />
        </View>
        <View style={styles.rowWrap}>
          {attendingPlayers.map((player) => (
            <Pill key={player.id} label={`Goal ${player.firstName}`} onPress={() => addGoal(match, "coachmate", player.id)} />
          ))}
        </View>
        {match.goals.map((goal) => {
          const scorer = rosterPlayers.find((player) => player.id === goal.scorerPlayerId);
          return (
            <View key={goal.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.playerTitle}>
                  {goal.side === "coachmate" ? "CoachMate" : "Tegenstander"} - {formatClock(goal.second)}
                </Text>
                <Text style={styles.playerMeta}>
                  {scorer ? `${scorer.firstName} ${scorer.lastName}` : "Geen scorer"} - {goal.actor.label}
                </Text>
              </View>
              <PrimaryButton label="Undo" onPress={() => removeGoal(match, goal.id)} tone="secondary" />
            </View>
          );
        })}
      </ScreenCard>

      <ScreenCard>
        <Text style={styles.cardTitle}>Correcties achteraf</Text>
        {match.shifts.map((shift) => {
          const player = rosterPlayers.find((entry) => entry.id === shift.playerId);
          return (
            <View key={shift.id} style={styles.lineBlock}>
              <Text style={styles.playerTitle}>{player ? player.firstName : "Speler"} - {formatClock(shift.startedAtSecond)} - {formatClock(shift.endedAtSecond ?? currentSecond)}</Text>
              <View style={styles.rowWrap}>
                <Pill label="-30s start" onPress={() => updateShift(match, shift.id, Math.max(0, shift.startedAtSecond - 30), shift.endedAtSecond)} />
                <Pill label="+30s start" onPress={() => updateShift(match, shift.id, Math.min(match.durationMinutes * 60, shift.startedAtSecond + 30), shift.endedAtSecond)} />
                <Pill
                  label="-30s eind"
                  onPress={() => updateShift(match, shift.id, shift.startedAtSecond, Math.max(shift.startedAtSecond, (shift.endedAtSecond ?? currentSecond) - 30))}
                />
                <Pill
                  label="+30s eind"
                  onPress={() => updateShift(match, shift.id, shift.startedAtSecond, Math.min(match.durationMinutes * 60, (shift.endedAtSecond ?? currentSecond) + 30))}
                />
                <Pill label="Verwijder" onPress={() => removeShift(match, shift.id)} />
              </View>
            </View>
          );
        })}
      </ScreenCard>

      <ScreenCard>
        <Text style={styles.cardTitle}>Notities</Text>
        <Field
          value={notesDraft}
          onChangeText={setNotesDraft}
          placeholder="Bijzonderheden, blessures, afspraken..."
          multiline
          style={{ minHeight: 110, textAlignVertical: "top" }}
        />
        <PrimaryButton label="Notities opslaan" onPress={() => updateNotes(match, notesDraft)} tone="secondary" />
      </ScreenCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    gap: 16,
    backgroundColor: "#f6fbff"
  },
  emptyState: {
    flex: 1,
    padding: 18,
    justifyContent: "center",
    backgroundColor: "#f6fbff"
  },
  heroCard: {
    backgroundColor: "#ecfeff"
  },
  scoreRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16
  },
  heroScore: {
    fontSize: 44,
    fontWeight: "900",
    color: "#0f172a"
  },
  heroDash: {
    fontSize: 34,
    color: "#0f172a"
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a"
  },
  playerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a"
  },
  playerMeta: {
    fontSize: 13,
    color: "#64748b"
  },
  helper: {
    fontSize: 13,
    color: "#475569"
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  lineBlock: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0"
  }
});
