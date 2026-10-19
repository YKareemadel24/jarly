import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo } from "react";
import { SectionList, Text, View } from "react-native";
import { makeActivityStyles } from "@/components/activity.styles";
import { JarVessel } from "@/components/jar-vessel";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import {
  activitySections,
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
  const title = isDeposit
    ? row.entry.source === "recurring"
      ? "Scheduled deposit"
      : "Money added"
    : "Money withdrawn";
  const amountLabel = `${isDeposit ? "+" : "−"}${format(row.entry.amount)}`;
  return (
    <View
      style={styles.row}
      accessibilityLabel={`${title} into ${row.jar.name}. ${amountLabel}.`}
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
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{row.jar.name}</Text>
        <Text style={styles.rowMeta}>
          {title}
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

  const groups = useMemo(() => activitySections(jars), [jars]);

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
            <Text style={styles.title}>Every deposit,{`\n`}told simply.</Text>
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
            <Text style={styles.emptyTitle}>Nothing saved yet.</Text>
            <Text style={styles.emptyCopy}>
              Your deposits will appear here.
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
