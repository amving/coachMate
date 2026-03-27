import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#0284c7",
        headerShown: false,
        tabBarStyle: {
          height: 68,
          paddingTop: 8
        }
      }}
    >
      <Tabs.Screen name="seasons" options={{ title: "Seizoenen" }} />
      <Tabs.Screen name="matches" options={{ title: "Wedstrijden" }} />
      <Tabs.Screen name="stats" options={{ title: "Statistieken" }} />
      <Tabs.Screen name="settings" options={{ title: "Instellingen" }} />
    </Tabs>
  );
}
