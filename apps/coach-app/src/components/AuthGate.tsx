import { PropsWithChildren, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { signInCoach } from "../auth/client";
import { useCoachSession } from "../hooks/useCoachSession";
import { Field, PrimaryButton, ScreenCard, SectionTitle } from "./ui";

export function AuthGate({ children }: PropsWithChildren) {
  const { user, isReady } = useCoachSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  if (!isReady) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  return (
    <View style={styles.centered}>
      <ScreenCard style={{ width: "100%" }}>
        <SectionTitle title="Coach login" subtitle="Log in met het coach-account uit Firebase Auth om seizoenen en wedstrijden te beheren." />
        <Field value={email} onChangeText={setEmail} placeholder="E-mailadres" autoCapitalize="none" keyboardType="email-address" />
        <Field value={password} onChangeText={setPassword} placeholder="Wachtwoord" secureTextEntry />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          label={isBusy ? "Bezig..." : "Inloggen"}
          onPress={async () => {
            try {
              setIsBusy(true);
              setError("");
              await signInCoach(email.trim(), password);
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : "Inloggen mislukt");
            } finally {
              setIsBusy(false);
            }
          }}
        />
      </ScreenCard>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "#f6fbff"
  },
  error: {
    color: "#dc2626",
    fontSize: 13
  }
});
