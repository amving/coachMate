import { buildPlayerSeasonStats, buildTeamSeasonStats, formatMinutes } from "@coachmate/shared";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Pill, ScreenCard, SectionTitle } from "../../src/components/ui";
import { useCoachData } from "../../src/hooks/useCoachData";

export default function StatsScreen() {
  const { isConfigured, matches, players, seasons } = useCoachData();
  const [selectedSeasonId, setSelectedSeasonId] = useState("");

  useEffect(() => {
    if (!selectedSeasonId && seasons[0]) {
      setSelectedSeasonId(seasons[0].id);
    }
  }, [selectedSeasonId, seasons]);

  const seasonMatches = selectedSeasonId ? matches.filter((match) => match.seasonId === selectedSeasonId) : matches;
  const seasonPlayerIds = selectedSeasonId
    ? seasons.find((season) => season.id === selectedSeasonId)?.playerIds ?? []
    : players.map((player) => player.id);
  const teamStats = buildTeamSeasonStats(seasonMatches);
  const playerStats = Object.values(buildPlayerSeasonStats(seasonMatches, seasonPlayerIds));

  if (!isConfigured) {
    return (
      <View style={styles.emptyState}>
        <ScreenCard>
          <SectionTitle title="Statistieken wachten op data" subtitle="Na koppeling met Firebase worden seizoens- en totaalcijfers hier direct berekend." />
        </ScreenCard>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionTitle title="Statistieken" subtitle="Bekijk cijfers per seizoen of cumulatief over alle seizoenen." />

      <ScreenCard>
        <Text style={styles.cardTitle}>Filter</Text>
        <View style={styles.rowWrap}>
          <Pill label="Alle seizoenen" active={!selectedSeasonId} onPress={() => setSelectedSeasonId("")} />
          {seasons.map((season) => (
            <Pill key={season.id} label={season.name} active={selectedSeasonId === season.id} onPress={() => setSelectedSeasonId(season.id)} />
          ))}
        </View>
      </ScreenCard>

      <ScreenCard>
        <Text style={styles.cardTitle}>Team</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statValue}>{teamStats.finishedMatches}/{teamStats.matches}</Text>
          <Text style={styles.statLabel}>afgeronde wedstrijden</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statValue}>{teamStats.wins}-{teamStats.draws}-{teamStats.losses}</Text>
          <Text style={styles.statLabel}>winst-gelijk-verlies</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statValue}>{teamStats.goalsFor}-{teamStats.goalsAgainst}</Text>
          <Text style={styles.statLabel}>doelpunten voor-tegen</Text>
        </View>
      </ScreenCard>

      {playerStats.map((entry) => {
        const player = players.find((item) => item.id === entry.playerId);
        if (!player) {
          return null;
        }

        return (
          <ScreenCard key={entry.playerId}>
            <Text style={styles.cardTitle}>#{player.jerseyNumber} {player.firstName} {player.lastName}</Text>
            <Text style={styles.statLabel}>Wedstrijden: {entry.matchesPlayed}</Text>
            <Text style={styles.statLabel}>Goals: {entry.goalsScored}</Text>
            <Text style={styles.statLabel}>Speelminuten: {formatMinutes(entry.minutesPlayed)}</Text>
            <Text style={styles.statLabel}>Keepersminuten: {formatMinutes(entry.goalkeeperMinutes)}</Text>
          </ScreenCard>
        );
      })}
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
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a"
  },
  statsRow: {
    gap: 4
  },
  statValue: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0284c7"
  },
  statLabel: {
    fontSize: 14,
    color: "#475569"
  }
});
