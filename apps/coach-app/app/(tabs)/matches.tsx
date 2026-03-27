import { formatDateLabel, scoreForMatch } from "@coachmate/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Field, Pill, PrimaryButton, ScreenCard, SectionTitle } from "../../src/components/ui";
import { useCoachData } from "../../src/hooks/useCoachData";
import { createMatch } from "../../src/services/coachMateService";

export default function MatchesScreen() {
  const { isConfigured, matches, seasons } = useCoachData();
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [location, setLocation] = useState("");
  const [kickoffAt, setKickoffAt] = useState("2026-09-05T09:00");
  const [durationMinutes, setDurationMinutes] = useState("60");

  useEffect(() => {
    if (!selectedSeasonId && seasons[0]) {
      setSelectedSeasonId(seasons[0].id);
    }
  }, [selectedSeasonId, seasons]);

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? seasons[0] ?? null;
  const seasonMatches = selectedSeason ? matches.filter((match) => match.seasonId === selectedSeason.id) : [];

  if (!isConfigured) {
    return (
      <View style={styles.emptyState}>
        <ScreenCard>
          <SectionTitle title="Koppeling ontbreekt" subtitle="Zodra Firebase is ingesteld, verschijnen wedstrijden hier realtime." />
        </ScreenCard>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionTitle title="Wedstrijden" subtitle="Per seizoen maak je wedstrijden aan en deel je unieke ouderlinks." />

      <ScreenCard>
        <Text style={styles.cardTitle}>Seizoen kiezen</Text>
        <View style={styles.rowWrap}>
          {seasons.map((season) => (
            <Pill key={season.id} label={season.name} active={selectedSeason?.id === season.id} onPress={() => setSelectedSeasonId(season.id)} />
          ))}
        </View>
      </ScreenCard>

      {selectedSeason ? (
        <ScreenCard>
          <Text style={styles.cardTitle}>Nieuwe wedstrijd in {selectedSeason.name}</Text>
          <Field value={opponentName} onChangeText={setOpponentName} placeholder="Tegenstander" />
          <Field value={location} onChangeText={setLocation} placeholder="Locatie" />
          <Field value={kickoffAt} onChangeText={setKickoffAt} placeholder="Aanvang (YYYY-MM-DDTHH:mm)" />
          <Field value={durationMinutes} onChangeText={setDurationMinutes} placeholder="Duur in minuten" keyboardType="number-pad" />
          <PrimaryButton
            label="Wedstrijd aanmaken"
            onPress={async () => {
              await createMatch(selectedSeason, {
                opponentName,
                location,
                kickoffAt: new Date(kickoffAt).toISOString(),
                durationMinutes: Number(durationMinutes) || 60
              });
              setOpponentName("");
              setLocation("");
            }}
          />
        </ScreenCard>
      ) : null}

      {seasonMatches.map((match) => {
        const score = scoreForMatch(match);
        const attending = Object.values(match.attendance).filter((value) => value === "attending").length;

        return (
          <ScreenCard key={match.id}>
            <View style={styles.matchHeader}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.cardTitle}>CoachMate vs {match.opponentName}</Text>
                <Text style={styles.subtle}>{formatDateLabel(match.kickoffAt)} - {match.location}</Text>
              </View>
              <Text style={styles.score}>{score.goalsFor} - {score.goalsAgainst}</Text>
            </View>
            <View style={styles.rowWrap}>
              <Pill label={match.status} active />
              <Pill label={`${attending} aanwezig`} />
              <Pill label={`${match.playerIds.length} in selectie`} />
            </View>
            <PrimaryButton
              label="Open live wedstrijdscherm"
              onPress={() => router.push({ pathname: "/match/[matchId]", params: { matchId: match.id } })}
            />
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
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a"
  },
  subtle: {
    fontSize: 13,
    color: "#64748b"
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  matchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  score: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0284c7"
  }
});
