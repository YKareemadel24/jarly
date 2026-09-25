/**
 * Pure Saving Jar domain layer — public entry point.
 *
 * The implementation lives in focused modules under `lib/domain/`:
 * - `domain/money.ts`    — minor-unit conversion, formatting, input sanitising
 * - `domain/jar.ts`      — jar/entry types, milestones, streaks, `applyEntry`
 * - `domain/schedule.ts` — recurring-deposit catch-up and cadence maths
 * - `domain/insights.ts` — monthly charts, deadline countdowns, pace, nudges
 * - `domain/presets.ts`  — one-tap deposit suggestions
 * - `domain/badges.ts`   — badge catalogue and progress
 *
 * Rules enforced across these modules:
 * - Money is ALWAYS an integer number of minor units (cents). Never floats.
 * - Milestone levels are 25/50/75/100 and every crossed level is recorded.
 * - Habit streaks are calendar-day based, not deposit-count based.
 * - Recurring rules have a computable nextDate and can be caught up deterministically.
 *
 * Import from this entry point (or from the store's re-exports); the module
 * split is internal and must not leak into screens.
 */

export * from "./domain";
