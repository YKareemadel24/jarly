import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type JarVesselProps = {
  accent: string;
  icon: string;
  progress: number;
  size?: "small" | "medium" | "large";
  label?: string;
  /** Increment to replay the coin-drop deposit effect. */
  coinDropKey?: number;
};

const SIZES = {
  small: { width: 74, height: 88, icon: 24, label: 10 },
  medium: { width: 104, height: 126, icon: 33, label: 11 },
  large: { width: 164, height: 198, icon: 49, label: 13 },
};

const TICK_LEVELS = [25, 50, 75];

export function JarVessel({ accent, icon, progress, size = "medium", label, coinDropKey }: JarVesselProps) {
  const metrics = SIZES[size];
  const reduceMotion = Boolean(useReducedMotion());
  const fill = Math.max(0, Math.min(100, progress));
  const complete = fill >= 99.5;

  // Fill height lives in pixels so Reanimated can drive it natively.
  const fillHeight = useSharedValue((metrics.height * fill) / 100);
  useEffect(() => {
    const target = (metrics.height * fill) / 100;
    if (reduceMotion) {
      fillHeight.value = withTiming(target, { duration: 90 });
    } else {
      fillHeight.value = withSpring(target, { damping: 20, stiffness: 105 });
    }
  }, [fill, fillHeight, metrics.height, reduceMotion]);

  const coinY = useSharedValue(-36);
  const coinOpacity = useSharedValue(0);
  useEffect(() => {
    if (!coinDropKey || reduceMotion) return;
    coinY.value = -36;
    coinOpacity.value = withTiming(1, { duration: 70 });
    coinY.value = withSequence(
      withTiming(metrics.height * 0.3, { duration: 430, easing: Easing.in(Easing.quad) }),
      withSpring(metrics.height * 0.24, { damping: 13, stiffness: 190 }),
    );
    coinOpacity.value = withDelay(480, withTiming(0, { duration: 260 }));
  }, [coinDropKey, coinY, coinOpacity, metrics.height, reduceMotion]);

  const fillStyle = useAnimatedStyle(() => ({ height: fillHeight.value }));
  const coinStyle = useAnimatedStyle(() => ({ transform: [{ translateY: coinY.value }], opacity: coinOpacity.value }));

  return (
    <View style={[styles.wrap, { width: metrics.width, height: metrics.height + 12 }]} accessible accessibilityRole="image" accessibilityLabel={label}>
      {/* Coin drop plays above the glass so the fall is never clipped. */}
      <Animated.View pointerEvents="none" style={[styles.coinLayer, coinStyle]}>
        <View style={[styles.coin, { width: metrics.icon * 0.52, height: metrics.icon * 0.52 }]} />
      </Animated.View>
      <View style={[styles.lid, complete ? [styles.lidSealed, { width: metrics.width * 0.72, left: metrics.width * 0.14, backgroundColor: `${accent}C4` }] : { width: metrics.width * 0.52, left: metrics.width * 0.24, backgroundColor: `${accent}75` }]} />
      <View style={[styles.neck, { width: metrics.width * 0.62, left: metrics.width * 0.19, borderColor: `${accent}A8` }]} />
      <View style={[styles.body, { width: metrics.width, height: metrics.height, borderColor: `${accent}9B`, backgroundColor: `${accent}10` }]}>
        <Animated.View style={[styles.fill, { backgroundColor: `${accent}A8` }, fillStyle]}>
          <View style={[styles.surface, { backgroundColor: `${accent}C9` }]} />
        </Animated.View>
        <View style={[styles.glow, { backgroundColor: complete ? `${accent}40` : `${accent}28` }]} />
        <View style={styles.reflection} />
        {/* Etched milestone ticks double as a progress ruler (never color-only meaning). */}
        {TICK_LEVELS.map((level) => (
          <View key={level} pointerEvents="none" style={[styles.tick, { bottom: `${level}%` }]}>
            <View style={styles.tickLine} />
            {size === "large" ? <Text style={styles.tickLabel}>{level}</Text> : null}
          </View>
        ))}
        <View style={[styles.iconWrap, { top: "39%" }]}>
          <View style={{ width: metrics.icon + 22, height: metrics.icon + 22, alignItems: "center", justifyContent: "center" }}>
            <View style={[StyleSheet.absoluteFillObject, styles.iconScrim]} />
            <MaterialIcons name={icon as never} size={metrics.icon} color="#FFFDF9" style={styles.iconGlyph} />
          </View>
        </View>
        {complete ? (
          <View style={[styles.badge, { top: metrics.height * 0.14, right: -6, width: size === "large" ? 32 : size === "medium" ? 27 : 23, height: size === "large" ? 32 : size === "medium" ? 27 : 23 }]}>
            <MaterialIcons name="verified" size={size === "large" ? 20 : size === "medium" ? 17 : 14} color={accent} />
          </View>
        ) : null}
        {label ? (
          <View style={styles.label}>
            <Text style={[styles.labelText, { fontSize: metrics.label }]}>{label}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", alignSelf: "center" },
  coinLayer: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", zIndex: 6 },
  coin: { borderRadius: 999, backgroundColor: "#E8BE5F", borderWidth: 1.5, borderColor: "#B8860B", shadowColor: "#4A3324", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 }, shadowRadius: 3, elevation: 2 },
  lid: { position: "absolute", top: 0, height: 9, borderRadius: 5, zIndex: 4 },
  lidSealed: { height: 11, borderRadius: 6 },
  neck: { position: "absolute", top: 7, height: 17, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderTopLeftRadius: 9, borderTopRightRadius: 9, zIndex: 3 },
  body: { position: "absolute", bottom: 0, overflow: "hidden", borderWidth: 1.5, borderTopLeftRadius: 27, borderTopRightRadius: 27, borderBottomLeftRadius: 35, borderBottomRightRadius: 35, shadowColor: "#4A3324", shadowOpacity: 0.16, shadowOffset: { width: 0, height: 9 }, shadowRadius: 12, elevation: 4 },
  fill: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  surface: { position: "absolute", left: "-8%", right: "-8%", top: -4, height: 10, borderRadius: 999, opacity: 0.95 },
  glow: { position: "absolute", left: "12%", right: "12%", bottom: "10%", height: "47%", borderRadius: 999 },
  reflection: { position: "absolute", top: "16%", left: "15%", width: "13%", height: "35%", borderRadius: 99, backgroundColor: "rgba(255,255,255,0.47)", transform: [{ rotate: "-12deg" }] },
  tick: { position: "absolute", left: "58%", right: "10%", flexDirection: "row", alignItems: "center", gap: 3 },
  tickLine: { flex: 1, height: 1.5, borderRadius: 1, backgroundColor: "rgba(44,35,29,0.26)" },
  tickLabel: { color: "rgba(44,35,29,0.48)", fontSize: 7, fontWeight: "800" },
  iconWrap: { position: "absolute", left: 0, right: 0, height: 58, alignItems: "center", justifyContent: "center" },
  iconScrim: { backgroundColor: "rgba(44,35,29,0.30)" },
  iconGlyph: { zIndex: 1 },
  badge: { position: "absolute", borderRadius: 999, backgroundColor: "#FFFDF9", alignItems: "center", justifyContent: "center", shadowColor: "#4A3324", shadowOpacity: 0.22, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 3, zIndex: 5 },
  label: { position: "absolute", alignSelf: "center", bottom: 9, maxWidth: "88%", alignItems: "center", backgroundColor: "rgba(32,27,24,0.38)", borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  labelText: { color: "rgba(255,253,249,0.96)", fontWeight: "800", letterSpacing: 0.35 },
});
