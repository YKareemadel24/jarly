import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { makeStyles } from "@/components/jar-reminder.styles";
import { useColors } from "@/hooks/use-colors";
import { type Jar, type JarReminder } from "@/lib/domain/jar";
import {
  isValidJarReminder,
  nextReminderDates,
  snoozeReminderOneDay,
} from "@/lib/domain/reminder";
import { useSavings } from "@/lib/savings-store";
import { useSettings } from "@/lib/settings-store";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_REMINDER: JarReminder = {
  enabled: true,
  hour: 9,
  minute: 0,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
};

export function JarReminderSettings({ jar }: { jar: Jar }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { editJar } = useSavings();
  const { remindersEnabled } = useSettings();
  const reminder = jar.reminder ?? DEFAULT_REMINDER;
  const [enabled, setEnabled] = useState(reminder.enabled);
  const [hour, setHour] = useState(String(reminder.hour).padStart(2, "0"));
  const [minute, setMinute] = useState(
    String(reminder.minute).padStart(2, "0"),
  );
  const [weekdays, setWeekdays] = useState(reminder.weekdays);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const next = jar.reminder ?? DEFAULT_REMINDER;
    setEnabled(next.enabled);
    setHour(String(next.hour).padStart(2, "0"));
    setMinute(String(next.minute).padStart(2, "0"));
    setWeekdays(next.weekdays);
  }, [jar.id, jar.reminder]);

  function save(action: "save" | "snooze" | "clear" = "save") {
    const next: JarReminder = {
      ...reminder,
      enabled,
      hour: /^\d{1,2}$/.test(hour) ? Number(hour) : NaN,
      minute: /^\d{1,2}$/.test(minute) ? Number(minute) : NaN,
      weekdays,
    };
    if (!isValidJarReminder(next)) {
      setMessage("Choose a time from 00:00 to 23:59 and at least one weekday.");
      return;
    }
    if (action === "clear") delete next.snoozedUntil;
    try {
      editJar(jar.id, {
        reminder: action === "snooze" ? snoozeReminderOneDay(next) : next,
      });
      setMessage("Reminder settings saved.");
      setExpanded(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save your reminder.",
      );
    }
  }

  const [next] = nextReminderDates(reminder);
  const snoozed =
    reminder.snoozedUntil && new Date(reminder.snoozedUntil) > new Date();
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Personal reminder</Text>
      <Text style={styles.copy}>
        {!jar.reminder
          ? "Using default reminders."
          : !reminder.enabled
            ? "Personal reminder paused."
            : snoozed
              ? `Snoozed until ${new Date(reminder.snoozedUntil!).toLocaleString()}.`
              : next
                ? `Next reminder: ${next.toLocaleString()}.`
                : "No personal reminders scheduled."}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((open) => !open)}
        style={styles.secondary}
      >
        <Text style={styles.label}>
          {expanded
            ? "Hide reminder settings"
            : jar.reminder
              ? "Edit reminder"
              : "Set reminder"}
        </Text>
      </Pressable>
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          {message}
        </Text>
      ) : null}
      {expanded && (
        <>
          <Text style={styles.copy}>
            Choose when to check in. Reminders never record a deposit or change
            automatic deposits.
          </Text>
          {!jar.reminder && (
            <Text style={styles.copy}>
              Using default reminders until you save a personal schedule.
            </Text>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Personal schedule enabled</Text>
            <Switch
              accessibilityLabel="Personal schedule enabled"
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ true: colors.primary }}
            />
          </View>
          <Text style={styles.label}>Local time (24-hour)</Text>
          <View style={styles.time}>
            <TextInput
              accessibilityLabel="Reminder hour"
              value={hour}
              onChangeText={setHour}
              keyboardType="number-pad"
              maxLength={2}
              style={styles.input}
            />
            <Text style={styles.label}>:</Text>
            <TextInput
              accessibilityLabel="Reminder minute"
              value={minute}
              onChangeText={setMinute}
              keyboardType="number-pad"
              maxLength={2}
              style={styles.input}
            />
          </View>
          <Text style={styles.label}>Weekdays</Text>
          <View style={styles.days}>
            {DAYS.map((day, index) => (
              <Pressable
                key={day}
                accessibilityRole="checkbox"
                accessibilityLabel={`${day} reminder`}
                accessibilityState={{ checked: weekdays.includes(index) }}
                onPress={() =>
                  setWeekdays((days) =>
                    days.includes(index)
                      ? days.filter((item) => item !== index)
                      : [...days, index].sort(),
                  )
                }
                style={[
                  styles.day,
                  weekdays.includes(index) && styles.selected,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    weekdays.includes(index) && styles.selectedText,
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => save()}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Save reminder</Text>
          </Pressable>
          <View style={styles.days}>
            <Pressable
              accessibilityRole="button"
              onPress={() => save("snooze")}
              style={styles.secondary}
            >
              <Text style={styles.label}>Snooze one day</Text>
            </Pressable>
            {snoozed && (
              <Pressable
                accessibilityRole="button"
                onPress={() => save("clear")}
                style={styles.secondary}
              >
                <Text style={styles.label}>Clear snooze</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.copy}>
            {Platform.OS === "web"
              ? "Web saves your preferences; OS reminders are available in the native app."
              : !remindersEnabled
                ? "Notifications are off. Enable Saving reminders in Profile and allow device notifications to receive reminders."
                : "Delivery requires device notification permission. Manage Saving reminders in Profile."}
          </Text>
          <Text style={styles.copy}>
            The daily 09:00 savings summary stays separate. Up to 63 upcoming
            jar reminders share the device queue. Open the app regularly to
            refill it; reminders stop when the queue runs out. With many jars,
            each gets fewer dates; above 63 eligible jars, some get no slots.
            Open after changing time zones. Clock times skipped by daylight
            saving are skipped.
          </Text>
          {(jar.archived || (jar.target > 0 && jar.balance >= jar.target)) && (
            <Text style={styles.copy}>
              This jar is archived or funded, so its personal reminders are
              quiet.
            </Text>
          )}
        </>
      )}
    </View>
  );
}
