import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Field, Pill, PrimaryButton, ScreenCard, SectionTitle } from "../../src/components/ui";
import { useCoachData } from "../../src/hooks/useCoachData";
import { createPlayer, createSeason, togglePlayerForSeason } from "../../src/services/coachMateService";

const palette = ["#0ea5e9", "#14b8a6", "#f97316", "#ec4899", "#8b5cf6"];

export default function SeasonsScreen() {
  const { isConfigured, players, seasons } = useCoachData();
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [seasonName, setSeasonName] = useState("");
  const [seasonStartDate, setSeasonStartDate] = useState("2026-08-01");
  const [seasonEndDate, setSeasonEndDate] = useState("2027-06-30");
  const [seasonColor, setSeasonColor] = useState(palette[0]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("1");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");

  useEffect(() => {
    if (!selectedSeasonId && seasons[0]) {
      setSelectedSeasonId(seasons[0].id);
    }
  }, [selectedSeasonId, seasons]);

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? seasons[0] ?? null;

  if (!isConfigured) {
    return (
      <View style={styles.emptyState}>
        <ScreenCard>
          <SectionTitle title="Firebase nog niet ingesteld" subtitle="Vul eerst de env-variabelen in zodat Expo en Firestore kunnen verbinden." />
        </ScreenCard>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionTitle title="CoachMate" subtitle="Beheer seizoenen en spelers die later in wedstrijden beschikbaar zijn." />

      <ScreenCard>
        <Text style={styles.cardTitle}>Nieuw seizoen</Text>
        <Field value={seasonName} onChangeText={setSeasonName} placeholder="Bijvoorbeeld 2026 / 2027" />
        <Field value={seasonStartDate} onChangeText={setSeasonStartDate} placeholder="Startdatum (YYYY-MM-DD)" />
        <Field value={seasonEndDate} onChangeText={setSeasonEndDate} placeholder="Einddatum (YYYY-MM-DD)" />
        <View style={styles.rowWrap}>
          {palette.map((color) => (
            <Pill key={color} label={color.replace("#", "")} active={seasonColor === color} onPress={() => setSeasonColor(color)} />
          ))}
        </View>
        <PrimaryButton
          label="Seizoen toevoegen"
          onPress={async () => {
            await createSeason({
              name: seasonName,
              startDate: seasonStartDate,
              endDate: seasonEndDate,
              accentColor: seasonColor
            });
            setSeasonName("");
          }}
        />
      </ScreenCard>

      <ScreenCard>
        <Text style={styles.cardTitle}>Coach selecteert seizoen</Text>
        <View style={styles.rowWrap}>
          {seasons.map((season) => (
            <Pill
              key={season.id}
              label={season.name}
              active={selectedSeason?.id === season.id}
              onPress={() => setSelectedSeasonId(season.id)}
            />
          ))}
        </View>
      </ScreenCard>

      <ScreenCard>
        <Text style={styles.cardTitle}>Nieuwe speler</Text>
        <Field value={firstName} onChangeText={setFirstName} placeholder="Voornaam" />
        <Field value={lastName} onChangeText={setLastName} placeholder="Achternaam" />
        <Field value={jerseyNumber} onChangeText={setJerseyNumber} placeholder="Rugnummer" keyboardType="number-pad" />
        <Field value={parentName} onChangeText={setParentName} placeholder="Naam ouder" />
        <Field value={parentPhone} onChangeText={setParentPhone} placeholder="WhatsApp / telefoon" keyboardType="phone-pad" />
        <PrimaryButton
          label="Speler toevoegen"
          onPress={async () => {
            await createPlayer({
              firstName,
              lastName,
              jerseyNumber: Number(jerseyNumber) || 0,
              parentName,
              parentPhone
            });
            setFirstName("");
            setLastName("");
            setJerseyNumber("1");
            setParentName("");
            setParentPhone("");
          }}
        />
      </ScreenCard>

      {selectedSeason ? (
        <ScreenCard>
          <Text style={styles.cardTitle}>Selectie voor {selectedSeason.name}</Text>
          <Text style={styles.helper}>Spelers worden alleen door de coach beheerd. Een seizoen kan een andere selectie hebben dan eerdere seizoenen.</Text>
          {players.map((player) => {
            const active = selectedSeason.playerIds.includes(player.id);
            return (
              <View key={player.id} style={styles.listRow}>
                <View>
                  <Text style={styles.playerName}>#{player.jerseyNumber} {player.firstName} {player.lastName}</Text>
                  <Text style={styles.playerMeta}>{player.parentName} - {player.parentPhone}</Text>
                </View>
                <Pill
                  label={active ? "In seizoen" : "Toevoegen"}
                  active={active}
                  onPress={() => togglePlayerForSeason(selectedSeason, player.id)}
                />
              </View>
            );
          })}
        </ScreenCard>
      ) : null}
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
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 12
  },
  playerName: {
    fontSize: 16,
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
  }
});
