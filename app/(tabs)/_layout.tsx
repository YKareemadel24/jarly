import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const padding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: 1, height: 60 + padding, paddingTop: 8, paddingBottom: padding }, tabBarLabelStyle: { fontSize: 11, fontWeight: "700" } }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <MaterialIcons name="home-filled" color={color} size={23} /> }} />
    <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: ({ color }) => <MaterialIcons name="receipt-long" color={color} size={22} /> }} />
    <Tabs.Screen name="stats" options={{ title: "Insights", tabBarIcon: ({ color }) => <MaterialIcons name="query-stats" color={color} size={24} /> }} />
    <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <MaterialIcons name="person-outline" color={color} size={25} /> }} />
  </Tabs>;
}
