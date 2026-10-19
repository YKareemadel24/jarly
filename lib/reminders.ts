import { type Jar, deadlineCountdown, money } from "@/lib/savings-core";

/** One savings reminder for each active, unfinished jar. */
export function jarReminders(
  jars: Jar[],
  now: Date = new Date(),
  currency: string = "USD",
): { jar: Jar; title: string; detail: string }[] {
  return jars
    .filter((jar) => !jar.archived && jar.balance < jar.target)
    .map((jar) => {
      const details = [
        `${money(jar.target - jar.balance, currency)} left to save.`,
      ];
      const rule = jar.recurring;
      if (rule && !rule.paused && rule.amount > 0) {
        const due = new Date(rule.nextDate ?? jar.createdAt);
        details.push(
          `Scheduled deposit: ${money(rule.amount, currency)} on ${due.toLocaleDateString(
            "en-US",
            {
              month: "short",
              day: "numeric",
              year: "numeric",
            },
          )}.`,
        );
      }
      const deadline = deadlineCountdown(jar.deadline, now);
      if (deadline) details.push(`Deadline: ${deadline}.`);
      return { jar, title: jar.name, detail: details.join(" ") };
    });
}
