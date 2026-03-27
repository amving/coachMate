import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AuthGate } from "../src/components/AuthGate";

export default function RootLayout() {
  return (
    <AuthGate>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthGate>
  );
}
