import { Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";

export function EmptyState({ title, copy, ctaLabel, onCta }: { title: string; copy: string; ctaLabel: string; onCta: () => void }) {
  const colors = useColors();
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 26, padding: 26, alignItems: "center" }}>
      <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "800", marginTop: 6, textAlign: "center" }}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 }}>{copy}</Text>
      <Pressable onPress={onCta} style={{ backgroundColor: colors.primary, minHeight: 52, borderRadius: 16, marginTop: 18, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#FFFDF9", fontSize: 14, fontWeight: "800" }}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

export function JarSkeleton() {
  const colors = useColors();
  return <View style={{ height: 114, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: 0.7 }} />;
}
