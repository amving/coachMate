import { ScrollView, StyleSheet, Text } from "react-native";

import { signOutCoach } from "../../src/auth/client";
import { parentWebUrl } from "../../src/firebase/config";
import { useCoachSession } from "../../src/hooks/useCoachSession";
import { PrimaryButton, ScreenCard, SectionTitle } from "../../src/components/ui";
import { useCoachData } from "../../src/hooks/useCoachData";

export default function SettingsScreen() {
  const { isConfigured } = useCoachData();
  const { user } = useCoachSession();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionTitle title="Instellingen" subtitle="Praktische projectinfo voor Expo, Firebase en de ouder-webapp." />

      <ScreenCard>
        <Text style={styles.cardTitle}>Firebase status</Text>
        <Text style={styles.line}>{isConfigured ? "Verbonden via omgevingsvariabelen" : "Nog niet geconfigureerd"}</Text>
        <Text style={styles.line}>{user?.email ? `Ingelogd als ${user.email}` : "Niet ingelogd"}</Text>
        <Text style={styles.line}>Realtime opslag: Firestore</Text>
        <Text style={styles.line}>Hosting ouderpagina: Firebase Hosting</Text>
        <Text style={styles.line}>Synchronisatie: laatste schrijfactie wint</Text>
        <PrimaryButton label="Uitloggen" onPress={() => signOutCoach()} tone="secondary" />
      </ScreenCard>

      <ScreenCard>
        <Text style={styles.cardTitle}>Ouder-webpagina</Text>
        <Text style={styles.line}>{parentWebUrl || "Stel EXPO_PUBLIC_PARENT_WEB_URL in voor deelbare uitnodigingslinks."}</Text>
      </ScreenCard>

      <ScreenCard>
        <Text style={styles.cardTitle}>Ontwikkelnotities</Text>
        <Text style={styles.line}>Coach-app is opgezet voor Expo Go op iPhone.</Text>
        <Text style={styles.line}>Seizoenen en spelers worden alleen in de coach-app beheerd.</Text>
        <Text style={styles.line}>Ouders hebben geen login en openen alleen een unieke matchlink.</Text>
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
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a"
  },
  line: {
    fontSize: 14,
    color: "#475569"
  }
});
