import { useMemo } from "react";
import { Text, View } from "react-native";

import { makeSavingsPlanStyles } from "@/components/savings-plan.styles";
import { useColors } from "@/hooks/use-colors";
import {
  deadlineCountdown,
  depositTotalWithin,
  effectiveEntries,
  paceProjection,
  type Jar,
} from "@/lib/savings-core";
import { useMoney } from "@/lib/savings-store";

export function SavingsPlan({ jar }: { jar: Jar }) {
  const colors = useColors();
  const styles = useMemo(() => makeSavingsPlanStyles(colors), [colors]);
  const format = useMoney();
  const now = new Date();
  const projection = paceProjection(jar, now);
  const entries = effectiveEntries(jar.entries);
  const windowMs = 28 * 86_400_000;
  const recentPace = Math.round(
    depositTotalWithin([{ entries }], windowMs, now) / 4,
  );
  const depositDays = new Set(
    entries
      .filter(
        (entry) =>
          entry.direction === "deposit" &&
          new Date(entry.at).getTime() >= now.getTime() - windowMs &&
          new Date(entry.at).getTime() <= now.getTime(),
      )
      .map((entry) => new Date(entry.at).toDateString()),
  );
  const funded = projection.status === "funded";
  const undated = projection.status === "no-deadline";
  const countdown = deadlineCountdown(jar.deadline, now);
  const overdue = countdown === "Past deadline";
  const dueSoon =
    countdown === "1 day left" || /^[2-6] days left$/.test(countdown ?? "");
  const estimatedDate =
    depositDays.size >= 2 && projection.projectedDate
      ? new Date(projection.projectedDate).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : undefined;

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>SAVINGS PLAN</Text>
      <Text style={styles.title}>
        {funded ? "Goal funded." : "One week at a time."}
      </Text>
      {funded ? (
        <Text style={styles.copy}>You have reached this jar’s target.</Text>
      ) : (
        <>
          {undated ? (
            <Text style={styles.copy}>
              Set a target date to calculate a weekly amount and finish
              estimate.
            </Text>
          ) : overdue ? (
            <Text style={styles.copy}>
              Your deadline has passed. Choose a new target date to set a weekly
              amount.
            </Text>
          ) : countdown === "Due today" || dueSoon ? (
            <View style={styles.metric}>
              <Text style={styles.label}>
                {dueSoon ? "Remaining by deadline" : "Remaining today"}
              </Text>
              <Text style={styles.amount}>
                {format(jar.target - jar.balance)}
              </Text>
            </View>
          ) : (
            <View style={styles.metric}>
              <Text style={styles.label}>Weekly amount to target</Text>
              <Text style={styles.amount}>
                {format(projection.requiredPerWeekMinor)} / week
              </Text>
            </View>
          )}
          <View style={styles.metric}>
            <Text style={styles.label}>Recent deposit pace</Text>
            <Text style={styles.amount}>{format(recentPace)} / week</Text>
            <Text style={styles.hint}>
              Deposits over the past 28 days, averaged over four weeks.
            </Text>
          </View>
          {!undated &&
            (estimatedDate ? (
              <View style={styles.metric}>
                <Text style={styles.label}>Estimated finish</Text>
                <Text style={styles.estimate}>{estimatedDate}</Text>
                <Text style={styles.hint}>
                  Uses the higher of recent deposits and your recurring
                  schedule. Withdrawals can delay this estimate.
                </Text>
              </View>
            ) : (
              <Text style={styles.copy}>
                {depositDays.size >= 2
                  ? "A finish estimate is unavailable at this pace."
                  : "Record deposits on two different days within the past 28 days to estimate a finish."}
              </Text>
            ))}
        </>
      )}
    </View>
  );
}
