import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, SectionList, Text, View } from "react-native";
import { makeActivityStyles } from "@/components/activity.styles";
import { JarVessel } from "@/components/jar-vessel";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import {
  activitySections,
  type ActivityFilters,
  type ActivityRowData,
} from "@/lib/activity-sections";
import { useMoney, useSavings } from "@/lib/savings-store";

function ActivityRow({
  row,
  styles,
  colors,
  accents,
  format,
}: {
  row: ActivityRowData;
  styles: ReturnType<typeof makeActivityStyles>;
  colors: ReturnType<typeof useColors>;
  accents: Record<string, string>;
  format: (minor: number) => string;
}) {
  const accent = accents[row.jar.accent];
  const isDeposit = row.entry.direction === "deposit";
  const movement = isDeposit
    ? row.entry.source === "recurring"
      ? "Scheduled deposit"
      : "Money added"
    : "Money withdrawn";
  const title = row.entry.undoOf ? `Undo · ${movement}` : movement;
  const amountLabel = `${isDeposit ? "+" : "−"}${format(row.entry.amount)}`;
  return (
    <View
      style={styles.row}
      accessibilityLabel={`${title} ${isDeposit ? "into" : "from"} ${row.jar.name}. ${amountLabel}.${row.entry.revisions?.length ? " Corrected." : ""}`}
    >
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: isDeposit ? `${accent}1D` : `${colors.error}17` },
        ]}
      >
        <MaterialIcons
          name={isDeposit ? "south" : "north"}
          size={18}
          color={isDeposit ? accent : colors.error}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{row.jar.name}</Text>
        <Text style={styles.rowMeta}>
          {title}
          {row.entry.revisions?.length ? " · Corrected" : ""}
          {row.entry.note ? ` · ${row.entry.note}` : ""}
        </Text>
      </View>
      <Text
        style={[styles.rowAmount, { color: isDeposit ? accent : colors.error }]}
      >
        {amountLabel}
      </Text>
    </View>
  );
}

export default function ActivityScreen() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeActivityStyles(colors), [colors]);
  const { jars } = useSavings();
  const format = useMoney();
  const [filters, setFilters] = useState<ActivityFilters>({});
  const filtered = Boolean(
    filters.jarId ||
    (filters.direction && filters.direction !== "all") ||
    (filters.range && filters.range !== "all"),
  );
  const hasActivity = jars.some(
    (jar) => !jar.archived && jar.entries.length > 0,
  );

  const groups = useMemo(
    () => activitySections(jars, new Date(), filters),
    [jars, filters],
  );

  return (
    <ScreenContainer>
      <SectionList
        sections={groups}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        keyExtractor={(row) => `${row.jar.id}:${row.entry.id}`}
        ListHeaderComponent={
          <>
            <Text style={styles.kicker}>ACTIVITY</Text>
            <Text style={styles.title}>Every move,{`\n`}told simply.</Text>
            <View style={styles.filters}>
              <View style={styles.filterHeading}>
                <Text style={styles.filterTitle}>Filter activity</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reset activity filters"
                  disabled={!filtered}
                  onPress={() => setFilters({})}
                  style={({ pressed }) => [
                    styles.reset,
                    !filtered && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.resetText}>Reset</Text>
                </Pressable>
              </View>
              <Text style={styles.filterLabel}>Jar</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.jarChoices}
              >
                {[
                  { id: "", name: "All jars" },
                  ...jars.filter((jar) => !jar.archived),
                ].map((jar) => {
                  const selected = (filters.jarId ?? "") === jar.id;
                  return (
                    <Pressable
                      key={jar.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Jar: ${jar.name}`}
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setFilters((current) => ({
                          ...current,
                          jarId: jar.id || undefined,
                        }))
                      }
                      style={({ pressed }) => [
                        styles.choice,
                        selected && styles.choiceSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          selected && styles.choiceTextSelected,
                        ]}
                      >
                        {jar.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.filterLabel}>Direction</Text>
              <View style={styles.choices}>
                {(
                  [
                    ["all", "All"],
                    ["deposit", "Deposits"],
                    ["withdrawal", "Withdrawals"],
                  ] as const
                ).map(([value, label]) => {
                  const selected = (filters.direction ?? "all") === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityLabel={`Direction: ${label}`}
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setFilters((current) => ({
                          ...current,
                          direction: value,
                        }))
                      }
                      style={({ pressed }) => [
                        styles.choice,
                        selected && styles.choiceSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          selected && styles.choiceTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.filterLabel}>Date range</Text>
              <View style={styles.choices}>
                {(
                  [
                    ["all", "All time"],
                    ["7days", "7 days"],
                    ["30days", "30 days"],
                  ] as const
                ).map(([value, label]) => {
                  const selected = (filters.range ?? "all") === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityLabel={`Date range: ${label}`}
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setFilters((current) => ({ ...current, range: value }))
                      }
                      style={({ pressed }) => [
                        styles.choice,
                        selected && styles.choiceSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          selected && styles.choiceTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.filterHint}>
                Date ranges include today. Archived jars stay in Profile.
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <JarVessel
              accent={accents.amber}
              icon="star"
              progress={0}
              size="medium"
            />
            <Text style={styles.emptyTitle}>
              {hasActivity ? "No matching activity." : "No activity yet."}
            </Text>
            <Text style={styles.emptyCopy}>
              {hasActivity
                ? "Try another filter or reset to see every move."
                : "Your deposits and withdrawals will appear here."}
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View
            style={[
              styles.groupCard,
              index === 0 && styles.groupCardFirst,
              index === section.data.length - 1 && styles.groupCardLast,
            ]}
          >
            <ActivityRow
              row={item}
              styles={styles}
              colors={colors}
              accents={accents}
              format={format}
            />
            {index < section.data.length - 1 ? (
              <View style={styles.divider} />
            ) : null}
          </View>
        )}
      />
    </ScreenContainer>
  );
}
