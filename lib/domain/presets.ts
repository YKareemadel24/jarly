/**
 * One-tap deposit suggestions derived entirely from the jar's own state.
 *
 * Pure and integer-minor throughout; callers format the words. Equal amounts
 * collapse to their first suggestion, so a jar never shows two chips that
 * would deposit the same money.
 */

import { money } from "./money";
import { type Jar, MILESTONE_LEVELS } from "./jar";
import { recurringPerWeek } from "./schedule";

/** Identity for a one-tap deposit suggestion. */
export type QuickPresetId =
  | "round-up"
  | "next-milestone"
  | "weekly-pace"
  | "repeat-last";

export type QuickPreset = {
  id: QuickPresetId;
  /** Short primary label, e.g. "Hit 50%". */
  label: string;
  /** One-line explanation of where the amount came from. */
  hint: string;
  /** Integer minor units, always greater than zero. */
  amount: number;
};

/** Step a round-up suggestion snaps the balance to, in minor units. */
const ROUND_UP_STEP = 500;
/** Largest round-up gap worth suggesting, so a chip never dwarfs the goal. */
const ROUND_UP_CAP = 20_000;
/** Trailing window used to derive the jar's own saving pace. */
const PACE_WINDOW_MS = 28 * 86_400_000;

/**
 * One-tap deposit suggestions derived entirely from the jar's own state: a
 * round-up, the exact gap to the next unreached milestone, the jar's own recent
 * pace, and a repeat of the last deposit. Equal amounts collapse to their first
 * suggestion, so a jar never shows two chips that would deposit the same money.
 */
export function quickPresets(
  jar: Pick<
    Jar,
    "target" | "balance" | "milestonesHit" | "entries" | "recurring"
  >,
  now: Date = new Date(),
  currency: string = "USD",
): QuickPreset[] {
  const suggestions: QuickPreset[] = [];

  // 1. Neaten the balance up to the next clean step. An empty jar has nothing
  // to neaten, so it starts from the milestone or pace suggestion instead.
  const remainder = Math.abs(jar.balance) % ROUND_UP_STEP;
  const roundUp = remainder === 0 ? ROUND_UP_STEP : ROUND_UP_STEP - remainder;
  if (jar.balance > 0 && roundUp > 0 && roundUp <= ROUND_UP_CAP) {
    suggestions.push({
      id: "round-up",
      label: `Round to ${money(jar.balance + roundUp, currency)}`,
      hint: "Neaten the balance",
      amount: roundUp,
    });
  }

  // 2. Land exactly on the next milestone this jar has not recorded yet.
  if (jar.target > 0) {
    const ratio = (jar.balance / jar.target) * 100;
    const level = MILESTONE_LEVELS.find((candidate) => ratio < candidate);
    if (level) {
      const gap = Math.round((jar.target * level) / 100) - jar.balance;
      if (gap > 0) {
        suggestions.push({
          id: "next-milestone",
          label: `Hit ${level}%`,
          hint: `${money(gap, currency)} to go`,
          amount: gap,
        });
      }
    }
  }

  // 3. The jar's own pace: trailing deposits, or its recurring schedule.
  let recent = 0;
  for (const entry of jar.entries) {
    if (entry.direction !== "deposit") continue;
    const at = new Date(entry.at).getTime();
    if (at >= now.getTime() - PACE_WINDOW_MS && at <= now.getTime())
      recent += entry.amount;
  }
  const pace = Math.max(
    Math.round(recent / 4),
    recurringPerWeek(jar.recurring),
  );
  if (pace > 0) {
    suggestions.push({
      id: "weekly-pace",
      label: "Your weekly pace",
      hint: `${money(pace, currency)} per week`,
      amount: pace,
    });
  }

  // 4. Repeat whatever was last added. Newest entries come first.
  for (const entry of jar.entries) {
    if (entry.direction !== "deposit") continue;
    suggestions.push({
      id: "repeat-last",
      label: "Repeat last",
      hint: money(entry.amount, currency),
      amount: entry.amount,
    });
    break;
  }

  const seen = new Set<number>();
  return suggestions
    .filter((preset) => {
      if (!Number.isInteger(preset.amount) || preset.amount <= 0) return false;
      if (seen.has(preset.amount)) return false;
      seen.add(preset.amount);
      return true;
    })
    .slice(0, 4);
}
